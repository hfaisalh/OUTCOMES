/** partner-inbox.test.ts: the bell and the messages of a partner, with invented messages (decision 326). */
import { describe, expect, it } from "vitest";
import { bellHtml, inboxHtml } from "./partner-inbox";
import type { PartnerSlice } from "../../modules/13-partner-portal/scope";
import type { PartnerUi } from "./partner-outcomes";

const m = (id: string, read: boolean, title: string) => ({ id, partnerId: "p1", at: "2026-12-01T00:00:00Z", kind: "reminder" as const, title, text: `Text of ${title}`, read });
const slice = (messages: ReturnType<typeof m>[]) => ({ partner: { id: "p1", name: "Alpha" }, messages }) as unknown as PartnerSlice;
const ui = (inbox: boolean) => ({ inbox, open: [], details: [], lastOpened: "", refusing: null, form: null, csv: null, message: "", error: "" }) as PartnerUi;

describe("the partner bell and inbox", () => {
  it("names the unread count in words for a screen reader, and shows it on the bell", () => {
    const html = bellHtml(slice([m("a", false, "A"), m("b", true, "B"), m("c", false, "C")]), ui(false));
    expect(html).toContain('aria-label="Messages, 2 unread"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">2</span>");
    expect(bellHtml(slice([]), ui(false))).toContain('aria-label="Messages"');
  });
  it("shows nothing until the bell is opened, then the messages with New on the unread ones", () => {
    const s = slice([m("a", false, "Answers due soon"), m("b", true, "Work sent back")]);
    expect(inboxHtml(s, ui(false))).toBe("");
    const html = inboxHtml(s, ui(true));
    expect(html).toContain("Answers due soon");
    expect(html).toContain('<span class="pill unrouted">New</span>');
    expect(html).toContain('data-action="pt-msg-read"');
  });
  it("is calm with no messages, and offers no Mark all read when everything is read", () => {
    expect(inboxHtml(slice([]), ui(true))).toContain("No messages yet.");
    expect(inboxHtml(slice([m("a", true, "A")]), ui(true))).not.toContain("pt-msg-read");
  });
});
