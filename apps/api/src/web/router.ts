import path from "node:path";
import express, { Router, type ErrorRequestHandler, type RequestHandler } from "express";
import { AppError } from "../utils/errors.js";
import { createAdminRouter } from "./adminRoutes.js";
import { createAuditorRouter } from "./auditorRoutes.js";
import type { WebDeps } from "./deps.js";
import { createLoginRouter } from "./loginRoutes.js";

/** src/web atau dist/web -> apps/api/public (sama untuk tsx dan hasil build). */
const publicDir = path.resolve(__dirname, "../../public");

// Tanpa JavaScript dan tanpa gaya inline: seluruh tampilan memakai /static/app.css.
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "private, no-cache",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  next();
};

const homeFor = (path: string): string => (path.startsWith("/admin") ? "/admin" : path.startsWith("/auditor") ? "/auditor" : "/masuk");

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

/** Antarmuka web (EJS, server-rendered) untuk Auditor dan Admin. Dipasang setelah rute /api. */
export function createWebRouter(deps: WebDeps): Router {
  const router = Router();

  router.use("/static", express.static(publicDir, { maxAge: "1h", index: false }));
  router.use(securityHeaders);
  router.use(express.urlencoded({ extended: false, limit: "200kb" }));

  // Gerbang masuk bersama (Admin + Auditor) dipasang lebih dulu; "/" mengarahkan ke dashboard sesuai peran atau ke /masuk.
  router.use(createLoginRouter(deps));
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
