import { Router, type Response } from "express";
import { resolvePasswordLogin } from "../services/auditService.js";
import { AppError } from "../utils/errors.js";
import { requireStore, type WebDeps } from "./deps.js";
import { trimmed } from "./helpers.js";
import { UNBOUND_AUDITOR_ID } from "./security.js";

/**
 * Gerbang masuk bersama untuk web Admin + Auditor. Bentuknya sama: email + kata sandi.
 *  - Email hanya memilih peran (bawaan: admin@sopinsya / auditor@sopinsya).
 *  - Admin memakai ADMIN_PASSWORD; Auditor memakai AUDITOR_PASSWORD. Tanpa kode undangan.
 * Web peserta (apps/web) adalah aplikasi terpisah dan tidak memakai gerbang ini.
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
    // Sesi Auditor yang tidak sah akan dialihkan kembali ke /masuk oleh area Auditor (tanpa perulangan).
    if (sec.auditorBinding(req)) return res.redirect(303, "/auditor");
    res.redirect(303, "/masuk");
  });

  router.get("/masuk", (req, res) => {
    if (sec.adminBinding(req)) return res.redirect(303, "/admin");
    renderGate(res, 200);
  });

  // Rute lama dipertahankan agar bookmark dan tautan undangan lama tetap mendarat di halaman masuk.
  router.get("/admin/masuk", (_req, res) => res.redirect(303, "/masuk"));
  router.get("/undangan/:token", (_req, res) => res.redirect(303, "/masuk"));

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
      if (verdict === "disabled") {
        renderGate(res, 503, { error: "Login Auditor belum diaktifkan (AUDITOR_PASSWORD belum diatur di server).", email });
        return;
      }
      if (verdict !== "ok") {
        renderGate(res, verdict === "blocked" ? 429 : 401, { error: verdict === "blocked" ? blocked : generic, email });
        return;
      }
      try {
        const ctx = await resolvePasswordLogin(requireStore(deps));
        sec.issueAuditorCookie(res, ctx.auditorId);
        res.redirect(303, "/auditor");
        return;
      } catch (err) {
        // Kata sandi benar tetapi belum ada sesi aktif/auditor: tetap masuk (seperti Admin). Halaman Auditor
        // menampilkan keadaan "menunggu sesi" dan otomatis terhubung begitu Admin mengaktifkan sesi.
        if (err instanceof AppError && (err.statusCode === 403 || err.statusCode === 409)) {
          sec.issueAuditorCookie(res, UNBOUND_AUDITOR_ID);
          res.redirect(303, "/auditor");
          return;
        }
        throw err;
      }
    }

    sec.recordLoginFailure(ip);
    renderGate(res, 401, { error: generic, email });
  });

  return router;
}
