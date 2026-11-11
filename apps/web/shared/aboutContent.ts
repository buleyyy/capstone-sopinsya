import { z } from "zod";
import type { AdminReadStore } from "../admin/readStore.js";

/**
 * Isi halaman Tentang Kami (peserta). Disimpan di tabel SiteContent (key "about") dan diedit Admin lewat
 * /admin/pengaturan. Bila belum pernah disimpan, atau tabel belum dimigrasi, dipakai teks bawaan di bawah.
 */
export const ABOUT_KEY = "about";

export interface AboutBlock {
  title: string;
  points: string[];
}
export interface AboutContent {
  intro: string;
  vision: AboutBlock;
  mission: AboutBlock;
}

export const DEFAULT_ABOUT: AboutContent = {
  intro: "Profil Sopinsya Educenter akan diisi oleh penyelenggara.",
  vision: {
    title: "Membangun Kompetensi Profesional yang Siap Industri",
    points: ["Menjadi platform pelatihan terpercaya berbasis standar kompetensi nasional (BNSP)"],
  },
  mission: {
    title: "Membangun Kompetensi Profesional yang Siap Industri",
    points: ["Menjadi platform pelatihan terpercaya berbasis standar kompetensi nasional (BNSP)"],
  },
};

const block = z.object({
  title: z.string().trim().min(1).max(160),
  points: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
});

export const aboutSchema = z.object({
  intro: z.string().trim().min(1).max(1500),
  vision: block,
  mission: block,
});

/** Satu baris textarea = satu poin; baris kosong dibuang. */
export const pointsFromText = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

/** Membaca isi tersimpan; data rusak atau database belum siap tidak boleh merusak halaman publik. */
export async function loadAbout(admin: AdminReadStore | undefined): Promise<AboutContent> {
  if (!admin) return DEFAULT_ABOUT;
  try {
    const raw = await admin.getSiteContent(ABOUT_KEY);
    if (raw === null) return DEFAULT_ABOUT;
    const parsed = aboutSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_ABOUT;
  } catch (err) {
    console.warn("[web] konten Tentang Kami tidak terbaca, memakai teks bawaan:", (err as Error).message);
    return DEFAULT_ABOUT;
  }
}
