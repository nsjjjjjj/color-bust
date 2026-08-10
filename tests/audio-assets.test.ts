import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { AUDIO_EFFECTS, AUDIO_TRACKS } from "../app/use-game-audio";

const root = new URL("../", import.meta.url);
const origin = "https://deck-mayhem.test";

const expectedTracks = {
  menu: "/audio/bgm-menu.m4a",
  run: null,
  shop: "/audio/bgm-shop.mp3",
  boss: "/audio/bgm-boss.m4a",
  silent: null,
} as const;

const expectedEffects = {
  "card-select": null,
  "card-play": "/audio/card-play.mp3",
  "card-draw": "/audio/card-draw.mp3",
  "deck-setup": "/audio/deck-setup.mp3",
  score: "/audio/score.mp3",
  buy: null,
  uno: null,
  win: null,
  lose: null,
} as const;

const expectedAudioPaths = [
  ...Object.values(expectedTracks),
  ...Object.values(expectedEffects),
].filter((path): path is string => path !== null).sort();

function sources(definitions: Record<string, { readonly src: string } | null>) {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [name, definition?.src ?? null]),
  );
}

function isMp3(buffer: Buffer): boolean {
  const hasId3Tag = buffer.subarray(0, 3).toString("ascii") === "ID3";
  const hasMpegFrameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  return hasId3Tag || hasMpegFrameSync;
}

function isM4a(buffer: Buffer): boolean {
  return buffer.subarray(4, 8).toString("ascii") === "ftyp";
}

async function audioResponse(pathname: string): Promise<Response> {
  const bytes = await readFile(new URL(`public${pathname}`, root));
  const type = pathname.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg";
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "Content-Type": type, "Content-Length": String(bytes.byteLength) },
  });
}

function cacheKey(input: RequestInfo | URL): string {
  const value = input instanceof Request ? input.url : String(input);
  return new URL(value, origin).href;
}

class MemoryCache {
  readonly entries = new Map<string, Response>();

  async match(input: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(cacheKey(input))?.clone();
  }

  async put(input: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(cacheKey(input), response.clone());
  }

  async add(input: RequestInfo | URL): Promise<void> {
    const pathname = new URL(cacheKey(input)).pathname;
    const response = pathname.startsWith("/audio/")
      ? await audioResponse(pathname)
      : new Response("app shell", { status: 200 });
    await this.put(input, response);
  }

  async addAll(inputs: readonly (RequestInfo | URL)[]): Promise<void> {
    await Promise.all(inputs.map((input) => this.add(input)));
  }
}

type WorkerListener = (event: unknown) => void;

async function createServiceWorkerHarness() {
  const source = await readFile(new URL("public/sw.js", root), "utf8");
  const listeners = new Map<string, WorkerListener>();
  const stores = new Map<string, MemoryCache>();
  let online = true;

  const cacheStorage = {
    async open(name: string): Promise<MemoryCache> {
      const current = stores.get(name) ?? new MemoryCache();
      stores.set(name, current);
      return current;
    },
    async match(input: RequestInfo | URL): Promise<Response | undefined> {
      for (const cache of stores.values()) {
        const response = await cache.match(input);
        if (response) return response;
      }
      return undefined;
    },
    async keys(): Promise<string[]> {
      return [...stores.keys()];
    },
    async delete(name: string): Promise<boolean> {
      return stores.delete(name);
    },
  };

  const workerSelf = {
    location: { origin },
    clients: { claim: () => Promise.resolve() },
    skipWaiting: () => Promise.resolve(),
    addEventListener(type: string, listener: WorkerListener) {
      listeners.set(type, listener);
    },
  };

  const networkFetch = async (input: RequestInfo | URL): Promise<Response> => {
    if (!online) throw new TypeError("offline");
    const pathname = new URL(cacheKey(input)).pathname;
    return pathname.startsWith("/audio/")
      ? audioResponse(pathname)
      : new Response("network", { status: 200 });
  };

  vm.runInNewContext(source, {
    self: workerSelf,
    caches: cacheStorage,
    fetch: networkFetch,
    URL,
    Request,
    Response,
    Headers,
    Promise,
    Uint8Array,
    ArrayBuffer,
    console,
  }, { filename: "public/sw.js" });

  async function install(): Promise<void> {
    const listener = listeners.get("install");
    assert.ok(listener, "service worker must register an install listener");
    const pending: Promise<unknown>[] = [];
    listener({
      waitUntil(value: Promise<unknown>) {
        pending.push(Promise.resolve(value));
      },
    });
    await Promise.all(pending);
  }

  async function dispatchFetch(request: Request): Promise<Response> {
    const listener = listeners.get("fetch");
    assert.ok(listener, "service worker must register a fetch listener");
    let response: Promise<Response> | undefined;
    listener({
      request,
      respondWith(value: Response | PromiseLike<Response>) {
        response = Promise.resolve(value);
      },
    });
    assert.ok(response, `service worker did not handle ${request.url}`);
    return response;
  }

  return {
    stores,
    install,
    dispatchFetch,
    goOffline() {
      online = false;
    },
  };
}

test("audio hook maps every supplied track and effect to the intended scene", () => {
  assert.deepEqual(sources(AUDIO_TRACKS), expectedTracks);
  assert.deepEqual(sources(AUDIO_EFFECTS), expectedEffects);
});

test("ships seven non-empty audio files with valid container signatures", async () => {
  assert.equal(expectedAudioPaths.length, 7);
  for (const pathname of expectedAudioPaths) {
    const bytes = await readFile(new URL(`public${pathname}`, root));
    assert.ok(bytes.byteLength > 1_000, `${pathname} is unexpectedly small`);
    if (pathname.endsWith(".m4a")) {
      assert.ok(isM4a(bytes), `${pathname} is not an ISO BMFF/M4A file`);
    } else {
      assert.ok(isMp3(bytes), `${pathname} is not an MP3 file`);
    }
  }
});

test("service worker precaches every audio asset and serves byte ranges offline", async () => {
  const harness = await createServiceWorkerHarness();
  await harness.install();

  const cachedPaths = new Set(
    [...harness.stores.values()].flatMap((cache) =>
      [...cache.entries.keys()].map((key) => new URL(key).pathname),
    ),
  );
  for (const pathname of expectedAudioPaths) {
    assert.ok(cachedPaths.has(pathname), `${pathname} is missing from the install cache`);
  }

  const pathname = "/audio/card-play.mp3";
  const original = await readFile(new URL(`public${pathname}`, root));
  harness.goOffline();

  const full = await harness.dispatchFetch(new Request(`${origin}${pathname}`));
  assert.equal(full.status, 200);
  assert.equal((await full.arrayBuffer()).byteLength, original.byteLength);

  const partial = await harness.dispatchFetch(new Request(`${origin}${pathname}`, {
    headers: { Range: "bytes=2-5" },
  }));
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), `bytes 2-5/${original.byteLength}`);
  assert.equal(partial.headers.get("accept-ranges"), "bytes");
  assert.equal(partial.headers.get("content-length"), "4");
  assert.deepEqual(
    Buffer.from(await partial.arrayBuffer()),
    original.subarray(2, 6),
  );
});
