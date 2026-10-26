import { randomBytes } from "node:crypto";
import type { Request } from "express";

/** Membaca field formulir sebagai string (tanpa memangkas, agar perbandingan perubahan tetap tepat). */
export function field(req: Request, key: string): string {
  const body = req.body as Record<string, unknown> | undefined;
  const v = body?.[key];
  return typeof v === "string" ? v : "";
}

export const trimmed = (req: Request, key: string): string => field(req, key).trim();

/** Bilangan bulat positif dari formulir; selain itu NaN. */
export function intField(req: Request, key: string): number {
  const v = trimmed(req, key);
  return /^\d{1,9}$/.test(v) ? Number(v) : Number.NaN;
}

/** Parameter rute berupa bilangan bulat positif; selain itu dianggap tidak ditemukan (NaN). */
export function intParam(value: string | string[] | undefined): number {
  return typeof value === "string" && /^\d{1,9}$/.test(value) ? Number(value) : Number.NaN;
}

/**
 * Input <input type="datetime-local"> tidak membawa zona waktu. Aplikasi ini dipakai di WIB (UTC+7),
 * sehingga nilainya ditafsirkan sebagai WIB agar tidak bergantung pada zona waktu server.
 */
export function wibInput(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return `${v}:00+07:00`;
  return v;
}

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : `${dateTime.format(d)} WIB`;
}

/** Kunci idempotensi formulir temuan: dibuat saat formulir ditampilkan, sehingga klik ganda tidak menggandakan temuan. */
export const newRequestId = (): string => randomBytes(16).toString("hex");

export const percent = (part: number, total: number): number => (total <= 0 ? 0 : Math.round((part / total) * 100));

export const SESSION_LABEL: Record<string, string> = { DRAFT: "Draf", ACTIVE: "Aktif", CLOSED: "Ditutup" };
export const VERSION_LABEL: Record<string, string> = { DRAFT: "Draf", PUBLISHED: "Diterbitkan", RETIRED: "Dipensiunkan" };
export const INVITE_LABEL: Record<string, string> = {
  BELUM_DIKLAIM: "Belum diklaim",
  AKTIF: "Aktif",
  DICABUT: "Dicabut",
  KEDALUWARSA: "Undangan kedaluwarsa",
};
export const CLASS_LABEL: Record<string, string> = { MAJOR: "Major", MINOR: "Minor", OBSERVASI: "Observasi" };
