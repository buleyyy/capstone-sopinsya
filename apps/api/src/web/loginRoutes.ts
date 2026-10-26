import { Router, type Response } from "express";
import { resolvePasswordLogin } from "../services/auditService.js";
import { AppError } from "../utils/errors.js";
import { requireStore, type WebDeps } from "./deps.js";
import { trimmed } from "./helpers.js";

/**
 * Gerbang kredensial role Admin dan Auditor. Email hanya memilih role; password terpisah per role.
 * Setelah password role benar, server menerbitkan cookie Auditor bertanda tangan; tautan undangan tidak dipakai untuk login.
 * Web peserta (apps/web) adalah aplikasi terpisah dan tidak memakai gerbang staf.
 */
export function createLoginRouter(deps: WebDeps): Router {
  const router = Router();
  const { sec, loginEmails } = deps;

  const renderGate = (res: Response, status: number, o: { error?: string | null; email?: string } = {}) => {
    res.status(status).render("masuk", {
      title: "Masuk",
      error: o.error ?? null,
      email: o.email ?? "",
      adminEnabled: sec.adminEnabled,
      auditorEnabled: sec.auditorEnabled,
      adminEmail: loginEmails.admin,
      auditorEmail: loginEmails.auditor,
    });
  };

  router.get("/", (req, res) => {
    if (sec.adminBinding(req)) return res.redirect(303, "/admin");
    if (sec.auditorBinding(req)) return res.redirect(303, "/auditor");
    res.redirect(303, "/masuk");
  });

  router.get("/masuk", (req, res) => {
    if (sec.adminBinding(req)) return res.redirect(303, "/admin");
    if (sec.auditorBinding(req)) return res.redirect(303, "/auditor");
    renderGate(res, 200);
  });

  // Bookmark lama Admin tetap diarahkan ke gerbang masuk Admin.
  router.get("/admin/masuk", (_req, res) => res.redirect(303, "/masuk"));

  // URL undangan lama tidak lagi mengaktifkan akses; semua Auditor masuk melalui email + kata sandi.
  router.get("/undangan/:token", (_req, res) => res.redirect(303, "/masuk?access=password"));
  router.post("/undangan/:token", (_req, res) => res.redirect(303, "/masuk?access=password"));

  router.post("/masuk", sec.checkOrigin, async (req, res) => {
    const ip = req.ip ?? "unknown";
    const email = trimmed(req, "email").toLowerCase();
    const secret = trimmed(req, "secret");
    const generic = "Email atau kata sandi tidak sesuai.";
    const blocked = "Terlalu banyak percobaan. Coba lagi dalam 15 menit.";

    if (sec.isLoginBlocked(ip)) {
      renderGate(res, 429, { error: blocked, email });
      return;
    }

    if (email === loginEmails.admin) {
      const verdict = sec.checkAdminPassword(secret, ip);
      if (verdict === "ok") {
        sec.issueAdminCookie(res);
        res.redirect(303, "/admin");
        return;
      }
      if (verdict === "disabled") {
        renderGate(res, 503, { error: "Login Admin belum diaktifkan (ADMIN_PASSWORD belum diatur di server).", email });
        return;
      }
      renderGate(res, verdict === "blocked" ? 429 : 401, { error: verdict === "blocked" ? blocked : generic, email });
      return;
    }

    if (email === loginEmails.auditor) {
      const verdict = sec.checkAuditorPassword(secret, ip);
      if (verdict === "ok") {
        try {
          const context = await resolvePasswordLogin(requireStore(deps));
          sec.issueAuditorCookie(res, context.auditorId);
          res.set("Cache-Control", "no-store");
          res.redirect(303, "/auditor");
          return;
        } catch (err) {
          if (err instanceof AppError && err.statusCode === 409) {
            renderGate(res, 409, { error: err.message, email });
            return;
          }
          throw err;
        }
      }
      if (verdict === "disabled") {
        renderGate(res, 503, { error: "Login Auditor belum diaktifkan (AUDITOR_PASSWORD belum diatur di server).", email });
        return;
      }
      renderGate(res, verdict === "blocked" ? 429 : 401, { error: verdict === "blocked" ? blocked : generic, email });
      return;
    }

    sec.recordLoginFailure(ip);
    renderGate(res, 401, { error: generic, email });
  });

  return router;
}
