import type { RequestHandler, Response } from "express";
import type { AuditStore } from "../domain/auditStore.js";
import { authenticate, type AuditContext } from "../services/auditService.js";
import { AppError } from "../utils/errors.js";

export const SESSION_COOKIE = "sopinsya_session";

/** Membaca satu cookie dari header Cookie (tanpa dependency tambahan). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Akses auditor: token sesi dari cookie HttpOnly. Pada SETIAP request status sesi dibaca ulang dari
 * database dan diperiksa canAccess (tanpa itu: 403). Hasilnya (res.locals.audit) adalah SATU-SATUNYA
 * sumber sessionId/auditorId/checklistVersionId untuk handler; tidak pernah diambil dari body/query.
 */
export function requireAuditor(store: AuditStore, clock: () => Date = () => new Date()): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = readCookie(req.header("cookie"), SESSION_COOKIE);
      if (!token) throw new AppError(401, "UNAUTHENTICATED", "Sesi login tidak valid");
      res.locals["audit"] = await authenticate(store, token, clock());
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getAuditContext(res: Response): AuditContext {
  const ctx = res.locals["audit"] as AuditContext | undefined;
  if (!ctx) throw new AppError(500, "INTERNAL_ERROR", "Konteks audit tidak tersedia (middleware belum dipasang)");
  return ctx;
}
