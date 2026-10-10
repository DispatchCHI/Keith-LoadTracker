// Builds the Windows desktop installer (Tauri + NSIS) and copies it to ./installer.
// Usage: npm run desktop:build
// Supabase settings come from the local .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
// and are baked into the bundle at build time.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const envPath = join(root, ".env");
const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const url = /^VITE_SUPABASE_URL=(.+)$/m.exec(env)?.[1]?.trim() ?? process.env.VITE_SUPABASE_URL ?? "";
const key = /^VITE_SUPABASE_ANON_KEY=(.+)$/m.exec(env)?.[1]?.trim() ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env; the desktop app would have no cloud sync.");
  process.exit(1);
}
console.log(`Supabase: ${url}`);

execSync("npx tauri build", { stdio: "inherit" });

const conf = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const nsisDir = join(root, "src-tauri", "target", "release", "bundle", "nsis");
const exe = readdirSync(nsisDir)
  .filter((f) => f.endsWith("-setup.exe") && f.includes(`_${conf.version}_`))
  .map((f) => join(nsisDir, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!exe) {
  console.error(`No NSIS installer for version ${conf.version} found in ${nsisDir}`);
  process.exit(1);
}
const outDir = join(root, "installer");
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, `${conf.productName} Setup ${conf.version}.exe`);
copyFileSync(exe, dest);
console.log(`Installer: ${dest} (${(statSync(dest).size / 1048576).toFixed(1)} MB)`);