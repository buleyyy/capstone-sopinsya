import type { AccountRecord, AccountStore, AccountWithHash, UserRole } from "../../src/domain/accountStore.js";
import { UniqueViolationError } from "../../src/domain/auditStore.js";

/** Penyimpanan akun in-memory untuk test; meniru constraint unik email dan kontrak AccountStore. */
export class MemoryAccountStore implements AccountStore {
  rows: AccountWithHash[] = [];
  private seq = 1;

  private strip(r: AccountWithHash): AccountRecord {
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      isActive: r.isActive,
      lastLoginAt: r.lastLoginAt,
      createdAt: r.createdAt,
    };
  }

  async findByEmail(email: string) {
    const r = this.rows.find((x) => x.email === email);
    return r ? { ...r } : null;
  }
  async findById(id: number) {
    const r = this.rows.find((x) => x.id === id);
    return r ? this.strip(r) : null;
  }
  async list(role?: UserRole) {
    return this.rows.filter((r) => role === undefined || r.role === role).map((r) => this.strip(r));
  }
  async countByRole(role: UserRole) {
    return this.rows.filter((r) => r.role === role).length;
  }
  async create(data: { email: string; name: string; passwordHash: string; role: UserRole }) {
    if (this.rows.some((r) => r.email === data.email)) throw new UniqueViolationError("email");
    const row: AccountWithHash = {
      id: this.seq++,
      ...data,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    };
    this.rows.push(row);
    return this.strip(row);
  }
  async update(id: number, data: { email: string; name: string }) {
    const r = this.rows.find((x) => x.id === id);
    if (!r) return null;
    if (this.rows.some((x) => x.id !== id && x.email === data.email)) throw new UniqueViolationError("email");
    r.email = data.email;
    r.name = data.name;
    return this.strip(r);
  }
  async setActive(id: number, isActive: boolean) {
    const r = this.rows.find((x) => x.id === id);
    if (!r) return false;
    r.isActive = isActive;
    return true;
  }
  async setPasswordHash(id: number, passwordHash: string) {
    const r = this.rows.find((x) => x.id === id);
    if (!r) return false;
    r.passwordHash = passwordHash;
    return true;
  }
  async touchLogin(id: number, now: Date) {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.lastLoginAt = now;
  }
}
