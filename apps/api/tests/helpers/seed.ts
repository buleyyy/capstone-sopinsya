import { MemoryStore } from "./memoryStore.js";
import * as admin from "../../src/services/adminService.js";
import { authenticateAccount, type AuditContext } from "../../src/services/auditService.js";
import { hashPassword } from "../../src/lib/passwords.js";

export const T0 = new Date("2026-10-01T00:00:00.000Z");
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Kata sandi akun Auditor pada skenario seed. */
export const AUDITOR_PASSWORD = "kata-sandi-auditor-uji";

let cachedHash: Promise<string> | undefined;
/** scrypt sengaja lambat; hash dihitung sekali per proses test agar suite tetap cepat. */
const seededPasswordHash = (): Promise<string> => (cachedHash ??= hashPassword(AUDITOR_PASSWORD));

export async function publishedVersion(
  store: MemoryStore,
  standardId: number,
  label: string,
  items: { departmentId: number; criteria: string }[],
  now: Date = T0,
) {
  const v = await admin.createChecklistVersion(store, { standardId, versionLabel: label });
  let order = 0;
  for (const it of items) {
    await admin.addChecklistItem(store, { versionId: v.id, departmentId: it.departmentId, criteria: it.criteria, sortOrder: order++ });
  }
  await admin.publishChecklistVersion(store, { versionId: v.id }, now);
  return v;
}

/** Membuat akun Auditor langsung di store dengan kata sandi seed (melewati hashing ulang). */
export async function makeAccount(store: MemoryStore, name: string, email: string) {
  return store.createAuditorAccount({ name, email, passwordHash: await seededPasswordHash() });
}

/**
 * Skenario dasar: 2 unit (A, B), 1 standar, 1 versi PUBLISHED (A1, A2, B1), 1 sesi ACTIVE (batas tulis +7 hari).
 * Akun auditor1 (aud1): dilarang mengaudit A, ditugaskan ke B. Akun auditor2 (aud2): dilarang mengaudit B, ditugaskan ke A.
 */
export async function seed(now: Date = T0) {
  const store = new MemoryStore();
  const deptA = await admin.createDepartment(store, { name: "Unit A" });
  const deptB = await admin.createDepartment(store, { name: "Unit B" });
  const standard = await admin.createStandard(store, { code: "iso37001", name: "ISO 37001" });
  const v1 = await publishedVersion(store, standard.id, "2016", [
    { departmentId: deptA.id, criteria: "A1" },
    { departmentId: deptA.id, criteria: "A2" },
    { departmentId: deptB.id, criteria: "B1" },
  ], now);
  const session = await admin.createSession(store, { title: "Audit 1", checklistVersionId: v1.id, expiresAt: addDays(now, 7) }, now);
  const acc1 = await makeAccount(store, "Auditor 1", "auditor1@sopinsya");
  const acc2 = await makeAccount(store, "Auditor 2", "auditor2@sopinsya");
  const aud1 = await admin.addAuditorToSession(store, { sessionId: session.id, accountId: acc1.id, excludeDepartmentIds: [deptA.id] }, now);
  const aud2 = await admin.addAuditorToSession(store, { sessionId: session.id, accountId: acc2.id, excludeDepartmentIds: [deptB.id] }, now);
  const assign1 = await admin.createAssignment(store, { sessionId: session.id, auditorId: aud1.id, departmentId: deptB.id }, now);
  const assign2 = await admin.createAssignment(store, { sessionId: session.id, auditorId: aud2.id, departmentId: deptA.id }, now);
  await admin.activateSession(store, { sessionId: session.id }, now);

  const item = (criteria: string) => {
    const found = store.items.find((i) => i.criteria === criteria && i.versionId === v1.id);
    if (!found) throw new Error(`item ${criteria} tidak ada`);
    return found;
  };
  return {
    store,
    deptA,
    deptB,
    standard,
    v1,
    session,
    acc1,
    acc2,
    aud1,
    aud2,
    assign1,
    assign2,
    items: { a1: item("A1"), a2: item("A2"), b1: item("B1") },
  };
}

/** Konteks audit untuk akun, seperti yang dibangun middleware /auditor (akun -> keanggotaan sesi). */
export async function login(store: MemoryStore, accountId: number, now: Date = T0): Promise<AuditContext> {
  const access = await authenticateAccount(store, accountId, now);
  if (!access.context) throw new Error("akun tidak memiliki sesi yang dapat diakses");
  return access.context;
}

export const finding = (over: Record<string, unknown> = {}) => ({
  clientRequestId: "req-00000001",
  classification: "MINOR",
  problem: "Dokumen tidak lengkap",
  location: "Ruang arsip",
  objectiveEvidence: "Formulir tidak ditandatangani",
  reference: "Klausul 8.2",
  ...over,
});
