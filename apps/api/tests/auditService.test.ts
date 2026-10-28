import { describe, expect, it } from "vitest";
import * as admin from "../src/services/adminService.js";
import * as auditModule from "../src/services/auditService.js";
import {
  authenticateAccount,
  closeFinding,
  createFinding,
  getChecklist,
  getDashboard,
  getFindingHistory,
  listFindings,
  saveAnswer,
  verifyAuditorCredentials,
} from "../src/services/auditService.js";
import { AUDITOR_PASSWORD, addDays, finding, login, makeAccount, publishedVersion, seed, T0 } from "./helpers/seed.js";

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("seharusnya gagal, tetapi berhasil");
};

describe("login akun Auditor dan resolusi sesi", () => {
  it("kredensial benar menghasilkan id akun; email diabaikan huruf besar/kecilnya", async () => {
    const s = await seed();
    expect(await verifyAuditorCredentials(s.store, "auditor1@sopinsya", AUDITOR_PASSWORD)).toBe(s.acc1.id);
    expect(await verifyAuditorCredentials(s.store, "  AUDITOR2@Sopinsya ", AUDITOR_PASSWORD)).toBe(s.acc2.id);
  });

  it("kata sandi salah, email tidak dikenal, dan akun nonaktif ditolak identik (null)", async () => {
    const s = await seed();
    expect(await verifyAuditorCredentials(s.store, "auditor1@sopinsya", "salah-total")).toBeNull();
    expect(await verifyAuditorCredentials(s.store, "tidak-ada@sopinsya", AUDITOR_PASSWORD)).toBeNull();
    await admin.setAuditorAccountActive(s.store, { accountId: s.acc1.id, isActive: false });
    expect(await verifyAuditorCredentials(s.store, "auditor1@sopinsya", AUDITOR_PASSWORD)).toBeNull();
  });

  it("hanya hash yang tersimpan; kata sandi mentah tidak ada di data", async () => {
    const s = await seed();
    expect(JSON.stringify(s.store.accounts)).not.toContain(AUDITOR_PASSWORD);
    expect(s.store.accounts[0]?.passwordHash.startsWith("scrypt$")).toBe(true);
  });

  it("authenticateAccount memberi konteks sesi ACTIVE milik akun itu sendiri", async () => {
    const s = await seed();
    const access = await authenticateAccount(s.store, s.acc1.id, T0);
    expect(access.context).toMatchObject({ auditorId: s.aud1.id, sessionId: s.session.id });
    const other = await authenticateAccount(s.store, s.acc2.id, T0);
    expect(other.context?.auditorId).toBe(s.aud2.id);
  });

  it("akun tidak dikenal atau nonaktif: 401, dicek ulang pada setiap pemanggilan", async () => {
    const s = await seed();
    expect(await fail(authenticateAccount(s.store, 9999, T0))).toMatchObject({ statusCode: 401 });
    await admin.setAuditorAccountActive(s.store, { accountId: s.acc1.id, isActive: false });
    expect(await fail(authenticateAccount(s.store, s.acc1.id, T0))).toMatchObject({ statusCode: 401 });
    await admin.setAuditorAccountActive(s.store, { accountId: s.acc1.id, isActive: true });
    await expect(authenticateAccount(s.store, s.acc1.id, T0)).resolves.toBeTruthy();
  });

  it("keanggotaan dicabut atau sesi ditutup: akun tetap sah tetapi tanpa konteks sesi", async () => {
    const s = await seed();
    await admin.revokeAuditor(s.store, { sessionId: s.session.id, auditorId: s.aud1.id }, T0);
    expect((await authenticateAccount(s.store, s.acc1.id, T0)).context).toBeNull();

    await admin.restoreAuditor(s.store, { sessionId: s.session.id, auditorId: s.aud1.id }, T0);
    expect((await authenticateAccount(s.store, s.acc1.id, T0)).context).not.toBeNull();

    await admin.closeSession(s.store, { sessionId: s.session.id, noAccess: true }, T0);
    expect((await authenticateAccount(s.store, s.acc1.id, T0)).context).toBeNull();
  });

  it("akun yang belum ditugaskan ke sesi manapun dapat login tanpa konteks", async () => {
    const s = await seed();
    const lone = await makeAccount(s.store, "Auditor Baru", "baru@sopinsya");
    const access = await authenticateAccount(s.store, lone.id, T0);
    expect(access.account.id).toBe(lone.id);
    expect(access.context).toBeNull();
  });

  it("tidak ada ketergantungan pada undangan: fungsi dan kolom undangan tidak ada", async () => {
    const s = await seed();
    for (const name of ["claimInvitation", "authenticate", "authenticateById", "resolvePasswordLogin", "logout"]) {
      expect(name in auditModule).toBe(false);
    }
    expect(JSON.stringify(s.store.auditors)).not.toMatch(/invite|tokenHash/i);
  });
});

