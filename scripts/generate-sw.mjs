import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const serviceWorkerPath = join(root, "public", "sw.js");
const publicRoot = join(root, "public");
const nextStaticRoot = join(root, ".next", "static");

const publicFiles = await walk(publicRoot);
const staticFiles = await walk(nextStaticRoot);
const ignoredPublicFiles = new Set([
  "sw.js",
  "README.md",
  "audio/README.md",
  // Local Finder copies; canonical versions have the same audio without suffixes.
  "audio/cashout-claim 2.mp3",
  "audio/cashout-tick 2.mp3",
]);
const legacyCardFace = /^art\/cards\/core\//;

const assets = [
  "/",
  ...publicFiles
    .map((path) => slash(relative(publicRoot, path)))
    .filter((path) => !ignoredPublicFiles.has(path) && !legacyCardFace.test(path))
    .map((path) => `/${path}`),
  ...staticFiles.map((path) => `/_next/static/${slash(relative(nextStaticRoot, path))}`),
].filter((value, index, values) => values.indexOf(value) === index).sort();

const digest = createHash("sha256");
for (const asset of assets) {
  digest.update(asset);
  if (asset !== "/") {
    const filePath = asset.startsWith("/_next/static/")
      ? join(nextStaticRoot, asset.slice("/_next/static/".length))
      : join(publicRoot, asset.slice(1));
    digest.update(await readFile(filePath));
  }
}
const version = `deck-mayhem-${digest.digest("hex").slice(0, 12)}`;

let source = await readFile(serviceWorkerPath, "utf8");
source = source
  .replace(/const CACHE_VERSION = "deck-mayhem-[^"]+";/, `const CACHE_VERSION = ${JSON.stringify(version)};`)
  .replace(/const APP_SHELL = \[[\s\S]*?\];\nconst CACHEABLE_API/, `const APP_SHELL = ${JSON.stringify(assets, null, 2)};\nconst CACHEABLE_API`);
await writeFile(serviceWorkerPath, source);
console.log(`Generated ${version} with ${assets.length} offline assets.`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function slash(value) {
  return sep === "/" ? value : value.split(sep).join("/");
}
