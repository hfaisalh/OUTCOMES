/**
 * a11y.mjs
 *
 * What it does: the automated accessibility check (DECISIONS 294). It serves the built app (dist/) with the same security headers as the live site, opens it in the demo with the sample setup loaded, visits every staff page and the main windows, and runs axe-core (WCAG 2.0, 2.1 and 2.2 level A and AA, and best practice) on each. It prints what is broken and exits with 1 if anything is.
 * Who calls it: `npm run a11y`, by hand before a release. Depends on: a built app (`npm run build`), the axe-core package, and Chrome or Chromium (set CHROME to its path if it is not in the usual place). Node 22 or later.
 * Data flow: dist/ -> a small local web server -> headless Chrome -> axe-core injected into the page -> a list of broken rules per page.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5301, DEBUG = 9340;
const CHROME = process.env.CHROME ?? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
if (!CHROME) { console.error("Chrome or Chromium was not found. Set CHROME to its path."); process.exit(2); }
if (!existsSync(path.join(root, "dist/app/index.html"))) { console.error("Build first: npm run build"); process.exit(2); }

// --- A local server with the live site's headers ---
const headers = Object.fromEntries(JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")).headers[0].headers.map((h) => [h.key, h.value]));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = new URL(req.url, "http://x").pathname;
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, "dist", p);
  if (!f.startsWith(path.join(root, "dist")) || !existsSync(f)) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream", ...headers });
  res.end(readFileSync(f));
}).listen(PORT);

// --- Chrome over the DevTools protocol ---
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DEBUG}`, "--window-size=1500,1000", `--user-data-dir=${path.join(root, "node_modules/.cache/a11y-profile")}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => { chrome.kill(); server.close(); process.exit(code); };
await sleep(2500);
const targets = await (await fetch(`http://localhost:${DEBUG}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: `http://localhost:${PORT}/app/?demo=1` });
await sleep(3500);
await ev(readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8"));

// --- The scenes ---
const go = (p) => `(()=>{const b=document.createElement('button');b.dataset.page=${JSON.stringify(p)};document.body.appendChild(b);b.click();b.remove();return 1})()`;
const click = (sel) => `(()=>{const r=document.querySelector(${JSON.stringify(sel)});if(r)r.click();return !!r})()`;
const PAGES = ["work-orders", "projects", "partners", "beneficiaries", "outcome-records", "assignment", "confirmation", "allocate", "progress", "dashboard", "workflows", "rules", "benefits", "settings", "data-feed", "data-files", "audit", "attention", "sources"];
const scenes = [{ name: "settings", js: go("settings") }, { name: "load the sample setup", js: click("[data-sample=load]") }, ...PAGES.map((p) => ({ name: p, js: go(p) })),
  { name: "gifts, gift window", js: `${go("work-orders")};${click("tr[data-gift-open]")}` }, { name: "close the gift window", js: click("[data-gift-close]") },
  { name: "beneficiaries, person window", js: `${go("beneficiaries")};${click("[data-bn=open]")}` }, { name: "close", js: click("[data-bn=cancel]") }];
let broken = 0;
for (const s of scenes) {
  await ev(s.js); await sleep(800);
  const out = await ev(`axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa","best-practice"]}}).then(r=>JSON.stringify(r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,help:v.help,ex:v.nodes[0].target.join(" ").slice(0,90)}))))`);
  const list = JSON.parse(out ?? "[]");
  broken += list.length;
  console.log(`${list.length === 0 ? "ok  " : "FAIL"} ${s.name}`);
  for (const v of list) console.log(`     [${v.impact}] ${v.id} x${v.n}: ${v.help} | e.g. ${v.ex}`);
}
console.log(broken === 0 ? "\nNo accessibility problems found." : `\n${broken} broken rule(s).`);
done(broken === 0 ? 0 : 1);
