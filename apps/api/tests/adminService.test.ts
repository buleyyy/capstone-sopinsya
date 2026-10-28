import { describe, expect, it } from "vitest";
import * as admin from "../src/services/adminService.js";
import * as audit from "../src/services/auditService.js";
import { MemoryStore } from "./helpers/memoryStore.js";
import { addDays, makeAccount, seed, T0 } from "./helpers/seed.js";

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("seharusnya gagal, tetapi berhasil");
};

async function draftVersion(store: MemoryStore) {
  const dept = await admin.createDepartment(store, { name: "Unit X" });
  const std = await admin.createStandard(store, { code: "x", name: "Standar X" });
  const v = await admin.createChecklistVersion(store, { standardId: std.id, versionLabel: "1" });
  return { dept, std, v };
}

describe("versi checklist", () => {
  it("versi PUBLISHED tidak dapat diubah", async () => {
    const s = await seed();
    expect(
      await fail(admin.addChecklistItem(s.store, { versionId: s.v1.id, departmentId: s.deptA.id, criteria: "tambahan" })),
    ).toMatchObject({ statusCode: 409, code: "VERSION_NOT_EDITABLE" });
    expect(s.store.items.filter((i) => i.versionId === s.v1.id)).toHaveLength(3);
  });

  it("versi kosong tidak dapat diterbitkan; terbit dua kali ditolak", async () => {
    const store = new MemoryStore();
    const { dept, v } = await draftVersion(store);
    expect(await fail(admin.publishChecklistVersion(store, { versionId: v.id }, T0))).toMatchObject({ code: "VERSION_EMPTY" });
    await admin.addChecklistItem(store, { versionId: v.id, departmentId: dept.id, criteria: "K1" });
    await admin.publishChecklistVersion(store, { versionId: v.id }, T0);
    expect(await fail(admin.publishChecklistVersion(store, { versionId: v.id }, T0))).toMatchObject({ code: "INVALID_STATE" });
  });

  it("dua versi dari standar yang sama dapat terbit bersamaan; label duplikat ditolak", async () => {
    const s = await seed();
    const v2 = await admin.createChecklistVersion(s.store, { standardId: s.standard.id, versionLabel: "2025" });
    await admin.addChecklistItem(s.store, { versionId: v2.id, departmentId: s.deptA.id, criteria: "baru" });
    await admin.publishChecklistVersion(s.store, { versionId: v2.id }, T0);
    expect(s.store.versions.filter((v) => v.status === "PUBLISHED")).toHaveLength(2);
    expect(await fail(admin.createChecklistVersion(s.store, { standardId: s.standard.id, versionLabel: "2025" }))).toMatchObject({
      code: "ALREADY_EXISTS",
    });
  });

  it("versi RETIRED tidak dapat dipilih untuk sesi baru", async () => {
    const s = await seed();
    await admin.retireChecklistVersion(s.store, { versionId: s.v1.id }, T0);
    expect(
      await fail(admin.createSession(s.store, { title: "Baru", checklistVersionId: s.v1.id, expiresAt: addDays(T0, 5) }, T0)),
    ).toMatchObject({ code: "VERSION_NOT_PUBLISHED" });
  });
});

