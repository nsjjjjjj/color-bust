import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const root = new URL("../", import.meta.url);
let child;
let origin;
let dataDirectory;

before(async () => {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  dataDirectory = await mkdtemp(join(tmpdir(), "deck-mayhem-test-"));
  child = spawn(process.execPath, [".next/standalone/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: dataDirectory,
      SECURE_COOKIES: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stdout.on("data", (chunk) => { diagnostics += chunk; });
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      // The standalone server may still be binding its socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`standalone server did not become ready:\n${diagnostics}`);
});

after(async () => {
  child?.kill("SIGTERM");
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
});

test("standalone server renders the DECK MAYHEM application shell", async () => {
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /DECK MAYHEM/);
  assert.match(html, /커뮤니티 카드 로그라이크/);
  assert.match(html, /게임 선택 · 새 5 STAGE 런/);
  assert.match(html, /메이헴 연구소/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("SQLite registration, session, and authenticated API work in standalone Node", async () => {
  const health = await fetch(`${origin}/api/health`);
  assert.deepEqual(await health.json(), { status: "ok" });

  const body = new URLSearchParams({
    displayName: "EC2 Tester",
    email: "ec2@example.com",
    password: "correct-horse",
    returnTo: "/",
  });
  const registration = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    body,
    redirect: "manual",
  });
  assert.equal(registration.status, 303);
  const cookie = registration.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie?.startsWith("deck_mayhem_session="));

  const me = await fetch(`${origin}/api/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, "ec2@example.com");

  const guestbook = await fetch(`${origin}/api/guestbook`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ message: "EC2 standalone test", rating: 5 }),
  });
  assert.equal(guestbook.status, 201);
});

test("ships a complete generated offline shell", async () => {
  const [manifest, serviceWorker, pwaRegister, layout, packageJson] = await Promise.all([
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8"),
    readFile(new URL("app/pwa-register.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /DECK MAYHEM/);
  assert.match(serviceWorker, /networkFirst/);
  assert.match(serviceWorker, /networkFirstAsset/);
  assert.match(serviceWorker, /staleWhileRevalidate/);
  assert.match(serviceWorker, /deck-mayhem-[a-f0-9]{12}/);
  assert.match(serviceWorker, /\/_next\/static\/[^"\n]+\.js/);
  assert.match(serviceWorker, /\/_next\/static\/[^"\n]+\.css/);
  assert.match(serviceWorker, /\/art\/deck-mayhem-card-frame-v1\.png/);
  assert.match(pwaRegister, /getRegistrations/);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(packageJson, /next start/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)));
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
