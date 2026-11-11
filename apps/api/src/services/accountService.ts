import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import {
  accountRefSchema,
  bootstrapAdminSchema,
  createAccountSchema,
  parseInput,
  resetPasswordSchema,
  setAccountActiveSchema,
  updateAccountSchema,
} from "../domain/auditSchemas.js";
import { UniqueViolationError } from "../domain/auditStore.js";
import type { AccountRecord, AccountStore, AccountWithHash } from "../domain/accountStore.js";
import { AppError } from "../utils/errors.js";

/**
 * Akun internal Admin/Auditor. Kata sandi HANYA disimpan sebagai hash bcrypt; plaintext tidak pernah
 * ditulis ke database, log, maupun respons (kecuali kata sandi sementara yang ditampilkan sekali ke Admin).
 */

// Biaya 12 untuk runtime; 4 (minimum bcrypt) saat test agar suite tetap cepat.
const BCRYPT_COST = process.env["NODE_ENV"] === "test" ? 4 : 12;

export const hashPassword = (plain: string): Promise<string> => hash(plain, BCRYPT_COST);
export const verifyPassword = (plain: string, storedHash: string): Promise<boolean> => compare(plain, storedHash);

let dummyHash: Promise<string> | undefined;
/** Hash palsu agar login untuk email yang tidak ada tetap memakan waktu bcrypt yang sama. */
const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

/** 16 karakter URL-safe (96 bit entropi). Ditampilkan sekali kepada Admin. */
export const generateTemporaryPassword = (): string => randomBytes(12).toString("base64url");

const toRecord = (a: AccountWithHash): AccountRecord => ({
  id: a.id,
  email: a.email,
  name: a.name,
  role: a.role,
  isActive: a.isActive,
  lastLoginAt: a.lastLoginAt,
  createdAt: a.createdAt,
});

const duplicateEmail = () => new AppError(409, "EMAIL_TAKEN", "Email sudah dipakai akun lain");

/**
 * Memverifikasi email + kata sandi. Mengembalikan akun hanya bila ada, aktif, dan kata sandi cocok;
 * selain itu null tanpa membedakan penyebabnya (tidak membocorkan keberadaan akun).
 */
export async function authenticateAccount(
  store: AccountStore,
  rawEmail: string,
  password: string,
  now: Date = new Date(),
): Promise<AccountRecord | null> {
  const email = rawEmail.trim().toLowerCase();
  if (email === "" || password === "" || password.length > 256) return null;
  const found = await store.findByEmail(email);
  // Selalu satu perbandingan bcrypt, baik akun ada maupun tidak.
  const ok = await verifyPassword(password, found?.passwordHash ?? (await getDummyHash()));
  if (!found || !ok || !found.isActive) return null;
  await store.touchLogin(found.id, now);
  return toRecord(found);
}

export interface AccountSecretResult {
  account: AccountRecord;
  /** Terisi hanya bila sistem yang membuat kata sandi; tampilkan sekali lalu buang. */
  temporaryPassword: string | null;
}

async function requireAuditorAccount(store: AccountStore, accountId: number): Promise<AccountRecord> {
  const account = await store.findById(accountId);
  // Admin hanya mengelola akun Auditor; akun Admin tidak dapat diubah lewat jalur ini.
  if (!account || account.role !== "AUDITOR") throw new AppError(404, "NOT_FOUND", "Akun Auditor tidak ditemukan");
  return account;
}

export async function createAuditorAccount(store: AccountStore, rawInput: unknown): Promise<AccountSecretResult> {
  const input = parseInput(createAccountSchema, rawInput);
  const password = input.password ?? generateTemporaryPassword();
  try {
    const account = await store.create({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(password),
      role: "AUDITOR",
    });
    return { account, temporaryPassword: input.password ? null : password };
  } catch (err) {
    if (err instanceof UniqueViolationError) throw duplicateEmail();
    throw err;
  }
}

export async function updateAuditorAccount(store: AccountStore, rawInput: unknown): Promise<AccountRecord> {
  const input = parseInput(updateAccountSchema, rawInput);
  await requireAuditorAccount(store, input.accountId);
  try {
    const updated = await store.update(input.accountId, { email: input.email, name: input.name });
    if (!updated) throw new AppError(404, "NOT_FOUND", "Akun Auditor tidak ditemukan");
    return updated;
  } catch (err) {
    if (err instanceof UniqueViolationError) throw duplicateEmail();
    throw err;
  }
}

export async function setAuditorAccountActive(store: AccountStore, rawInput: unknown): Promise<AccountRecord> {
  const input = parseInput(setAccountActiveSchema, rawInput);
  await requireAuditorAccount(store, input.accountId);
  await store.setActive(input.accountId, input.isActive);
  return requireAuditorAccount(store, input.accountId);
}

