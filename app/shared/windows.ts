/**
 * windows.ts
 *
 * What it does: opens and closes the pop-up windows (DECISIONS 225, 220): a window eases in when it opens (not when it is redrawn after a change inside it) and out when it closes, only transform and opacity move, and a person who asks the system for less motion gets none.
 * Who calls it: the shell (app/main.ts) and every file that draws a window: the beneficiary window, the areas window and the others. Depends on: nothing. It touches only the element it is given.
 * Data flow: putWindow(root, html) draws the window's HTML into its root, easing in only if the root was empty; dropWindow(root) eases out, then empties the root.
 */

export const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// Windows (DECISIONS 225): every window root eases in when it opens (not on a redraw inside it) and out when it closes, as the gift window does.
const closers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
export function putWindow(root: HTMLElement, html: string): void {
  const t = closers.get(root);
  if (t !== undefined) { clearTimeout(t); closers.delete(root); root.classList?.remove?.("gw-out"); root.innerHTML = ""; }
  const opening = root.innerHTML === "";
  root.innerHTML = html;
  root.classList?.toggle?.("gw-in", opening && html !== "" && !reducedMotion());
}
export function dropWindow(root: HTMLElement | null): void {
  if (!root || root.innerHTML === "" || closers.has(root)) return;
  if (reducedMotion() || typeof root.classList?.add !== "function") { root.innerHTML = ""; return; } // no motion asked for, or nothing to animate (the test page)
  root.classList.add("gw-out");
  closers.set(root, setTimeout(() => { closers.delete(root); root.innerHTML = ""; root.classList.remove("gw-out"); }, 130));
}
