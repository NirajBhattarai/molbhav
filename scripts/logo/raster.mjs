/**
 * Rasterise iOS SVG assets from scripts/logo/generate.py via sharp (bundled with Next).
 *
 * Usage: node scripts/logo/raster.mjs <out_dir>
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../../package.json"));
const sharp = require("sharp");

const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/logo/raster.mjs <out_dir>");
  process.exit(1);
}

async function pngFromSvg(svgPath, pngPath, size, { opaque = false } = {}) {
  const svg = readFileSync(svgPath);
  let pipeline = sharp(svg, { density: 288 }).resize(size, size, { fit: "fill" });
  // App Store icons must be opaque (no alpha).
  if (opaque) {
    pipeline = pipeline.flatten({ background: "#222d78" }).removeAlpha();
  }
  const buf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  mkdirSync(dirname(pngPath), { recursive: true });
  writeFileSync(pngPath, buf);
  console.log("wrote", pngPath);
}

const iconSvg = join(out, "ios/AppIcon-1024.svg");
const splashSvg = join(out, "ios/splash-2732.svg");
if (!existsSync(iconSvg) || !existsSync(splashSvg)) {
  console.error("Run generate.py first so ios/*.svg exist.");
  process.exit(1);
}

await pngFromSvg(iconSvg, join(out, "ios/AppIcon-512@2x.png"), 1024, { opaque: true });
await pngFromSvg(splashSvg, join(out, "ios/splash-2732x2732.png"), 2732, { opaque: true });
// Same splash at 1x/2x/3x filenames Capacitor / Xcode splash set expects.
copyFileSync(join(out, "ios/splash-2732x2732.png"), join(out, "ios/splash-2732x2732-1.png"));
copyFileSync(join(out, "ios/splash-2732x2732.png"), join(out, "ios/splash-2732x2732-2.png"));

// Web apple-touch icon (180) for Safari home screen.
const webIcon = join(out, "web/apple-icon.png");
await pngFromSvg(iconSvg, webIcon, 180);

console.log("ok");
