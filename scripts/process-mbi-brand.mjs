/**
 * Copy the official MBI logo into app + icon slots. Does not recolor or redraw the mark.
 *
 *   node scripts/process-mbi-brand.mjs
 *   npx tauri icon public/brand/mbi-icon-1024.png --output src-tauri/icons --ios-color "#ffffff"
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "public/brand/mbi-logo-source.png");
const brandDir = path.join(root, "public/brand");
const assetsDir = path.join(root, "src/assets");

await mkdir(brandDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });
await copyFile(source, path.join(brandDir, "mbi-logo.png"));
await copyFile(source, path.join(assetsDir, "mbi-logo.png"));

await writeFile(
  path.join(brandDir, "mbi-red.json"),
  JSON.stringify(
    {
      hex: "#d8282c",
      r: 216,
      g: 40,
      b: 44,
      note: "Modal ribbon red sampled from official 200x200 PNG (core pixels).",
      source: "public/brand/mbi-logo-source.png",
    },
    null,
    2,
  ) + "\n",
);

function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-y", ...args], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${args.join(" ")}`);
  }
}

const icon1024 = path.join(brandDir, "mbi-icon-1024.png");
ffmpeg([
  "-i",
  source,
  "-vf",
  "scale=780:780:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2:white,format=rgba",
  icon1024,
]);

for (const [size, dest] of [
  [32, path.join(root, "public/favicon-32.png")],
  [180, path.join(root, "public/apple-touch-icon.png")],
  [192, path.join(root, "public/pwa-192.png")],
  [512, path.join(root, "public/pwa-512.png")],
]) {
  ffmpeg(["-i", icon1024, "-vf", `scale=${size}:${size}`, dest]);
}

console.log("Wrote official MBI logo copies and white-padded icons.");
console.log("Next: npx tauri icon public/brand/mbi-icon-1024.png --output src-tauri/icons");