describe("isolasi antar-auditor", () => {
  it("penugasan milik auditor lain dijawab 404 pada semua operasi", async () => {
    const s = await seed();
    const c1 = await login(s.store, s.acc1.id);
    const other = s.assign2.id;
    expect(await fail(getChecklist(s.store, c1, other))).toMatchObject({ statusCode: 404 });
    expect(await fail(saveAnswer(s.store, c1, other, s.items.a1.id, { result: "YA" }, T0))).toMatchObject({ statusCode: 404 });
    expect(await fail(createFinding(s.store, c1, other, finding(), T0))).toMatchObject({ statusCode: 404 });
    expect(await fail(listFindings(s.store, c1, other))).toMatchObject({ statusCode: 404 });
  });

  it("temuan auditor lain tidak dapat ditutup atau dilihat riwayatnya", async () => {
    const s = await seed();
    const c1 = await login(s.store, s.acc1.id);
    const c2 = await login(s.store, s.acc2.id);
    const { finding: f } = await createFinding(s.store, c2, s.assign2.id, finding(), T0);
    expect(await fail(closeFinding(s.store, c1, f.id, {}, T0))).toMatchObject({ statusCode: 404 });
    expect(await fail(getFindingHistory(s.store, c1, f.id))).toMatchObject({ statusCode: 404 });
  });
});

describe("jawaban checklist", () => {
  it("menyimpan YA, TIDAK, dan mengembalikan ke belum dijawab (null)", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    const a = await saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: "YA" }, T0);
    expect(a.result).toBe("YA");
    expect((await saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: "TIDAK" }, T0)).result).toBe("TIDAK");
    expect((await saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: null }, T0)).result).toBeNull();
    expect(s.store.answers).toHaveLength(1); // upsert: satu baris per item
  });

  it("menolak nilai di luar YA/TIDAK/null", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    expect(await fail(saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: "N/A" }, T0))).toMatchObject({ statusCode: 422 });
  });

  it("menolak item dari unit lain", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id); // ditugaskan ke unit B
    expect(await fail(saveAnswer(s.store, c, s.assign1.id, s.items.a1.id, { result: "YA" }, T0))).toMatchObject({
      statusCode: 422,
      code: "ITEM_NOT_IN_CHECKLIST",
    });
  });

  it("menolak penulisan setelah batas waktu (tetap dapat dibaca)", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    const late = addDays(T0, 8);
    expect(await fail(saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: "YA" }, late))).toMatchObject({
      statusCode: 403,
      code: "SESSION_NOT_WRITABLE",
    });
    expect(s.store.answers).toHaveLength(0);
    await expect(getChecklist(s.store, c, s.assign1.id)).resolves.toHaveLength(1);
  });

  it("menyimpan snapshot item saat jawaban dibuat", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    await saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: "YA" }, T0);
    expect(s.store.answers[0]?.snapshot).toMatchObject({
      schemaVersion: 1,
      criteria: "B1",
      standardCode: "ISO37001",
      versionLabel: "2016",
      departmentName: "Unit B",
    });
  });
});

