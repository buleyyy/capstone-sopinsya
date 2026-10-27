import { Router, type Response } from "express";
import { verifyAuditorCredentials } from "../services/auditService.js";
import { requireStore, type WebDeps } from "./deps.js";
import { field, trimmed } from "./helpers.js";

/**
 * Gerbang login tunggal untuk Admin dan Auditor (email + kata sandi). Role ditentukan sistem dari email:
 *  - email Admin (ADMIN_LOGIN_EMAIL) + ADMIN_PASSWORD -> cookie Admin, /admin;
 *  - selain itu dicari sebagai akun Auditor di database (dibuat Admin) -> cookie Auditor, /auditor.
 * Tidak ada undangan, token, atau tautan khusus. Web peserta (apps/web) tidak memakai gerbang ini.
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
      adminEmail: loginEmails.admin,
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

  // Bookmark lama Admin tetap diarahkan ke gerbang masuk bersama.
  router.get("/admin/masuk", (_req, res) => res.redirect(303, "/masuk"));

  router.post("/masuk", sec.checkOrigin, async (req, res) => {
    const ip = req.ip ?? "unknown";
    const email = trimmed(req, "email").toLowerCase();
    const generic = "Email atau kata sandi tidak sesuai.";
    const blocked = "Terlalu banyak percobaan. Coba lagi dalam 15 menit.";

    if (sec.isLoginBlocked(ip)) {
      renderGate(res, 429, { error: blocked, email });
      return;
    }

    if (email === loginEmails.admin) {
      const verdict = sec.checkAdminPassword(trimmed(req, "secret"), ip);
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

    // Akun Auditor. Kata sandi tidak dipangkas (sama seperti saat dibuat). Semua kegagalan (email tidak ada,
    // kata sandi salah, akun nonaktif) memberi respons yang sama dan dihitung pada pembatas percobaan per IP.
    const accountId = await verifyAuditorCredentials(requireStore(deps), email, field(req, "secret"));
    if (accountId === null) {
      sec.recordLoginFailure(ip);
      renderGate(res, 401, { error: generic, email });
      return;
    }
    // Sengaja TIDAK mereset pembatas IP di sini: akun Auditor yang sah tidak boleh dipakai untuk menghapus
    // hitungan percobaan tebak password Admin dari IP yang sama.
    sec.issueAuditorCookie(res, accountId);
    res.set("Cache-Control", "no-store");
    res.redirect(303, "/auditor");
  });

  return router;
}
