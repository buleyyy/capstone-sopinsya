import { AppError } from "../utils/errors.js";
import type { SessionStatus } from "./auditSchemas.js";

export interface SessionState {
  status: SessionStatus;
  expiresAt: Date;
  auditorAccessUntil: Date | null;
}

/**
 * Akses (baca): ACTIVE kapan saja (termasuk setelah expiresAt), atau CLOSED selama
 * auditorAccessUntil terisi dan belum lewat. DRAFT tidak dapat diakses auditor.
 */
export const canAccess = (s: SessionState, now: Date): boolean => {
  if (s.status === "ACTIVE") return true;
  return s.status === "CLOSED" && s.auditorAccessUntil !== null && now.getTime() < s.auditorAccessUntil.getTime();
};

/** Tulis: hanya ACTIVE dan belum melewati expiresAt. */
export const canWrite = (s: SessionState, now: Date): boolean =>
  s.status === "ACTIVE" && now.getTime() < s.expiresAt.getTime();

export function assertCanAccess(s: SessionState, now: Date): void {
  if (!canAccess(s, now)) {
    throw new AppError(403, "SESSION_NOT_ACCESSIBLE", "Sesi tidak dapat diakses");
  }
}

export function assertCanWrite(s: SessionState, now: Date): void {
  if (!canWrite(s, now)) {
    throw new AppError(403, "SESSION_NOT_WRITABLE", "Sesi tidak menerima perubahan (ditutup atau melewati batas waktu)");
  }
}

export interface InviteState {
  claimedAt: Date | null;
  revokedAt: Date | null;
  inviteExpiresAt: Date;
}

/** I3: undangan dapat diklaim hanya bila belum diklaim, tidak dicabut, dan belum kedaluwarsa. */
export const isInviteClaimable = (a: InviteState, now: Date): boolean =>
  a.claimedAt === null && a.revokedAt === null && a.inviteExpiresAt.getTime() > now.getTime();

/**
 * Aturan bisnis: auditor tidak boleh mengaudit unit yang dikecualikan baginya (self-audit).
 * Daftar pengecualian dideklarasikan Admin saat membuat undangan.
 */
export function assertNotExcluded(excludedDepartmentIds: readonly number[], targetDepartmentId: number): void {
  if (excludedDepartmentIds.includes(targetDepartmentId)) {
    throw new AppError(422, "SELF_AUDIT_FORBIDDEN", "Auditor tidak boleh mengaudit unit ini (self-audit)");
  }
}