describe("konsistensi versi checklist", () => {
  it("sesi lama tetap memakai versinya setelah versi baru terbit", async () => {
    const s = await seed();
    const v2 = await publishedVersion(s.store, s.standard.id, "2025", [{ departmentId: s.deptB.id, criteria: "B1-baru" }]);
    const c = await login(s.store, s.acc1.id);
    const list = await getChecklist(s.store, c, s.assign1.id);
    expect(list.map((i) => i.criteria)).toEqual(["B1"]);
    const v2Item = s.store.items.find((i) => i.versionId === v2.id);
    expect(await fail(saveAnswer(s.store, c, s.assign1.id, v2Item?.id ?? 0, { result: "YA" }, T0))).toMatchObject({
      code: "ITEM_NOT_IN_CHECKLIST",
    });
  });

  it("dua standar berbeda dipakai bersamaan tanpa tercampur", async () => {
    const s = await seed();
    const other = await admin.createStandard(s.store, { code: "iso9001", name: "ISO 9001" });
    const vOther = await publishedVersion(s.store, other.id, "2015", [{ departmentId: s.deptB.id, criteria: "MUTU-B1" }]);
    const session2 = await admin.createSession(s.store, { title: "Audit 2", checklistVersionId: vOther.id, expiresAt: addDays(T0, 7) }, T0);
    const accX = await makeAccount(s.store, "Auditor X", "x@sopinsya");
    const memberX = await admin.addAuditorToSession(s.store, { sessionId: session2.id, accountId: accX.id, noExclusions: true }, T0);
    const a = await admin.createAssignment(s.store, { sessionId: session2.id, auditorId: memberX.id, departmentId: s.deptB.id }, T0);
    await admin.activateSession(s.store, { sessionId: session2.id }, T0);

    const cX = await login(s.store, accX.id);
    const c1 = await login(s.store, s.acc1.id);
    expect((await getChecklist(s.store, cX, a.id)).map((i) => i.criteria)).toEqual(["MUTU-B1"]);
    expect((await getChecklist(s.store, c1, s.assign1.id)).map((i) => i.criteria)).toEqual(["B1"]);
    expect(await fail(getChecklist(s.store, cX, s.assign1.id))).toMatchObject({ statusCode: 404 });
  });
});

