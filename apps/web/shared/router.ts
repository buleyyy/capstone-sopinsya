import path from "node:path";
import express, { Router, type ErrorRequestHandler, type RequestHandler } from "express";
import { AppError } from "../../api/src/utils/errors.js";
import { createAdminRouter } from "../admin/routes.js";
import { createAuditorRouter } from "../audit/routes.js";
import { createPesertaRouter } from "../peserta/routes.js";
import type { WebDeps } from "./deps.js";
import { createLoginRouter } from "./loginRoutes.js";
import { WEB_ROOT } from "./paths.js";

/** apps/web/public (sama untuk tsx dan hasil build). */
const publicDir = path.join(WEB_ROOT, "public");

// Gaya dan skrip hanya dari berkas statis same-origin (/static/*.css, /static/*.js). Tanpa gaya/skrip inline,
// sehingga CSP tetap melarang 'unsafe-inline'. Halaman tetap berfungsi tanpa JS (JS hanya peningkatan: filter langsung,
// tombol cetak, unggah bukti, tes peserta).
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "private, no-cache",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-src https://www.youtube-nocookie.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  next();
};

const homeFor = (p: string): string =>
  p.startsWith("/admin") ? "/admin" : p.startsWith("/audit") ? "/audit" : p.startsWith("/peserta") ? "/peserta/" : "/masuk";

const errorPage: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    // Sesi Auditor tidak ada/tidak sah: kembali ke halaman masuk.
    if (err.statusCode === 401) return res.redirect(303, "/masuk");
    const details = Array.isArray(err.details) ? (err.details as { path: string; message: string }[]) : [];
    res.status(err.statusCode).render("error", {
      title: "Terjadi masalah",
      status: err.statusCode,
      message: err.message,
      details,
      home: homeFor(req.path),
    });
    return;
  }

  const status = (err as { status?: number }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).render("error", {
      title: "Permintaan tidak valid",
      status,
      message: "Permintaan tidak dapat diproses.",
      details: [],
      home: homeFor(req.path),
    });
    return;
  }

  console.error("[web] unhandled error:", err);
  res.status(500).render("error", {
    title: "Kesalahan server",
    status: 500,
    message: "Terjadi kesalahan pada server. Coba lagi, atau hubungi Admin bila berulang.",
    details: [],
    home: homeFor(req.path),
  });
};

/**
 * Antarmuka web (EJS, server-rendered) untuk tiga area pada satu server/port:
 *   /peserta  - peserta pelatihan (publik, tanpa login)
 *   /admin    - Admin
 *   /audit    - Auditor
 * Dipasang setelah rute /api. Gerbang masuk bersama (/masuk) untuk Admin dan Auditor.
 */
export function createWebRouter(deps: WebDeps): Router {
  const router = Router();

  // Di production berkas statis di-cache 1 jam (URL berversi ?v= pada header.ejs memutus cache setiap server dimulai ulang).
  // Di development tanpa cache, supaya perubahan CSS/JS langsung terlihat dengan muat ulang biasa.
  router.use("/static", express.static(publicDir, { maxAge: process.env["NODE_ENV"] === "production" ? "1h" : 0, index: false }));
  router.use(securityHeaders);
  router.use(express.urlencoded({ extended: false, limit: "200kb" }));

  // Tautan lama /auditor/* (termasuk tautan berkas bukti yang tersimpan) dialihkan ke /audit/*.
  // 308 mempertahankan method dan badan permintaan (POST tetap POST).
  router.use("/auditor", (req, res) => {
    res.redirect(308, `/audit${req.url === "/" ? "/" : req.url}`);
  });

  // Gerbang masuk bersama dipasang lebih dulu; "/" mengarah ke area staf (bila sudah masuk) atau /peserta.
  router.use(createLoginRouter(deps));
  router.use(createPesertaRouter(deps));
  router.use(createAuditorRouter(deps));
  router.use(createAdminRouter(deps));

  // Rute /api yang tidak dikenal tetap dijawab JSON oleh notFoundHandler global.
  router.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.status(404).render("error", {
      title: "Halaman tidak ditemukan",
      status: 404,
      message: "Halaman yang Anda cari tidak ada.",
      details: [],
      home: homeFor(req.path),
    });
  });

  router.use(errorPage);
  return router;
}
