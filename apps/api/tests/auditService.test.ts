import { describe, expect, it } from "vitest";
import * as admin from "../src/services/adminService.js";
import {
  authenticate,
  claimInvitation,
  closeFinding,
  createFinding,
  getChecklist,
  getDashboard,
  getFindingHistory,
  listFindings,
  logout,
  saveAnswer,
} from "../src/services/auditService.js";
import { addDays, finding, login, publishedVersion, seed, T0 } from "./helpers/seed.js";

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("seharusnya gagal, tetapi berhasil");
};

describe("klaim undangan dan sesi login", () => {
  it("undangan valid menghasilkan token sesi; klaim kedua ditolak 404 identik", async () => {
    const s = await seed();
    const ok = await claimInvitation(s.store, { token: s.inv1.inviteToken }, T0);
    expect(ok.token).toMatch(/^[0-9a-f]{64}$/);
    expect(await fail(claimInvitation(s.store, { token: s.inv1.inviteToken }, T0))).toMatchObject({
      statusCode: 404,
      code: "INVITATION_NOT_FOUND",
    });
  });

  it("undangan tidak dikenal dan kedaluwarsa ditolak dengan galat yang sama", async () => {
    const s = await seed();
    const unknown = await fail(claimInvitation(s.store, { token: "a".repeat(64) }, T0));
    const expired = await fail(claimInvitation(s.store, { token: s.inv1.inviteToken }, addDays(T0, 30)));
    expect(unknown).toMatchObject({ statusCode: 404, code: "INVITATION_NOT_FOUND" });
    expect(expired).toMatchObject({ statusCode: 404, code: "INVITATION_NOT_FOUND" });
  });

  it("undangan valid tetapi sesi tidak dapat diakses: 403 SESSION_NOT_ACCESSIBLE", async () => {
    const s = await seed();
    await admin.closeSession(s.store, { sessionId: s.session.id, noAccess: true }, T0);
    expect(await fail(claimInvitation(s.store, { token: s.inv1.inviteToken }, T0))).toMatchObject({
      statusCode: 403,
      code: "SESSION_NOT_ACCESSIBLE",
    });
  });

  it("hanya hash yang tersimpan; token mentah tidak ada di data", async () => {
    const s = await seed();
    await claimInvitation(s.store, { token: s.inv1.inviteToken }, T0);
    expect(JSON.stringify(s.store.auditors)).not.toContain(s.inv1.inviteToken);
  });

  it("token tidak dikenal 401; logout dan pencabutan membuat token tidak berlaku", async () => {
    const s = await seed();
    expect(await fail(authenticate(s.store, "x".repeat(64), T0))).toMatchObject({ statusCode: 401 });

    const claimed = await claimInvitation(s.store, { token: s.inv1.inviteToken }, T0);
    const ctx = await authenticate(s.store, claimed.token, T0);
    await logout(s.store, ctx);
    expect(await fail(authenticate(s.store, claimed.token, T0))).toMatchObject({ statusCode: 401 });

    const claimed2 = await claimInvitation(s.store, { token: s.inv2.inviteToken }, T0);
    await admin.revokeAuditor(s.store, { sessionId: s.session.id, auditorId: s.inv2.auditor.id }, T0);
    expect(await fail(authenticate(s.store, claimed2.token, T0))).toMatchObject({ statusCode: 401 });
  });

  it("terbit ulang menghanguskan token lama dan undangan lama", async () => {
    const s = await seed();
    const claimed = await claimInvitation(s.store, { token: s.inv1.inviteToken }, T0);
    const re = await admin.reissueInvitation(s.store, { sessionId: s.session.id, auditorId: s.inv1.auditor.id }, T0);
    expect(await fail(authenticate(s.store, claimed.token, T0))).toMatchObject({ statusCode: 401 });
    expect(await fail(claimInvitation(s.store, { token: s.inv1.inviteToken }, T0))).toMatchObject({ statusCode: 404 });
    await expect(claimInvitation(s.store, { token: re.inviteToken }, T0)).resolves.toBeTruthy();
  });
});

describe("isolasi antar-auditor", () => {
  it("penugasan milik auditor lain dijawab 404 pada semua operasi", async () => {
    const s = await seed();
    const c1 = await login(s.store, s.inv1.inviteToken);
    const other = s.assign2.id;
    expect(await fail(getChecklist(s.store, c1, other))).toMatchObject({ statusCode: 404 });
    expect(await fail(saveAnswer(s.store, c1, other, s.items.a1.id, { result: "YA" }, T0))).toMatchObject({ statusCode: 404 });
    expect(await fail(createFinding(s.store, c1, other, finding(), T0))).toMatchObject({ statusCode: 404 });
    expect(await fail(listFindings(s.store, c1, other))).toMatchObject({ statusCode: 404 });
  });

  it("temuan auditor lain tidak dapat ditutup atau dilihat riwayatnya", async () => {
    const s = await seed();
    const c1 = await login(s.store, s.inv1.inviteToken);
    const c2 = await login(s.store, s.inv2.inviteToken);
    const { finding: f } = await createFinding(s.store, c2, s.assign2.id, finding(), T0);
    expect(await fail(closeFinding(s.store, c1, f.id, {}, T0))).toMatchObject({ statusCode: 404 });
    expect(await fail(getFindingHistory(s.store, c1, f.id))).toMatchObject({ statusCode: 404 });
  });
});

