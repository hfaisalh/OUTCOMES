import { partnerHomeHtml } from "./partner-home";
import { signinHtml } from "./signin-page";
import { profileFormOf } from "./partner-profile";
import type { PartnerUi } from "./partner-outcomes";
const kid = (id: string, name: string, eligibility: string, over = {}) => ({ id, kind: "person", name, status: "active", area: "Kasur", notes: "", dob: "2015-01-01", gender: "female", guardian: "G", guardianRelation: "mother", placeOfBirth: "", idNumber: "X1", fatherStatus: "", motherStatus: "", eligibility, eligibilityNote: "", partnerId: "p1", partnerRef: "", memberIds: [], targetProjectId: "g1", ...over });
const slice: any = { partner: { id: "p1", name: "Alpha Trust", reference: "R-1", type: "NGO", reportVia: "Email", language: "Urdu", itemIds: ["S"], contacts: [{ name: "Amina Khan", position: "Director", phone: "1", mobile: "", email: "a@example.org", handles: "" }], benefitTerms: { S: { costPerUnit: 30, currency: "GBP" } } },
  giftProjects: [{ id: "g1", name: "Orphan homes", itemIds: ["S"], clusters: [{ id: "c", name: "Lahore", label: "Home", parentId: "", place: "", status: "active" }] }],
  beneficiaries: [kid("PRS-1", "Amina Khan", "ready"), kid("PRS-2", "Bilal Ahmed", "review", { dob: "" }), kid("PRS-3", "Chand Ali", "ready")],
  enrolments: [{ id: "EN-1", beneficiaryId: "PRS-3", giftProjectId: "g1", clusterId: "c", itemId: "S", role: "", status: "active", since: "2026-11-01" }],
  assignments: [{ key: "sub:1", partnerId: "p1", giftProjectId: "g1", itemId: "S", parts: 1, how: "auto", at: "2026-11-02T00:00:00Z" }],
  confirmations: [], progress: [], allocations: [], itemNames: { S: "Orphan Sponsorship Monthly" },
  costs: [{ id: "PC-0001", partnerId: "p1", date: "2026-11-20", category: "Travel", amount: 40, currency: "GBP", projectId: "g1", itemId: "S", note: "Transport", by: "x", at: "t" }],
  gifts: { "sub:1": { reference: "sub:1", recurring: true, units: 2, planned: 12, paid: 3, cause: "Orphans", intention: "", tribute: "", phases: [{ label: "Visit", days: 7 }], review: true, feedback: false, answerBy: "2026-11-05" } } };
const Q: PartnerUi = { open: [], details: [], lastOpened: "", refusing: null, form: null, csv: null, message: "", error: "" };
const show = (ui: Partial<PartnerUi>) => { document.getElementById("shell")!.innerHTML = partnerHomeHtml(slice, "Sara", "v0", { ...Q, ...ui }); };
(window as any).scene = (n: string) => {
  if (n === "home") show({});
  else if (n === "open") show({ open: ["none"], details: ["sub:1"] });
  else if (n === "form") show({ form: { id: "", values: {}, error: "", similar: false } });
  else if (n === "cost") show({ cost: { id: "", values: {}, error: "" } });
  else if (n === "profile") show({ profile: profileFormOf(slice.partner) });
  else if (n === "signin") document.getElementById("shell")!.innerHTML = signinHtml("");
  return n;
};