describe("temuan", () => {
  it("idempoten: kirim ulang kunci dan isi sama menghasilkan satu temuan", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    const first = await createFinding(s.store, c, s.assign1.id, finding(), T0);
    const again = await createFinding(s.store, c, s.assign1.id, finding(), T0);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.finding.id).toBe(first.finding.id);
    expect(s.store.findings).toHaveLength(1);
  });

  it("kunci sama dengan isi berbeda: 409 IDEMPOTENCY_CONFLICT", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    await createFinding(s.store, c, s.assign1.id, finding(), T0);
    expect(await fail(createFinding(s.store, c, s.assign1.id, finding({ problem: "lain" }), T0))).toMatchObject({
      statusCode: 409,
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("nomor urut per sesi bertambah; kode tampil diturunkan dari sessionId dan seq", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    const a = await createFinding(s.store, c, s.assign1.id, finding({ clientRequestId: "req-aaaaaaaa" }), T0);
    const b = await createFinding(s.store, c, s.assign1.id, finding({ clientRequestId: "req-bbbbbbbb" }), T0);
    expect([a.finding.seq, b.finding.seq]).toEqual([1, 2]);
    expect(a.finding.sessionId).toBe(s.session.id);
  });

  it("beberapa temuan boleh menaut ke satu jawaban; jawaban assignment lain ditolak", async () => {
    const s = await seed();
    const c1 = await login(s.store, s.acc1.id);
    const c2 = await login(s.store, s.acc2.id);
    const ans = await saveAnswer(s.store, c1, s.assign1.id, s.items.b1.id, { result: "TIDAK" }, T0);
    await createFinding(s.store, c1, s.assign1.id, finding({ clientRequestId: "req-aaaaaaaa", answerId: ans.id }), T0);
    await createFinding(s.store, c1, s.assign1.id, finding({ clientRequestId: "req-bbbbbbbb", answerId: ans.id }), T0);
    expect(s.store.findings.filter((f) => f.answerId === ans.id)).toHaveLength(2);
    expect(await fail(createFinding(s.store, c2, s.assign2.id, finding({ clientRequestId: "req-cccccccc", answerId: ans.id }), T0))).toMatchObject({
      code: "ANSWER_ASSIGNMENT_MISMATCH",
    });
  });

  it("temuan baru ditolak setelah batas waktu dan nomor tidak terpakai; pengulangan lama tetap dijawab", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    await createFinding(s.store, c, s.assign1.id, finding(), T0);
    const late = addDays(T0, 8);
    expect(await fail(createFinding(s.store, c, s.assign1.id, finding({ clientRequestId: "req-baru0001" }), late))).toMatchObject({
      statusCode: 403,
      code: "SESSION_NOT_WRITABLE",
    });
    expect(s.store.sessions[0]?.findingSeq).toBe(1);
    await expect(createFinding(s.store, c, s.assign1.id, finding(), late)).resolves.toMatchObject({ created: false });
  });

  it("penutupan tercatat di riwayat dan idempoten", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    const { finding: f } = await createFinding(s.store, c, s.assign1.id, finding(), T0);
    const closed = await closeFinding(s.store, c, f.id, { note: "Sudah diperbaiki" }, T0);
    expect(closed.changed).toBe(true);
    expect(closed.finding.status).toBe("CLOSED");

    const history = await getFindingHistory(s.store, c, f.id);
    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, "OPEN"],
      ["OPEN", "CLOSED"],
    ]);
    expect(history[1]?.note).toBe("Sudah diperbaiki");
    expect(history[1]?.changedByAuditorId).toBe(c.auditorId);

    const again = await closeFinding(s.store, c, f.id, {}, T0);
    expect(again.changed).toBe(false);
    expect(await getFindingHistory(s.store, c, f.id)).toHaveLength(2);
  });

  it("penutupan temuan mengikuti canAccess: boleh dalam jendela akses, ditolak setelahnya", async () => {
    const s = await seed();
    const c = await login(s.store, s.acc1.id);
    const { finding: f } = await createFinding(s.store, c, s.assign1.id, finding(), T0);
    await admin.closeSession(s.store, { sessionId: s.session.id, accessUntil: addDays(T0, 3) }, T0);

    // Sesi CLOSED: penulisan baru ditolak, tetapi penutupan temuan masih boleh dalam jendela akses.
    expect(await fail(createFinding(s.store, c, s.assign1.id, finding({ clientRequestId: "req-baru0001" }), addDays(T0, 1)))).toMatchObject({
      code: "SESSION_NOT_WRITABLE",
    });
    await expect(closeFinding(s.store, c, f.id, {}, addDays(T0, 1))).resolves.toMatchObject({ changed: true });

    const s2 = await seed();
    const c2 = await login(s2.store, s2.acc1.id);
    const { finding: f2 } = await createFinding(s2.store, c2, s2.assign1.id, finding(), T0);
    await admin.closeSession(s2.store, { sessionId: s2.session.id, noAccess: true }, T0);
    expect(await fail(closeFinding(s2.store, c2, f2.id, {}, T0))).toMatchObject({ code: "SESSION_NOT_ACCESSIBLE" });
  });
});

describe("dashboard", () => {
  it("menghitung progres jawaban dan temuan per penugasan milik sendiri", async () => {
    const s = await seed();
    const c1 = await login(s.store, s.acc1.id);
    const c2 = await login(s.store, s.acc2.id);
    const ans = await saveAnswer(s.store, c1, s.assign1.id, s.items.b1.id, { result: "TIDAK" }, T0);
    await createFinding(s.store, c1, s.assign1.id, finding({ answerId: ans.id, classification: "MAJOR" }), T0);

    const d1 = await getDashboard(s.store, c1);
    expect(d1).toHaveLength(1);
    expect(d1[0]).toMatchObject({
      assignmentId: s.assign1.id,
      totalItems: 1,
      answered: 1,
      tidak: 1,
      ya: 0,
      unanswered: 0,
      findings: { total: 1, open: 1, closed: 0, byClassification: { MAJOR: 1, MINOR: 0, OBSERVASI: 0 } },
    });

    const d2 = await getDashboard(s.store, c2);
    expect(d2).toHaveLength(1);
    expect(d2[0]).toMatchObject({ assignmentId: s.assign2.id, totalItems: 2, answered: 0, unanswered: 2 });
  });
});
