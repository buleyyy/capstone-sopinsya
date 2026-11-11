import { z } from "zod";
import { toHttpsUrl } from "../../api/src/routes/publicContent.js";
import type { AdminReadStore } from "../admin/readStore.js";

/**
 * Pengaturan Situs > Identitas & Kontak (mockup "Kelola Hak Akses & Akun"): nama situs, tagline, kontak,
 * jam operasional, alamat, dan tautan media sosial yang tampil di header/footer peserta.
 * Disimpan di SiteContent key "site"; bila belum pernah disimpan dipakai nilai bawaan di bawah.
 */
export const SITE_KEY = "site";

export interface SiteIdentity {
  siteName: string;
  tagline: string;
  whatsapp: string; // nomor, mis. 0812-3456-7890 / +62 812...
  email: string;
  hours: string;
  address: string;
  instagram: string;
  linkedin: string;
  youtube: string;
  facebook: string;
}

export const DEFAULT_SITE: SiteIdentity = {
  siteName: "SopinsyaEducenter",
  tagline: "Pusat Pelatihan dan Sertifikasi Profesional",
  whatsapp: "+62 812-3456-7890",
  email: "info@sopinsyaeducenter.com",
  hours: "Senin - Jumat (08.00 - 17.00 WIB)",
  address: "Jl. Jenderal Sudirman No. 12, Jakarta, Indonesia",
  instagram: "",
  linkedin: "",
  youtube: "",
  facebook: "",
};

const link = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || toHttpsUrl(v) !== null, "Tautan media sosial harus diawali https://");

export const siteSchema = z.object({
  siteName: z.string().trim().min(1, "Nama situs wajib diisi").max(80),
  tagline: z.string().trim().max(160),
  whatsapp: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/, "Nomor WhatsApp hanya boleh berisi angka"),
  email: z.union([z.literal(""), z.string().trim().max(160).email("Format email tidak valid")]),
  hours: z.string().trim().max(120),
  address: z.string().trim().max(300),
  instagram: link,
  linkedin: link,
  youtube: link,
  facebook: link,
});

/** Tautan wa.me dari nomor (0812... -> 62812...); kosong bila nomor tidak valid. */
export function whatsappLink(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return digits.length >= 9 && digits.length <= 15 ? `https://wa.me/${digits}` : "";
}

export async function loadSite(admin: AdminReadStore | undefined): Promise<SiteIdentity> {
  if (!admin) return DEFAULT_SITE;
  try {
    const raw = await admin.getSiteContent(SITE_KEY);
    if (raw === null) return DEFAULT_SITE;
    const parsed = siteSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_SITE;
  } catch (err) {
    console.warn("[web] identitas situs tidak terbaca, memakai bawaan:", (err as Error).message);
    return DEFAULT_SITE;
  }
}
