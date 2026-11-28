/**
 * signin-page.test.ts
 *
 * What it does: tests the sign-in screen (DECISIONS 91): the form posts to the server, offers every example role, says a wrong passphrase was wrong, and never lets text become HTML.
 * Who calls it: vitest. Depends on: signin-page.ts.
 */

import { describe, expect, it } from "vitest";
import { ROLES } from "../modules/00-platform/roles";
import { checkingHtml, signinHtml } from "./signin-page";

describe("the sign-in screen", () => {
  it("explains CRM sign-in, offers the test sign-in as any example role, and links to the demo", () => {
    const html = signinHtml("");
    expect(html).toContain("From the CRM");
    expect(html).toContain('action="/api/owner-login"');
    expect(html).toContain('type="password" name="passphrase"');
    for (const r of ROLES) expect(html).toContain(`<option value="${r.id}">`);
    expect(html).toContain('href="?demo=1"');
    expect(html).not.toContain("warnnote");
  });
  it("leads with the usual email and password form, and keeps the owner passphrase tucked away", () => {
    const html = signinHtml("");
    expect(html).toContain('type="email" name="email"');
    expect(html).toContain('type="password" name="password"');
    expect(html.indexOf('name="email"')).toBeLessThan(html.indexOf('name="passphrase"'));
    expect(html).toContain("<details");
  });
  it("shows what went wrong, safely", () => {
    expect(signinHtml("That passphrase is not right.")).toContain("That passphrase is not right.");
    expect(signinHtml("<img src=x>")).not.toContain("<img src=x>"); // the typed text is shown as text; the only image is our own logo mark
    expect(signinHtml("<img src=x>")).toContain("&lt;img src=x&gt;");
  });
  it("has a short waiting screen while the session is checked", () => {
    expect(checkingHtml()).toContain("Checking your sign-in");
  });
});

describe("the version on the sign-in screen", () => {
  it("shows the build label under the card, so a person can tell which version they are on before signing in", () => {
    expect(signinHtml("", "v0.1.0 · abc1234 · 28/11/26 10:00 UTC")).toContain("Version v0.1.0 · abc1234 · 28/11/26 10:00 UTC");
  });
  it("shows nothing when there is no label, and escapes one", () => {
    expect(signinHtml("")).not.toContain("signin-ver");
    expect(signinHtml("", "<b>x</b>")).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
