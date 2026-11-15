import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guard sumber untuk toggle Show/Hide kata sandi di Admin > Akun & Hak Akses.
// Kata sandi disimpan sebagai hash bcrypt, jadi tabel TIDAK boleh menampilkan nilai aslinya;
// toggle hanya dipasang pada input kata sandi (Tambah Akun dan Reset kata sandi).
const webRoot = resolve(__dirname, "../../web");
const akunView = readFileSync(resolve(webRoot, "views/admin/akun.ejs"), "utf8");
const auditJs = readFileSync(resolve(webRoot, "public/audit.js"), "utf8");
const auditCss = readFileSync(resolve(webRoot, "public/audit.css"), "utf8");

describe("toggle kata sandi di halaman Akun & Hak Akses", () => {
  for (const id of ["password", "e_pw"]) {
    it(`input #${id} tetap type=password dan punya tombol mata`, () => {
      expect(akunView).toMatch(new RegExp(`<input id="${id}" type="password"`));
      const btn = akunView.match(new RegExp(`<button[^>]*data-toggle-password="${id}"[^>]*>`));
      expect(btn).not.toBeNull();
      const tag = btn![0];
      expect(tag).toContain('type="button"'); // tidak men-submit form
      expect(tag).toContain("data-eye-swap");
      expect(tag).toContain('aria-pressed="false"'); // default tersembunyi
      expect(tag).toContain('aria-label="Tampilkan kata sandi"');
      expect(tag).toMatch(/\shidden[\s>]/); // baru muncul setelah audit.js aktif
      expect(akunView).toContain('<use href="#i-eye"/>');
    });
  }

  it("kolom Kata sandi di tabel tetap tersamar dan tidak membaca hash", () => {
    expect(akunView).toContain("••••••••");
    expect(akunView).not.toMatch(/passwordHash/i);
    expect(akunView).not.toMatch(/a\.password/);
  });

  it("audit.js menukar ikon Eye/EyeOff dan menyamarkan ulang saat reset", () => {
    expect(auditJs).toContain("data-eye-swap");
    expect(auditJs).toContain("#i-eye-off");
    expect(auditJs).toContain("#i-eye'");
    expect(auditJs).toMatch(/addEventListener\('reset'/);
    expect(auditJs).not.toMatch(/<script/i); // CSP: tanpa inline script
  });

  it("CSS tombol mata tersedia", () => {
    expect(auditCss).toContain(".ad-pw");
    expect(auditCss).toContain(".ad-eye");
  });
});
