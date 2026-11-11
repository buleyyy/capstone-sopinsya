import PDFDocument from "pdfkit";

/**
 * PDF formulir Laporan Ketidaksesuaian dan Tindakan Korektif yang dibuat di server (A4 lanskap).
 * Memakai font bawaan PDF (Helvetica), sehingga tidak ada berkas font yang perlu disertakan.
 * Data masuk berupa tipe murni (bukan tipe service) agar mudah diuji.
 */

export interface PdfHeader {
  organization: string;
  subtitle: string;
  formTitle: string;
  formCode: string;
  revision: string;
  issuedAt: string;
}

export interface PdfFinding {
  code: string;
  classification: "MAJOR" | "MINOR" | "OBSERVASI";
  status: "OPEN" | "CLOSED";
  reference: string;
  problem: string;
  location: string;
  objectiveEvidence: string;
  closedAtLabel: string | null;
  rootCause: string | null;
  correction: string | null;
  correctionPic: string | null;
  correctionTarget: string | null;
  correctionEvidenceName: string | null;
  correctiveAction: string | null;
  correctiveActionPic: string | null;
  correctiveActionTarget: string | null;
  correctiveActionEvidenceName: string | null;
  improvementAction: string | null;
  improvementPic: string | null;
  improvementTarget: string | null;
  improvementEvidenceName: string | null;
  verificationResult: string | null;
  verifiedDateLabel: string | null;
}

export interface FindingsPdfInput {
  header: PdfHeader;
  sessionTitle: string;
  unitName: string;
  auditorName: string;
  printedAtLabel: string;
  findings: PdfFinding[];
  counts: { major: number; minor: number; observasi: number };
  reportedDateLabel: string | null;
  followedUpDateLabel: string | null;
  verifiedDateLabel: string | null;
  auditees: string[];
  verifiers: string[];
}

// ---------- Teks ----------

const CP1252_EXTRA = new Set("\u2022\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u20ac\u2122".split(""));

/**
 * Font bawaan PDF (Helvetica) hanya mengenal Latin-1 dan beberapa tanda baca cp1252. Karakter lain (emoji, aksara non-Latin)
 * diganti "?" agar tidak menjadi karakter rusak. Baris baru dipertahankan.
 */
export function toPdfText(raw: string): string {
  let out = "";
  for (const ch of raw.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, "  ")) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n") out += ch;
    else if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    else if (code <= 0xff || CP1252_EXTRA.has(ch)) out += ch;
    else out += "?";
  }
  return out;
}

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_SIZE = 7.5;
const LINE_H = 9.6;
const PAD = 4;
const TABLE_HEAD_H = 26;

interface Seg { text: string; bold: boolean; gray?: boolean }
type Line = Seg[];

const BLACK = "#111827";
const GRAY = "#4b5563";
const BORDER = "#6b7280";
const HEAD_BG = "#e5e7eb";

/** Memecah teks per kata sesuai lebar kolom (kata yang lebih panjang dari kolom dipotong per karakter). */
function wrapSegments(doc: PDFKit.PDFDocument, segs: Seg[], width: number): Line[] {
  const lines: Line[] = [];
  let cur: Line = [];
  let used = 0;
  const measure = (t: string, bold: boolean) => doc.font(bold ? FONT_BOLD : FONT).fontSize(FONT_SIZE).widthOfString(t);
  const push = (seg: Seg, text: string) => {
    const last = cur[cur.length - 1];
    if (last && last.bold === seg.bold && last.gray === seg.gray) last.text += text;
    else cur.push({ text, bold: seg.bold, ...(seg.gray ? { gray: true } : {}) });
  };
  const newLine = () => {
    lines.push(cur);
    cur = [];
    used = 0;
  };

  for (const seg of segs) {
    const paragraphs = toPdfText(seg.text).split("\n");
    paragraphs.forEach((para, pi) => {
      if (pi > 0) newLine();
      // Pisah menjadi kata + spasi agar spasi antarkata tetap terukur.
      for (const token of para.match(/\S+|\s+/g) ?? []) {
        const isSpace = /^\s+$/.test(token);
        if (isSpace && used === 0) continue; // tidak diawali spasi pada baris baru
        const w = measure(token, seg.bold);
        if (used + w <= width) {
          push(seg, token);
          used += w;
          continue;
        }
        if (isSpace) {
          newLine();
          continue;
        }
        if (used > 0) newLine();
        if (w <= width) {
          push(seg, token);
          used = w;
          continue;
        }
        // Kata lebih panjang dari kolom (mis. URL): potong per karakter.
        let chunk = "";
        for (const ch of token) {
          if (measure(chunk + ch, seg.bold) > width && chunk !== "") {
            push(seg, chunk);
            newLine();
            chunk = "";
          }
          chunk += ch;
        }
        if (chunk) {
          push(seg, chunk);
          used = measure(chunk, seg.bold);
        }
      }
    });
  }
  if (cur.length > 0 || lines.length === 0) lines.push(cur);
  return lines;
}

