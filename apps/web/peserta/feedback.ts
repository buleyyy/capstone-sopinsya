import { randomUUID } from "node:crypto";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { validateEvidenceUpload } from "../../api/src/domain/evidenceFile.js";
import { AppError } from "../../api/src/utils/errors.js";
import type { ReviewRow } from "../admin/readStore.js";
import type { WebDeps } from "../shared/deps.js";
import { headerFileName, jsonUpload, rawUpload } from "../shared/files.js";
import { trimmed } from "../shared/helpers.js";
import { loadProgram } from "./programs.js";

/**
 * Masukan peserta (publik, tanpa login):
 *  - Rating & Ulasan: POST /peserta/program/:slug/ulasan (formulir biasa; tampil setelah dikirim, Admin bisa menyembunyikan)
 *  - Tugas Studi Kasus: POST /peserta/program/:slug/pertemuan/:n/studi-kasus/kirim (berkas mentah lewat fetch)
 * Keduanya dibatasi per IP agar tidak bisa dibanjiri.
 */

const SLUG = /^[a-z0-9-]{1,80}$/;

export interface ReviewSummary {
  average: number; // 0 bila belum ada
  count: number;
  buckets: { stars: number; count: number }[]; // 5..1
}

export function summarize(reviews: Pick<ReviewRow, "rating">[]): ReviewSummary {
  const count = reviews.length;
  const sum = reviews.reduce((n, r) => n + r.rating, 0);
  return {
    average: count === 0 ? 0 : Math.round((sum / count) * 10) / 10,
    count,
    buckets: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: reviews.filter((r) => r.rating === stars).length })),
  };
}

/** Ulasan yang tampil di situs peserta (isVisible), terbaru dulu. Gagal baca = daftar kosong (halaman tetap tampil). */
export async function visibleReviews(deps: WebDeps): Promise<ReviewRow[]> {
  if (!deps.admin) return [];
  try {
    return (await deps.admin.listReviews()).filter((r) => r.isVisible);
  } catch (err) {
    console.warn("[web] ulasan tidak terbaca:", (err as Error).message);
    return [];
  }
}

const reviewSchema = z.object({
  reviewerName: z.string().trim().max(120).transform((v) => v || "Anonim"),
  rating: z.number().int().min(1, "Pilih rating 1 sampai 5 bintang").max(5, "Pilih rating 1 sampai 5 bintang"),
  comment: z.string().trim().min(5, "Ulasan minimal 5 karakter").max(2000, "Ulasan maksimal 2000 karakter"),
  clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

/** Pembatas sederhana per IP (memori proses): maksimal `max` kiriman per 15 menit. */
function limiter(max: number) {
  const hits = new Map<string, number[]>();
  return (ip: string, now = Date.now()): boolean => {
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
    if (recent.length >= max) {
      hits.set(ip, recent);
      return false;
    }
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear(); // cegah tumbuh tanpa batas
    return true;
  };
}

const decodeHeader = (req: Request, key: string): string => {
  const raw = req.get(key) ?? "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
};

export function registerFeedbackRoutes(router: Router, deps: WebDeps): void {
  const reviewLimit = limiter(10);
  const uploadLimit = limiter(10);

  router.post("/peserta/program/:slug/ulasan", deps.sec.checkOrigin, async (req, res: Response) => {
    const slug = String(req.params["slug"]);
    const back = `/peserta/program/${slug}`;
    if (!SLUG.test(slug) || !deps.admin) throw new AppError(404, "NOT_FOUND", "Program tidak ditemukan");
    if (!reviewLimit(req.ip ?? "?")) return res.redirect(303, `${back}?ulasan=batas#ulasan`);
    const parsed = reviewSchema.safeParse({
      reviewerName: trimmed(req, "reviewerName"),
      rating: Number(trimmed(req, "rating")) || 0,
      comment: trimmed(req, "comment"),
      clientRequestId: trimmed(req, "clientRequestId") || randomUUID(),
    });
    if (!parsed.success) return res.redirect(303, `${back}?ulasan=invalid#ulasan`);
    const saved = await deps.admin.createReview(slug, parsed.data);
    if (!saved) throw new AppError(404, "NOT_FOUND", "Program tidak ditemukan");
    res.redirect(303, `${back}?ulasan=ok#ulasan`);
  });

  router.post(
    "/peserta/program/:slug/pertemuan/:n/studi-kasus/kirim",
    deps.sec.checkOrigin,
    rawUpload,
    jsonUpload(async (req, res) => {
      const slug = String(req.params["slug"]);
      const n = Number(req.params["n"]);
      if (!deps.admin) throw new AppError(503, "DB_NOT_CONFIGURED", "Pengiriman belum tersedia");
      const program = SLUG.test(slug) ? await loadProgram(deps, slug) : null;
      if (!program || !Number.isInteger(n) || !program.meetings.some((m) => m.number === n)) {
        throw new AppError(404, "NOT_FOUND", "Program atau pertemuan tidak ditemukan");
      }
      if (!uploadLimit(req.ip ?? "?")) throw new AppError(429, "TOO_MANY", "Terlalu banyak pengiriman. Coba lagi dalam 15 menit.");
      const identity = z
        .object({
          participantName: z.string().min(1, "Nama wajib diisi").max(120),
          participantInstitution: z.string().min(1, "Instansi wajib diisi").max(160),
          participantEmail: z.union([z.literal(""), z.string().max(160).email("Format email tidak valid")]),
        })
        .safeParse({
          participantName: decodeHeader(req, "x-participant-name"),
          participantInstitution: decodeHeader(req, "x-participant-institution"),
          participantEmail: decodeHeader(req, "x-participant-email"),
        });
      if (!identity.success) throw new AppError(422, "VALIDATION_ERROR", identity.error.issues[0]?.message ?? "Data diri tidak valid");
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const meta = validateEvidenceUpload(headerFileName(req), body);
      const saved = await deps.admin.createCaseStudy(slug, {
        meetingNo: n,
        participantName: identity.data.participantName,
        participantInstitution: identity.data.participantInstitution,
        participantEmail: identity.data.participantEmail || null,
        file: { fileName: meta.fileName, contentType: meta.contentType, data: body },
      });
      if (!saved) throw new AppError(404, "NOT_FOUND", "Program tidak ditemukan");
      res.status(201).json({ ok: true, name: meta.fileName });
    }),
  );
}
