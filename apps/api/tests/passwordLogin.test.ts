import { describe, expect, it } from "vitest";
import * as admin from "../src/services/adminService.js";
import { authenticateById, resolvePasswordLogin } from "../src/services/auditService.js";
import { WebSecurity } from "../src/web/security.js";
import { MemoryStore } from "./helpers/memoryStore.js";
import { T0, seed } from "./helpers/seed.js";

describe("login kata sandi Auditor (tanpa undangan)", () => {
  it("memilih auditor pertama yang belum dicabut pada sesi ACTIVE", async () => {
    const s = await seed();
    const ctx = await resolvePasswordLogin(s.store, T0);
    expect(ctx).toMatchObject({ auditorId: s.inv1.auditor.id, sessionId: s.session.id });

    await admin.revokeAuditor(s.store, { sessionId: s.session.id, auditorId: s.inv1.auditor.id }, T0);
    const next = await resolvePasswordLogin(s.store, T0);
    expect(next.auditorId).toBe(s.inv2.auditor.id);
  });

  it("tidak butuh undangan diklaim; penugasan auditor tetap terbaca", async () => {
    const s = await seed();
    const ctx = await resolvePasswordLogin(s.store, T0);
    const again = await authenticateById(s.store, ctx.auditorId, T0);
    expect(again.sessionId).toBe(s.session.id);
    expect(s.store.auditors.find((a) => a.id === ctx.auditorId)?.claimedAt).toBeNull();
  });

  it("409 bila tidak ada sesi ACTIVE atau auditor", async () => {
    await expect(resolvePasswordLogin(new MemoryStore(), T0)).rejects.toMatchObject({
      statusCode: 409,
      code: "NO_ACTIVE_AUDIT_SESSION",
    });
  });

  it("authenticateById: 401 untuk id tidak dikenal atau auditor dicabut; 403 setelah sesi ditutup", async () => {
    const s = await seed();
    await expect(authenticateById(s.store, 9999, T0)).rejects.toMatchObject({ statusCode: 401 });

    await admin.closeSession(s.store, { sessionId: s.session.id, noAccess: true }, T0);
    await expect(authenticateById(s.store, s.inv1.auditor.id, T0)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("authenticateById: 401 setelah auditor dicabut", async () => {
    const s = await seed();
    await admin.revokeAuditor(s.store, { sessionId: s.session.id, auditorId: s.inv1.auditor.id }, T0);
    await expect(authenticateById(s.store, s.inv1.auditor.id, T0)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("WebSecurity (kata sandi dan cookie Auditor)", () => {
  const make = (over: { auditorPassword?: string | undefined } = {}) =>
    new WebSecurity({
      secret: "s".repeat(32),
      production: false,
      adminPassword: "kata-sandi-admin-123",
      auditorPassword: "auditor123",
      ...over,
    });

  it("menerima kata sandi Auditor yang benar dan menolak yang salah, termasuk kata sandi Admin", () => {
    const s = make();
    expect(s.checkAuditorPassword("auditor123", "10.0.0.1")).toBe("ok");
    expect(s.checkAuditorPassword("salah", "10.0.0.2")).toBe("wrong");
    expect(s.checkAuditorPassword("kata-sandi-admin-123", "10.0.0.3")).toBe("wrong");
    expect(s.checkAdminPassword("auditor123", "10.0.0.4")).toBe("wrong");
  });

  it("menonaktifkan login Auditor bila AUDITOR_PASSWORD kosong", () => {
    const s = make({ auditorPassword: undefined });
    expect(s.auditorEnabled).toBe(false);
    expect(s.checkAuditorPassword("auditor123", "10.0.0.1")).toBe("disabled");
  });

  it("login Auditor ikut pembatas 8 percobaan gagal per IP", () => {
    const s = make();
    for (let i = 0; i < 8; i += 1) expect(s.checkAuditorPassword("salah", "10.0.0.9")).toBe("wrong");
    expect(s.checkAuditorPassword("auditor123", "10.0.0.9")).toBe("blocked");
  });

  const cookieFrom = (s: WebSecurity, auditorId: number, now: number): string => {
    let header = "";
    s.issueAuditorCookie({ cookie: (_n: string, v: string) => (header = v) } as never, auditorId, now);
    return header;
  };
  const reqWith = (value: string | undefined) =>
    ({ header: (n: string) => (n === "cookie" && value !== undefined ? `sopinsya_session=${value}` : undefined) }) as never;

  it("cookie Auditor bertanda tangan: sah, memuat id auditor, dan kedaluwarsa", () => {
    const s = make();
    const t0 = 1_000_000;
    const value = cookieFrom(s, 42, t0);
    expect(s.auditorBinding(reqWith(value), t0 + 1000)).toMatchObject({ auditorId: 42, binding: value });
    expect(s.auditorBinding(reqWith(value), t0 + 13 * 3_600_000)).toBeUndefined();
  });

  it("menolak cookie yang diubah id-nya, bertanda tangan rahasia lain, atau berformat salah", () => {
    const s = make();
    const t0 = 1_000_000;
    const [exp, , nonce, sig] = cookieFrom(s, 42, t0).split(".") as [string, string, string, string];
    expect(s.auditorBinding(reqWith(`${exp}.7.${nonce}.${sig}`), t0)).toBeUndefined();

    const other = new WebSecurity({ secret: "x".repeat(32), production: false, auditorPassword: "auditor123" });
    expect(other.auditorBinding(reqWith(cookieFrom(s, 42, t0)), t0)).toBeUndefined();

    expect(s.auditorBinding(reqWith("bukan-cookie"), t0)).toBeUndefined();
    expect(s.auditorBinding(reqWith(undefined), t0)).toBeUndefined();
  });
});
