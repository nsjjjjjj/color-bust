const CACHE_VERSION = "deck-mayhem-6c63ada9f3fc";
const APP_SHELL = [
  "/",
  "/_next/static/72v33DgGYHhbFGy5Yl-78/_buildManifest.js",
  "/_next/static/72v33DgGYHhbFGy5Yl-78/_clientMiddlewareManifest.js",
  "/_next/static/72v33DgGYHhbFGy5Yl-78/_ssgManifest.js",
  "/_next/static/chunks/08ttfj81-47mu.js",
  "/_next/static/chunks/0cz1d0mv5g_q7.js",
  "/_next/static/chunks/0n7lt7wyn0e4k.css",
  "/_next/static/chunks/0qol-ihbikepu.js",
  "/_next/static/chunks/1ntnobrxa0mdj.css",
  "/_next/static/chunks/1ydheh02n_cym.js",
  "/_next/static/chunks/22i43cg4l4-dq.js",
  "/_next/static/chunks/2rth4v15ptnn2.js",
  "/_next/static/chunks/2tswzwt7g9k6a.js",
  "/_next/static/chunks/310vm2bl3xxpt.js",
  "/_next/static/chunks/31ea98sji2xan.css",
  "/_next/static/chunks/3fntmmi971322.js",
  "/_next/static/chunks/turbopack-325o-jjm--dwk.js",
  "/art/card-back.png",
  "/art/card-symbols/fire_symbol.png",
  "/art/card-symbols/leaf_symbol.png",
  "/art/card-symbols/lightning_symbol.png",
  "/art/card-symbols/water_symbol.png",
  "/art/cards/chunky/fire_0.png",
  "/art/cards/chunky/fire_1.png",
  "/art/cards/chunky/fire_2.png",
  "/art/cards/chunky/fire_3.png",
  "/art/cards/chunky/fire_4.png",
  "/art/cards/chunky/fire_5.png",
  "/art/cards/chunky/fire_6.png",
  "/art/cards/chunky/fire_7.png",
  "/art/cards/chunky/fire_8.png",
  "/art/cards/chunky/fire_9.png",
  "/art/cards/chunky/leaf_0.png",
  "/art/cards/chunky/leaf_1.png",
  "/art/cards/chunky/leaf_2.png",
  "/art/cards/chunky/leaf_3.png",
  "/art/cards/chunky/leaf_4.png",
  "/art/cards/chunky/leaf_5.png",
  "/art/cards/chunky/leaf_6.png",
  "/art/cards/chunky/leaf_7.png",
  "/art/cards/chunky/leaf_8.png",
  "/art/cards/chunky/leaf_9.png",
  "/art/cards/chunky/lightning_0.png",
  "/art/cards/chunky/lightning_1.png",
  "/art/cards/chunky/lightning_2.png",
  "/art/cards/chunky/lightning_3.png",
  "/art/cards/chunky/lightning_4.png",
  "/art/cards/chunky/lightning_5.png",
  "/art/cards/chunky/lightning_6.png",
  "/art/cards/chunky/lightning_7.png",
  "/art/cards/chunky/lightning_8.png",
  "/art/cards/chunky/lightning_9.png",
  "/art/cards/chunky/water_0.png",
  "/art/cards/chunky/water_1.png",
  "/art/cards/chunky/water_2.png",
  "/art/cards/chunky/water_3.png",
  "/art/cards/chunky/water_4.png",
  "/art/cards/chunky/water_5.png",
  "/art/cards/chunky/water_6.png",
  "/art/cards/chunky/water_7.png",
  "/art/cards/chunky/water_8.png",
  "/art/cards/chunky/water_9.png",
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
  "/audio/cashout-claim.mp3",
  "/audio/cashout-tick.mp3",
  "/audio/deck-setup.mp3",
  "/audio/hand-sort-rank.m4a",
  "/audio/hand-sort-suit.m4a",
  "/audio/lose.m4a",
  "/audio/pack-open.m4a",
  "/audio/pack-reveal.m4a",
  "/audio/round-score-settle.mp3",
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
