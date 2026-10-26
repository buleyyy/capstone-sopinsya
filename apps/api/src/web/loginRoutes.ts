import { Router, type Response } from "express";
import { claimInvitation } from "../services/auditService.js";
import { requireStore, type WebDeps } from "./deps.js";
import { SESSION_COOKIE } from "../middleware/sessionAccess.js";
import { trimmed } from "./helpers.js";

/**
 * Gerbang kredensial Admin. Auditor masuk dengan tautan undangan individual sekali pakai.
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
      adminEmail: loginEmails.admin,
    });
  };

  router.get("/", (req, res) => {
    if (sec.adminBinding(req)) return res.redirect(303, "/admin");
    res.redirect(303, "/masuk");
  });

  router.get("/masuk", (req, res) => {
    if (sec.adminBinding(req)) return res.redirect(303, "/admin");
    renderGate(res, 200);
  });

  // Bookmark lama Admin tetap diarahkan ke gerbang masuk bersama.
  router.get("/admin/masuk", (_req, res) => res.redirect(303, "/masuk"));

  // GET tidak menghanguskan token; undangan hanya diklaim setelah Auditor menekan tombol.
  router.get("/undangan/:token", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.render("undangan", { title: "Aktifkan akses Auditor", token: req.params["token"] });
  });

  // Token sesi hanya disimpan sebagai hash oleh service. Cookie HttpOnly berisi token acak yang sama.
  router.post("/undangan/:token", sec.checkOrigin, async (req, res) => {
    const claimed = await claimInvitation(requireStore(deps), { token: req.params["token"] });
    res.cookie(SESSION_COOKIE, claimed.token, sec.cookieOptions(12 * 3_600_000));
    res.set("Cache-Control", "no-store");
    res.redirect(303, "/auditor");
  });

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

    sec.recordLoginFailure(ip);
    renderGate(res, 401, { error: generic, email });
  });

  return router;
}