// ---------- Isi sel ----------

const labelled = (label: string, text: string): Seg[] => [{ text: `${label} `, bold: true }, { text, bold: false }];
const meta = (text: string): Seg => ({ text, bold: false, gray: true });

function cellSegments(f: PdfFinding): Seg[][] {
  const isObs = f.classification === "OBSERVASI";
  const kat = f.classification === "MAJOR" ? "1" : f.classification === "MINOR" ? "2" : "O";

  const plain = (text: string | null): Seg[] => (text ? [{ text, bold: false }] : []);
  const withMeta = (main: string | null, pic: string | null, target: string | null, evidence: string | null): Seg[] => {
    const out: Seg[] = plain(main);
    const extra = [pic ? `PIC: ${pic}` : "", target ? `Target: ${target}` : "", evidence ? `Bukti: Terlampir (${evidence})` : ""].filter(Boolean);
    for (const e of extra) out.push(meta(`${out.length ? "\n" : ""}${e}`));
    return out;
  };

  const verification: Seg[] = [{ text: f.status === "CLOSED" ? "Closed" : "Open", bold: true }];
  if (f.verificationResult) verification.push(meta(`\n${f.verificationResult}`));
  const dateLabel = f.verifiedDateLabel ?? (f.status === "CLOSED" ? f.closedAtLabel : null);
  if (dateLabel) verification.push(meta(`\n${dateLabel}`));

  return [
    [{ text: "", bold: false }], // nomor diisi saat menggambar
    plain(f.reference),
    [
      ...labelled("Problem:", f.problem),
      ...labelled("\nLocation:", f.location),
      ...labelled("\nObjective evidence:", f.objectiveEvidence),
      ...labelled("\nReference:", f.reference),
    ],
    [{ text: kat, bold: true }],
    isObs ? plain("-") : plain(f.rootCause),
    isObs ? plain("-") : withMeta(f.correction, f.correctionPic, f.correctionTarget, f.correctionEvidenceName),
    isObs
      ? withMeta(f.improvementAction, f.improvementPic, f.improvementTarget, f.improvementEvidenceName)
      : withMeta(f.correctiveAction, f.correctiveActionPic, f.correctiveActionTarget, f.correctiveActionEvidenceName),
    verification,
  ];
}

// ---------- Tata letak ----------

const COLUMNS: { title: string; note: string; w: number; center?: boolean }[] = [
  { title: "No.", note: "(1)", w: 0.05, center: true },
  { title: "Acuan Ketidaksesuaian", note: "(2)", w: 0.1 },
  { title: "Uraian Ketidaksesuaian (PLOR)", note: "(3)", w: 0.25 },
  { title: "Kat", note: "(4)", w: 0.04, center: true },
  { title: "Akar Penyebab", note: "(5)", w: 0.13 },
  { title: "Perbaikan / Koreksi", note: "(6)", w: 0.15 },
  { title: "Tindakan Korektif / Peningkatan", note: "(7)", w: 0.17 },
  { title: "Hasil Verifikasi", note: "(8)", w: 0.11, center: true },
];

