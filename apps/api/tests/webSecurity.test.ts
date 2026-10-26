import { describe, expect, it } from "vitest";
import { WebSecurity } from "../src/web/security.js";

const make = (over: { adminPassword?: string | undefined } = {}) =>
  new WebSecurity({ secret: "s".repeat(32), production: false, adminPassword: "kata-sandi-admin-123", ...over });

describe("WebSecurity (gerbang masuk Admin)", () => {
  it("menerima kata sandi yang benar dan menolak yang salah", () => {
    const s = make();
    expect(s.checkAdminPassword("kata-sandi-admin-123", "10.0.0.1")).toBe("ok");
    expect(s.checkAdminPassword("salah", "10.0.0.2")).toBe("wrong");
  });

  it("menonaktifkan login Admin bila ADMIN_PASSWORD kosong", () => {
    const s = make({ adminPassword: undefined });
    expect(s.adminEnabled).toBe(false);
    expect(s.checkAdminPassword("apa-saja", "10.0.0.1")).toBe("disabled");
  });

  it("memblokir IP setelah 8 kegagalan, termasuk untuk kata sandi benar, tanpa memblokir IP lain", () => {
    const s = make();
    for (let i = 0; i < 8; i += 1) expect(s.checkAdminPassword("salah", "10.0.0.9")).toBe("wrong");
    expect(s.isLoginBlocked("10.0.0.9")).toBe(true);
    expect(s.checkAdminPassword("kata-sandi-admin-123", "10.0.0.9")).toBe("blocked");
    expect(s.checkAdminPassword("kata-sandi-admin-123", "10.0.0.10")).toBe("ok");
  });

  it("melepas blokir setelah jendela 15 menit lewat", () => {
    const s = make();
    const t0 = 1_000_000;
    for (let i = 0; i < 8; i += 1) s.recordLoginFailure("10.0.0.11", t0);
    expect(s.isLoginBlocked("10.0.0.11", t0 + 1000)).toBe(true);
    expect(s.isLoginBlocked("10.0.0.11", t0 + 15 * 60_000 + 1)).toBe(false);
  });

  it("token CSRF terikat pada nilai sesi dan menolak nilai kosong", () => {
    const s = make();
    const token = s.csrfToken("sesi-a");
    expect(s.isValidCsrf("sesi-a", token)).toBe(true);
    expect(s.isValidCsrf("sesi-b", token)).toBe(false);
    expect(s.isValidCsrf("sesi-a", undefined)).toBe(false);
    expect(s.isValidCsrf("sesi-a", "")).toBe(false);
  });
});
