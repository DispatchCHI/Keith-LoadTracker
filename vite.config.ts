import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { MIN_SYNC_VERSION, SYNC_VERSION } from "./src/lib/syncVersion.ts";

const appVersion: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

function gitSha(): string {
  const fromEnv = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "nogit";
  }
}

const builtAt = new Date().toISOString();
const buildId = `${appVersion}-${gitSha()}-${builtAt.replace(/[^0-9]/g, "").slice(0, 14)}`;

/** Writes dist/version.json for the stale-build guard (src/lib/versionGuard.ts). */
function versionJson(): Plugin {
  return {
    name: "load-tracker-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify(
          { buildId, appVersion, syncVersion: SYNC_VERSION, minSyncVersion: MIN_SYNC_VERSION, builtAt },
          null,
          2,
        )}\n`,
      });
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss(), versionJson()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  clearScreen: false,
  build: {
    target: ["es2021", "chrome105"],
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: host || "0.0.0.0",
    port: 4521,
    strictPort: true,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 4522,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4521,
    strictPort: true,
  },
});
