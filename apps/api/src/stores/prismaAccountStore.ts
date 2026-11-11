import { Prisma, type PrismaClient } from "@prisma/client";
import type { AccountRecord, AccountStore, AccountWithHash, UserRole } from "../domain/accountStore.js";
import { UniqueViolationError } from "../domain/auditStore.js";

async function unique<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new UniqueViolationError(String(e.meta?.["target"] ?? ""));
    }
    throw e;
  }
}

// Sengaja memilih field satu per satu: passwordHash tidak boleh ikut keluar kecuali lewat findByEmail.
const select = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const toRecord = (r: AccountRecord): AccountRecord => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role,
  isActive: r.isActive,
  lastLoginAt: r.lastLoginAt,
  createdAt: r.createdAt,
});

/** Implementasi AccountStore dengan Prisma/MySQL (belum dijalankan terhadap database di environment ini). */
export class PrismaAccountStore implements AccountStore {
  constructor(private readonly db: PrismaClient) {}

  async findByEmail(email: string): Promise<AccountWithHash | null> {
    const r = await this.db.userAccount.findUnique({ where: { email }, select: { ...select, passwordHash: true } });
    return r ? { ...toRecord(r), passwordHash: r.passwordHash } : null;
  }

  async findById(id: number): Promise<AccountRecord | null> {
    const r = await this.db.userAccount.findUnique({ where: { id }, select });
    return r ? toRecord(r) : null;
  }

  async list(role?: UserRole): Promise<AccountRecord[]> {
    const rows = await this.db.userAccount.findMany({
      where: role ? { role } : {},
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
      select,
    });
    return rows.map(toRecord);
  }

  countByRole(role: UserRole): Promise<number> {
    return this.db.userAccount.count({ where: { role } });
  }

  async create(data: { email: string; name: string; passwordHash: string; role: UserRole }): Promise<AccountRecord> {
    const r = await unique(() => this.db.userAccount.create({ data, select }));
    return toRecord(r);
  }

  async update(id: number, data: { email: string; name: string }): Promise<AccountRecord | null> {
    const existing = await this.db.userAccount.count({ where: { id } });
    if (existing === 0) return null;
    const r = await unique(() => this.db.userAccount.update({ where: { id }, data, select }));
    return toRecord(r);
  }

  async setActive(id: number, isActive: boolean): Promise<boolean> {
    const r = await this.db.userAccount.updateMany({ where: { id }, data: { isActive } });
    return r.count === 1;
  }

  async setPasswordHash(id: number, passwordHash: string): Promise<boolean> {
    const r = await this.db.userAccount.updateMany({ where: { id }, data: { passwordHash } });
    return r.count === 1;
  }

  async touchLogin(id: number, now: Date): Promise<void> {
    await this.db.userAccount.updateMany({ where: { id }, data: { lastLoginAt: now } });
  }
}
