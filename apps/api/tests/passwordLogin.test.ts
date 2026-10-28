import { describe, expect, it } from "vitest";
import { hashPassword, verifyAgainstOptional, verifyPassword } from "../src/lib/passwords.js";
import { WebSecurity } from "../src/web/security.js";

describe("hash kata sandi (scrypt)", () => {
  it("hash berformat scrypt, berbeda tiap pemanggilan (salt acak), dan tidak memuat kata sandi", async () => {
    const a = await hashPassword("kata-sandi-uji-1");
    const b = await hashPassword("kata-sandi-uji-1");
    expect(a).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("kata-sandi-uji-1");
  });

  it("memverifikasi kata sandi benar dan menolak yang salah", async () => {
    const h = await hashPassword("kata-sandi-uji-1");
    expect(await verifyPassword("kata-sandi-uji-1", h)).toBe(true);
    expect(await verifyPassword("kata-sandi-uji-2", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
  });

  it("hash rusak atau skema asing dianggap tidak cocok, bukan galat", async () => {
    for (const bad of ["", "bukan-hash", "bcrypt$1$2$3$aa$bb", "scrypt$x$8$1$aa$bb", "scrypt$16384$8$1$zz$", "scrypt$16384$8$1$aa$bb$cc"]) {
      expect(await verifyPassword("apa-saja", bad)).toBe(false);
    }
  });

  it("verifyAgainstOptional: tanpa hash selalu false (perhitungan pembanding tetap dijalankan)", async () => {
    expect(await verifyAgainstOptional("apa-saja", null)).toBe(false);
    expect(await verifyAgainstOptional("apa-saja", undefined)).toBe(false);
    const h = await hashPassword("rahasia-panjang-1");
    expect(await verifyAgainstOptional("rahasia-panjang-1", h)).toBe(true);
  });
});

describe("WebSecurity: cookie Auditor berbasis akun", () => {
  const make = () => new WebSecurity({ secret: "s".repeat(32), production: false, adminPassword: "kata-sandi-admin-123" });

  const cookieFrom = (s: WebSecurity, accountId: number, now: number): string => {
    let header = "";
    s.issueAuditorCookie({ cookie: (_n: string, v: string) => (header = v) } as never, accountId, now);
    return header;
  };
  const reqWith = (value: string | undefined) =>
    ({ header: (n: string) => (n === "cookie" && value !== undefined ? `sopinsya_session=${value}` : undefined) }) as never;

  it("tidak lagi memiliki kata sandi Auditor bersama", () => {
    const s = make() as unknown as Record<string, unknown>;
    expect("checkAuditorPassword" in s).toBe(false);
    expect("auditorEnabled" in s).toBe(false);
  });

  it("kata sandi Admin tetap berfungsi dan ikut pembatas 8 percobaan gagal per IP", () => {
    const s = make();
    expect(s.checkAdminPassword("kata-sandi-admin-123", "10.0.0.1")).toBe("ok");
    for (let i = 0; i < 8; i += 1) expect(s.checkAdminPassword("salah", "10.0.0.9")).toBe("wrong");
    expect(s.checkAdminPassword("kata-sandi-admin-123", "10.0.0.9")).toBe("blocked");
  });

  it("cookie bertanda tangan: sah, memuat id akun, dan kedaluwarsa", () => {
    const s = make();
    const t0 = 1_000_000;
    const value = cookieFrom(s, 42, t0);
    expect(s.auditorBinding(reqWith(value), t0 + 1000)).toMatchObject({ accountId: 42, binding: value });
    expect(s.auditorBinding(reqWith(value), t0 + 13 * 3_600_000)).toBeUndefined();
  });

  it("menolak cookie yang diubah id-nya, rahasia lain, atau berformat salah", () => {
    const s = make();
    const t0 = 1_000_000;
    const [exp, , nonce, sig] = cookieFrom(s, 42, t0).split(".") as [string, string, string, string];
    expect(s.auditorBinding(reqWith(`${exp}.7.${nonce}.${sig}`), t0)).toBeUndefined();

    const other = new WebSecurity({ secret: "x".repeat(32), production: false });
    expect(other.auditorBinding(reqWith(cookieFrom(s, 42, t0)), t0)).toBeUndefined();

    expect(s.auditorBinding(reqWith("bukan-cookie"), t0)).toBeUndefined();
    expect(s.auditorBinding(reqWith(undefined), t0)).toBeUndefined();
  });
});
