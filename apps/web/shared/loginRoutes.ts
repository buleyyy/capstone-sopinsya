import { Router, type Response } from "express";
import { resolvePasswordLogin } from "../../api/src/services/auditService.js";
import { authenticateAccount } from "../../api/src/services/accountService.js";
import { AppError } from "../../api/src/utils/errors.js";
import { requireStore, type WebDeps } from "./deps.js";
import { trimmed } from "./helpers.js";
import { UNBOUND_AUDITOR_ID } from "./security.js";

/**
 * Gerbang masuk bersama untuk Admin + Auditor: email + kata sandi.
 *  - UTAMA: akun di database (UserAccount, hash bcrypt). Role akun (ADMIN/AUDITOR) menentukan tujuan; pengguna tidak
 *    memilih role sendiri. Akun nonaktif atau kata sandi salah menghasilkan pesan yang sama (tidak membocorkan akun).
 *  - FALLBACK SEMENTARA (hanya bila LEGACY_ENV_LOGIN=true, dilarang di production): kata sandi environment lama.
 *    Rencana penghapusan: docs/AUTH-ACCOUNTS.md.
 * Area peserta (/peserta) tidak memakai gerbang ini: peserta tidak perlu masuk.
 */
export function createLoginRouter(deps: WebDeps): Router {
  const router = Router();
  const { sec, loginEmails } = deps;

  const renderGate = (res: Response, status: number, o: { error?: string | null; email?: string } = {}) => {
    res.status(status).render("masuk", {
      title: "Masuk",
      error: o.error ?? null,
      email: o.email ?? "",
      legacyEnvLogin: deps.legacyEnvLogin,
      adminEnabled: deps.legacyEnvLogin && sec.adminEnabled,
      auditorEnabled: deps.legacyEnvLogin && sec.auditorEnabled,
      adminEmail: loginEmails.admin,
      auditorEmail: loginEmails.auditor,
    });
  };

  // "/" : staf yang sudah masuk diarahkan ke areanya; selain itu ke area peserta (publik).
  router.get("/", (req, res) => {
    if (sec.adminBinding(req)) return res.redirect(303, "/admin");
    // Sesi Auditor yang tidak sah akan dialihkan kembali ke /masuk oleh area Audit (tanpa perulangan).
    if (sec.auditorBinding(req)) return res.redirect(303, "/audit");
    res.redirect(303, "/peserta/");
  });

  router.get("/masuk", (req, res) => {
    if (sec.adminBinding(req)) return res.redirect(303, "/admin");
    renderGate(res, 200);
  });

  // Bookmark lama /admin/masuk tetap mendarat di halaman masuk.
  router.get("/admin/masuk", (_req, res) => res.redirect(303, "/masuk"));

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

    // 1) Sumber utama: akun database.
    if (deps.accounts) {
      const account = await authenticateAccount(deps.accounts, email, secret);
      if (account) {
        sec.resetLoginFailures(ip);
        if (account.role === "ADMIN") {
          sec.issueAdminCookie(res, Date.now(), account.id);
          res.redirect(303, "/admin");
        } else {
          sec.issueAuditorAccountCookie(res, account.id);
          res.redirect(303, "/audit");
        }
        return;
      }
    }

    // 2) Fallback sementara: hanya bila diaktifkan eksplisit dan email cocok dengan email peran lama.
    //    Bila email itu dimiliki akun database, akun database yang menentukan: kegagalan di atas tidak boleh
    //    "diselamatkan" oleh kata sandi environment (mencegah legacy menembus akun database yang kata sandinya berbeda).
    const ownedByDbAccount = deps.accounts ? (await deps.accounts.findByEmail(email)) !== null : false;
    const legacyEmail =
      deps.legacyEnvLogin && !ownedByDbAccount && (email === loginEmails.admin || email === loginEmails.auditor);
    if (!legacyEmail) {
      sec.recordLoginFailure(ip);
      renderGate(res, 401, { error: generic, email });
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
        renderGate(res, 401, { error: generic, email });
        return;
      }
      renderGate(res, verdict === "blocked" ? 429 : 401, { error: verdict === "blocked" ? blocked : generic, email });
      return;
    }

    const verdict = sec.checkAuditorPassword(secret, ip);
    if (verdict === "disabled") {
      renderGate(res, 401, { error: generic, email });
      return;
    }
    if (verdict !== "ok") {
      renderGate(res, verdict === "blocked" ? 429 : 401, { error: verdict === "blocked" ? blocked : generic, email });
      return;
    }
    try {
      const ctx = await resolvePasswordLogin(requireStore(deps));
      sec.issueAuditorCookie(res, ctx.auditorId);
      res.redirect(303, "/audit");
    } catch (err) {
      // Kata sandi benar tetapi belum ada sesi aktif/auditor: tetap masuk; halaman Audit menampilkan keadaan menunggu.
      if (err instanceof AppError && (err.statusCode === 403 || err.statusCode === 409)) {
        sec.issueAuditorCookie(res, UNBOUND_AUDITOR_ID);
        res.redirect(303, "/audit");
        return;
      }
      throw err;
    }
  });

  return router;
}
