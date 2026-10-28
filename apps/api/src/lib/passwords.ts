import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Hash kata sandi memakai scrypt bawaan Node (tanpa dependency baru).
 * Format tersimpan: scrypt$N$r$p$salt(hex)$hash(hex). Parameter ikut disimpan agar dapat dinaikkan kelak
 * tanpa membuat hash lama tidak terbaca.
 */
const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

function derive(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Perbandingan waktu-konstan. Hash rusak atau tidak dikenal dianggap tidak cocok (false), bukan error. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, nRaw, rRaw, pRaw, saltHex, hashHex, ...rest] = stored.split("$");
  if (scheme !== "scrypt" || !nRaw || !rRaw || !pRaw || !saltHex || !hashHex || rest.length > 0) return false;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (![N, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;
  try {
    const actual = await derive(password, Buffer.from(saltHex, "hex"), expected.length, { N, r, p });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Memverifikasi terhadap hash yang mungkin tidak ada. Bila hash tidak ada (email tidak terdaftar), tetap
 * dijalankan satu perhitungan scrypt agar waktu respons tidak membocorkan apakah email terdaftar.
 */
export async function verifyAgainstOptional(password: string, stored: string | null | undefined): Promise<boolean> {
  if (stored) return verifyPassword(password, stored);
  dummyHash ??= hashPassword("kata-sandi-pembanding-waktu");
  await verifyPassword(password, await dummyHash);
  return false;
}
