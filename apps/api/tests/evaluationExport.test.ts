import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  TEST_SHEET_NAME,
  buildTestResultsWorkbook,
  excelDate,
  excelTime,
  testExportFileName,
  xlsxText,
} from "../../web/admin/evaluationXlsx.js";
import type { TrainingAttemptRow } from "../../web/admin/readStore.js";

const HEADERS = [
  "No", "Nama Program", "Pertemuan", "Email", "Nama Peserta", "Jabatan", "Nama Instansi", "Nomor HP",
  "Benar", "Total Soal", "Nilai", "Jenis Test", "Tanggal", "Waktu Kirim",
];

const PROGRAMS: Record<string, string> = { "iso-9001": "ISO 9001", smap: "SMAP / ISO 37001 (Anti Penyuapan)", k3: "K3" };
const label = (slug: string) => PROGRAMS[slug] ?? slug;

let nextId = 1;
const attempt = (o: Partial<TrainingAttemptRow>): TrainingAttemptRow => ({
  id: nextId++, testId: 1, testTitle: "Tes", programSlug: "iso-9001", meetingNo: 1, type: "PRE",
  participantName: "Alfi", participantInstitution: "GUNADARMA", participantEmail: null, participantPosition: null,
  participantPhone: null, correctCount: 2, totalQuestions: 10, score: 20,
  submittedAt: new Date("2026-10-27T12:12:21Z"), ...o,
});

// Beberapa peserta, beberapa program, Pre dan Post bercampur; data diurutkan seperti rekap aplikasi (terbaru dulu).
const ROWS: TrainingAttemptRow[] = [
  attempt({ participantEmail: "budi@contoh.id", participantName: "Budi Santoso", participantPosition: "Manajer Mutu",
    participantPhone: "+62 812-3456-7890", type: "POST", meetingNo: 2, correctCount: 8, score: 80,
    submittedAt: new Date("2026-10-25T18:40:44Z") }), // 26 Okt 2026 01:40:44 WIB (melewati tengah malam)
  attempt({ programSlug: "smap", participantName: "Siti Nurhaliza, S.Kom; Ñandú", participantInstitution: 'PT "Maju", Tbk',
    participantPhone: "08123456789", correctCount: 10, score: 100, submittedAt: new Date("2026-10-27T10:50:40Z") }),
  attempt({ programSlug: "k3", participantName: '=HYPERLINK("http://x")', participantInstitution: "@kantor", type: "POST",
    correctCount: 0, score: 0, submittedAt: new Date("2026-10-26T18:21:25Z") }),
  attempt({}),
];

const load = async (rows: TrainingAttemptRow[]) => {
  const buf = await buildTestResultsWorkbook(rows, label, new Date("2026-11-13T00:00:00Z"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]); // tipe Buffer exceljs lebih sempit dari @types/node
  return { buf, ws: wb.getWorksheet(TEST_SHEET_NAME)! };
};

/** ExcelJS mengembalikan Date untuk sel berformat tanggal/waktu; samakan ke nomor seri Excel agar mudah dibandingkan. */
const serial = (v: unknown): number => (v instanceof Date ? v.getTime() / 86_400_000 + 25_569 : Number(v));

