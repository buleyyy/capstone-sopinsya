import ExcelJS from "exceljs";
import type { TrainingAttemptRow } from "./readStore.js";

/**
 * Ekspor Rekap Nilai Pre-Test & Post-Test ke berkas Excel (.xlsx).
 *
 * Dipisah dari evaluationRoutes.ts agar bisa diuji tanpa Express/database. Modul ini HANYA memformat baris yang
 * sudah diambil dan difilter oleh rute; tidak menghitung ulang nilai, jumlah soal, atau mengambil data sendiri.
 */

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const TEST_SHEET_NAME = "Rekap Pre-Post Test";

type Align = "left" | "center" | "right";
interface Column {
  header: string;
  align: Align;
  /** Format sel Excel. "@" = teks (menjaga angka 0 di depan nomor HP). */
  numFmt: string;
  /** Lebar minimum (karakter); lebar akhir menyesuaikan isi terpanjang. */
  min: number;
}

/** Urutan dan nama kolom sama dengan ekspor CSV sebelumnya. */
export const TEST_COLUMNS: readonly Column[] = [
  // Catatan lebar: ExcelJS menganggap lebar 9 = bawaan dan tidak menulisnya, jadi semua lebar minimum dibuat != 9.
  { header: "No", align: "center", numFmt: "0", min: 7 },
  { header: "Nama Program", align: "left", numFmt: "@", min: 16 },
  { header: "Pertemuan", align: "center", numFmt: "0", min: 11 },
  { header: "Email", align: "left", numFmt: "@", min: 12 },
  { header: "Nama Peserta", align: "left", numFmt: "@", min: 16 },
  { header: "Jabatan", align: "left", numFmt: "@", min: 12 },
  { header: "Nama Instansi", align: "left", numFmt: "@", min: 16 },
  { header: "Nomor HP", align: "left", numFmt: "@", min: 14 },
  { header: "Benar", align: "center", numFmt: "0", min: 10 },
  { header: "Total Soal", align: "center", numFmt: "0", min: 12 },
  { header: "Nilai", align: "center", numFmt: "0", min: 10 },
  { header: "Jenis Test", align: "center", numFmt: "@", min: 12 },
  // Tanggal & waktu disimpan sebagai angka tanggal/waktu Excel sungguhan (bisa diurutkan dan difilter).
  // [$-421] memaksa nama bulan berbahasa Indonesia di Excel mana pun, apa pun bahasa Windows-nya.
  { header: "Tanggal", align: "center", numFmt: "[$-421]d mmmm yyyy", min: 18 },
  { header: "Waktu Kirim", align: "center", numFmt: "hh:mm:ss", min: 12 },
];

const MAX_WIDTH = 48;
const HEADER_FILL = "FF1F4E79"; // biru tua
const BORDER_COLOR = { argb: "FFBFBFBF" };
const THIN = { style: "thin", color: BORDER_COLOR } as const;

// ---------- Waktu (WIB, Asia/Jakarta, UTC+7 tanpa DST) ----------

const wibParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface WibParts { year: number; month: number; day: number; hour: number; minute: number; second: number }

export function toWib(d: Date): WibParts {
  const p = Object.fromEntries(wibParts.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p["year"]), month: Number(p["month"]), day: Number(p["day"]),
    hour: Number(p["hour"]), minute: Number(p["minute"]), second: Number(p["second"]),
  };
}

/** Nomor seri tanggal Excel (1900 date system) untuk tanggal kalender WIB dari `d`. */
export function excelDate(d: Date): number {
  const w = toWib(d);
  return Math.round(Date.UTC(w.year, w.month - 1, w.day) / 86_400_000) + 25_569;
}

/** Pecahan hari Excel (0..1) untuk jam WIB dari `d`. */
export function excelTime(d: Date): number {
  const w = toWib(d);
  return (w.hour * 3600 + w.minute * 60 + w.second) / 86_400;
}

/** Nama berkas: Rekap_Nilai_Pre_Post_Test_YYYY-MM-DD.xlsx (tanggal WIB hari ekspor). */
export function testExportFileName(now: Date = new Date()): string {
  const w = toWib(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Rekap_Nilai_Pre_Post_Test_${w.year}-${pad(w.month)}-${pad(w.day)}.xlsx`;
}

// ---------- Teks aman ----------

const XML_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const PHONE_LIKE = /^[+-]?[\d\s().-]+$/;

/**
 * Teks sel: buang karakter kontrol yang tidak sah di XML, dan netralkan awalan formula (=, @, +, -) seperti ekspor
 * CSV lama. Nomor telepon bergaya "+62 812-..." tidak diubah. Sel xlsx bertipe teks tidak dievaluasi Excel, ini hanya
 * lapisan pertahanan bila berkas kelak disimpan ulang ke CSV atau diedit.
 */
export function xlsxText(value: string | null | undefined): string {
  let s = (value ?? "").replace(XML_CONTROL, "");
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !PHONE_LIKE.test(s))) s = `'${s}`;
  return s;
}

// ---------- Workbook ----------

/** Nilai kosong/null ditulis sebagai sel benar-benar kosong (bukan teks ""), supaya filter Excel menyebutnya (Blanks). */
const blankable = (v: string | null | undefined): string | null => (v === null || v === undefined || v === "" ? null : xlsxText(v));

export function testRowValues(a: TrainingAttemptRow, no: number, programLabel: string): (string | number | null)[] {
  return [
    no,
    blankable(programLabel),
    a.meetingNo,
    blankable(a.participantEmail),
    blankable(a.participantName),
    blankable(a.participantPosition),
    blankable(a.participantInstitution),
    blankable(a.participantPhone),
    a.correctCount,
    a.totalQuestions,
    a.score,
    a.type === "PRE" ? "Pre-test" : "Post-test",
    excelDate(a.submittedAt),
    excelTime(a.submittedAt),
  ];
}

/**
 * Membuat berkas .xlsx rekap Pre/Post-test dari baris yang SUDAH difilter (urutan baris dipertahankan, No = urutan).
 * `programLabel` memetakan slug program ke nama program yang tampil di aplikasi.
 */
export async function buildTestResultsWorkbook(
  rows: readonly TrainingAttemptRow[],
  programLabel: (slug: string) => string,
  now: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sopinsya";
  wb.lastModifiedBy = "Sopinsya";
  wb.created = now;
  wb.modified = now;

  const ws = wb.addWorksheet(TEST_SHEET_NAME, {
    // Baris judul tetap terlihat saat scroll.
    views: [{ state: "frozen", xSplit: 0, ySplit: 1, activeCell: "A2" }],
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" },
  });

  const colCount = TEST_COLUMNS.length;
  const widths = TEST_COLUMNS.map((c) => Math.max(c.min, c.header.length + 5)); // +5: ruang tombol filter

  // Header
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  TEST_COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  });
  headerRow.commit();

  // Data
  rows.forEach((a, idx) => {
    const values = testRowValues(a, idx + 1, programLabel(a.programSlug));
    const row = ws.getRow(idx + 2);
    TEST_COLUMNS.forEach((col, i) => {
      const v = values[i] ?? null;
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.numFmt = col.numFmt;
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { vertical: "middle", horizontal: col.align };
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
      if (typeof v === "string" && col.numFmt === "@") {
        const longest = Math.max(...v.split(/\r?\n/).map((line) => line.length), 0);
        widths[i] = Math.max(widths[i] as number, longest + 2);
      }
    });
    row.commit();
  });

  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = Math.min(Math.max(w, TEST_COLUMNS[i]!.min), MAX_WIDTH);
  });

  // Filter di setiap header, mencakup seluruh data.
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: colCount } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
