/**
 * Satu-satunya tempat yang membaca base URL API.
 * Komponen lain wajib memakai `apiUrl()` agar alamat backend tidak di-hardcode.
 */
const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const API_BASE_URL = rawBase.replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Tautan WhatsApp untuk tombol "Hubungi Kami". Nomor belum diputuskan (lihat PENDING-DECISIONS),
 * jadi dibaca dari env. Bila kosong, tombol mengarah ke bagian kontak di halaman Tentang Kami.
 */
export const WHATSAPP_URL = process.env.NEXT_PUBLIC_WHATSAPP_URL ?? "";
export const CONTACT_HREF = WHATSAPP_URL || "/tentang-kami#kontak";
export const CONTACT_IS_EXTERNAL = WHATSAPP_URL !== "";
