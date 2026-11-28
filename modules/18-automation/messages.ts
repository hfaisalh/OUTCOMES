/**
 * messages.ts
 *
 * What it does: the partner's inbox (DECISIONS 326): short messages OUTCOMES leaves for a partner, shown behind the bell in the partner portal. Reminders, late notices, a gift moved away, work sent back at review, a new batch.
 * Who calls it: the sweep (sweep.ts), the server and demo when a batch is assigned or work is sent back, the partner handler (reading and marking read) and the portal. Depends on: nothing. Pure.
 *
 * Rules:
 * - Rule: a message holds no donor details and no money: only the benefit, a count, a date, and what the partner has to do. The reason a person gave for rejecting work is the one free text, and it is MWF's own words to that partner.
 * - Rule: a message has a unique key. A second message with a key already in the inbox is not added, so running the job twice in one day does not double the reminders.
 * - Rule: an inbox keeps the latest 100 messages of a partner; older ones drop off. A partner sees only its own.
 */

export type MessageKind = "reminder" | "late" | "moved" | "sent-back" | "new-batch";
export interface PartnerMessage { id: string; partnerId: string; at: string; kind: MessageKind; title: string; text: string; read: boolean }
export type NewMessage = Omit<PartnerMessage, "read">;
export const MAX_PER_PARTNER = 100;

export function addMessages(existing: PartnerMessage[], fresh: NewMessage[]): { value: PartnerMessage[]; added: number } {
  const have = new Set(existing.map((m) => m.id));
  const add = fresh.filter((m, i) => !have.has(m.id) && fresh.findIndex((x) => x.id === m.id) === i).map((m): PartnerMessage => ({ ...m, read: false }));
  const all = [...existing, ...add];
  const keep = new Set<string>();
  const by = new Map<string, PartnerMessage[]>();
  for (const m of all) by.set(m.partnerId, [...(by.get(m.partnerId) ?? []), m]);
  for (const list of by.values()) list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_PER_PARTNER).forEach((m) => keep.add(m.id));
  return { value: all.filter((m) => keep.has(m.id)), added: add.length };
}

export const forPartner = (list: PartnerMessage[], partnerId: string): PartnerMessage[] => list.filter((m) => m.partnerId === partnerId).sort((a, b) => b.at.localeCompare(a.at));
export const unreadCount = (list: PartnerMessage[], partnerId: string): number => list.filter((m) => m.partnerId === partnerId && !m.read).length;

// Marks a partner's messages read: the ids given, or all of them. It never touches another partner's messages.
export function markRead(list: PartnerMessage[], partnerId: string, ids: string[] | "all"): PartnerMessage[] {
  return list.map((m) => (m.partnerId === partnerId && (ids === "all" || ids.includes(m.id)) ? { ...m, read: true } : m));
}

const dmy = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const gifts = (n: number): string => `${n} gift${n === 1 ? "" : "s"}`;

// --- The messages the job and the screens leave ---
export const sentBackMessage = (partnerId: string, benefit: string, phase: string, reason: string, due: string, at: string, key: string): NewMessage => ({
  id: `sent-back:${key}:${at}`, partnerId, at, kind: "sent-back", title: "Work sent back",
  text: `MWF sent back the work for ${benefit}. ${reason}${phase ? ` Please put right: ${phase}` : " Please put it right"}${due ? `, by ${dmy(due)}` : ""}.`,
});
export const newBatchMessage = (partnerId: string, batch: number | undefined, count: number, at: string): NewMessage => ({
  id: `batch:${partnerId}:${batch ?? 0}:${at.slice(0, 10)}`, partnerId, at, kind: "new-batch", title: batch === undefined ? "New gifts" : `Batch ${batch}`,
  text: `${gifts(count)} ${count === 1 ? "has" : "have"} been assigned to you${batch === undefined ? "" : ` in batch ${batch}`}. Please accept or refuse ${count === 1 ? "it" : "them"} in the days set.`,
});
export const dueMessage = (kind: "reminder" | "late", partnerId: string, what: "answer" | "phase", n: number, due: string, today: string): NewMessage => ({
  id: `${kind}-${what}:${partnerId}:${kind === "reminder" ? due : today}`, partnerId, at: `${today}T00:00:00Z`, kind,
  title: kind === "reminder" ? (what === "answer" ? "Answers due soon" : "Work due soon") : (what === "answer" ? "Answers are late" : "Work is late"),
  text: kind === "reminder" ? `${gifts(n)} ${what === "answer" ? "to accept or refuse" : "with work to finish"} ${n === 1 ? "is" : "are"} due by ${dmy(due)}.` : `${gifts(n)} ${what === "answer" ? "still to accept or refuse" : "with work to finish"} ${n === 1 ? "is" : "are"} past ${n === 1 ? "its" : "their"} day.`,
});
export const movedMessage = (partnerId: string, n: number, days: number, today: string): NewMessage => ({
  id: `moved:${partnerId}:${today}`, partnerId, at: `${today}T00:00:00Z`, kind: "moved", title: "Gifts moved to another partner",
  text: `${gifts(n)} ${n === 1 ? "was" : "were"} moved to another partner because there was no answer ${days} day${days === 1 ? "" : "s"} after the deadline.`,
});
