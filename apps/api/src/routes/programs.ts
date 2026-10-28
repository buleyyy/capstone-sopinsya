import { Router } from "express";
import { toPublicProgram, type PublicProgramStore } from "../domain/training.js";
import { AppError } from "../utils/errors.js";
import { ok } from "../utils/response.js";

const SLUG = /^[a-z0-9-]{1,80}$/;

/**
 * Rute publik (tanpa login) program pelatihan ISO beserta pertemuan dan sumber belajarnya. Hanya baca.
 *  GET /api/public/programs        daftar program terbit (dengan pertemuan terbit)
 *  GET /api/public/programs/:slug  satu program terbit
 * Program/pertemuan/sumber berstatus draf tidak pernah keluar; slug tidak ada dan program draf dijawab sama (404).
 */
export function createProgramRouter(store: PublicProgramStore | undefined): Router {
  const router = Router();

  const requireStore = (): PublicProgramStore => {
    if (!store) throw new AppError(503, "DB_NOT_CONFIGURED", "Data belum tersedia (database belum dikonfigurasi)");
    return store;
  };

  router.get("/programs", async (_req, res) => {
    const rows = await requireStore().listPublished();
    res.set("Cache-Control", "no-store");
    res.json(ok(rows.filter((p) => p.isPublished).map(toPublicProgram)));
  });

  router.get("/programs/:slug", async (req, res) => {
    const s = requireStore();
    const slug = String(req.params["slug"]);
    if (!SLUG.test(slug)) throw new AppError(404, "NOT_FOUND", "Program tidak ditemukan");
    const row = await s.getPublished(slug);
    if (!row || !row.isPublished) throw new AppError(404, "NOT_FOUND", "Program tidak ditemukan");
    res.set("Cache-Control", "no-store");
    res.json(ok(toPublicProgram(row)));
  });

  return router;
}
