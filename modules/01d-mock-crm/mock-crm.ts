/**
 * mock-crm.ts
 *
 * What it does: pretends to be a CRM for testing. It produces a feed in exactly the format of
 * docs/CRM-FEED-SPEC.md, and new gifts "arrive" as time passes, so OUTCOMES can be tested with
 * live input before any real CRM is connected. Everything is invented.
 * Who calls it: the server's connector (api/_server.ts) for an organisation whose CRM setting is
 * "demo", and the tests.
 * Depends on: the FeedRow type from Module 1c. Pure: no database, no network, no clock of its own.
 *
 * How time works: gift number n arrives at EPOCH + n x INTERVAL. The feed at any moment is simply
 * every gift whose time has come, so the same moment always gives the same feed and nothing has to
 * be stored. Later events happen to some gifts so the review list is exercised too:
 *   - some gifts first show as pending, then become paid a few minutes later
 *   - some paid gifts are deleted later, some change amount, some are replaced by another transaction
 *   - some gifts fail and never become paid
 * Rule: only the most recent MAX_LINES gifts are in the feed, so it never grows without limit.
 */

import type { FeedRow } from "../01c-crm-connector/feed.js";

export const EPOCH_MS = Date.UTC(2026, 10, 19, 0, 0, 0); // 19 Nov 2026, 00:00 UTC
export const INTERVAL_MS = 5 * 60 * 1000; // a new gift every 5 minutes
export const MAX_LINES = 1500;
const MIN = 60 * 1000;

export interface MockItem {
  id: string;
  name: string;
  price: number;
  recurring: boolean;
  instalments: string; // "" means indefinitely when recurring
  needsFeedback: boolean;
  weight: number; // how often it is bought, out of 100
  intention: string;
}

// The invented catalogue. "Flood Relief Appeal" matches no framework keyword on purpose, so it stays unsorted until someone sorts it.
export const MOCK_ITEMS: MockItem[] = [
  { id: "I10", name: "Orphan Sponsorship Monthly", price: 30, recurring: true, instalments: "12", needsFeedback: true, weight: 18, intention: "Sadaqah" },
  { id: "I13", name: "Hifz Sponsorship Monthly", price: 25, recurring: true, instalments: "", needsFeedback: true, weight: 10, intention: "Sadaqah" },
  { id: "I15", name: "School Sponsorship Monthly", price: 20, recurring: true, instalments: "12", needsFeedback: true, weight: 8, intention: "Sadaqah" },
  { id: "I11", name: "Water Pump", price: 150, recurring: false, instalments: "", needsFeedback: true, weight: 10, intention: "Sadaqah Jariyah" },
  { id: "I16", name: "Masjid Construction Share", price: 100, recurring: false, instalments: "", needsFeedback: true, weight: 6, intention: "Sadaqah Jariyah" },
  { id: "I17", name: "Rebuild a House", price: 500, recurring: false, instalments: "", needsFeedback: true, weight: 4, intention: "Sadaqah" },
  { id: "I18", name: "Animal Sacrifice", price: 75, recurring: false, instalments: "", needsFeedback: true, weight: 6, intention: "Qurbani" },
  { id: "I19", name: "Rickshaw for Livelihood", price: 300, recurring: false, instalments: "", needsFeedback: true, weight: 4, intention: "Sadaqah" },
  { id: "I20", name: "Microfinance Loan Fund", price: 200, recurring: false, instalments: "", needsFeedback: true, weight: 4, intention: "Sadaqah" },
  { id: "I22", name: "Flood Relief Appeal", price: 50, recurring: false, instalments: "", needsFeedback: true, weight: 6, intention: "Sadaqah" },
  { id: "I12", name: "General Donation", price: 20, recurring: false, instalments: "", needsFeedback: false, weight: 14, intention: "Sadaqah" },
  { id: "I21", name: "Zakat Fund", price: 100, recurring: false, instalments: "", needsFeedback: false, weight: 10, intention: "Zakat" },
];

