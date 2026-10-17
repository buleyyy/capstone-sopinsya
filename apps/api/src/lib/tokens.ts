import { createHash, randomBytes } from "node:crypto";

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Token acak 256 bit (hex). Dikirim sekali ke penerima; simpan hanya hash-nya (sha256Hex). */
export const generateToken = (): string => randomBytes(32).toString("hex");

/** Token undangan auditor (tampil sekali kepada Admin). */
export const generateInviteToken = generateToken;

/** Token sesi auditor (dikirim sebagai cookie HttpOnly setelah undangan diklaim). */
export const generateSessionToken = generateToken;
