/**
 * logins.ts
 *
 * What it does: the test sign-in accounts (DECISIONS 250). Each account is an email, a name, a password (kept only as a salted hash) and what it signs in as: an example staff role, or one partner. Used for testing the staff and partner journeys before the CRM sends real sign-ins.
 * Who calls it: the sign-in handler (signin-handler.ts) and the tests. Depends on: roles.ts, the partner permissions (13-partner-portal/scope.ts) and Node's crypto (scrypt).
 * Rules:
 * - Rule: the real product signs people in from the CRM (DECISIONS 24). These accounts exist for testing and are kept in the organisation's own setup, never shared between organisations.
 * - Rule: a password is never kept or sent back, only its hash. A wrong email and a wrong password give the same answer, so nobody can learn which emails exist.
 * - Rule: what an account may do is decided only by what it signs in as. A partner account carries the partner's id and the two partner permissions and nothing else (DECISIONS 249).
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PARTNER_PERMISSIONS } from "../13-partner-portal/scope.js";
import { roleById, ROLES } from "./roles.js";

// --- Types ---
export interface Login {
  email: string; // lower case
  name: string;
  role: string; // an example staff role id, or "partner"
  partnerId?: string; // set when role is "partner"
  hash: string; // "scrypt$<salt>$<hash>", hex
}
export type PublicLogin = Omit<Login, "hash">;
export const PARTNER_ROLE = "partner";
export const MIN_PASSWORD = 10;

// --- Password ---
const KEY_BYTES = 32;
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, KEY_BYTES).toString("hex")}`;
}
export function checkPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const given = scryptSync(password, Buffer.from(salt, "hex"), KEY_BYTES);
  const good = Buffer.from(hash, "hex");
  return given.length === good.length && timingSafeEqual(given, good);
}

// --- The rules ---
export const normEmail = (s: unknown): string => (typeof s === "string" ? s.trim().toLowerCase() : "");
export const validEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 120;
export const publicOf = (l: Login): PublicLogin => ({ email: l.email, name: l.name, role: l.role, ...(l.partnerId ? { partnerId: l.partnerId } : {}) });

type Result = { value: Login[] } | { error: string };

// Adds an account. `partnerIds` are the partners that exist, so an account cannot point at one that does not.
export function addLogin(existing: Login[], raw: { email: unknown; name: unknown; role: unknown; partnerId?: unknown; password: unknown }, partnerIds: string[]): Result {
  const email = normEmail(raw.email);
  const name = typeof raw.name === "string" ? raw.name.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  const role = typeof raw.role === "string" ? raw.role : "";
  const partnerId = typeof raw.partnerId === "string" ? raw.partnerId : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  if (name === "") return { error: "Enter a name." };
  if (existing.some((l) => l.email === email)) return { error: "That email already has an account." };
  if (password.length < MIN_PASSWORD) return { error: `The password needs at least ${MIN_PASSWORD} characters.` };
  if (role === PARTNER_ROLE) {
    if (!partnerIds.includes(partnerId)) return { error: "Choose the partner this account belongs to." };
  } else if (!ROLES.some((r) => r.id === role)) return { error: "Choose what this account signs in as." };
  return { value: [...existing, { email, name, role, ...(role === PARTNER_ROLE ? { partnerId } : {}), hash: hashPassword(password) }] };
}

export const removeLogin = (existing: Login[], email: unknown): Login[] => existing.filter((l) => l.email !== normEmail(email));

// The account for an email and password, or undefined. Always does one password check, so a missing email takes as long as a wrong password.
const DUMMY = hashPassword("not-a-real-password");
export function findLogin(existing: Login[], email: unknown, password: unknown): Login | undefined {
  const l = existing.find((x) => x.email === normEmail(email));
  const ok = checkPassword(typeof password === "string" ? password : "", l ? l.hash : DUMMY);
  return l && ok ? l : undefined;
}

// What the account holds when signed in. Partner: only the partner's own permissions and its id. Staff: the example role's permissions.
export function sessionPartsFor(l: Login): { perms: string[]; partner?: string } {
  return l.role === PARTNER_ROLE && l.partnerId ? { perms: PARTNER_PERMISSIONS, partner: l.partnerId } : { perms: roleById(l.role).permissions };
}
