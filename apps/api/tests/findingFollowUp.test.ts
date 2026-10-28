import { describe, expect, it } from "vitest";
import { createFinding, listFindingFollowUps, saveFindingFollowUp } from "../src/services/auditService.js";
import { T0, finding, login, seed } from "./helpers/seed.js";

async function setup(classification: "MAJOR" | "MINOR" | "OBSERVASI" = "MINOR") {
  const s = await seed();
  const ctx = await login(s.store, s.acc1.id);
  const { finding: f } = await createFinding(s.store, ctx, s.assign1.id, finding({ classification }), T0);
  return { s, ctx, f };
}

const capa = {
  rootCause: "Belum memahami SOP",
  correction: "Memasang pengatur suhu",
  correctionPic: "Tim Laboratorium",
  correctionTarget: "Januari 2027",
  correctiveAction: "Sosialisasi SOP",
  correctiveActionPic: "Tim Mutu",
  correctiveActionTarget: "April 2027",
};

describe("tindak lanjut temuan", () => {
  it("Minor/Major: menyimpan akar penyebab, koreksi, dan tindakan korektif", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await saveFindingFollowUp(s.store, ctx, f.id, capa, T0);
    const [row] = await listFindingFollowUps(s.store, ctx, s.assign1.id);
    expect(row).toMatchObject({ findingId: f.id, ...capa, improvementAction: null });
  });

  it("kolom kosong menjadi null dan penyimpanan berikutnya menimpa seluruh isi", async () => {
    const { s, ctx, f } = await setup("MAJOR");
    await saveFindingFollowUp(s.store, ctx, f.id, capa, T0);
    await saveFindingFollowUp(s.store, ctx, f.id, { rootCause: "  Akar baru  ", correction: "" }, T0);
    const [row] = await listFindingFollowUps(s.store, ctx, s.assign1.id);
    expect(row).toMatchObject({ rootCause: "Akar baru", correction: null, correctiveAction: null });
  });

  it("Observasi: hanya tindakan peningkatan; kolom CAPA ditolak (422)", async () => {
    const { s, ctx, f } = await setup("OBSERVASI");
    await saveFindingFollowUp(s.store, ctx, f.id, { improvementAction: "Satu pintu layanan", improvementPic: "Tim Mutu" }, T0);
    const [row] = await listFindingFollowUps(s.store, ctx, s.assign1.id);
    expect(row).toMatchObject({ improvementAction: "Satu pintu layanan", improvementPic: "Tim Mutu", rootCause: null });

    await expect(saveFindingFollowUp(s.store, ctx, f.id, { rootCause: "x" }, T0)).rejects.toMatchObject({
      statusCode: 422,
      code: "FOLLOWUP_NOT_ALLOWED",
    });
  });

  it("Major/Minor menolak tindakan peningkatan (422)", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await expect(saveFindingFollowUp(s.store, ctx, f.id, { improvementAction: "x" }, T0)).rejects.toMatchObject({
      statusCode: 422,
      code: "FOLLOWUP_NOT_ALLOWED",
    });
  });

  it("menolak teks terlalu panjang (422 VALIDATION_ERROR)", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await expect(saveFindingFollowUp(s.store, ctx, f.id, { correctionTarget: "x".repeat(81) }, T0)).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_ERROR",
    });
  });

  it("404 untuk temuan milik auditor lain", async () => {
    const { s, f } = await setup("MINOR");
    const other = await login(s.store, s.acc2.id);
    await expect(saveFindingFollowUp(s.store, other, f.id, capa, T0)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("403 setelah sesi tidak dapat diakses", async () => {
    const { s, ctx, f } = await setup("MINOR");
    await s.store.closeSession(s.session.id, T0, null);
    const closedCtx = { ...ctx, session: (await s.store.findSession(s.session.id))! };
    await expect(saveFindingFollowUp(s.store, closedCtx, f.id, capa, T0)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("listFindingFollowUps: 404 untuk penugasan auditor lain", async () => {
    const { s, ctx } = await setup("MINOR");
    await expect(listFindingFollowUps(s.store, ctx, s.assign2.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