/** Mengganti kata sandi akun Auditor. Kosong = dibuatkan sementara dan dikembalikan sekali. */
export async function resetAuditorPassword(store: AccountStore, rawInput: unknown): Promise<AccountSecretResult> {
  const input = parseInput(resetPasswordSchema, rawInput);
  const account = await requireAuditorAccount(store, input.accountId);
  const password = input.password ?? generateTemporaryPassword();
  await store.setPasswordHash(account.id, await hashPassword(password));
  return { account, temporaryPassword: input.password ? null : password };
}

export async function getAuditorAccount(store: AccountStore, rawInput: unknown): Promise<AccountRecord> {
  const input = parseInput(accountRefSchema, rawInput);
  return requireAuditorAccount(store, input.accountId);
}

export type BootstrapResult =
  | { created: true; account: AccountRecord }
  | { created: false; reason: "ADMIN_EXISTS" | "EMAIL_TAKEN" };

/**
 * Membuat Admin pertama dari kredensial environment. Idempotent dan aman diulang: tidak membuat akun bila
 * sudah ada Admin, dan tidak pernah menimpa kata sandi akun yang sudah ada.
 */
export async function bootstrapAdmin(store: AccountStore, rawInput: unknown): Promise<BootstrapResult> {
  const input = parseInput(bootstrapAdminSchema, rawInput);
  if ((await store.countByRole("ADMIN")) > 0) return { created: false, reason: "ADMIN_EXISTS" };
  try {
    const account = await store.create({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: "ADMIN",
    });
    return { created: true, account };
  } catch (err) {
    if (err instanceof UniqueViolationError) return { created: false, reason: "EMAIL_TAKEN" };
    throw err;
  }
}

export type SyncBootstrapResult =
  | { status: "CREATED" | "UPDATED" | "UNCHANGED"; account: AccountRecord; changes: string[] }
  | { status: "EMAIL_TAKEN" | "AMBIGUOUS" };

/**
 * Menyelaraskan akun Admin dengan kredensial environment (hanya dipakai bila BOOTSTRAP_ADMIN_SYNC=true).
 * Idempotent: menjalankannya ulang dengan input sama menghasilkan UNCHANGED dan tidak mengubah apa pun.
 *  - Email sudah dipakai Admin   -> akun itu yang diselaraskan (kata sandi hanya diganti bila berbeda).
 *  - Email dipakai akun Auditor  -> EMAIL_TAKEN, tidak ada yang diubah.
 *  - Email belum dipakai:
 *      0 Admin -> dibuat; tepat 1 Admin -> email Admin itu diganti (mis. dari email placeholder);
 *      lebih dari 1 Admin -> AMBIGUOUS (tidak ada yang diubah, karena tidak jelas akun mana yang dimaksud).
 * Tidak ada data yang dihapus dan tidak ada akun duplikat. Kata sandi disimpan sebagai hash bcrypt dan tidak dicetak.
 */
export async function syncBootstrapAdmin(store: AccountStore, rawInput: unknown): Promise<SyncBootstrapResult> {
  const input = parseInput(bootstrapAdminSchema.partial({ name: true }), rawInput);
  const byEmail = await store.findByEmail(input.email);
  if (byEmail && byEmail.role !== "ADMIN") return { status: "EMAIL_TAKEN" };

  let target: AccountWithHash | null = byEmail;
  if (!target) {
    const admins = await store.list("ADMIN");
    if (admins.length === 0) {
      try {
        const account = await store.create({
          email: input.email,
          name: input.name ?? "Administrator",
          passwordHash: await hashPassword(input.password),
          role: "ADMIN",
        });
        return { status: "CREATED", account, changes: ["akun dibuat"] };
      } catch (err) {
        if (err instanceof UniqueViolationError) return { status: "EMAIL_TAKEN" };
        throw err;
      }
    }
    const only = admins[0];
    if (admins.length > 1 || !only) return { status: "AMBIGUOUS" };
    target = await store.findByEmail(only.email);
    if (!target) return { status: "AMBIGUOUS" };
  }

  const changes: string[] = [];
  let account: AccountRecord = toRecord(target);

  const newName = input.name ?? target.name;
  if (target.email !== input.email || target.name !== newName) {
    try {
      const updated = await store.update(target.id, { email: input.email, name: newName });
      if (!updated) return { status: "AMBIGUOUS" };
      if (target.email !== input.email) changes.push(`email diganti dari ${target.email}`);
      if (target.name !== newName) changes.push("nama diperbarui");
      account = updated;
    } catch (err) {
      if (err instanceof UniqueViolationError) return { status: "EMAIL_TAKEN" };
      throw err;
    }
  }

  if (!(await verifyPassword(input.password, target.passwordHash))) {
    await store.setPasswordHash(target.id, await hashPassword(input.password));
    changes.push("kata sandi diganti");
  }

  if (!target.isActive) {
    await store.setActive(target.id, true);
    account = { ...account, isActive: true };
    changes.push("akun diaktifkan");
  }

  return { status: changes.length > 0 ? "UPDATED" : "UNCHANGED", account, changes };
}
