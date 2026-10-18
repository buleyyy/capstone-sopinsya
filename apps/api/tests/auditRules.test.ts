import { describe, expect, it } from "vitest";
import {
  assertNotExcluded,
  canAccess,
  canWrite,
  isInviteClaimable,
  type SessionState,
} from "../src/domain/auditRules.js";

const now = new Date("2026-10-10T00:00:00Z");
const before = new Date("2026-10-09T00:00:00Z");
const after = new Date("2026-10-11T00:00:00Z");

const s = (over: Partial<SessionState>): SessionState => ({
  status: "ACTIVE",
  expiresAt: after,
  auditorAccessUntil: null,
  ...over,
});

describe("canAccess / canWrite (matriks status sesi)", () => {
  it("DRAFT: tidak dapat diakses dan tidak dapat ditulis", () => {
    expect(canAccess(s({ status: "DRAFT" }), now)).toBe(false);
    expect(canWrite(s({ status: "DRAFT" }), now)).toBe(false);
  });

  it("ACTIVE sebelum expiresAt: akses dan tulis", () => {
    expect(canAccess(s({}), now)).toBe(true);
    expect(canWrite(s({}), now)).toBe(true);
  });

  it("ACTIVE setelah expiresAt: tetap bisa dibaca, tidak bisa ditulis", () => {
    const expired = s({ expiresAt: before });
    expect(canAccess(expired, now)).toBe(true);
    expect(canWrite(expired, now)).toBe(false);
  });

  it("tepat pada expiresAt: sudah tidak dapat ditulis", () => {
    expect(canWrite(s({ expiresAt: now }), now)).toBe(false);
  });

  it("CLOSED dalam auditorAccessUntil: dapat dibaca, tidak dapat ditulis", () => {
    const closed = s({ status: "CLOSED", auditorAccessUntil: after });
    expect(canAccess(closed, now)).toBe(true);
    expect(canWrite(closed, now)).toBe(false);
  });

  it("CLOSED tanpa auditorAccessUntil atau sudah lewat: tidak ada akses", () => {
    expect(canAccess(s({ status: "CLOSED", auditorAccessUntil: null }), now)).toBe(false);
    expect(canAccess(s({ status: "CLOSED", auditorAccessUntil: before }), now)).toBe(false);
    expect(canAccess(s({ status: "CLOSED", auditorAccessUntil: now }), now)).toBe(false);
  });
});

describe("isInviteClaimable (invarian I3)", () => {
  const base = { claimedAt: null, revokedAt: null, inviteExpiresAt: after };
  it("valid bila belum diklaim, tidak dicabut, belum kedaluwarsa", () => {
    expect(isInviteClaimable(base, now)).toBe(true);
  });
  it("ditolak bila sudah diklaim, dicabut, atau kedaluwarsa", () => {
    expect(isInviteClaimable({ ...base, claimedAt: before }, now)).toBe(false);
    expect(isInviteClaimable({ ...base, revokedAt: before }, now)).toBe(false);
    expect(isInviteClaimable({ ...base, inviteExpiresAt: before }, now)).toBe(false);
  });
});

describe("assertNotExcluded (self-audit)", () => {
  it("menolak unit yang dikecualikan", () => {
    let caught: unknown;
    try {
      assertNotExcluded([1, 2], 2);
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ code: "SELF_AUDIT_FORBIDDEN", statusCode: 422 });
  });
  it("mengizinkan unit lain dan daftar kosong", () => {
    expect(() => assertNotExcluded([1, 2], 3)).not.toThrow();
    expect(() => assertNotExcluded([], 3)).not.toThrow();
  });
});
