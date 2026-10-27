import type { Response } from "express";
import type { AuditContext } from "../services/auditService.js";
import { AppError } from "../utils/errors.js";

/** Nama cookie sesi Auditor (nilai bertanda tangan, dibuat WebSecurity.issueAuditorCookie). */
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
 * Konteks audit (res.locals.audit) diisi middleware /auditor dari database pada SETIAP request, lewat
 * cookie bertanda tangan -> akun -> keanggotaan sesi. Ini SATU-SATUNYA sumber sessionId/auditorId/
 * checklistVersionId untuk handler; tidak pernah diambil dari body/query.
 */
export function getAuditContext(res: Response): AuditContext {
  const ctx = res.locals["audit"] as AuditContext | undefined;
  if (!ctx) throw new AppError(500, "INTERNAL_ERROR", "Konteks audit tidak tersedia (middleware belum dipasang)");
  return ctx;
}
