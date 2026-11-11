import { AppError } from "../utils/errors.js";

/** Batas ukuran satu berkas bukti. */
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

/** Tautan lokal ke berkas yang diunggah, mis. /auditor/bukti/12/foto.jpg (nama di ujung hanya hiasan). */
export const LOCAL_EVIDENCE_PATH = /^\/auditor\/bukti\/\d{1,9}(\/[^\s/?#]{1,200})?$/;

export interface EvidenceFileRecord {
  id: number;
  sessionId: number;
  fileName: string;
  contentType: string;
  data: Buffer;
}

/** Penyimpanan berkas bukti. Berkas selalu terikat pada satu sesi audit dan hanya dibaca dalam sesi itu. */
export interface EvidenceStore {
  save(data: { sessionId: number; fileName: string; contentType: string; data: Buffer }): Promise<{ id: number }>;
  get(sessionId: number, id: number): Promise<EvidenceFileRecord | null>;
}

interface TypeRule {
  contentType: string;
  /** Ditampilkan di peramban (pratinjau) atau dipaksa unduh. */
  inline: boolean;
  matches: (b: Buffer) => boolean;
}

const startsWith = (b: Buffer, bytes: number[], offset = 0) => bytes.every((v, i) => b[offset + i] === v);

const TYPES: Record<string, TypeRule> = {
  pdf: { contentType: "application/pdf", inline: true, matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  png: { contentType: "image/png", inline: true, matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { contentType: "image/jpeg", inline: true, matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { contentType: "image/jpeg", inline: true, matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  webp: {
    contentType: "image/webp",
    inline: true,
    matches: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
  // Excel/Word modern adalah arsip ZIP ("PK").
  xlsx: {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    inline: false,
    matches: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    inline: false,
    matches: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
};

export const EVIDENCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx";

/** Merapikan nama berkas dari klien: buang path, karakter kontrol/berbahaya, dan batasi panjang. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>:*?|]/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 150) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 150 - ext.length) + ext;
}

/**
 * Memeriksa berkas unggahan: ukuran, ekstensi yang diizinkan, dan tanda byte awal (magic bytes) yang cocok.
 * Content-Type dari klien tidak dipercaya; tipe ditentukan dari ekstensi yang lolos pemeriksaan isi.
 */
export function validateEvidenceUpload(rawName: string, data: Buffer): { fileName: string; contentType: string; inline: boolean } {
  if (data.length === 0) throw new AppError(422, "EVIDENCE_EMPTY", "Berkas kosong");
  if (data.length > MAX_EVIDENCE_BYTES) {
    throw new AppError(413, "EVIDENCE_TOO_LARGE", "Ukuran berkas maksimal 5 MB");
  }
  const fileName = sanitizeFileName(rawName);
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const rule = Object.prototype.hasOwnProperty.call(TYPES, ext) ? TYPES[ext] : undefined;
  if (!rule) throw new AppError(422, "EVIDENCE_TYPE", "Jenis berkas tidak diizinkan (PDF, JPG, PNG, WEBP, XLSX, DOCX)");
  if (!rule.matches(data)) throw new AppError(422, "EVIDENCE_CONTENT", "Isi berkas tidak sesuai dengan ekstensinya");
  return { fileName, contentType: rule.contentType, inline: rule.inline };
}

/** Apakah tipe konten ini boleh ditampilkan langsung di peramban. */
export const isInlineType = (contentType: string): boolean =>
  Object.values(TYPES).some((t) => t.contentType === contentType && t.inline);
