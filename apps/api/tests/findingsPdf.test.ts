import { describe, expect, it } from "vitest";
import { renderFindingsPdf, toPdfText, type FindingsPdfInput, type PdfFinding } from "../src/services/findingsPdf.js";

const finding = (i: number, over: Partial<PdfFinding> = {}): PdfFinding => ({
  code: `T-1-${i}`,
  classification: "MINOR",
  status: "OPEN",
  reference: "Klausul 8.2",
  problem: "Dokumen tidak lengkap",
  location: "Ruang arsip",
  objectiveEvidence: "Formulir tidak ditandatangani",
  closedAtLabel: null,
  rootCause: null,
  correction: null,
  correctionPic: null,
  correctionTarget: null,
  correctionEvidenceName: null,
  correctiveAction: null,
  correctiveActionPic: null,
  correctiveActionTarget: null,
  correctiveActionEvidenceName: null,
  improvementAction: null,
  improvementPic: null,
  improvementTarget: null,
  improvementEvidenceName: null,
  verificationResult: null,
  verifiedDateLabel: null,
  ...over,
});

const input = (findings: PdfFinding[]): FindingsPdfInput => ({
  header: { organization: "SOPINSYA EDUCENTER", subtitle: "SMAP ISO 37001", formTitle: "LAPORAN KETIDAKSESUAIAN", formCode: "F.12-01", revision: "00", issuedAt: "" },
  sessionTitle: "Audit 1",
  unitName: "Unit A",
  auditorName: "Auditor 1",
  printedAtLabel: "9 Nov 2026",
  findings,
  counts: { major: 0, minor: findings.length, observasi: 0 },
  reportedDateLabel: null,
  followedUpDateLabel: null,
  verifiedDateLabel: null,
  auditees: [],
  verifiers: [],
});

const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;

describe("renderFindingsPdf", () => {
  it("menghasilkan berkas PDF yang sah untuk daftar kosong (satu halaman)", async () => {
    const pdf = await renderFindingsPdf(input([]));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1")).toContain("%%EOF");
    expect(pageCount(pdf)).toBe(1);
  });

  it("memakai A4 lanskap", async () => {
    const pdf = await renderFindingsPdf(input([finding(1)]));
    expect(pdf.toString("latin1")).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
  });

  it("banyak temuan menghasilkan lebih dari satu halaman", async () => {
    const many = Array.from({ length: 30 }, (_, i) => finding(i + 1, { problem: "Uraian panjang. ".repeat(40) }));
    expect(pageCount(await renderFindingsPdf(input(many)))).toBeGreaterThan(1);
  });

  it("tidak melempar galat untuk teks ekstrem (URL panjang, emoji, baris kosong, satu sel lebih tinggi dari halaman)", async () => {
    const odd = finding(1, {
      problem: `${"a".repeat(600)}\n\n\n😀 日本語 \u0000\t`,
      objectiveEvidence: "x ".repeat(6000),
      classification: "OBSERVASI",
      improvementAction: "Tindakan",
      improvementEvidenceName: "SK_Ruang.pdf",
    });
    const pdf = await renderFindingsPdf(input([odd, finding(2)]));
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });
});

describe("toPdfText", () => {
  it("mempertahankan Latin-1 dan tanda baca umum, mengganti karakter lain dengan '?'", () => {
    expect(toPdfText("Café – “kutip” … €")).toBe("Café – “kutip” … €");
    expect(toPdfText("😀")).toBe("?");
    expect(toPdfText("日本")).toBe("??");
  });

  it("membuang karakter kontrol tetapi mempertahankan baris baru", () => {
    expect(toPdfText("a\u0000b\r\nc\td")).toBe("ab\nc  d");
  });
});
