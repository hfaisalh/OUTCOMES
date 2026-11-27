/**
 * data-page.ts
 *
 * What it does: the Data area (DECISIONS 92). Getting gifts in is separate from looking after them, as in a CRM's data integration: the CRM connection
 * (last pick-up, reload, run a pick-up now) and the file upload, with the steps shown. Gifts only shows the result.
 * Who calls it: app/main.ts. Depends on: the helpers in pages.ts. Pure: it takes a View and returns HTML.
 *
 * Rule: nothing here changes how gifts are made. The same pick-up, the same upload and the same checks run as before, only from a different screen.
 */

import { esc, liveBar, loadCard, metric, ownerCard, type View } from "./pages";

const step = (n: number, title: string, text: string, done: boolean): string => `<div class="dstep${done ? " done" : ""}"><span class="dnum">${done ? "✓" : n}</span><div><b>${title}</b><div class="muted">${text}</div></div></div>`;

// CRM connection: where gifts come from, when they were last read, and the buttons to read again.
export function dataFeedPage(v: View): string {
  const live = v.workOrders.filter((w) => w.status !== "excluded").length;
  const unrouted = v.workOrders.filter((w) => w.status === "unrouted").length;
  return `
    <h1>CRM connection</h1>
    <p class="sub">Gifts come in from the CRM, are checked, and then appear in Gifts. Only items the CRM marks as needing feedback are brought in. Nothing is typed in by hand.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(v.workOrders.length, "Payments held")}${metric(live, "Live")}${metric(unrouted, "Unrouted", unrouted ? "warn" : "")}${metric(v.review.length, "To review", v.review.length ? "warn" : "")}</div>
    <div class="card"><h2>${v.live ? "Last pick-up" : "Demo data"}</h2>
      ${v.live ? liveBar(v) : `<p class="muted">This is the demo, with invented data. Nothing is saved.</p>`}
      <div class="actions">
        <button class="primary" data-action="refresh">${v.live ? "Reload" : "Refresh from CRM"}</button>
        ${v.live ? (v.canPickup ? `<button data-action="pickup-now">Run pickup now</button>` : "") : `<button data-action="demo-new">Demo: a new paid line arrives in the CRM</button><button data-action="demo-change">Demo: the CRM changes an amount</button>`}
      </div>
    </div>
    ${v.live ? "" : ownerCard(v)}
    <div class="card"><h2>How data gets into Gifts</h2>
      ${step(1, "Read", "The pick-up reads the CRM (or the files you upload) and keeps only what is needed. No donor contact details.", v.live && !!v.run)}
      ${step(2, "Check", "Each line is matched to its item and workflow. Lines it cannot sort are held as Unrouted.", v.workOrders.length > 0)}
      ${step(3, "Audit", "A batch audit compares what was read with the CRM and holds anything that changed for a person to review.", (v.audits ?? []).length > 0)}
      ${step(4, "Gifts", "Checked gifts appear in the Gifts list, ready to be allocated to a beneficiary.", live > 0)}
    </div>`;
}

// Upload files: for an organisation that gives OUTCOMES export files rather than a direct CRM connection.
export function dataFilesPage(v: View): string {
  return `
    <h1>Upload files</h1>
    <p class="sub">Load export files from the CRM's Export Centre. They are read in this browser, and only what is needed for gifts and the audit is sent to your saved data.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    ${v.live ? "" : ownerCard(v)}
    ${loadCard(v)}
    <div class="card"><h2>After loading</h2>
      <p class="muted">The gifts appear in <a data-page="work-orders">Gifts</a>, and the audit of what was loaded is under <a data-page="audit">Audit</a>.</p>
    </div>`;
}
