/**
 * list-frames.ts
 *
 * What it does: gives every list in a page the same frame (DECISIONS 208): the heading row stays in view while the rows scroll inside a framed box, and the box is a white curved card unless it already sits in one.
 * It works on the page's HTML before it is shown, so every list in the solution, present and future, behaves the same without each page repeating the markup. A table that has a heading row (thead) is a list.
 * A table already inside a wrapper (tablewrap, twrap, oc, octablewrap) takes the frame on that wrapper, any other table is wrapped. A table inside another table, and one without a heading row (a plain facts table), is left alone.
 * Who calls it: app/main.ts when it draws the page. Depends on: nothing. Pure: text in, text out. The look is in app/theme.css (.listframe).
 */

const WRAPPER = /<div class="([^"]*\b(?:tablewrap|twrap|oc|octablewrap|listframe)\b[^"]*)">\s*$/;

export function frameLists(html: string): string {
  const tags = /<(\/?)table\b[^>]*>/g;
  let depth = 0;
  let start = -1;
  const spans: { start: number; end: number }[] = [];
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    if (m[1] === "") { if (depth === 0) start = m.index; depth++; }
    else { depth = Math.max(0, depth - 1); if (depth === 0 && start >= 0) { spans.push({ start, end: m.index + m[0].length }); start = -1; } }
  }
  let out = "";
  let at = 0;
  for (const s of spans) {
    const table = html.slice(s.start, s.end);
    if (!table.includes("<thead")) continue; // not a list
    const before = html.slice(at, s.start);
    const wrapper = WRAPPER.exec(before);
    if (wrapper) {
      if (wrapper[1]!.split(/\s+/).includes("listframe")) continue;
      // Rule: the wrapper the page already has becomes the frame.
      out += before.slice(0, wrapper.index) + before.slice(wrapper.index).replace(`class="${wrapper[1]}"`, `class="${wrapper[1]} listframe"`) + table;
    } else out += `${before}<div class="listframe">${table}</div>`;
    at = s.end;
  }
  return out + html.slice(at);
}