describe("lifecycle sesi", () => {
  it("sesi hanya dapat dibuat dari versi PUBLISHED dan batas tulis di masa depan", async () => {
    const store = new MemoryStore();
    const { v } = await draftVersion(store);
    expect(await fail(admin.createSession(store, { title: "S", checklistVersionId: v.id, expiresAt: addDays(T0, 5) }, T0))).toMatchObject({
      code: "VERSION_NOT_PUBLISHED",
    });
    const s = await seed();
    expect(
      await fail(admin.createSession(s.store, { title: "S", checklistVersionId: s.v1.id, expiresAt: addDays(T0, -1) }, T0)),
    ).toMatchObject({ code: "EXPIRES_IN_PAST" });
  });

  it("aktivasi hanya dari DRAFT", async () => {
    const s = await seed(); // sudah ACTIVE
    expect(await fail(admin.activateSession(s.store, { sessionId: s.session.id }, T0))).toMatchObject({ code: "INVALID_STATE" });
  });

  it("batas waktu sesi DRAFT dapat diperbarui ke masa depan setelah tenggat lama lewat", async () => {
    const s = await seed();
    const draft = await admin.createSession(
      s.store,
      { title: "Draft tertunda", checklistVersionId: s.v1.id, expiresAt: addDays(T0, 1) },
      T0,
    );
    const now = addDays(T0, 2);
    expect(
      await fail(admin.updateDraftSessionDeadline(s.store, { sessionId: draft.id, to: addDays(T0, 1) }, now)),
    ).toMatchObject({ code: "EXPIRES_IN_PAST" });

    await admin.updateDraftSessionDeadline(s.store, { sessionId: draft.id, to: addDays(T0, 20) }, now);
    expect((await s.store.findSession(draft.id))?.expiresAt).toEqual(addDays(T0, 20));

    await s.store.activateSession(draft.id);
    expect(
      await fail(admin.updateDraftSessionDeadline(s.store, { sessionId: draft.id, to: addDays(T0, 30) }, now)),
    ).toMatchObject({ code: "INVALID_STATE" });
  });

  it("perpanjangan hanya ke masa depan dan hanya untuk sesi ACTIVE", async () => {
    const s = await seed();
    expect(await fail(admin.extendSession(s.store, { sessionId: s.session.id, to: addDays(T0, 3) }, T0))).toMatchObject({
      code: "EXTEND_NOT_FORWARD",
    });
    await admin.extendSession(s.store, { sessionId: s.session.id, to: addDays(T0, 14) }, T0);
    expect(s.store.sessions[0]?.expiresAt.getTime()).toBe(addDays(T0, 14).getTime());
  });

  it("sesi CLOSED tidak dapat dibuka, diaktifkan, atau diperpanjang", async () => {
    const s = await seed();
    await admin.closeSession(s.store, { sessionId: s.session.id, noAccess: true }, T0);
    expect(s.store.sessions[0]?.status).toBe("CLOSED");
    expect(s.store.sessions[0]?.closedAt).toEqual(T0);
    expect(await fail(admin.activateSession(s.store, { sessionId: s.session.id }, T0))).toMatchObject({ code: "INVALID_STATE" });
    expect(await fail(admin.extendSession(s.store, { sessionId: s.session.id, to: addDays(T0, 30) }, T0))).toMatchObject({
      code: "INVALID_STATE",
    });
    expect(await fail(admin.closeSession(s.store, { sessionId: s.session.id, noAccess: true }, T0))).toMatchObject({
      code: "INVALID_STATE",
    });
    expect(s.store.sessions[0]?.status).toBe("CLOSED");
  });

  it("penutupan wajib memilih accessUntil atau noAccess, dan accessUntil harus di masa depan", async () => {
    const s = await seed();
    expect(await fail(admin.closeSession(s.store, { sessionId: s.session.id }, T0))).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await fail(admin.closeSession(s.store, { sessionId: s.session.id, accessUntil: addDays(T0, -1) }, T0))).toMatchObject({
      code: "ACCESS_UNTIL_IN_PAST",
    });
    expect(s.store.sessions[0]?.status).toBe("ACTIVE");
  });
});