// Invented supporters. Names only, no contact details (CRM-FEED-SPEC).
const FIRST = ["Amina", "Bilal", "Chloe", "Daniyal", "Emre", "Fatima", "Gabriel", "Hana", "Idris", "Jamila", "Karim", "Layla", "Musa", "Nadia", "Omar", "Priya", "Qasim", "Rania", "Sami", "Tariq", "Umar", "Yasmin", "Zayd", "Hira"];
const LAST = ["Sample", "Example", "Test", "Demo"];
const SUPPORTERS = 24;
const CENTRES = ["", "", "", "Sample Centre North", "Sample Centre East"];
const CHANNELS: [string, string, string][] = [["Website", "Stripe", "Card"], ["Website", "PayPal", "Wallet"], ["POS", "Terminal", "Card"], ["Kiosk", "Terminal", "Card"], ["Phone", "Manual", "Bank transfer"]];

// A repeatable pseudo-random number from 0 up to 1 for gift n and a salt. Same inputs, same answer.
function rand(n: number, salt: number): number {
  let t = (n * 2654435761 + salt * 40503 + 0x9e3779b9) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const pad = (x: number, w: number) => String(x).padStart(w, "0");
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}`;
};

function pickItem(n: number): MockItem {
  let r = rand(n, 1) * 100;
  for (const it of MOCK_ITEMS) {
    r -= it.weight;
    if (r < 0) return it;
  }
  return MOCK_ITEMS[0] as MockItem;
}

// Rule: every sixth gift has a second line in the same transaction, so a basket of two items is tested.
const baseOf = (n: number) => (n % 6 === 5 ? n - 1 : n);

// One feed row for gift number n, as the CRM would show it at time nowMs.
export function mockLine(n: number, nowMs: number): FeedRow {
  const base = baseOf(n);
  const at = EPOCH_MS + base * INTERVAL_MS;
  const age = nowMs - at; // how long ago the gift was made
  const item = pickItem(n);
  const supporter = Math.floor(rand(base, 2) * SUPPORTERS);
  const [channel, merchant, mode] = CHANNELS[Math.floor(rand(base, 3) * CHANNELS.length)] as [string, string, string];
  const quantity = item.price <= 50 && !item.recurring ? 1 + Math.floor(rand(n, 4) * 3) : 1;
  let amount = item.price * quantity;

  // Rule: the time-based events. Each depends only on n and the age, so they are repeatable.
  let status = "paid";
  if (base % 7 === 0 && age < 6 * MIN) status = "pending"; // paid a few minutes after it was made
  if (base % 10 === 3) status = "failed"; // never paid
  const deleted = base % 23 === 5 && age > 9 * MIN ? "1" : "0";
  if (n % 19 === 4 && age > 12 * MIN) amount += 10; // the amount was edited afterwards
  const supersededBy = base % 29 === 9 && age > 15 * MIN ? `T${3000 + base}R` : "";

  const subscription = item.recurring ? `S${item.id}-${pad(supporter, 2)}` : "";
  const instalment = item.recurring ? String(1 + (Math.floor(base / 60) % 12)) : "";
  return {
    line_id: `ML${pad(n, 5)}`,
    transaction_ref: `T${3000 + base}`,
    status,
    is_deleted: deleted,
    superseded_by: supersededBy,
    paid_at: stamp(at),
    supporter_id: `D${200 + supporter}`,
    supporter_name: `${FIRST[supporter % FIRST.length]} ${LAST[supporter % LAST.length]}`,
    group_name: CENTRES[Math.floor(rand(base, 5) * CENTRES.length)] ?? "",
    channel,
    merchant,
    payment_mode: mode,
    item_id: item.id,
    item_name: item.name,
    item_recurring: item.recurring ? "1" : "0",
    item_frequency: item.instalments,
    needs_feedback: item.needsFeedback ? "1" : "0",
    subscription_id: subscription,
    instalment_number: instalment,
    amount: String(amount),
    quantity: String(quantity),
    intention: item.intention,
  };
}

// The whole feed at time nowMs: every gift whose time has come, newest MAX_LINES only.
export function mockFeed(nowMs: number): FeedRow[] {
  if (nowMs < EPOCH_MS) return [];
  const latest = Math.floor((nowMs - EPOCH_MS) / INTERVAL_MS); // the newest gift number
  const first = Math.max(0, latest - MAX_LINES + 1);
  const rows: FeedRow[] = [];
  for (let n = first; n <= latest; n++) rows.push(mockLine(n, nowMs));
  return rows;
}