describe("Ekspor Rekap Nilai Pre-Test & Post-Test (.xlsx)", () => {
  it("menghasilkan berkas xlsx valid dengan 14 header berurutan dan satu baris per data", async () => {
    const { buf, ws } = await load(ROWS);
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // zip/OOXML, bukan teks CSV
    expect(ws).toBeDefined();
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(HEADERS);
    expect(ws.rowCount).toBe(1 + ROWS.length);
    expect(ws.columnCount).toBe(14);
  });

  it("setiap atribut masuk ke kolomnya sendiri dan sama dengan data sumber (termasuk Pre/Post)", async () => {
    const { ws } = await load(ROWS);
    ROWS.forEach((a, i) => {
      const r = ws.getRow(i + 2);
      expect(r.getCell(1).value).toBe(i + 1);
      expect(r.getCell(2).value).toBe(label(a.programSlug));
      expect(r.getCell(3).value).toBe(a.meetingNo);
      expect(r.getCell(8).value ?? null).toBe(a.participantPhone);
      expect(r.getCell(9).value).toBe(a.correctCount);
      expect(r.getCell(10).value).toBe(a.totalQuestions);
      expect(r.getCell(11).value).toBe(a.score);
      expect(r.getCell(12).value).toBe(a.type === "PRE" ? "Pre-test" : "Post-test");
    });
    const types = ROWS.map((_, i) => ws.getRow(i + 2).getCell(12).value);
    expect(types).toEqual(["Post-test", "Pre-test", "Post-test", "Pre-test"]);
    // Teks dengan koma, titik koma, kutip, dan karakter non-ASCII tetap utuh di satu sel.
    expect(ws.getCell("E3").value).toBe("Siti Nurhaliza, S.Kom; Ñandú");
    expect(ws.getCell("G3").value).toBe('PT "Maju", Tbk');
    expect(ws.getCell("B3").value).toBe("SMAP / ISO 37001 (Anti Penyuapan)");
  });

  it("nilai, jumlah soal, benar, pertemuan, dan No bertipe angka; nomor HP bertipe teks (angka 0 depan aman)", async () => {
    const { ws } = await load(ROWS);
    for (const col of [1, 3, 9, 10, 11]) expect(typeof ws.getRow(3).getCell(col).value).toBe("number");
    expect(ws.getCell("H3").value).toBe("08123456789");
    expect(ws.getCell("H3").numFmt).toBe("@");
    expect(ws.getCell("H2").value).toBe("+62 812-3456-7890"); // nomor bergaya +62 tidak diberi apostrof
  });

  it("sel kosong (email/jabatan/HP null) benar-benar kosong, bukan teks kosong", async () => {
    const { ws } = await load(ROWS);
    expect(ws.getCell("D3").value ?? null).toBeNull();
    expect(ws.getCell("F3").value ?? null).toBeNull();
    expect(ws.getCell("D3").border?.left?.style).toBe("thin"); // tetap berborder
  });

  it("tanggal & waktu memakai WIB, tersimpan sebagai tanggal/waktu Excel dengan format konsisten", async () => {
    const { ws } = await load(ROWS);
    // Baris 2: 2026-10-25T18:40:44Z = 26 Oktober 2026 01:40:44 WIB.
    expect(serial(ws.getCell("M2").value)).toBe(Date.UTC(2026, 9, 26) / 86_400_000 + 25_569);
    expect(serial(ws.getCell("N2").value)).toBeCloseTo((1 * 3600 + 40 * 60 + 44) / 86_400, 8);
    // Baris 5: 2026-10-27T12:12:21Z = 27 Oktober 2026 19:12:21 WIB.
    expect(serial(ws.getCell("M5").value)).toBe(Date.UTC(2026, 9, 27) / 86_400_000 + 25_569);
    expect(serial(ws.getCell("N5").value)).toBeCloseTo((19 * 3600 + 12 * 60 + 21) / 86_400, 8);
    for (let r = 2; r <= 5; r += 1) {
      expect(ws.getCell(`M${r}`).numFmt).toBe("[$-421]d mmmm yyyy");
      expect(ws.getCell(`N${r}`).numFmt).toBe("hh:mm:ss");
    }
  });

  it("header tebal berlatar warna, ada filter di semua kolom, freeze baris pertama, dan border tipis", async () => {
    const { ws } = await load(ROWS);
    const h = ws.getCell("A1");
    expect(h.font?.bold).toBe(true);
    expect(h.fill).toMatchObject({ type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } });
    expect(ws.autoFilter).toBe("A1:N5");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    for (const addr of ["A1", "N1", "A2", "N5", "H3"]) {
      const b = ws.getCell(addr).border!;
      expect([b.top?.style, b.bottom?.style, b.left?.style, b.right?.style]).toEqual(["thin", "thin", "thin", "thin"]);
    }
  });

  it("alignment mengikuti jenis data dan lebar kolom menyesuaikan isi", async () => {
    const { ws } = await load(ROWS);
    expect(ws.getCell("B2").alignment?.horizontal).toBe("left"); // teks
    expect(ws.getCell("E2").alignment?.horizontal).toBe("left");
    expect(ws.getCell("K2").alignment?.horizontal).toBe("center"); // angka pendek
    expect(ws.getCell("M2").alignment?.horizontal).toBe("center"); // tanggal
    const w = (c: number) => ws.getColumn(c).width as number;
    expect(w(2)).toBeGreaterThanOrEqual("SMAP / ISO 37001 (Anti Penyuapan)".length); // Nama Program terpanjang
    expect(w(5)).toBeGreaterThanOrEqual("Siti Nurhaliza, S.Kom; Ñandú".length);
    expect(w(1)).toBeLessThan(w(2));
    for (let c = 1; c <= 14; c += 1) expect(w(c)).toBeLessThanOrEqual(48);
  });

  it("menetralkan awalan formula pada teks tanpa merusak nomor telepon", async () => {
    const { ws } = await load(ROWS);
    expect(ws.getCell("E4").value).toBe(`'=HYPERLINK("http://x")`);
    expect(ws.getCell("G4").value).toBe("'@kantor");
    expect(xlsxText("+1+cmd|' /C calc'!A0")).toBe("'+1+cmd|' /C calc'!A0");
    expect(xlsxText("-2+3")).toBe("'-2+3");
    expect(xlsxText("+62 (812) 345-678")).toBe("+62 (812) 345-678");
    expect(xlsxText("Budi")).toBe("Budi");
    expect(xlsxText("a\u0000b\u0008c")).toBe("abc"); // karakter kontrol tidak sah di XML dibuang
  });

  it("tetap valid dan hanya berisi header bila tidak ada data", async () => {
    const { ws } = await load([]);
    expect(ws.rowCount).toBe(1);
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(HEADERS);
    expect(ws.autoFilter).toBe("A1:N1");
  });

  it("menangani banyak baris (2000) tanpa mengubah urutan atau nomor", async () => {
    const many = Array.from({ length: 2000 }, (_, i) => attempt({ participantName: `Peserta ${i + 1}`, score: i % 101 }));
    const { ws } = await load(many);
    expect(ws.rowCount).toBe(2001);
    expect(ws.getCell("A2001").value).toBe(2000);
    expect(ws.getCell("E1001").value).toBe("Peserta 1000");
    expect(ws.autoFilter).toBe("A1:N2001");
  });
});

