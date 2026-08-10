const CACHE_VERSION = "deck-mayhem-v2";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
  "/art/menu-marble.png",
  "/art/card-back.png",
  "/fonts/Galmuri11.woff2",
  "/fonts/Galmuri11-Bold.woff2",
];
const AUDIO_ASSETS = [
  "/audio/bgm-menu.m4a",
  "/audio/bgm-boss.m4a",
  "/audio/bgm-shop.mp3",
  "/audio/card-draw.mp3",
  "/audio/card-play.mp3",
  "/audio/deck-setup.mp3",
  "/audio/score.mp3",
];
const CACHEABLE_API = ["/api/community", "/api/guestbook", "/api/leaderboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(APP_SHELL);

      // Audio is useful offline, but one missing optional media file must not
      // prevent a new version of the app shell from being installed.
      await Promise.allSettled(AUDIO_ASSETS.map((asset) => cache.add(asset)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("/"));
  }
}

function parseByteRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;

  const startText = match[1];
  const endText = match[2];
  let start;
  let end;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;

    if (endText) {
      end = Number(endText);
      if (!Number.isSafeInteger(end) || end < start) return null;
      end = Math.min(end, size - 1);
    } else {
      end = size - 1;
    }
  }

  return { start, end };
}

function rangeNotSatisfiable(size) {
  return new Response(null, {
    status: 416,
    statusText: "Range Not Satisfiable",
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes */${size}`,
    },
  });
}

function fullAudioResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function audioResponse(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_VERSION);
  // Strip query parameters and, crucially, the incoming Range header so only
  // complete media responses are persisted in the offline cache.
  const cacheKey = new Request(`${url.origin}${url.pathname}`, {
    method: "GET",
    credentials: "same-origin",
  });
  let response = await cache.match(cacheKey);

  if (!response) {
    try {
      const networkResponse = await fetch(cacheKey);
      if (!networkResponse.ok) return networkResponse;
      response = networkResponse;
      try {
        await cache.put(cacheKey, networkResponse.clone());
      } catch {
        // A full network response is still playable when storage is full or
        // unavailable, so a cache write failure should not mute the game.
      }
    } catch {
      return new Response(null, {
        status: 503,
        statusText: "Audio Unavailable",
        headers: { "Accept-Ranges": "bytes" },
      });
    }
  }

  const rangeHeader = request.headers.get("Range");
  if (!rangeHeader) return fullAudioResponse(response);

  const bytes = await response.arrayBuffer();
  const range = parseByteRange(rangeHeader, bytes.byteLength);
  if (!range) return rangeNotSatisfiable(bytes.byteLength);

  const body = bytes.slice(range.start, range.end + 1);
  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(body.byteLength));
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${bytes.byteLength}`);

  return new Response(body, {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/audio/")) {
    event.respondWith(audioResponse(request));
    return;
  }
  if (CACHEABLE_API.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
        return response;
      }),
    ),
  );
});
