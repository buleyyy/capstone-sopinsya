import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { readCookie, SESSION_COOKIE } from "../../api/src/middleware/sessionAccess.js";
import { AppError } from "../../api/src/utils/errors.js";

export const ADMIN_COOKIE = "sopinsya_admin";
const ADMIN_TTL_MS = 8 * 3_600_000;
const AUDITOR_TTL_MS = 12 * 3_600_000;

/**
 * Id auditor khusus pada cookie login kata sandi bersama bila saat masuk belum ada sesi audit aktif.
 * Cookie ini hanya diterbitkan setelah kata sandi Auditor terverifikasi; id sebenarnya dicari ulang pada setiap request.
 */
export const UNBOUND_AUDITOR_ID = 0;

export interface SecurityOptions {
  /** Rahasia HMAC (CSRF dan cookie Admin). Bila kosong, dibuat acak per proses (sesi hilang saat restart). */
  secret?: string | undefined;
  adminPassword?: string | undefined;
  /** Kata sandi Auditor (satu akun bersama untuk UAT). Kosong = login Auditor dinonaktifkan. */
  auditorPassword?: string | undefined;
  appOrigin?: string | undefined;
  /**
   * FALLBACK SEMENTARA: true = cookie dan login kata sandi environment (tanpa akun database) masih diterima.
   * Bawaan true agar perilaku lama tetap utuh bila tidak diatur; aplikasi mengisinya dari LEGACY_ENV_LOGIN (bawaan false).
   */
  legacyEnvLogin?: boolean | undefined;
  production: boolean;
}

