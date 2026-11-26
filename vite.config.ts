/**
 * vite.config.ts
 *
 * What it does: settings for the local pages (npm run dev). The OUTCOMES shell is at /app/ and the
 * Module 1 mapping page is now inside the shell under Data, Other sources (DECISIONS 93).
 * Who calls it: Vite, when you run npm run dev or npm run build.
 */

import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const repoRoot = import.meta.dirname;

// The version shown at the bottom of the menu: the package version, the short commit and the build time (DD/MM/YY HH:MM, UTC), so you can tell which build a page is on.
function buildLabel(): string {
  const version = (JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as { version: string }).version;
  let commit = (process.env["VERCEL_GIT_COMMIT_SHA"] ?? "").slice(0, 7);
  if (commit === "") { try { commit = execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim(); } catch { commit = "local"; } }
  const d = new Date();
  const p2 = (n: number): string => String(n).padStart(2, "0");
  return `v${version} \u00B7 ${commit} \u00B7 ${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
}

export default defineConfig({
  root: repoRoot,
  define: { __BUILD_LABEL__: JSON.stringify(buildLabel()) },
  // Rule: npm run dev opens the page for a person. A check run by a tool sets OUTCOMES_NO_OPEN=1 so no tab opens in their browser.
  server: { open: process.env["OUTCOMES_NO_OPEN"] ? false : "/app/", fs: { allow: [repoRoot] } },
  // Tests run from the repo root, not from the page folder.
  test: { root: repoRoot, include: ["modules/**/*.test.ts", "app/**/*.test.ts"] },
  build: {
    outDir: resolve(repoRoot, "dist"),
    emptyOutDir: true,
    rollupOptions: { input: { app: resolve(repoRoot, "app/index.html") } },
  },
});
