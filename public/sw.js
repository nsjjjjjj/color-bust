const CACHE_VERSION = "deck-mayhem-1703827f350b";
const APP_SHELL = [
  "/",
  "/_next/static/MnGeXnmV4VMmFy9Rb16Mq/_buildManifest.js",
  "/_next/static/MnGeXnmV4VMmFy9Rb16Mq/_clientMiddlewareManifest.js",
  "/_next/static/MnGeXnmV4VMmFy9Rb16Mq/_ssgManifest.js",
  "/_next/static/chunks/068n1a0zu4c6f.css",
  "/_next/static/chunks/08ttfj81-47mu.js",
  "/_next/static/chunks/0cz1d0mv5g_q7.js",
  "/_next/static/chunks/0fi1a615t7x32.css",
  "/_next/static/chunks/0g1g5xth9r2my.css",
  "/_next/static/chunks/0td_q_jvg2olo.js",
  "/_next/static/chunks/19mx3mg6lkumu.js",
  "/_next/static/chunks/22i43cg4l4-dq.js",
  "/_next/static/chunks/2rth4v15ptnn2.js",
  "/_next/static/chunks/310vm2bl3xxpt.js",
  "/_next/static/chunks/3fntmmi971322.js",
  "/_next/static/chunks/43xy2g4_-fb9q.js",
  "/_next/static/chunks/turbopack-1ht71va82inkw.js",
  "/art/card-back.png",
  "/art/cards/core/blue-0.png",
  "/art/cards/core/blue-1.png",
  "/art/cards/core/blue-2.png",
  "/art/cards/core/blue-3.png",
  "/art/cards/core/blue-4.png",
  "/art/cards/core/blue-5.png",
  "/art/cards/core/blue-6.png",
  "/art/cards/core/blue-7.png",
  "/art/cards/core/blue-8.png",
  "/art/cards/core/blue-9.png",
  "/art/cards/core/green-0.png",
  "/art/cards/core/green-1.png",
  "/art/cards/core/green-2.png",
  "/art/cards/core/green-3.png",
  "/art/cards/core/green-4.png",
  "/art/cards/core/green-5.png",
  "/art/cards/core/green-6.png",
  "/art/cards/core/green-7.png",
  "/art/cards/core/green-8.png",
  "/art/cards/core/green-9.png",
  "/art/cards/core/red-0.png",
  "/art/cards/core/red-1.png",
  "/art/cards/core/red-2.png",
  "/art/cards/core/red-3.png",
  "/art/cards/core/red-4.png",
  "/art/cards/core/red-5.png",
  "/art/cards/core/red-6.png",
  "/art/cards/core/red-7.png",
  "/art/cards/core/red-8.png",
  "/art/cards/core/red-9.png",
  "/art/cards/core/yellow-0.png",
  "/art/cards/core/yellow-1.png",
  "/art/cards/core/yellow-2.png",
  "/art/cards/core/yellow-3.png",
  "/art/cards/core/yellow-4.png",
  "/art/cards/core/yellow-5.png",
  "/art/cards/core/yellow-6.png",
  "/art/cards/core/yellow-7.png",
  "/art/cards/core/yellow-8.png",
  "/art/cards/core/yellow-9.png",
  "/art/deck-mayhem-card-frame-v1.png",
  "/art/menu-marble.png",
  "/audio/LICENSE-KENNEY.txt",
  "/audio/bgm-boss.mp3",
  "/audio/bgm-final-boss.mp3",
  "/audio/bgm-menu.m4a",
  "/audio/bgm-run.m4a",
  "/audio/bgm-shop.mp3",
  "/audio/buy.m4a",
  "/audio/card-draw.mp3",
  "/audio/card-play.mp3",
  "/audio/card-select.m4a",
  "/audio/deck-setup.mp3",
  "/audio/lose.m4a",
  "/audio/pack-open.m4a",
  "/audio/pack-reveal.m4a",
  "/audio/score.mp3",
  "/audio/uno.m4a",
  "/audio/win.m4a",
  "/brand/deck-mayhem-mark.png",
  "/favicon.svg",
  "/file.svg",
  "/fonts/Galmuri-LICENSE.txt",
  "/fonts/Galmuri11-Bold.woff2",
  "/fonts/Galmuri11.woff2",
  "/globe.svg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/icon-maskable.svg",
  "/icons/icon.svg",
  "/manifest.webmanifest",
  "/og-mayhem-ui.png",
  "/og.png",
  "/window.svg"
];
const CACHEABLE_API = ["/api/community", "/api/guestbook", "/api/leaderboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(APP_SHELL);
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
    if (responseMayBeCached(response)) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("/"));
  }
}

function responseMayBeCached(response) {
  if (!response.ok) return false;
  const cacheControl = response.headers.get("Cache-Control") || "";
  return !/(?:no-store|no-cache)/i.test(cacheControl);
}

async function networkFirstAsset(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (responseMayBeCached(response)) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
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
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return;

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
  if (["script", "style", "worker", "sharedworker"].includes(request.destination)) {
    event.respondWith(networkFirstAsset(request));
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((response) => {
        if (responseMayBeCached(response)) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
        return response;
      }),
    ),
  );
});
