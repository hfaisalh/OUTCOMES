/**
 * vite.config.ts
 *
 * What it does: settings for the local Module 1 page (npm run dev). The page lives in
 * modules/01-data-mapping/ui and reads the pure logic one folder up.
 * Who calls it: Vite, when you run npm run dev or npm run build.
 */

import { resolve } from "node:path";
import { defineConfig } from "vite";

const repoRoot = import.meta.dirname;

export default defineConfig({
  root: resolve(repoRoot, "modules/01-data-mapping/ui"),
  server: { fs: { allow: [repoRoot] } }, // lets the page import the logic in the parent folder
  build: { outDir: resolve(repoRoot, "dist"), emptyOutDir: true },
});
