import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";
import * as admin from "../src/services/adminService.js";
import {
  authenticateAccount,
  bootstrapAdmin,
  createAuditorAccount,
  hashPassword,
  resetAuditorPassword,
  setAuditorAccountActive,
  updateAuditorAccount,
  verifyPassword,
} from "../src/services/accountService.js";
import { createFinding, getChecklist, resolveAccountContext } from "../src/services/auditService.js";
import { WebSecurity } from "../../web/shared/security.js";
import { MemoryAccountStore } from "./helpers/memoryAccountStore.js";
import { MemoryStore } from "./helpers/memoryStore.js";
import { T0, addDays, finding, seed } from "./helpers/seed.js";

const PASS = "kata-sandi-panjang-1";

async function auditorAccount(accounts: MemoryAccountStore, email = "auditor.satu@contoh.id", name = "Auditor Satu") {
  const r = await createAuditorAccount(accounts, { email, name, password: PASS });
  return r.account;
}

describe("kata sandi bcrypt", () => {
  it("menyimpan hash bcrypt, bukan plaintext, dan memverifikasinya", async () => {
    const hash = await hashPassword(PASS);
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).not.toContain(PASS);
    expect(await verifyPassword(PASS, hash)).toBe(true);
    expect(await verifyPassword("salah-salah-salah", hash)).toBe(false);
  });

  it("akun tersimpan dengan hash, tidak pernah plaintext", async () => {
    const accounts = new MemoryAccountStore();
    await auditorAccount(accounts);
    const row = accounts.rows[0];
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(accounts.rows)).not.toContain(PASS);
  });
});

describe("authenticateAccount", () => {
  it("berhasil untuk akun aktif (email tidak peka huruf) dan mencatat login terakhir", async () => {
    const accounts = new MemoryAccountStore();
    const acc = await auditorAccount(accounts);
    const ok = await authenticateAccount(accounts, "  AUDITOR.Satu@Contoh.ID ", PASS, T0);
    expect(ok).toMatchObject({ id: acc.id, role: "AUDITOR" });
    expect(ok).not.toHaveProperty("passwordHash");
    expect(accounts.rows[0]?.lastLoginAt).toEqual(T0);
  });

  it("null untuk kata sandi salah, email tidak dikenal, dan akun nonaktif", async () => {
    const accounts = new MemoryAccountStore();
    const acc = await auditorAccount(accounts);
    expect(await authenticateAccount(accounts, acc.email, "salah-salah-salah", T0)).toBeNull();
    expect(await authenticateAccount(accounts, "tidak.ada@contoh.id", PASS, T0)).toBeNull();
    await setAuditorAccountActive(accounts, { accountId: acc.id, isActive: false });
    expect(await authenticateAccount(accounts, acc.email, PASS, T0)).toBeNull();
    await setAuditorAccountActive(accounts, { accountId: acc.id, isActive: true });
    expect(await authenticateAccount(accounts, acc.email, PASS, T0)).not.toBeNull();
  });
});