describe("akun Auditor", () => {
  it("membuat akun: email dinormalkan, kata sandi hanya tersimpan sebagai hash, email ganda ditolak", async () => {
    const store = new MemoryStore();
    const acc = await admin.createAuditorAccount(store, { name: "Budi", email: "  Budi@Instansi ", password: "rahasia-panjang-1" });
    expect(acc).toMatchObject({ email: "budi@instansi", name: "Budi", isActive: true });
    expect("passwordHash" in acc).toBe(false);
    expect(JSON.stringify(store.accounts)).not.toContain("rahasia-panjang-1");
    expect(await fail(admin.createAuditorAccount(store, { name: "Lain", email: "BUDI@instansi", password: "rahasia-panjang-2" }))).toMatchObject({
      code: "ALREADY_EXISTS",
    });
  });

  it("kata sandi pendek ditolak dan reset mengganti hash", async () => {
    const store = new MemoryStore();
    expect(await fail(admin.createAuditorAccount(store, { name: "A", email: "a@x", password: "pendek" }))).toMatchObject({
      code: "VALIDATION_ERROR",
    });
    const acc = await admin.createAuditorAccount(store, { name: "A", email: "a@x", password: "kata-sandi-awal-1" });
    const before = store.accounts[0]?.passwordHash;
    await admin.resetAuditorPassword(store, { accountId: acc.id, password: "kata-sandi-baru-22" });
    expect(store.accounts[0]?.passwordHash).not.toBe(before);
    expect(await audit.verifyAuditorCredentials(store, "a@x", "kata-sandi-baru-22")).toBe(acc.id);
    expect(await audit.verifyAuditorCredentials(store, "a@x", "kata-sandi-awal-1")).toBeNull();
  });

  it("akun yang tidak ada: 404", async () => {
    const store = new MemoryStore();
    expect(await fail(admin.setAuditorAccountActive(store, { accountId: 99, isActive: false }))).toMatchObject({ statusCode: 404 });
    expect(await fail(admin.resetAuditorPassword(store, { accountId: 99, password: "kata-sandi-baru-22" }))).toMatchObject({ statusCode: 404 });
  });
});

