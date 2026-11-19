/**
 * esm-imports.test.ts
 *
 * What it does: guards the server files. The server runs as plain Node modules, which need a ".js"
 * on every relative import (Vite and the tests do not). A missing one passes every test but fails
 * on the server with "Cannot find module", so this test checks for it.
 */

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const dirs = ["api", "modules/00-platform", "modules/01c-crm-connector", "modules/02-project-rules", "app"];
// app/ is only read by the server through menu.ts.
const served = (dir: string, name: string) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith("sample.ts") && (dir !== "app" || name === "menu.ts");

describe("server files", () => {
  it("write every relative import with a .js ending", () => {
    const bad: string[] = [];
    for (const dir of dirs) {
      for (const name of readdirSync(new URL(`${dir}/`, root))) {
        if (!served(dir, name)) continue;
        const text = readFileSync(new URL(`${dir}/${name}`, root), "utf8");
        for (const m of text.matchAll(/(?:import|export)\s[^;]*?from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
          if (!/\.(js|json)$/.test(m[1] as string)) bad.push(`${dir}/${name}: ${m[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
