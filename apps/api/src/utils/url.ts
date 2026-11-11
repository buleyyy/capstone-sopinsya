/** URL harus https:// tanpa kredensial (username/password) di host. Dipakai di mana pun Admin
 * menyimpan tautan eksternal (materi, video, SOP, dsb.) agar validasi satu sumber kebenaran. */
export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}
