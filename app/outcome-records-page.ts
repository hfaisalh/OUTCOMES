/**
 * outcome-records-page.ts
 *
 * What it does: draws the Outcomes list (DECISIONS 197), one line for each outcome a gift has created (OUT-0001): what was funded, the type, project, who delivers it, who gave, the plan, how far funded, a small pie for each
 * of twelve months, the stage and an active or ended circle. Filters (project, type, under-funded, failed payments, ended) and a search by reference, benefit, donor, partner or project. A click on a heading sorts by it.
 * It uses the same words, icons and pies as the Gifts and Beneficiaries lists. Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: modules/10-outcome-records, modules/07-beneficiaries (commitmentsFor, normName), outcomes.ts, itemRulesOf (the type of a benefit), gifts-page.ts (icons) and esc and View from pages.ts.
 */

import { commitmentsFor } from "../modules/07-beneficiaries/implementation";
import { normName } from "../modules/07-beneficiaries/beneficiaries";
import { itemRulesOf } from "../modules/07-beneficiaries/enrolments";
import { monthsAround, perPeriodRule, type UnitStatus } from "../modules/05-outcomes/outcomes";
import { unitsOfItem } from "../modules/02-project-rules/benefits";
import type { SavedFeatures } from "../modules/02-project-rules/kind-features";
import { outcomeRows, type OutcomeRow } from "../modules/10-outcome-records/outcome-records";
import { icon, SYMBOL } from "./gifts-page";
import { esc, type View } from "./pages";

const MAX_ROWS = 300;
const NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KEY: [string, string][] = [["p", "Paid"], ["e", "Expected"], ["m", "Missed"], ["f", "Nothing expected"], ["g", "Unfilled unit"]];
export const NO_OUTCOME_FILTER = { text: "", project: "", type: "", show: "" as "" | "underfunded" | "missed" | "ended" };

// One small pie for a month: a slice for each unit of the whole outcome, coloured by what its gift did that month. A thin ring marks the edge so a white (unfilled) unit still shows.
function pie(slots: { status: UnitStatus | "g" }[], label: string): string {
  const n = slots.length;
  // Rule (decision 201): an item of one unit has nothing to slice, so it is a rounded square, not a pie.
  if (n === 1) return `<svg class="mpie" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="${esc(label)}"><rect class="ring" x="1.2" y="1.2" width="21.6" height="21.6" rx="7" stroke-width=".7"/><rect class="sq ${slots[0]?.status}" x="4" y="4" width="16" height="16" rx="5"/></svg>`;
  const R = 9, C = 2 * Math.PI * R;
  const arcs = slots.map((sl, i) => { const len = C / n; return `<circle class="seg ${sl.status}" cx="12" cy="12" r="${R}" fill="none" stroke-width="6" stroke-dasharray="${n === 1 ? C : Math.max(len - 1.2, 0.5)} ${C}" stroke-dashoffset="${-i * len}" transform="rotate(-90 12 12)"/>`; });
  return `<svg class="mpie" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="${esc(label)}"><circle class="ring" cx="12" cy="12" r="11.7" stroke-width=".7"/><circle class="ring" cx="12" cy="12" r="6.3" stroke-width=".7"/>${arcs.join("")}</svg>`;
}

