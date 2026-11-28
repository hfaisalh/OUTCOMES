/**
 * partner-inbox.ts
 *
 * What it does: the partner's inbox (DECISIONS 326): a bell in the top bar that shows how many messages are unread, and the panel of messages it opens. Reminders, late notices, gifts moved to another partner, work sent back at review, new batches.
 * Who calls it: app/portal/partner-home.ts (the bell and the panel). Depends on: the partner slice and the message type. Pure: it takes the slice and the screen state and returns HTML.
 * Data flow: the bell sets partnerUi.inbox (partner-session.ts); "Mark all as read" sends msg-read and the server answers with the fresh slice. The messages come with the partner's own slice, so nothing here can show another partner's.
 * UX: the bell is a real button with a text name that includes the count (not colour or the badge alone), aria-expanded and aria-controls; an unread message has the word New as well as the tint.
 */

import type { PartnerSlice } from "../../modules/13-partner-portal/scope";
import { shortDate } from "../shared/dates";
import { esc, type PartnerUi } from "./partner-outcomes";

const BELL = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15zM10 21a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const unreadOf = (s: PartnerSlice): number => (s.messages ?? []).filter((m) => !m.read).length;

// --- The bell in the top bar ---
export function bellHtml(s: PartnerSlice, ui: PartnerUi): string {
  const n = unreadOf(s);
  return `<button type="button" class="phome-bell${ui.inbox ? " on" : ""}" data-action="pt-inbox" aria-expanded="${ui.inbox === true}" aria-controls="pt-inbox" aria-label="Messages${n ? `, ${n} unread` : ""}">${BELL}${n ? `<span class="phome-bell-n" aria-hidden="true">${n > 9 ? "9+" : n}</span>` : ""}</button>`;
}

// --- The panel ---
export function inboxHtml(s: PartnerSlice, ui: PartnerUi): string {
  if (!ui.inbox) return "";
  const list = s.messages ?? [];
  const n = unreadOf(s);
  const items = list.map((m) => `<li class="pm${m.read ? "" : " new"}"><div class="pm-h"><b>${esc(m.title)}</b>${m.read ? "" : ' <span class="pill unrouted">New</span>'}<span class="muted pm-d">${esc(shortDate(m.at))}</span></div><div>${esc(m.text)}</div></li>`).join("");
  return `<section class="card pm-card" id="pt-inbox" aria-label="Messages"><div class="pm-top"><h2>Messages</h2>${n ? `<button type="button" data-action="pt-msg-read">Mark all as read</button>` : ""}</div>
    ${list.length ? `<ul class="pm-list">${items}</ul>` : `<div class="empty">No messages yet. Reminders, work sent back and new batches appear here.</div>`}</section>`;
}
