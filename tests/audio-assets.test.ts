import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  AUDIO_EFFECTS,
  AUDIO_TRACKS,
  BGM_CROSSFADE_MS,
  BgmManager,
  DEFAULT_SCORE_TICK_VOICE_LIMIT,
  SCORE_EFFECT_FADE_DURATION_MS,
  SCORE_EFFECT_MAX_DURATION_MS,
  SCORE_EFFECT_START_OFFSET_SECONDS,
  SYNTH_EFFECTS,
  ScoreEffectPool,
  audioSceneForBossAnte,
  scoreTickPlaybackRate,
} from "../app/use-game-audio";

const root = new URL("../", import.meta.url);
const origin = "https://deck-mayhem.test";

const expectedTracks = {
  menu: "/audio/bgm-menu.m4a",
  run: "/audio/bgm-run.m4a",
  shop: "/audio/bgm-shop.mp3",
  boss: "/audio/bgm-boss.mp3",
  "final-boss": "/audio/bgm-final-boss.mp3",
  silent: null,
} as const;

const expectedEffects = {
  "card-select": "/audio/card-select.m4a",
  "card-play": "/audio/card-play.mp3",
  "card-draw": "/audio/card-draw.mp3",
  "deck-setup": "/audio/deck-setup.mp3",
  score: "/audio/score.mp3",
  buy: "/audio/buy.m4a",
  uno: "/audio/uno.m4a",
  "pack-open": "/audio/pack-open.m4a",
  "pack-reveal": "/audio/pack-reveal.m4a",
  win: "/audio/win.m4a",
  lose: "/audio/lose.m4a",
} as const;

const expectedAudioPaths = [
  ...Object.values(expectedTracks),
  ...Object.values(expectedEffects),
].flatMap((path) => path === null ? [] : [String(path)]).sort();

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