describe("jawaban checklist", () => {
  it("menyimpan YA, TIDAK, dan mengembalikan ke belum dijawab (null)", async () => {
    const s = await seed();
    const c = await login(s.store, s.inv1.inviteToken);
    const a = await saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: "YA" }, T0);
    expect(a.result).toBe("YA");
    expect((await saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: "TIDAK" }, T0)).result).toBe("TIDAK");
    expect((await saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: null }, T0)).result).toBeNull();
    expect(s.store.answers).toHaveLength(1); // upsert: satu baris per item
  });

  it("menolak nilai di luar YA/TIDAK/null", async () => {
    const s = await seed();
    const c = await login(s.store, s.inv1.inviteToken);
    expect(await fail(saveAnswer(s.store, c, s.assign1.id, s.items.b1.id, { result: "N/A" }, T0))).toMatchObject({ statusCode: 422 });
  });

  it("menolak item dari unit lain", async () => {
    const s = await seed();
    const c = await login(s.store, s.inv1.inviteToken); // ditugaskan ke unit B
    expect(await fail(saveAnswer(s.store, c, s.assign1.id, s.items.a1.id, { result: "YA" }, T0))).toMatchObject({
      statusCode: 422,
      code: "ITEM_NOT_IN_CHECKLIST",
    });
  });

  it("menolak penulisan setelah batas waktu (tetap dapat dibaca)", async () => {
    const s = await seed();
    const c = await login(s.store, s.inv1.inviteToken);
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
    const c = await login(s.store, s.inv1.inviteToken);
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
    const c = await login(s.store, s.inv1.inviteToken);
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
    const inv = await admin.createAuditor(s.store, { sessionId: session2.id, name: "Auditor X", noExclusions: true }, T0);
    const a = await admin.createAssignment(s.store, { sessionId: session2.id, auditorId: inv.auditor.id, departmentId: s.deptB.id }, T0);
    await admin.activateSession(s.store, { sessionId: session2.id }, T0);

    const cX = await login(s.store, inv.inviteToken);
    const c1 = await login(s.store, s.inv1.inviteToken);
    expect((await getChecklist(s.store, cX, a.id)).map((i) => i.criteria)).toEqual(["MUTU-B1"]);
    expect((await getChecklist(s.store, c1, s.assign1.id)).map((i) => i.criteria)).toEqual(["B1"]);
    expect(await fail(getChecklist(s.store, cX, s.assign1.id))).toMatchObject({ statusCode: 404 });
  });
});

describe("temuan", () => {
  it("idempoten: kirim ulang kunci dan isi sama menghasilkan satu temuan", async () => {
    const s = await seed();
    const c = await login(s.store, s.inv1.inviteToken);
    const first = await createFinding(s.store, c, s.assign1.id, finding(), T0);
    const again = await createFinding(s.store, c, s.assign1.id, finding(), T0);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.finding.id).toBe(first.finding.id);
    expect(s.store.findings).toHaveLength(1);
  });

  it("kunci sama dengan isi berbeda: 409 IDEMPOTENCY_CONFLICT", async () => {
    const s = await seed();
    const c = await login(s.store, s.inv1.inviteToken);
    await createFinding(s.store, c, s.assign1.id, finding(), T0);
    expect(await fail(createFinding(s.store, c, s.assign1.id, finding({ problem: "lain" }), T0))).toMatchObject({
      statusCode: 409,
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("nomor urut per sesi bertambah; kode tampil diturunkan dari sessionId dan seq", async () => {
    const s = await seed();
    const c = await login(s.store, s.inv1.inviteToken);
    const a = await createFinding(s.store, c, s.assign1.id, finding({ clientRequestId: "req-aaaaaaaa" }), T0);
    const b = await createFinding(s.store, c, s.assign1.id, finding({ clientRequestId: "req-bbbbbbbb" }), T0);
    expect([a.finding.seq, b.finding.seq]).toEqual([1, 2]);
    expect(a.finding.sessionId).toBe(s.session.id);
  });

  it("beberapa temuan boleh menaut ke satu jawaban; jawaban assignment lain ditolak", async () => {
    const s = await seed();
    const c1 = await login(s.store, s.inv1.inviteToken);
    const c2 = await login(s.store, s.inv2.inviteToken);
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
    const c = await login(s.store, s.inv1.inviteToken);
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
    const c = await login(s.store, s.inv1.inviteToken);
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
    const c = await login(s.store, s.inv1.inviteToken);
    const { finding: f } = await createFinding(s.store, c, s.assign1.id, finding(), T0);
    await admin.closeSession(s.store, { sessionId: s.session.id, accessUntil: addDays(T0, 3) }, T0);

    // Sesi CLOSED: penulisan baru ditolak, tetapi penutupan temuan masih boleh dalam jendela akses.
    expect(await fail(createFinding(s.store, c, s.assign1.id, finding({ clientRequestId: "req-baru0001" }), addDays(T0, 1)))).toMatchObject({
      code: "SESSION_NOT_WRITABLE",
    });
    await expect(closeFinding(s.store, c, f.id, {}, addDays(T0, 1))).resolves.toMatchObject({ changed: true });

    const s2 = await seed();
    const c2 = await login(s2.store, s2.inv1.inviteToken);
    const { finding: f2 } = await createFinding(s2.store, c2, s2.assign1.id, finding(), T0);
    await admin.closeSession(s2.store, { sessionId: s2.session.id, noAccess: true }, T0);
    expect(await fail(closeFinding(s2.store, c2, f2.id, {}, T0))).toMatchObject({ code: "SESSION_NOT_ACCESSIBLE" });
  });
});

describe("dashboard", () => {
  it("menghitung progres jawaban dan temuan per penugasan milik sendiri", async () => {
    const s = await seed();
    const c1 = await login(s.store, s.inv1.inviteToken);
    const c2 = await login(s.store, s.inv2.inviteToken);
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
