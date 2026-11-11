import { raw, Router, type Request, type RequestHandler, type Response } from "express";
import { isInlineType, MAX_EVIDENCE_BYTES, validateEvidenceUpload } from "../../api/src/domain/evidenceFile.js";
import { AppError } from "../../api/src/utils/errors.js";
import type { StoredFilePurpose } from "../admin/readStore.js";
import type { WebDeps } from "./deps.js";
import { intParam } from "./helpers.js";

/**
 * Berkas unggahan situs pelatihan (tabel StoredFile):
 *  - COVER    sampul program (gambar), publik
 *  - MATERIAL berkas materi/silabus/SOP yang ditempel pada konten program, publik
 *  - CASE_STUDY tugas studi kasus peserta, HANYA Admin (/admin/studi-kasus/:id/unduh)
 * Unggah memakai badan mentah (application/octet-stream) + header X-Filename, sama seperti bukti audit,
 * karena aplikasi tidak memakai parser multipart. Validasi jenis berkas memeriksa ekstensi DAN isi (magic bytes).
 */

export const PUBLIC_FILE_PATH = /^\/berkas\/\d{1,9}(\/[^\s/?#]{1,200})?$/;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export const fileUrl = (id: number, name: string): string => `/berkas/${id}/${encodeURIComponent(name)}`;

/** Nama berkas dari header X-Filename (di-encode URI oleh klien). */
export function headerFileName(req: Request): string {
  const rawName = req.get("x-filename") ?? "";
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
}

export function validateUpload(purpose: StoredFilePurpose, rawName: string, data: Buffer) {
  const meta = validateEvidenceUpload(rawName, data); // ukuran ≤ 5 MB, ekstensi + isi cocok
  if (purpose === "COVER" && !IMAGE_TYPES.has(meta.contentType)) {
    throw new AppError(422, "FILE_TYPE", "Sampul program harus berupa gambar (JPG, PNG, atau WEBP)");
  }
  return meta;
}

export const sendFile = (res: Response, file: { fileName: string; contentType: string; data: Buffer }, forceDownload = false) => {
  const inline = !forceDownload && isInlineType(file.contentType);
  res.set({
    "Content-Type": file.contentType,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "Content-Length": String(file.data.length),
    "X-Content-Type-Options": "nosniff",
  });
  res.send(file.data);
};

/** Respons JSON untuk unggahan lewat fetch(): kesalahan validasi menjadi { error }. */
export const jsonUpload =
  (handler: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error("[web] unggah berkas gagal:", err);
      res.status(500).json({ error: "Gagal menyimpan berkas. Coba lagi." });
    }
  };

export const rawUpload = raw({ type: "application/octet-stream", limit: MAX_EVIDENCE_BYTES });

/** Berkas publik (sampul & materi). Tugas studi kasus tidak pernah dilayani di sini. */
export function createFileRouter(deps: WebDeps): Router {
  const router = Router();
  router.get(["/berkas/:id", "/berkas/:id/:name"], async (req, res) => {
    const id = intParam(req.params["id"]);
    const file = deps.admin && !Number.isNaN(id) ? await deps.admin.getFile(id) : null;
    if (!file || file.purpose === "CASE_STUDY") throw new AppError(404, "NOT_FOUND", "Berkas tidak ditemukan");
    res.set("Cache-Control", "public, max-age=3600");
    sendFile(res, file);
  });
  return router;
}
