import { Router } from "express";
import type { Database } from "../lib/database.js";
import { fail, ok } from "../utils/response.js";

export function createHealthRouter(db: Database): Router {
  const router = Router();

  // Liveness: tidak pernah bergantung pada database.
  router.get("/", (_req, res) => {
    res.json(
      ok({
        status: "ok",
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        database: db.configured ? "configured" : "not_configured",
      }),
    );
  });

  // Pemeriksaan konektivitas database (terpisah dari liveness).
  router.get("/db", async (_req, res) => {
    if (!db.configured) {
      res.status(503).json(fail("DB_NOT_CONFIGURED", "DATABASE_URL belum dikonfigurasi"));
      return;
    }
    try {
      await db.ping();
      res.json(ok({ database: "connected" }));
    } catch {
      // Detail error sengaja tidak dikirim ke klien (bisa memuat host/kredensial).
      res.status(503).json(fail("DB_UNAVAILABLE", "Tidak dapat terhubung ke database"));
    }
  });

  return router;
}