test("ships sixteen non-empty audio files with valid container signatures", async () => {
  assert.equal(expectedAudioPaths.length, 16);
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

test("procedural effects cover the previously silent interaction and scoring beats", () => {
  const required = [
    "ui-click",
    "ui-error",
    "discard",
    "sort",
    "reroll",
    "sell",
    "coin",
    "round-clear",
    "round-start",
    "boss-alert",
    "mod-trigger",
    "multiplier",
    "enhancement",
    "mayhem-arm",
    "pack-pick",
    "equip",
  ] as const;
  assert.ok(required.every((name) => name in SYNTH_EFFECTS));
  for (const definition of Object.values(SYNTH_EFFECTS)) {
    assert.ok(definition.gain > 0 && definition.gain <= 1);
    assert.ok(definition.cooldownMs >= 0);
    assert.ok(definition.tones.length > 0);
    for (const tone of definition.tones) {
      assert.ok(tone.startHz >= 35 && tone.endHz >= 35);
      assert.ok(tone.durationMs >= 40 && tone.durationMs <= 500);
      assert.ok(tone.gain > 0 && tone.gain <= 0.2);
    }
  }
});

test("selects the dedicated final-boss scene only for ante five and later", () => {
  assert.equal(audioSceneForBossAnte(1), "boss");
  assert.equal(audioSceneForBossAnte(4), "boss");
  assert.equal(audioSceneForBossAnte(5), "final-boss");
  assert.equal(audioSceneForBossAnte(8), "final-boss");
});

test("score ticks rise in pitch and stay inside a safe playback-rate range", () => {
  const rates = [0, 1, 2, 3, 4].map((step) => scoreTickPlaybackRate(step));
  assert.deepEqual(rates, [...rates].sort((left, right) => left - right));
  assert.ok(rates[4] > rates[0]);
  assert.equal(scoreTickPlaybackRate(10_000), 1.8);
  assert.equal(scoreTickPlaybackRate(0, 1.25, -100), 0.65);
  assert.equal(DEFAULT_SCORE_TICK_VOICE_LIMIT, 3);
});

test("score effect pool preloads voices, deduplicates event tokens, and trims each hit", () => {
  const originalAudio = globalThis.Audio;

  class FakeScoreAudio {
    static readonly instances: FakeScoreAudio[] = [];
    readonly src: string;
    preload = "";
    volume = 1;
    playbackRate = 1;
    currentTime = 0;
    paused = true;
    ended = false;
    playCalls = 0;
    pauseCalls = 0;
    loadCalls = 0;
    released = false;

    constructor(src: string) {
      this.src = src;
      FakeScoreAudio.instances.push(this);
    }

    play(): Promise<void> {
      this.paused = false;
      this.ended = false;
      this.playCalls += 1;
      return Promise.resolve();
    }

    pause(): void {
      this.paused = true;
      this.pauseCalls += 1;
    }

    load(): void {
      this.loadCalls += 1;
    }

    removeAttribute(name: string): void {
      if (name === "src") this.released = true;
    }
  }

  globalThis.Audio = FakeScoreAudio as unknown as typeof Audio;
  const pool = new ScoreEffectPool({
    src: "/audio/score.mp3",
    gain: 0.58,
    voiceLimit: 3,
  });

  try {
    pool.configure(true, 0.65);
    assert.equal(pool.preparedVoiceCount, 3);
    assert.equal(FakeScoreAudio.instances.length, 3);
    assert.ok(FakeScoreAudio.instances.every(({ loadCalls }) => loadCalls === 1));

    assert.equal(pool.play("hand-1:card-1", { playbackRate: 1, gain: 1 }), true);
    assert.equal(pool.play("hand-1:card-1", { playbackRate: 1.2, gain: 1 }), false);
    assert.equal(pool.play("hand-1:card-2", { playbackRate: 1.2, gain: 0.9 }), true);
    assert.equal(FakeScoreAudio.instances.length, 3, "score playback must reuse the pool");
    assert.equal(FakeScoreAudio.instances[0].playCalls, 1);
    assert.equal(FakeScoreAudio.instances[0].currentTime, SCORE_EFFECT_START_OFFSET_SECONDS);
    assert.equal(FakeScoreAudio.instances[1].playCalls, 1);
    assert.equal(FakeScoreAudio.instances[1].playbackRate, 1.2);
    assert.ok(SCORE_EFFECT_MAX_DURATION_MS < 240);
    assert.ok(SCORE_EFFECT_FADE_DURATION_MS > 0);
  } finally {
    pool.dispose();
    globalThis.Audio = originalAudio;
  }
});

test("BGM manager reuses a matching track and crossfades scene changes", async () => {
  assert.ok(BGM_CROSSFADE_MS >= 300 && BGM_CROSSFADE_MS <= 800);

  const originalAudio = globalThis.Audio;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;

  class FakeAudio {
    static readonly instances: FakeAudio[] = [];
    readonly src: string;
    loop = false;
    preload = "";
    volume = 1;
    paused = true;
    playCalls = 0;
    released = false;

    constructor(src: string) {
      this.src = src;
      FakeAudio.instances.push(this);
    }

    play(): Promise<void> {
      this.paused = false;
      this.playCalls += 1;
      return Promise.resolve();
    }

    pause(): void {
      this.paused = true;
    }

    removeAttribute(name: string): void {
      if (name === "src") this.released = true;
    }

    load(): void {}
  }

  globalThis.Audio = FakeAudio as unknown as typeof Audio;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    const id = ++frameId;
    frames.set(id, callback);
    return id;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    frames.delete(id);
  }) as typeof cancelAnimationFrame;

  try {
    const manager = new BgmManager();
    manager.setScene("run");
    manager.configure(true, 0.4);
    assert.equal(FakeAudio.instances.length, 1);

    manager.setScene("run");
    assert.equal(FakeAudio.instances.length, 1, "same source must not create or restart a track");
    assert.equal(FakeAudio.instances[0].playCalls, 1);

    manager.setScene("shop");
    assert.equal(FakeAudio.instances.length, 2);
    assert.equal(FakeAudio.instances[0].released, false, "outgoing track stays alive during the fade");

    const finishAt = performance.now() + BGM_CROSSFADE_MS + 1;
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(finishAt);
    }
    await Promise.resolve();
    assert.equal(FakeAudio.instances[0].released, true, "outgoing track is released after the fade");
    assert.equal(FakeAudio.instances[1].released, false);
  } finally {
    globalThis.Audio = originalAudio;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
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
  assert.ok(cachedPaths.has("/"), "the offline navigation shell is missing");
  assert.ok(cachedPaths.has("/art/deck-mayhem-card-frame-v1.png"), "the gameplay card frame is missing");
  const staticPaths = [...cachedPaths].filter((pathname) => pathname.startsWith("/_next/static/"));
  assert.ok(staticPaths.some((pathname) => pathname.endsWith(".js")), "compiled client JavaScript is missing");
  assert.ok(staticPaths.some((pathname) => pathname.endsWith(".css")), "compiled CSS is missing");

  const pathname = "/audio/card-play.mp3";
  const original = await readFile(new URL(`public${pathname}`, root));
  harness.goOffline();

  const staticResponse = await harness.dispatchFetch(new Request(`${origin}${staticPaths.find((path) => path.endsWith(".js"))}`));
  assert.equal(staticResponse.status, 200, "client JavaScript must remain available offline");

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
