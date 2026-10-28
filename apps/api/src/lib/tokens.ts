import { createHash, randomBytes } from "node:crypto";

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Token acak 256 bit (hex). Utilitas umum; simpan hanya hash-nya (sha256Hex) bila perlu disimpan. */
export const generateToken = (): string => randomBytes(32).toString("hex");