export function outcomeRecordsPage(v: View): string {
  const f = v.outcomeRecFilter ?? NO_OUTCOME_FILTER;
  const today = v.today ?? "2026-01-01";
  const fws = v.frameworks ?? [];
  const projects = v.giftProjects ?? [];
  const months = monthsAround(today, 5, 6);
  const itemName = new Map((v.workOrders ?? []).map((w) => [w.itemId, w.itemName]));
  const itemFw = new Map<string, string>();
  for (const w of v.workOrders ?? []) if (w.frameworkId && !itemFw.has(w.itemId)) itemFw.set(w.itemId, w.frameworkId);
  const whole = (itemId: string): number => unitsOfItem(v.itemUnits, itemId, fws.find((x) => x.id === itemFw.get(itemId))?.unitsPerBeneficiary ?? 1);
  const partnerOfKey = new Map((v.assignments?.records ?? []).map((x) => [x.key, x.partnerId]));
  const partnerName = (id: string): string => (v.projects ?? []).find((p) => p.id === id)?.name ?? id;
  const typeOf = (itemId: string): string => itemRulesOf(v.itemKinds ?? {}, (v.kindFeatures ?? {}) as SavedFeatures, itemId, itemName.get(itemId) ?? "")?.kindLabel ?? "No type yet";
  const projectName = (id: string): string => projects.find((p) => p.id === id)?.name ?? "";
  const all = outcomeRows({ placements: v.placements?.records ?? [], commitments: commitmentsFor(v.workOrders ?? [], perPeriodRule(fws), today), partnerOf: (k) => partnerOfKey.get(k) ?? "", whole, months, today });

  // Rule: the search finds an outcome by its reference, benefit, donor, partner or project.
  const text = normName(f.text);
  const matches = (r: OutcomeRow): boolean => text === "" || normName(`${r.ref} ${itemName.get(r.itemId) ?? ""} ${r.gift?.donor ?? ""} ${partnerName(r.partnerId)} ${projectName(r.giftProjectId)}`).includes(text);
  const showOk = (r: OutcomeRow): boolean => (f.show === "" ? true : f.show === "underfunded" ? r.live && r.funded < 100 : f.show === "missed" ? r.missed > 0 : !r.live);
  const list = all.filter((r) => matches(r) && (f.project === "" || r.giftProjectId === f.project) && (f.type === "" || typeOf(r.itemId) === f.type) && showOk(r));

  // Rule: a click on a heading sorts by it, a second click reverses it. Empty values go last either way.
  const sort = v.outcomeRecSort;
  const sortValue = (r: OutcomeRow, key: string): string | number | null => {
    switch (key) {
      case "ref": return r.ref;
      case "benefit": return (itemName.get(r.itemId) ?? "").toLowerCase();
      case "type": return typeOf(r.itemId).toLowerCase();
      case "project": return projectName(r.giftProjectId).toLowerCase() || null;
      case "partner": return partnerName(r.partnerId).toLowerCase() || null;
      case "donor": return r.gift ? r.gift.donor.toLowerCase() : null;
      case "plan": return r.gift ? (r.gift.once ? 1 : r.gift.planned ? r.gift.paid / r.gift.planned : 0) : null;
      case "funded": return r.funded;
      case "stage": return r.live ? 1 : 0;
      default: return null;
    }
  };
  if (sort && sort.key !== "") {
    const dir = sort.dir === "desc" ? -1 : 1;
    list.sort((a, b) => { const x = sortValue(a, sort.key), y = sortValue(b, sort.key); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }

  const planOf = (g: NonNullable<OutcomeRow["gift"]>): string => (g.once ? `${g.paid}/${g.planned ?? 1}` : `${g.paid}/${g.planned ?? "∞"}`);
  const rows = list.slice(0, MAX_ROWS).map((r) => {
    const g = r.gift;
    const donor = g ? `${icon(g.once ? "one" : "rec", g.once ? SYMBOL.one : SYMBOL.recurring, g.once ? "One payment" : "Recurring gift")} ${esc(g.donor)}` : "";
    const stage = r.live ? `<span class="pill stage st-allocated" title="Allocated to ${esc(partnerName(r.partnerId) || "a partner")}">Allocated</span>` : `<span class="pill muted" title="${esc(r.why)}">Ended</span>`;
    const status = r.live ? `<span class="dot on" title="Live" aria-label="Live"></span>` : `<span class="dot off" title="${esc(`Ended ${r.endedOn}: ${r.why}`)}" aria-label="Ended"></span>`;
    return `<tr class="rowlink" data-gift-open="${esc(r.key.startsWith("sub:") ? r.key.slice(4) : r.key)}" tabindex="0" title="Open the gift"><td class="nm"><span class="refbox">${esc(r.ref)}</span></td><td class="clip">${esc(itemName.get(r.itemId) ?? r.itemId)}</td><td>${esc(typeOf(r.itemId))}</td><td>${esc(projectName(r.giftProjectId))}</td><td>${esc(partnerName(r.partnerId))}</td><td class="dn" title="${esc(g?.donor ?? "")}">${donor}</td><td class="num">${g ? planOf(g) : ""}</td><td class="num" title="Units the gift holds out of the ${r.whole} that make one whole outcome, counting only the instalments paid so far">${r.funded}%</td>${r.cells.map((c) => `<td class="m">${pie(c.slots, `${NAME[Number(c.month.slice(5, 7)) - 1]} ${c.month.slice(0, 4)}`)}</td>`).join("")}<td>${stage}</td><td class="c st">${status}</td></tr>`;
  }).join("");
  const th = (key: string, label: string, cls = "", tip = ""): string => `<th${cls ? ` class="${cls}"` : ""}${tip ? ` title="${esc(tip)}"` : ""}><button type="button" class="sortbtn" data-orsort="${key}">${label}${sort?.key === key ? (sort.dir === "desc" ? " ▼" : " ▲") : ""}</button></th>`;
  const head = `<thead><tr>${th("ref", "Outcome")}${th("benefit", "Benefit")}${th("type", "Type")}${th("project", "Project")}${th("partner", "Partner")}${th("donor", "Donor")}${th("plan", "Plan")}${th("funded", "Funded", "num", "The units the gift holds out of the units that make one whole outcome, counting only the instalments paid so far")}${months.map((m) => `<th class="m${m === today.slice(0, 7) ? " now" : ""}">${NAME[Number(m.slice(5, 7)) - 1]}</th>`).join("")}${th("stage", "Stage")}<th>Status</th></tr></thead>`;
  const legend = `<p class="symbolkey muted">${SYMBOL.recurring} recurring &nbsp; ${SYMBOL.one} one payment &nbsp; <span class="dot on"></span> live &nbsp; <span class="dot off"></span> ended</p><div class="legendrow">${KEY.map(([s, t]) => `<span><span class="sw ${s}"></span>${t}</span>`).join("")}</div>`;
  const sel = (x: string, val: string): string => (x === val ? " selected" : "");
  const types = [...new Set(all.map((r) => typeOf(r.itemId)))].sort();
  const filters = `<div class="filters"><select data-orf="project" aria-label="Project"><option value="">All projects</option>${projects.map((p) => `<option value="${esc(p.id)}"${sel(f.project, p.id)}>${esc(p.name)}</option>`).join("")}</select>
    <select data-orf="type" aria-label="Type"><option value="">All types</option>${types.map((t) => `<option value="${esc(t)}"${sel(f.type, t)}>${esc(t)}</option>`).join("")}</select>
    <select data-orf="show" aria-label="Show"><option value="">All</option><option value="underfunded"${sel(f.show, "underfunded")}>Under-funded</option><option value="missed"${sel(f.show, "missed")}>Failed payments</option><option value="ended"${sel(f.show, "ended")}>Ended</option></select>
    <input data-orf="text" value="${esc(f.text)}" placeholder="Search outcome, benefit, donor, partner or project" aria-label="Search" /></div>`;
  return `<h1>Outcomes</h1>
    <p class="sub">What gifts have created where the gift comes first (a pump, a camp) or there is no beneficiary (a mosque). Each is one outcome with its own reference. Open a row for the gift. Stages after allocation (delivered, confirmed, reported) come later.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    ${filters}
    ${all.length === 0 ? '<div class="empty">No outcomes yet. They appear when Allocate places a gift for a benefit where the gift comes first, or that has no beneficiary.</div>' : list.length === 0 ? '<div class="empty">Nothing matches.</div>' : `${legend}<div class="tablewrap regwrap"><table class="octable regtable">${head}<tbody>${rows}</tbody></table></div>
    <p class="muted">${list.length} of ${all.length} outcomes${list.length > MAX_ROWS ? `, the first ${MAX_ROWS} shown` : ""}.</p>`}`;
}
