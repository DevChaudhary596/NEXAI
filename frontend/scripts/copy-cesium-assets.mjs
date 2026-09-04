// Copies CesiumJS's runtime static assets (workers, images, CSS) into
// public/cesium so Next.js serves them like any other static file,
// regardless of bundler (webpack or Turbopack) — Cesium's own build
// tooling assumes webpack's CopyPlugin, which Turbopack doesn't support.
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(frontendRoot, "node_modules/cesium/Build/Cesium");
const dest = path.join(frontendRoot, "public/cesium");

if (!existsSync(source)) {
  console.warn("[copy-cesium-assets] cesium package not found, skipping");
  process.exit(0);
}

for (const dir of ["Workers", "Assets", "ThirdParty", "Widgets"]) {
  cpSync(path.join(source, dir), path.join(dest, dir), { recursive: true });
}

console.log("[copy-cesium-assets] copied Cesium static assets to public/cesium");
