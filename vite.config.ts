/**
 * vite.config.ts
 *
 * What it does: settings for the local pages (npm run dev). The OUTCOMES shell is at /app/ and the
 * Module 1 mapping page at /modules/01-data-mapping/ui/. Both read the pure logic in modules/.
 * Who calls it: Vite, when you run npm run dev or npm run build.
 */

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const repoRoot = import.meta.dirname;

export default defineConfig({
  root: repoRoot,
  server: { open: "/app/", fs: { allow: [repoRoot] } },
  // Tests run from the repo root, not from the page folder.
  test: { root: repoRoot, include: ["modules/**/*.test.ts", "app/**/*.test.ts"] },
  build: {
    outDir: resolve(repoRoot, "dist"),
    emptyOutDir: true,
    rollupOptions: { input: { app: resolve(repoRoot, "app/index.html"), mapping: resolve(repoRoot, "modules/01-data-mapping/ui/index.html") } },
  },
});
