import { describe, expect, it } from "vitest";
import { followUpSchema } from "../src/domain/auditSchemas.js";
import {
  createFinding,
  deleteFinding,
  getDashboard,
  listAllFindings,
  listFindingFollowUps,
  listFindings,
  saveFindingFollowUp,
} from "../src/services/auditService.js";
import { T0, finding, login, seed } from "./helpers/seed.js";

async function setup(classification: "MAJOR" | "MINOR" | "OBSERVASI" = "MINOR") {
  const s = await seed();
  const ctx = await login(s.store, s.inv1.inviteToken);
  const { finding: f } = await createFinding(s.store, ctx, s.assign1.id, finding({ classification }), T0);
  return { s, ctx, f };
}

describe("hapus lunak temuan", () => {
  it("temuan hilang dari daftar, register lintas unit, tindak lanjut, dan dashboard", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await createFinding(s.store, ctx, s.assign1.id, finding({ clientRequestId: "req-00000002" }), T0);

    const result = await deleteFinding(s.store, ctx, f.id, T0);
    expect(result.changed).toBe(true);

    expect((await listFindings(s.store, ctx, s.assign1.id)).map((x) => x.id)).not.toContain(f.id);
    expect(await listFindingFollowUps(s.store, ctx, s.assign1.id)).toHaveLength(1);
    expect(await listAllFindings(s.store, ctx)).toHaveLength(1);
    const [dash] = await getDashboard(s.store, ctx);
    expect(dash?.findings.total).toBe(1);
  });

  it("nomor temuan tidak dipakai ulang setelah penghapusan", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await deleteFinding(s.store, ctx, f.id, T0);
    const { finding: next } = await createFinding(s.store, ctx, s.assign1.id, finding({ clientRequestId: "req-00000002" }), T0);
    expect(next.seq).toBe(f.seq + 1);
  });

  it("idempoten: penghapusan kedua tidak galat dan changed = false", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await deleteFinding(s.store, ctx, f.id, T0);
    await expect(deleteFinding(s.store, ctx, f.id, T0)).resolves.toMatchObject({ changed: false });
  });

  it("temuan yang sudah dihapus tidak dapat diubah lagi (404)", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await deleteFinding(s.store, ctx, f.id, T0);
    await expect(saveFindingFollowUp(s.store, ctx, f.id, { rootCause: "x" }, T0)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404 untuk temuan milik auditor lain", async () => {
    const { s, ctx, f } = await setup("MINOR");
    const other = await login(s.store, s.inv2.inviteToken);
    await expect(deleteFinding(s.store, other, f.id, T0)).rejects.toMatchObject({ statusCode: 404 });
    expect(await listFindings(s.store, ctx, s.assign1.id)).toHaveLength(1);
  });

  it("403 setelah sesi tidak dapat ditulis, dan temuan tetap ada", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await s.store.closeSession(s.session.id, T0, null);
    const closedCtx = { ...ctx, session: (await s.store.findSession(s.session.id))! };
    await expect(deleteFinding(s.store, closedCtx, f.id, T0)).rejects.toMatchObject({ statusCode: 403 });
    expect(await s.store.findFindingOwned(ctx.sessionId, ctx.auditorId, f.id)).not.toBeNull();
  });
});

describe("bukti tindakan peningkatan (Observasi)", () => {
  it("Observasi menyimpan tautan bukti berkas unggahan maupun https", async () => {
    const { s, ctx, f } = await setup("OBSERVASI");
    await saveFindingFollowUp(s.store, ctx, f.id, { improvementAction: "Satu pintu", improvementEvidenceUrl: "/auditor/bukti/7/SK.pdf" }, T0);
    let [row] = await listFindingFollowUps(s.store, ctx, s.assign1.id);
    expect(row?.improvementEvidenceUrl).toBe("/auditor/bukti/7/SK.pdf");

    await saveFindingFollowUp(s.store, ctx, f.id, { improvementEvidenceUrl: "https://contoh.test/bukti.pdf" }, T0);
    [row] = await listFindingFollowUps(s.store, ctx, s.assign1.id);
    expect(row?.improvementEvidenceUrl).toBe("https://contoh.test/bukti.pdf");
  });

  it("Major/Minor menolak bukti peningkatan (422)", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await expect(
      saveFindingFollowUp(s.store, ctx, f.id, { improvementEvidenceUrl: "https://contoh.test/a.pdf" }, T0),
    ).rejects.toMatchObject({ statusCode: 422, code: "FOLLOWUP_NOT_ALLOWED" });
  });

  it("skema menolak http dan path lokal selain /auditor/bukti", () => {
    for (const bad of ["http://contoh.test/a", "/admin/akun", "javascript:alert(1)"]) {
      expect(followUpSchema.safeParse({ improvementEvidenceUrl: bad }).success).toBe(false);
    }
  });
});
