import { describe, expect, it } from "vitest";
import { createAccount, setAccountActive } from "../src/services/accountService.js";
import { csvCell, toCsv } from "../../web/admin/evaluationRoutes.js";
import { summarize } from "../../web/peserta/feedback.js";
import { siteSchema, whatsappLink } from "../../web/shared/siteIdentity.js";
import { PUBLIC_FILE_PATH, validateUpload } from "../../web/shared/files.js";
import { MemoryAccountStore } from "./helpers/memoryAccountStore.js";

const PASS = "kata-sandi-panjang-1";

describe("Ekspor CSV Hasil Evaluasi", () => {
  it("mengutip sel berisi koma/kutip dan menetralkan formula Excel", () => {
    expect(csvCell('PT "Maju", Tbk')).toBe('"PT ""Maju"", Tbk"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["A", "B"], [[1, "x"]])).toBe("﻿A,B\r\n1,x\r\n");
  });
});

describe("Ringkasan rating", () => {
  it("menghitung rata-rata satu desimal dan sebaran bintang", () => {
    const s = summarize([{ rating: 5 }, { rating: 5 }, { rating: 4 }]);
    expect(s.average).toBe(4.7);
    expect(s.count).toBe(3);
    expect(s.buckets.find((b) => b.stars === 5)?.count).toBe(2);
    expect(summarize([]).average).toBe(0);
  });
});

describe("Pengaturan Situs", () => {
  it("membentuk tautan wa.me dari nomor lokal", () => {
    expect(whatsappLink("0812-3456-7890")).toBe("https://wa.me/6281234567890");
    expect(whatsappLink("+62 812 3456 7890")).toBe("https://wa.me/6281234567890");
    expect(whatsappLink("123")).toBe("");
  });

  it("menolak tautan media sosial non-https", () => {
    const base = { siteName: "S", tagline: "", whatsapp: "", email: "", hours: "", address: "", instagram: "", linkedin: "", youtube: "", facebook: "" };
    expect(siteSchema.safeParse({ ...base, instagram: "https://instagram.com/x" }).success).toBe(true);
    expect(siteSchema.safeParse({ ...base, instagram: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("Berkas unggahan", () => {
  it("hanya menerima gambar untuk sampul dan mengenali tautan berkas publik", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const pdf = Buffer.from("%PDF-1.4 isi");
    expect(validateUpload("COVER", "sampul.png", png).contentType).toBe("image/png");
    expect(() => validateUpload("COVER", "materi.pdf", pdf)).toThrow(/gambar/);
    expect(validateUpload("MATERIAL", "materi.pdf", pdf).contentType).toBe("application/pdf");
    expect(PUBLIC_FILE_PATH.test("/berkas/12/materi.pdf")).toBe(true);
    expect(PUBLIC_FILE_PATH.test("/berkas/12/../x")).toBe(false);
  });
});

describe("Kelola Akun Admin & Auditor", () => {
  it("membuat akun Admin dan mencegah Admin menonaktifkan diri sendiri / Admin aktif terakhir", async () => {
    const store = new MemoryAccountStore();
    const a1 = (await createAccount(store, { email: "admin1@contoh.id", name: "Admin Satu", password: PASS }, "ADMIN")).account;
    expect(a1.role).toBe("ADMIN");
    await expect(setAccountActive(store, { accountId: a1.id, isActive: false }, a1.id)).rejects.toMatchObject({ code: "SELF_DEACTIVATE" });
    await expect(setAccountActive(store, { accountId: a1.id, isActive: false }, 999)).rejects.toMatchObject({ code: "LAST_ADMIN" });

    const a2 = (await createAccount(store, { email: "admin2@contoh.id", name: "Admin Dua", password: PASS }, "ADMIN")).account;
    const off = await setAccountActive(store, { accountId: a2.id, isActive: false }, a1.id);
    expect(off.isActive).toBe(false);
    const aud = (await createAccount(store, { email: "aud@contoh.id", name: "Auditor", password: PASS }, "AUDITOR")).account;
    expect((await setAccountActive(store, { accountId: aud.id, isActive: false }, a1.id)).isActive).toBe(false);
  });
});
