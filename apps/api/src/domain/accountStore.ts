export type UserRole = "ADMIN" | "AUDITOR";

/** Akun tanpa hash kata sandi: aman diteruskan ke view dan lapisan lain. */
export interface AccountRecord {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/** Hanya untuk verifikasi login; jangan pernah dikirim ke view atau log. */
export interface AccountWithHash extends AccountRecord {
  passwordHash: string;
}

/**
 * Penyimpanan akun internal (Admin/Auditor). Email selalu huruf kecil.
 * Pelanggaran unik email dilaporkan sebagai UniqueViolationError (lihat auditStore.ts).
 */
export interface AccountStore {
  findByEmail(email: string): Promise<AccountWithHash | null>;
  findById(id: number): Promise<AccountRecord | null>;
  list(role?: UserRole): Promise<AccountRecord[]>;
  countByRole(role: UserRole): Promise<number>;
  create(data: { email: string; name: string; passwordHash: string; role: UserRole }): Promise<AccountRecord>;
  /** null bila akun tidak ada. */
  update(id: number, data: { email: string; name: string }): Promise<AccountRecord | null>;
  setActive(id: number, isActive: boolean): Promise<boolean>;
  setPasswordHash(id: number, passwordHash: string): Promise<boolean>;
  touchLogin(id: number, now: Date): Promise<void>;
}