describe("kelola akun Auditor", () => {
  it("membuat kata sandi sementara bila kosong (tampil sekali) dan akun dapat login dengannya", async () => {
    const accounts = new MemoryAccountStore();
    const r = await createAuditorAccount(accounts, { email: "baru@contoh.id", name: "Baru", password: "" });
    expect(r.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(await authenticateAccount(accounts, "baru@contoh.id", r.temporaryPassword ?? "", T0)).not.toBeNull();
    const own = await createAuditorAccount(accounts, { email: "lain@contoh.id", name: "Lain", password: PASS });
    expect(own.temporaryPassword).toBeNull();
  });

  it("menolak email ganda (409) dan kata sandi pendek (422)", async () => {
    const accounts = new MemoryAccountStore();
    await auditorAccount(accounts);
    await expect(auditorAccount(accounts)).rejects.toMatchObject({ statusCode: 409, code: "EMAIL_TAKEN" });
    await expect(createAuditorAccount(accounts, { email: "x@contoh.id", name: "X", password: "pendek" })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("mengubah nama/email dan menolak email yang dipakai akun lain", async () => {
    const accounts = new MemoryAccountStore();
    const a = await auditorAccount(accounts, "a@contoh.id", "A");
    await auditorAccount(accounts, "b@contoh.id", "B");
    const changed = await updateAuditorAccount(accounts, { accountId: a.id, email: "a2@contoh.id", name: "A Baru" });
    expect(changed).toMatchObject({ email: "a2@contoh.id", name: "A Baru" });
    await expect(updateAuditorAccount(accounts, { accountId: a.id, email: "b@contoh.id", name: "A" })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("reset kata sandi: yang baru berlaku, yang lama tidak", async () => {
    const accounts = new MemoryAccountStore();
    const acc = await auditorAccount(accounts);
    const r = await resetAuditorPassword(accounts, { accountId: acc.id, password: "" });
    expect(r.temporaryPassword).not.toBeNull();
    expect(await authenticateAccount(accounts, acc.email, PASS, T0)).toBeNull();
    expect(await authenticateAccount(accounts, acc.email, r.temporaryPassword ?? "", T0)).not.toBeNull();
  });

  it("akun Admin tidak dapat diubah, dinonaktifkan, atau di-reset lewat pengelolaan akun Auditor", async () => {
    const accounts = new MemoryAccountStore();
    const boot = await bootstrapAdmin(accounts, { email: "admin@contoh.id", password: "admin-sandi-sangat-panjang" });
    expect(boot.created).toBe(true);
    const adminId = accounts.rows[0]?.id ?? 0;
    await expect(setAuditorAccountActive(accounts, { accountId: adminId, isActive: false })).rejects.toMatchObject({ statusCode: 404 });
    await expect(resetAuditorPassword(accounts, { accountId: adminId, password: "" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(updateAuditorAccount(accounts, { accountId: adminId, email: "x@contoh.id", name: "X" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("bootstrapAdmin", () => {
  it("membuat Admin pertama, idempotent, dan menolak kata sandi lemah", async () => {
    const accounts = new MemoryAccountStore();
    await expect(bootstrapAdmin(accounts, { email: "admin@contoh.id", password: "pendek" })).rejects.toMatchObject({ statusCode: 422 });
    const first = await bootstrapAdmin(accounts, { email: "Admin@Contoh.id", password: "admin-sandi-sangat-panjang" });
    expect(first).toMatchObject({ created: true, account: { role: "ADMIN", email: "admin@contoh.id" } });
    expect(await authenticateAccount(accounts, "admin@contoh.id", "admin-sandi-sangat-panjang", T0)).toMatchObject({ role: "ADMIN" });
    const again = await bootstrapAdmin(accounts, { email: "lain@contoh.id", password: "kata-sandi-lain-panjang" });
    expect(again).toEqual({ created: false, reason: "ADMIN_EXISTS" });
    expect(accounts.rows).toHaveLength(1);
  });
});

describe("penugasan sesi ke akun Auditor", () => {
  it("Auditor hanya mendapat sesi yang ditugaskan kepada akunnya", async () => {
    const s = await seed();
    const accounts = new MemoryAccountStore();
    const u1 = await auditorAccount(accounts, "u1@contoh.id", "U Satu");
    const u2 = await auditorAccount(accounts, "u2@contoh.id", "U Dua");

    await admin.assignAuditorAccount(s.store, accounts, { sessionId: s.session.id, accountId: u1.id, noExclusions: true }, T0);

    const ctx = await resolveAccountContext(s.store, u1.id, T0);
    expect(ctx.sessionId).toBe(s.session.id);
    expect(s.store.auditors.find((a) => a.id === ctx.auditorId)?.userId).toBe(u1.id);

    // Akun lain yang tidak ditugaskan tidak mendapat sesi apa pun.
    await expect(resolveAccountContext(s.store, u2.id, T0)).rejects.toMatchObject({ statusCode: 409, code: "NO_ASSIGNED_AUDIT_SESSION" });
  });

  it("menolak penugasan ganda, akun nonaktif, dan akun Admin", async () => {
    const s = await seed();
    const accounts = new MemoryAccountStore();
    const u = await auditorAccount(accounts);
    const args = { sessionId: s.session.id, accountId: u.id, noExclusions: true };
    await admin.assignAuditorAccount(s.store, accounts, args, T0);
    await expect(admin.assignAuditorAccount(s.store, accounts, args, T0)).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_ASSIGNED" });

    const off = await auditorAccount(accounts, "off@contoh.id", "Off");
    await setAuditorAccountActive(accounts, { accountId: off.id, isActive: false });
    await expect(
      admin.assignAuditorAccount(s.store, accounts, { ...args, accountId: off.id }, T0),
    ).rejects.toMatchObject({ statusCode: 422, code: "ACCOUNT_INACTIVE" });

    await bootstrapAdmin(accounts, { email: "admin@contoh.id", password: "admin-sandi-sangat-panjang" });
    const adminAcc = accounts.rows.find((r) => r.role === "ADMIN");
    await expect(
      admin.assignAuditorAccount(s.store, accounts, { ...args, accountId: adminAcc?.id ?? 0 }, T0),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("mewajibkan pernyataan eksplisit unit terlarang atau noExclusions", async () => {
    const s = await seed();
    const accounts = new MemoryAccountStore();
    const u = await auditorAccount(accounts);
    await expect(
      admin.assignAuditorAccount(s.store, accounts, { sessionId: s.session.id, accountId: u.id }, T0),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("pencabutan memutus akses, dan penugasan ulang mengaktifkannya kembali", async () => {
    const s = await seed();
    const accounts = new MemoryAccountStore();
    const u = await auditorAccount(accounts);
    const args = { sessionId: s.session.id, accountId: u.id, noExclusions: true };
    const row = await admin.assignAuditorAccount(s.store, accounts, args, T0);
    await admin.revokeAuditor(s.store, { sessionId: s.session.id, auditorId: row.id }, T0);
    await expect(resolveAccountContext(s.store, u.id, T0)).rejects.toMatchObject({ statusCode: 409 });

    await admin.assignAuditorAccount(s.store, accounts, args, T0);
    expect((await resolveAccountContext(s.store, u.id, T0)).auditorId).toBe(row.id);
  });

  it("akses setelah sesi ditutup mengikuti jendela akses (403 bila tanpa akses)", async () => {
    const s = await seed();
    const accounts = new MemoryAccountStore();
    const u = await auditorAccount(accounts);
    await admin.assignAuditorAccount(s.store, accounts, { sessionId: s.session.id, accountId: u.id, noExclusions: true }, T0);
    await admin.closeSession(s.store, { sessionId: s.session.id, noAccess: true }, T0);
    await expect(resolveAccountContext(s.store, u.id, T0)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("sesi tanpa Master Checklist", () => {
  it("dibuat, diaktifkan, dan dipakai mencatat temuan tanpa checklist", async () => {
    const store = new MemoryStore();
    const dept = await admin.createDepartment(store, { name: "Unit X" });
    const session = await admin.createSession(store, { title: "Tanpa checklist", expiresAt: addDays(T0, 7) }, T0);
    expect(session.checklistVersionId).toBeNull();

    const accounts = new MemoryAccountStore();
    const u = await auditorAccount(accounts);
    const auditor = await admin.assignAuditorAccount(store, accounts, { sessionId: session.id, accountId: u.id, noExclusions: true }, T0);
    const assignment = await admin.createAssignment(store, { sessionId: session.id, auditorId: auditor.id, departmentId: dept.id }, T0);
    await admin.activateSession(store, { sessionId: session.id }, T0);

    const ctx = await resolveAccountContext(store, u.id, T0);
    expect(ctx.checklistVersionId).toBeNull();
    expect(await getChecklist(store, ctx, assignment.id)).toEqual([]);

    const created = await createFinding(store, ctx, assignment.id, finding(), T0);
    expect(created.created).toBe(true);
  });
});

describe("cookie akun database (WebSecurity)", () => {
  const make = (legacyEnvLogin?: boolean) =>
    new WebSecurity({
      secret: "s".repeat(32),
      production: false,
      adminPassword: "kata-sandi-admin-123",
      auditorPassword: "auditor123",
      legacyEnvLogin,
    });

  /** Menangkap cookie yang diterbitkan lalu membangun Request seolah-olah browser mengirimkannya. */
  const issued = (fn: (res: Response) => void) => {
    const sent: { name: string; value: string }[] = [];
    const res = { cookie: (name: string, value: string) => void sent.push({ name, value }) } as unknown as Response;
    fn(res);
    const first = sent[0];
    if (!first) throw new Error("tidak ada cookie");
    const req = { header: (h: string) => (h.toLowerCase() === "cookie" ? `${first.name}=${first.value}` : undefined) } as unknown as Request;
    return { req, value: first.value, name: first.name };
  };

  it("cookie Auditor akun membawa userId dan tetap sah walau fallback environment mati", () => {
    const t = Date.now();
    const sec = make(false);
    const { req } = issued((res) => sec.issueAuditorAccountCookie(res, 7, t));
    expect(sec.auditorBinding(req, t + 1000)).toMatchObject({ auditorId: 0, userId: 7 });
  });

  it("cookie Auditor lama (id angka) ditolak bila fallback environment mati, diterima bila aktif", () => {
    const t = Date.now();
    const legacy = issued((res) => make().issueAuditorCookie(res, 42, t));
    expect(make(false).auditorBinding(legacy.req, t + 1000)).toBeUndefined();
    expect(make(true).auditorBinding(legacy.req, t + 1000)).toMatchObject({ auditorId: 42, userId: null });
  });

  it("cookie Admin akun membawa id; cookie Admin lama ditolak bila fallback mati", () => {
    const t = Date.now();
    const sec = make(false);
    const acct = issued((res) => sec.issueAdminCookie(res, t, 5));
    expect(sec.adminIdentity(acct.req, t + 1000)).toMatchObject({ userId: 5 });

    const legacy = issued((res) => sec.issueAdminCookie(res, t));
    expect(sec.adminIdentity(legacy.req, t + 1000)).toBeUndefined();
    expect(make(true).adminIdentity(legacy.req, t + 1000)).toMatchObject({ userId: null });
  });

  it("menolak cookie akun yang id-nya diubah atau sudah kedaluwarsa", () => {
    const t = Date.now();
    const sec = make(false);
    const { name, value } = issued((res) => sec.issueAdminCookie(res, t, 5));
    const parts = value.split(".");
    parts[1] = "1"; // mencoba menjadi akun lain
    const forged = { header: () => `${name}=${parts.join(".")}` } as unknown as Request;
    expect(sec.adminIdentity(forged, t + 1000)).toBeUndefined();

    const fresh = issued((res) => sec.issueAdminCookie(res, t, 5));
    expect(sec.adminIdentity(fresh.req, t + 48 * 3_600_000)).toBeUndefined();
  });
});