const NOTES: [string, string][] = [
  ["Diisi oleh pelapor/auditor:", "(1) Nomor urut temuan. (2) Klausul atau SOP yang tidak dipenuhi. (3) Uraian dengan metode PLOR: Problem, Location, Objective evidence, Reference. (4) Kategori: 1 = Major, 2 = Minor, O = Observasi."],
  ["Diisi oleh terlapor/auditee:", "(5) Akar penyebab (Kategori 1 dan 2). (6) Perbaikan/koreksi langsung, PIC, dan target (Kategori 1 dan 2). (7) Tindakan korektif (Kategori 1 dan 2) atau tindakan peningkatan (Observasi)."],
  ["Diisi oleh verifikator/auditor:", "(8) Closed bila tindakan terbukti menyelesaikan masalah atau peningkatan telah terlaksana; Open bila belum."],
];

/** Membuat PDF formulir Laporan Ketidaksesuaian dan Tindakan Korektif (A4 lanskap). */
export function renderFindingsPdf(input: FindingsPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 28, bottom: 34, left: 28, right: 28 },
    bufferPages: true,
    info: {
      Title: toPdfText(`${input.header.formTitle} - ${input.unitName}`),
      Author: toPdfText(input.auditorName),
      Subject: toPdfText(input.sessionTitle),
      Creator: "Sopinsya Educenter",
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentW = right - left;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  const colW = COLUMNS.map((c) => c.w * contentW);
  const colX = colW.map((_, i) => left + colW.slice(0, i).reduce((a, b) => a + b, 0));

  const drawLine = (line: Line, x: number, y: number, width: number, center: boolean) => {
    const total = line.reduce((s, seg) => s + doc.font(seg.bold ? FONT_BOLD : FONT).fontSize(FONT_SIZE).widthOfString(seg.text), 0);
    let cx = center ? x + Math.max((width - total) / 2, 0) : x;
    for (const seg of line) {
      doc.font(seg.bold ? FONT_BOLD : FONT).fontSize(FONT_SIZE).fillColor(seg.gray ? GRAY : BLACK);
      doc.text(seg.text, cx, y, { lineBreak: false });
      cx += doc.widthOfString(seg.text);
    }
  };

  // ----- Kepala formulir -----
  const drawHeader = (): number => {
    const top = doc.page.margins.top;
    const h = 62;
    const w1 = contentW * 0.3;
    const w2 = contentW * 0.4;
    const w3 = contentW - w1 - w2;
    doc.lineWidth(0.8).strokeColor(BORDER);
    doc.rect(left, top, w1, h).stroke();
    doc.rect(left + w1, top, w2, h).stroke();
    doc.rect(left + w1 + w2, top, w3, h).stroke();

    doc.fillColor(BLACK).font(FONT_BOLD).fontSize(10.5);
    doc.text(toPdfText(input.header.organization), left + 8, top + 10, { width: w1 - 16 });
    doc.font(FONT).fontSize(7.5).fillColor(GRAY).text(toPdfText(input.header.subtitle), left + 8, doc.y + 2, { width: w1 - 16 });

    doc.font(FONT).fontSize(7.5).fillColor(GRAY).text("FORMULIR", left + w1 + 8, top + 12, { width: w2 - 16, align: "center" });
    doc.font(FONT_BOLD).fontSize(11).fillColor(BLACK).text(toPdfText(input.header.formTitle), left + w1 + 8, doc.y + 3, { width: w2 - 16, align: "center" });

    const rows: [string, string][] = [
      ["No. dokumen", input.header.formCode],
      ["Revisi", input.header.revision],
      ["Tgl terbit", input.header.issuedAt || "-"],
      ["Unit diaudit", input.unitName],
      ["Sesi audit", input.sessionTitle],
      ["Dicetak", input.printedAtLabel],
    ];
    let my = top + 5;
    const mx = left + w1 + w2 + 8;
    for (const [k, v] of rows) {
      doc.font(FONT).fontSize(6.8).fillColor(GRAY).text(k, mx, my, { width: 52, lineBreak: false });
      doc.font(FONT_BOLD).fontSize(6.8).fillColor(BLACK).text(`: ${toPdfText(v)}`, mx + 52, my, { width: w3 - 66, lineBreak: false, ellipsis: true });
      my += 9;
    }

    const srcY = top + h + 6;
    doc.font(FONT_BOLD).fontSize(7.5).fillColor(BLACK).text("SUMBER KETIDAKSESUAIAN:", left, srcY, { continued: true, lineBreak: false });
    doc.font(FONT).text("   [x] Ketidaksesuaian Internal   [x] Audit Pemantauan   [ ] Keluhan   [ ] Lainnya: ____________", { lineBreak: false });
    return srcY + 16;
  };

  // ----- Kepala tabel (diulang pada tiap halaman) -----
  const drawTableHead = (y: number): number => {
    const h = TABLE_HEAD_H;
    doc.rect(left, y, contentW, h).fill(HEAD_BG);
    doc.lineWidth(0.6).strokeColor(BORDER);
    COLUMNS.forEach((c, i) => {
      doc.rect(colX[i]!, y, colW[i]!, h).stroke();
      doc.font(FONT_BOLD).fontSize(6.8).fillColor(BLACK).text(`${c.title} ${c.note}`, colX[i]! + 2, y + 5, { width: colW[i]! - 4, align: "center" });
    });
    return y + h;
  };

  let y = drawHeader();
  y = drawTableHead(y);
  const tableTop = () => doc.page.margins.top;

  const newPage = () => {
    doc.addPage();
    y = drawTableHead(tableTop());
  };

  if (input.findings.length === 0) {
    doc.lineWidth(0.6).strokeColor(BORDER).rect(left, y, contentW, 22).stroke();
    doc.font(FONT).fontSize(8).fillColor(GRAY).text("Tidak ada temuan.", left, y + 7, { width: contentW, align: "center" });
    y += 22;
  }

  input.findings.forEach((f, idx) => {
    const cells = cellSegments(f);
    cells[0] = [{ text: String(idx + 1), bold: false }];
    const wrapped: Line[][] = cells.map((segs, i) => {
      const lines = wrapSegments(doc, segs, colW[i]! - PAD * 2);
      if (i === 0) lines.push([{ text: f.code, bold: false, gray: true }]); // kode temuan di bawah nomor
      return lines;
    });
    const total = Math.max(...wrapped.map((l) => l.length));
    let from = 0;
    while (from < total) {
      const room = Math.floor((bottomLimit - y - PAD * 2) / LINE_H);
      const remaining = total - from;
      // Baris yang muat utuh pada halaman kosong tidak dipecah: pindah halaman. Hanya baris yang lebih tinggi dari satu
      // halaman yang dilanjutkan di halaman berikutnya (tidak ada teks yang dibuang).
      const fullPageRoom = Math.floor((bottomLimit - (tableTop() + TABLE_HEAD_H) - PAD * 2) / LINE_H);
      const fitsFreshPage = remaining <= fullPageRoom;
      const atPageTop = y <= tableTop() + TABLE_HEAD_H + 0.5;
      const needsBreak = remaining > room && (fitsFreshPage || room < 3);
      if (!atPageTop && needsBreak) {
        newPage();
        continue;
      }
      const take = Math.min(Math.max(room, 1), remaining);
      const h = take * LINE_H + PAD * 2;
      doc.lineWidth(0.6).strokeColor(BORDER);
      COLUMNS.forEach((c, i) => {
        doc.rect(colX[i]!, y, colW[i]!, h).stroke();
        wrapped[i]!.slice(from, from + take).forEach((line, li) => {
          drawLine(line, colX[i]! + PAD, y + PAD + li * LINE_H, colW[i]! - PAD * 2, c.center === true);
        });
      });
      y += h;
      from += take;
      if (from < total) newPage();
    }
  });

  // ----- Penutup: jumlah, tanda tangan, keterangan -----
  const ensure = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  };

  ensure(90);
  y += 8;
  doc.font(FONT).fontSize(7.5).fillColor(BLACK);
  doc.text(`Jumlah temuan kategori 1 (Major): ${input.counts.major}      Jumlah temuan kategori 2 (Minor): ${input.counts.minor}      Jumlah temuan Observasi (O): ${input.counts.observasi}`, left, y, { lineBreak: false });
  y += 14;

  const boxW = contentW / 3;
  const sign: [string, string, string][] = [
    [`DILAPORKAN TANGGAL: ${input.reportedDateLabel ?? "____ / ____ / ________"}`, "NAMA PELAPOR / AUDITOR:", input.auditorName],
    [`DITINDAKLANJUTI TANGGAL: ${input.followedUpDateLabel ?? "____ / ____ / ________"}`, `NAMA TERLAPOR / AUDITEE (${input.unitName}):`, input.auditees.join(", ")],
    [`DIVERIFIKASI TANGGAL: ${input.verifiedDateLabel ?? "____ / ____ / ________"}`, "NAMA VERIFIKATOR / AUDITOR:", input.verifiers.length ? input.verifiers.join(", ") : input.auditorName],
  ];
  const boxH = 64;
  doc.lineWidth(0.6).strokeColor(BORDER);
  sign.forEach(([head, label, name], i) => {
    const bx = left + i * boxW;
    doc.rect(bx, y, boxW, boxH).stroke();
    doc.rect(bx, y, boxW, 13).fillAndStroke(HEAD_BG, BORDER);
    doc.font(FONT_BOLD).fontSize(6.8).fillColor(BLACK).text(toPdfText(head), bx + 5, y + 3.5, { width: boxW - 10, lineBreak: false, ellipsis: true });
    doc.font(FONT).fontSize(6.5).fillColor(GRAY).text(toPdfText(label), bx + 5, y + 18, { width: boxW - 10, lineBreak: false, ellipsis: true });
    doc.font(FONT_BOLD).fontSize(8).fillColor(BLACK).text(toPdfText(name), bx + 5, y + 28, { width: boxW - 10, height: 14, ellipsis: true });
    doc.font(FONT).fontSize(6.5).fillColor(GRAY).text("Tanda tangan", bx + 5, y + boxH - 11, { width: boxW - 10, lineBreak: false });
  });
  y += boxH + 10;

  ensure(70);
  doc.font(FONT_BOLD).fontSize(7).fillColor(BLACK).text("KETERANGAN PENGISIAN", left, y, { lineBreak: false });
  y += 11;
  const noteW = contentW / 3 - 8;
  let noteBottom = y;
  NOTES.forEach(([title, text], i) => {
    const nx = left + i * (noteW + 12);
    doc.font(FONT_BOLD).fontSize(6.5).fillColor(BLACK).text(title, nx, y, { width: noteW });
    doc.font(FONT).fontSize(6.5).fillColor(GRAY).text(text, nx, doc.y + 1, { width: noteW });
    noteBottom = Math.max(noteBottom, doc.y);
  });
  y = noteBottom + 4;
  doc.font(FONT).fontSize(6.5).fillColor(GRAY).text(
    "Major: SOP tidak ada atau sama sekali tidak dikerjakan. Minor: dikerjakan tetapi tidak konsisten atau tidak rutin. Observasi: sudah dikerjakan dan masih dapat dioptimalkan.",
    left,
    y,
    { width: contentW },
  );

  // ----- Nomor halaman -----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // tanpa ini, menulis di tepi bawah memicu halaman baru
    doc.font(FONT).fontSize(7).fillColor(GRAY);
    doc.text(`${toPdfText(input.header.formCode)}  |  Halaman ${i + 1} dari ${range.count}`, left, doc.page.height - 22, { width: contentW, align: "right", lineBreak: false });
  }

  doc.end();
  return done;
}