describe("auditor dan penugasan", () => {
  it("menambah auditor ke sesi wajib menyatakan pengecualian self-audit secara eksplisit", async () => {
    const s = await seed();
    const acc = await makeAccount(s.store, "Baru", "baru@sopinsya");
    expect(await fail(admin.addAuditorToSession(s.store, { sessionId: s.session.id, accountId: acc.id }, T0))).toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("satu akun hanya sekali per sesi, akun nonaktif atau tidak ada ditolak", async () => {
    const s = await seed();
    expect(
      await fail(admin.addAuditorToSession(s.store, { sessionId: s.session.id, accountId: s.acc1.id, noExclusions: true }, T0)),
    ).toMatchObject({ code: "ALREADY_EXISTS" });
    const acc = await makeAccount(s.store, "Nonaktif", "off@sopinsya");
    await admin.setAuditorAccountActive(s.store, { accountId: acc.id, isActive: false });
    expect(
      await fail(admin.addAuditorToSession(s.store, { sessionId: s.session.id, accountId: acc.id, noExclusions: true }, T0)),
    ).toMatchObject({ code: "ACCOUNT_INACTIVE" });
    expect(
      await fail(admin.addAuditorToSession(s.store, { sessionId: s.session.id, accountId: 999, noExclusions: true }, T0)),
    ).toMatchObject({ statusCode: 404 });
  });

  it("Admin menambah akun ke sesi lalu menugaskan unit langsung, tanpa token apa pun", async () => {
    const s = await seed();
    const acc = await makeAccount(s.store, "Citra", "citra@sopinsya");
    const member = await admin.addAuditorToSession(
      s.store,
      { sessionId: s.session.id, accountId: acc.id, excludeDepartmentIds: [s.deptB.id] },
      T0,
    );
    expect(member).toMatchObject({ accountId: acc.id, name: "Citra", revokedAt: null });
    const assignment = await admin.createAssignment(
      s.store,
      { sessionId: s.session.id, auditorId: member.id, departmentId: s.deptA.id },
      T0,
    );
    expect(assignment.auditorId).toBe(member.id);
    const ctx = await audit.authenticateAccount(s.store, acc.id, T0);
    expect(ctx.context?.auditorId).toBe(member.id);
    expect(await audit.getDashboard(s.store, ctx.context!)).toHaveLength(1);
  });

  it("penugasan ke unit terlarang ditolak (self-audit) dan tidak membuat baris", async () => {
    const s = await seed();
    const before = s.store.assignments.length;
    expect(
      await fail(admin.createAssignment(s.store, { sessionId: s.session.id, auditorId: s.aud1.id, departmentId: s.deptA.id }, T0)),
    ).toMatchObject({ statusCode: 422, code: "SELF_AUDIT_FORBIDDEN" });
    expect(s.store.assignments).toHaveLength(before);
  });

  it("penugasan idempoten untuk target yang sama", async () => {
    const s = await seed();
    const again = await admin.createAssignment(
      s.store,
      { sessionId: s.session.id, auditorId: s.aud1.id, departmentId: s.deptB.id },
      T0,
    );
    expect(again.id).toBe(s.assign1.id);
    expect(s.store.assignments).toHaveLength(2);
  });

  it("auditor dari sesi lain tidak dapat ditugaskan di sesi ini", async () => {
    const s = await seed();
    const session2 = await admin.createSession(s.store, { title: "Lain", checklistVersionId: s.v1.id, expiresAt: addDays(T0, 7) }, T0);
    expect(
      await fail(admin.createAssignment(s.store, { sessionId: session2.id, auditorId: s.aud1.id, departmentId: s.deptB.id }, T0)),
    ).toMatchObject({ statusCode: 404 });
  });

  it("penambahan auditor dan penugasan ditolak setelah batas waktu tulis", async () => {
    const s = await seed();
    const late = addDays(T0, 8);
    const acc = await makeAccount(s.store, "Telat", "telat@sopinsya");
    expect(
      await fail(admin.addAuditorToSession(s.store, { sessionId: s.session.id, accountId: acc.id, noExclusions: true }, late)),
    ).toMatchObject({ code: "SESSION_NOT_WRITABLE" });
    expect(
      await fail(admin.createAssignment(s.store, { sessionId: s.session.id, auditorId: s.aud1.id, departmentId: s.deptB.id }, late)),
    ).toMatchObject({ code: "SESSION_NOT_WRITABLE" });
  });

  it("akun dapat ditambahkan ke sesi DRAFT, tetapi baru dapat dipakai setelah sesi aktif", async () => {
    const s = await seed();
    const draft = await admin.createSession(s.store, { title: "Draft", checklistVersionId: s.v1.id, expiresAt: addDays(T0, 7) }, T0);
    const acc = await makeAccount(s.store, "Draft", "draft@sopinsya");
    await admin.addAuditorToSession(s.store, { sessionId: draft.id, accountId: acc.id, noExclusions: true }, T0);
    expect((await audit.authenticateAccount(s.store, acc.id, T0)).context).toBeNull();
  });

  it("pencabutan selalu diizinkan dan idempoten; pemulihan hanya pada sesi yang dapat ditulis", async () => {
    const s = await seed();
    await admin.closeSession(s.store, { sessionId: s.session.id, noAccess: true }, T0);
    await admin.revokeAuditor(s.store, { sessionId: s.session.id, auditorId: s.aud1.id }, T0);
    await admin.revokeAuditor(s.store, { sessionId: s.session.id, auditorId: s.aud1.id }, T0);
    expect(s.store.auditors.find((a) => a.id === s.aud1.id)?.revokedAt).not.toBeNull();
    expect(await fail(admin.restoreAuditor(s.store, { sessionId: s.session.id, auditorId: s.aud1.id }, T0))).toMatchObject({
      code: "SESSION_NOT_WRITABLE",
    });
  });

  it("mengaitkan akun ke keanggotaan lama tanpa akun, tanpa mengubah penugasan yang ada", async () => {
    const s = await seed();
    const legacy = await s.store.createAuditor({ sessionId: s.session.id, accountId: s.acc1.id, name: "Lama", excludedDepartmentIds: [] }).catch(() => null);
    expect(legacy).toBeNull(); // pastikan unik (sessionId, accountId) ditegakkan
    const row = { id: 900, sessionId: s.session.id, accountId: null, name: "Lama", revokedAt: null };
    s.store.auditors.push(row);
    const acc = await makeAccount(s.store, "Pengganti", "ganti@sopinsya");
    await admin.linkAuditorAccount(s.store, { sessionId: s.session.id, auditorId: row.id, accountId: acc.id }, T0);
    expect(s.store.auditors.find((a) => a.id === row.id)?.accountId).toBe(acc.id);
    expect(await fail(admin.linkAuditorAccount(s.store, { sessionId: s.session.id, auditorId: row.id, accountId: s.acc2.id }, T0))).toMatchObject({
      statusCode: 409,
    });
  });
});