const hmac = (secret: string, value: string): string => createHmac("sha256", secret).update(value).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Pembatas percobaan login sederhana (di memori): 8 percobaan gagal per 15 menit per IP. */
class AttemptLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  isBlocked(key: string, now: number): boolean {
    const h = this.hits.get(key);
    if (!h) return false;
    if (now >= h.resetAt) {
      this.hits.delete(key);
      return false;
    }
    return h.count >= this.max;
  }

  recordFailure(key: string, now: number): void {
    const h = this.hits.get(key);
    if (!h || now >= h.resetAt) this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    else h.count += 1;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

export class WebSecurity {
  private readonly secret: string;
  private readonly limiter = new AttemptLimiter(8, 15 * 60_000);

  constructor(private readonly opts: SecurityOptions) {
    this.secret = opts.secret ?? randomBytes(32).toString("hex");
  }

  get legacyEnvLogin(): boolean {
    return this.opts.legacyEnvLogin ?? true;
  }

  get adminEnabled(): boolean {
    return Boolean(this.opts.adminPassword);
  }

  get auditorEnabled(): boolean {
    return Boolean(this.opts.auditorPassword);
  }

  cookieOptions(maxAgeMs?: number): CookieOptions {
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: this.opts.production,
      path: "/",
      ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
    };
  }

  // ---------- CSRF ----------

  /** Token CSRF terikat pada nilai sesi (cookie), jadi tidak bisa dipakai lintas sesi. */
  csrfToken(binding: string): string {
    return hmac(this.secret, `csrf:${binding}`);
  }

  isValidCsrf(binding: string, submitted: unknown): boolean {
    return typeof submitted === "string" && safeEqual(this.csrfToken(binding), submitted);
  }

  /**
   * Menolak POST lintas-origin. Origin yang sama dengan host permintaan (mis. akses lewat IP LAN) atau APP_ORIGIN diterima.
   * Tanpa header Origin (klien non-browser) diteruskan; token CSRF tetap diperiksa pada POST bersesi.
   */
  checkOrigin: RequestHandler = (req, _res, next) => {
    const origin = req.get("origin");
    if (origin) {
      const sameHost = `${req.protocol}://${req.get("host") ?? ""}`;
      if (origin !== sameHost && origin !== this.opts.appOrigin) {
        return next(new AppError(403, "BAD_ORIGIN", "Permintaan ditolak (origin tidak sesuai)"));
      }
    }
    next();
  };

  // ---------- Admin ----------

  /** Pembatas percobaan masuk (Admin dan Auditor berbagi satu gerbang): 8 kegagalan per 15 menit per IP. */
  isLoginBlocked(ip: string, now = Date.now()): boolean {
    return this.limiter.isBlocked(ip, now);
  }

  recordLoginFailure(ip: string, now = Date.now()): void {
    this.limiter.recordFailure(ip, now);
  }

  resetLoginFailures(ip: string): void {
    this.limiter.reset(ip);
  }

  private checkPassword(
    expected: string | undefined,
    candidate: string,
    ip: string,
    now: number,
  ): "ok" | "wrong" | "blocked" | "disabled" {
    if (!expected) return "disabled";
    if (this.limiter.isBlocked(ip, now)) return "blocked";
    const a = createHash("sha256").update(candidate).digest();
    const b = createHash("sha256").update(expected).digest();
    if (timingSafeEqual(a, b)) {
      this.limiter.reset(ip);
      return "ok";
    }
    this.limiter.recordFailure(ip, now);
    return "wrong";
  }

  checkAdminPassword(candidate: string, ip: string, now = Date.now()): "ok" | "wrong" | "blocked" | "disabled" {
    return this.checkPassword(this.opts.adminPassword, candidate, ip, now);
  }

  checkAuditorPassword(candidate: string, ip: string, now = Date.now()): "ok" | "wrong" | "blocked" | "disabled" {
    return this.checkPassword(this.opts.auditorPassword, candidate, ip, now);
  }

  // ---------- Auditor ----------

  /**
   * Cookie Auditor bertanda tangan (tanpa token di database), sehingga banyak peserta UAT dapat masuk
   * bersamaan dengan akun yang sama tanpa saling mengeluarkan. Isi: exp.auditorId.nonce.tandaTangan.
   */
  issueAuditorCookie(res: Response, auditorId: number, now = Date.now()): void {
    const value = `${now + AUDITOR_TTL_MS}.${auditorId}.${randomBytes(16).toString("hex")}`;
    res.cookie(SESSION_COOKIE, `${value}.${hmac(this.secret, `auditor:${value}`)}`, this.cookieOptions(AUDITOR_TTL_MS));
  }

  /**
   * Cookie untuk login akun database: bagian id berbentuk `u<idAkun>`. Aktif/role akun dan sesi yang ditugaskan
   * dicari ulang dari database pada setiap request, jadi menonaktifkan akun langsung memutus akses.
   */
  issueAuditorAccountCookie(res: Response, userId: number, now = Date.now()): void {
    const value = `${now + AUDITOR_TTL_MS}.u${userId}.${randomBytes(16).toString("hex")}`;
    res.cookie(SESSION_COOKIE, `${value}.${hmac(this.secret, `auditor:${value}`)}`, this.cookieOptions(AUDITOR_TTL_MS));
  }

  clearAuditorCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  /**
   * Cookie Auditor yang sah: binding CSRF + identitas. `userId` terisi untuk cookie akun database (auditorId = 0);
   * cookie lama (id auditor angka) hanya diterima selama fallback environment aktif.
   */
  auditorBinding(
    req: Request,
    now = Date.now(),
  ): { auditorId: number; userId: number | null; binding: string } | undefined {
    const raw = readCookie(req.header("cookie"), SESSION_COOKIE);
    if (!raw) return undefined;
    const parts = raw.split(".");
    if (parts.length !== 4) return undefined;
    const [exp, id, nonce, sig] = parts as [string, string, string, string];
    if (!safeEqual(hmac(this.secret, `auditor:${exp}.${id}.${nonce}`), sig)) return undefined;
    if (!(Number(exp) > now) || !/^u?\d{1,9}$/.test(id)) return undefined;
    if (id.startsWith("u")) return { auditorId: UNBOUND_AUDITOR_ID, userId: Number(id.slice(1)), binding: raw };
    if (!this.legacyEnvLogin) return undefined;
    return { auditorId: Number(id), userId: null, binding: raw };
  }

  /** @param userId akun database (cookie 4 bagian); null = cookie lama (fallback environment, 3 bagian). */
  issueAdminCookie(res: Response, now = Date.now(), userId: number | null = null): void {
    const nonce = randomBytes(16).toString("hex");
    const value = userId === null ? `${now + ADMIN_TTL_MS}.${nonce}` : `${now + ADMIN_TTL_MS}.${userId}.${nonce}`;
    res.cookie(ADMIN_COOKIE, `${value}.${hmac(this.secret, `admin:${value}`)}`, this.cookieOptions(ADMIN_TTL_MS));
  }

  clearAdminCookie(res: Response): void {
    res.clearCookie(ADMIN_COOKIE, this.cookieOptions());
  }

  /** Cookie Admin yang sah: binding CSRF + id akun (null untuk cookie lama; hanya diterima saat fallback aktif). */
  adminIdentity(req: Request, now = Date.now()): { binding: string; userId: number | null } | undefined {
    const raw = readCookie(req.header("cookie"), ADMIN_COOKIE);
    if (!raw) return undefined;
    const parts = raw.split(".");
    if (parts.length === 3) {
      const [exp, nonce, sig] = parts as [string, string, string];
      if (!safeEqual(hmac(this.secret, `admin:${exp}.${nonce}`), sig)) return undefined;
      if (!(Number(exp) > now) || !this.legacyEnvLogin) return undefined;
      return { binding: raw, userId: null };
    }
    if (parts.length === 4) {
      const [exp, uid, nonce, sig] = parts as [string, string, string, string];
      if (!safeEqual(hmac(this.secret, `admin:${exp}.${uid}.${nonce}`), sig)) return undefined;
      if (!(Number(exp) > now) || !/^\d{1,9}$/.test(uid)) return undefined;
      return { binding: raw, userId: Number(uid) };
    }
    return undefined;
  }

  /** Mengembalikan nilai cookie Admin yang sah (dipakai sebagai binding CSRF), atau undefined. */
  adminBinding(req: Request, now = Date.now()): string | undefined {
    return this.adminIdentity(req, now)?.binding;
  }

  /**
   * Halaman Admin: belum login -> alihkan ke /masuk. Keaktifan akun dan role diperiksa ulang oleh middleware
   * async di adminRoutes (butuh database).
   */
  requireAdmin: RequestHandler = (req, res, next) => {
    const binding = this.adminBinding(req);
    if (!binding) return res.redirect(303, "/masuk");
    res.locals["csrf"] = this.csrfToken(binding);
    res.locals["csrfBinding"] = binding;
    next();
  };

  /** Memeriksa token CSRF pada POST bersesi (Admin: cookie Admin; Auditor: token sesi dari cookie). */
  requireCsrf: RequestHandler = (req, res, next) => {
    const binding = res.locals["csrfBinding"] as string | undefined;
    const body = req.body as Record<string, unknown> | undefined;
    if (!binding || !this.isValidCsrf(binding, body?.["_csrf"])) {
      return next(new AppError(403, "BAD_CSRF", "Formulir kedaluwarsa atau tidak valid. Muat ulang halaman lalu coba lagi."));
    }
    next();
  };
}
