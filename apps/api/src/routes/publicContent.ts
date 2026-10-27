import { Router } from "express";
import type { PublicContentStore } from "../domain/publicContent.js";
import { AppError } from "../utils/errors.js";
import { ok } from "../utils/response.js";

/** Hanya URL https tanpa kredensial yang diteruskan ke pengunjung; selain itu dianggap tidak ada. */
export function toHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.username === "" && u.password === "" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Rute publik (tanpa autentikasi): daftar Programpelatihan dan dokumen materinya. Hanya baca. */
export function createPublicRouter(store: PublicContentStore | undefined): Router {
  const router = Router();

  const requireStore = (): PublicContentStore => {
    if (!store) throw new AppError(503, "DB_NOT_CONFIGURED", "Data belum tersedia (database belum dikonfigurasi)");
    return store;
  };

  router.get("/rooms", async (_req, res) => {
    res.json(ok(await requireStore().listRooms()));
  });

  router.get("/rooms/:id", async (req, res) => {
    const s = requireStore();
    const id = Number(req.params["id"]);
    // ID tidak valid dan Programtidak dipublikasikan dijawab sama (404) agar keberadaannya tidak terungkap.
    if (!Number.isInteger(id) || id < 1) throw new AppError(404, "NOT_FOUND", "Programtidak ditemukan");
    const room = await s.getRoom(id);
    if (!room) throw new AppError(404, "NOT_FOUND", "Programtidak ditemukan");
    res.json(ok({
      ...room,
      documents: room.documents.map((d) => ({ ...d, url: toHttpsUrl(d.url) })),
      resources: room.resources
        .map((resource) => ({ ...resource, url: toHttpsUrl(resource.url) }))
        .filter((resource) => resource.url !== null),
    }));
  });

  return router;
}