describe("Waktu & nama berkas ekspor", () => {
  it("memakai tanggal WIB untuk nama berkas Rekap_Nilai_Pre_Post_Test_YYYY-MM-DD.xlsx", () => {
    expect(testExportFileName(new Date("2026-11-12T17:30:00Z"))).toBe("Rekap_Nilai_Pre_Post_Test_2026-11-13.xlsx"); // 00:30 WIB
    expect(testExportFileName(new Date("2026-11-13T16:59:59Z"))).toBe("Rekap_Nilai_Pre_Post_Test_2026-11-13.xlsx"); // 23:59:59 WIB
    expect(testExportFileName(new Date("2026-11-13T17:00:00Z"))).toBe("Rekap_Nilai_Pre_Post_Test_2026-11-14.xlsx");
  });

  it("mengubah tanggal & jam ke nomor seri Excel berdasarkan WIB", () => {
    const d = new Date("2026-10-26T18:40:44Z"); // 27 Okt 2026 01:40:44 WIB
    expect(excelDate(d)).toBe(Date.UTC(2026, 9, 27) / 86_400_000 + 25_569);
    expect(excelTime(d)).toBeCloseTo(6044 / 86_400, 10);
    expect(excelDate(new Date("2026-01-01T00:00:00Z"))).toBe(46_023); // 1 Jan 2026
  });
});
