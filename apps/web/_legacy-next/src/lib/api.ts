import { apiUrl } from "./config";

export type ApiResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_found" }
  | { status: "unavailable"; message: string };

/**
 * Mengambil data dari API (dipanggil dari Server Component).
 * Tidak pernah melempar: kegagalan jaringan/server menjadi { status: "unavailable" } agar halaman
 * dapat menampilkan state galat yang jelas, bukan layar error Next.js.
 */
export async function fetchApi<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(apiUrl(path), { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "unavailable", message: `Server mengembalikan status ${res.status}.` };
    const body = (await res.json()) as { success?: boolean; data?: T };
    if (!body.success || body.data === undefined) {
      return { status: "unavailable", message: "Respons server tidak sesuai format." };
    }
    return { status: "ok", data: body.data };
  } catch {
    return { status: "unavailable", message: "Tidak dapat terhubung ke server. Coba lagi beberapa saat." };
  }
}
