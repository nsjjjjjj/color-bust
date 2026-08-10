const DATABASE_NAME = "color-bust";
const DATABASE_VERSION = 1;

const STORES = {
  runs: "runs",
  outbox: "outbox",
  community: "community",
  settings: "settings",
} as const;

export type LocalRunRecord<T = unknown> = {
  id: string;
  updatedAt: number;
  revision: number;
  data: T;
};

export type SyncOperation = {
  operationId: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  createdAt: number;
  attempts: number;
};

export type SyncResult = {
  synced: number;
  pending: number;
  needsSignIn: boolean;
};

type StoredSetting<T = unknown> = { key: string; value: T };

let databasePromise: Promise<IDBDatabase> | null = null;

function supportsIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!supportsIndexedDb()) {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.runs)) {
        const store = db.createObjectStore(STORES.runs, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        const store = db.createObjectStore(STORES.outbox, { keyPath: "operationId" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(STORES.community)) {
        const store = db.createObjectStore(STORES.community, { keyPath: "id" });
        store.createIndex("cachedAt", "cachedAt");
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab."));
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll()) as Promise<T[]>;
}

async function putValue(storeName: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  await requestResult(transaction.objectStore(storeName).put(value));
}

async function deleteValue(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  await requestResult(transaction.objectStore(storeName).delete(key));
}

export async function saveLocalRun<T>(record: LocalRunRecord<T>): Promise<void> {
  await putValue(STORES.runs, structuredClone(record));
}

export async function loadLocalRun<T>(id: string): Promise<LocalRunRecord<T> | null> {
  const db = await openDatabase();
  const value = await requestResult(db.transaction(STORES.runs, "readonly").objectStore(STORES.runs).get(id));
  return (value as LocalRunRecord<T> | undefined) ?? null;
}

export async function listLocalRuns<T>(): Promise<LocalRunRecord<T>[]> {
  const records = await readAll<LocalRunRecord<T>>(STORES.runs);
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteLocalRun(id: string): Promise<void> {
  await deleteValue(STORES.runs, id);
}

export async function enqueueSync(
  operation: Omit<SyncOperation, "operationId" | "createdAt" | "attempts"> &
    Partial<Pick<SyncOperation, "operationId" | "createdAt" | "attempts">>,
): Promise<SyncOperation> {
  const record: SyncOperation = {
    ...operation,
    operationId: operation.operationId ?? crypto.randomUUID(),
    createdAt: operation.createdAt ?? Date.now(),
    attempts: operation.attempts ?? 0,
  };
  await putValue(STORES.outbox, record);
  return record;
}

export async function listSyncQueue(): Promise<SyncOperation[]> {
  const records = await readAll<SyncOperation>(STORES.outbox);
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function flushSyncQueue(fetcher: typeof fetch = fetch): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, pending: (await listSyncQueue()).length, needsSignIn: false };
  }

  let synced = 0;
  let needsSignIn = false;
  const operations = await listSyncQueue();
  for (const operation of operations) {
    try {
      const response = await fetcher(operation.url, {
        method: operation.method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operation.operationId,
        },
        body: operation.body === undefined ? undefined : JSON.stringify(operation.body),
      });
      if (response.ok) {
        await deleteValue(STORES.outbox, operation.operationId);
        synced += 1;
        continue;
      }
      if (response.status === 401) {
        needsSignIn = true;
        break;
      }
      await putValue(STORES.outbox, { ...operation, attempts: operation.attempts + 1 });
      // 409는 리비전 충돌일 수 있으므로 성공으로 간주해 지우지 않는다.
      if (response.status === 409) break;
      if (response.status >= 500) break;
    } catch {
      await putValue(STORES.outbox, { ...operation, attempts: operation.attempts + 1 });
      break;
    }
  }
  return { synced, pending: (await listSyncQueue()).length, needsSignIn };
}

export async function cacheCommunityCards<T extends { id: string }>(cards: T[]): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORES.community, "readwrite");
  const store = transaction.objectStore(STORES.community);
  for (const card of cards) store.put({ ...structuredClone(card), cachedAt: Date.now() });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to cache cards."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Card cache transaction aborted."));
  });
}

export async function loadCachedCommunityCards<T>(): Promise<T[]> {
  return readAll<T>(STORES.community);
}

export async function setLocalSetting<T>(key: string, value: T): Promise<void> {
  await putValue(STORES.settings, { key, value } satisfies StoredSetting<T>);
}

export async function getLocalSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await openDatabase();
  const value = (await requestResult(
    db.transaction(STORES.settings, "readonly").objectStore(STORES.settings).get(key),
  )) as StoredSetting<T> | undefined;
  return value?.value ?? fallback;
}

export function subscribeConnectivity(listener: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const notify = () => listener(navigator.onLine);
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  notify();
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}
