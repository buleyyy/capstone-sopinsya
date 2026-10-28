import { assertCanWrite, assertNotExcluded, canWrite } from "../domain/auditRules.js";
import {
  addAuditorToSessionSchema,
  addItemSchema,
  auditorRefSchema,
  closeSessionSchema,
  createAssignmentSchema,
  createAuditorAccountSchema,
  createDepartmentSchema,
  createSessionSchema,
  createStandardSchema,
  createVersionSchema,
  extendSessionSchema,
  linkAuditorAccountSchema,
  parseInput,
  resetAuditorPasswordSchema,
  sessionRefSchema,
  setAuditorAccountActiveSchema,
  versionRefSchema,
} from "../domain/auditSchemas.js";
import type {
  AssignmentRecord,
  AuditStore,
  AuditorAccountRecord,
  AuditorRecord,
  ChecklistItemRecord,
  ChecklistVersionRecord,
  DepartmentRecord,
  SessionRecord,
  StandardRecord,
} from "../domain/auditStore.js";
import { UniqueViolationError } from "../domain/auditStore.js";
import { hashPassword } from "../lib/passwords.js";
import { AppError } from "../utils/errors.js";

/**
 * Operasi Admin (halaman /admin). Otorisasi Admin dilakukan di lapisan web (WebSecurity.requireAdmin).
 * Tidak ada operasi yang membuka kembali sesi CLOSED.
 */

const duplicate = (what: string) => new AppError(409, "ALREADY_EXISTS", `${what} sudah ada`);
const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} tidak ditemukan`);
const stateError = (message: string) => new AppError(409, "INVALID_STATE", message);

// ---------- Master data ----------

export async function createDepartment(store: AuditStore, raw: unknown): Promise<DepartmentRecord> {
  const { name } = parseInput(createDepartmentSchema, raw);
  try {
    return await store.createDepartment(name);
  } catch (e) {
    if (e instanceof UniqueViolationError) throw duplicate("Departemen");
    throw e;
  }
}

export async function createStandard(store: AuditStore, raw: unknown): Promise<StandardRecord> {
  const input = parseInput(createStandardSchema, raw);
  try {
    return await store.createStandard(input);
  } catch (e) {
    if (e instanceof UniqueViolationError) throw duplicate("Standar");
    throw e;
  }
}

// ---------- Versi checklist ----------

export async function createChecklistVersion(store: AuditStore, raw: unknown): Promise<ChecklistVersionRecord> {
  const input = parseInput(createVersionSchema, raw);
  if (!(await store.standardExists(input.standardId))) throw notFound("Standar");
  try {
    return await store.createChecklistVersion(input);
  } catch (e) {
    if (e instanceof UniqueViolationError) throw duplicate("Versi checklist");
    throw e;
  }
}

/** Item hanya dapat ditambahkan ke versi DRAFT. Versi PUBLISHED/RETIRED tidak boleh berubah. */
export async function addChecklistItem(store: AuditStore, raw: unknown): Promise<ChecklistItemRecord> {
  const input = parseInput(addItemSchema, raw);
  const version = await store.findChecklistVersion(input.versionId);
  if (!version) throw notFound("Versi checklist");
  if (!(await store.departmentExists(input.departmentId))) throw notFound("Departemen");
  const item = await store.addChecklistItem({
    versionId: input.versionId,
    departmentId: input.departmentId,
    sopId: input.sopId,
    criteria: input.criteria,
    reference: input.reference,
    sortOrder: input.sortOrder,
  });
  if (!item) {
    throw new AppError(409, "VERSION_NOT_EDITABLE", "Versi checklist yang sudah diterbitkan tidak dapat diubah");
  }
  return item;
}

export async function publishChecklistVersion(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<void> {
  const { versionId } = parseInput(versionRefSchema, raw);
  await store.transaction(async (tx) => {
    const version = await tx.findChecklistVersion(versionId);
    if (!version) throw notFound("Versi checklist");
    if (version.status !== "DRAFT") throw stateError("Hanya versi DRAFT yang dapat diterbitkan");
    if ((await tx.countItemsInVersion(versionId)) === 0) {
      throw new AppError(422, "VERSION_EMPTY", "Versi checklist tanpa item tidak dapat diterbitkan");
    }
    if (!(await tx.publishChecklistVersion(versionId, now))) throw stateError("Versi sudah tidak berstatus DRAFT");
  });
}

/** RETIRED: tidak dapat dipilih untuk sesi baru. Sesi yang sudah memakainya tidak terpengaruh. */
export async function retireChecklistVersion(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<void> {
  const { versionId } = parseInput(versionRefSchema, raw);
  const version = await store.findChecklistVersion(versionId);
  if (!version) throw notFound("Versi checklist");
  if (!(await store.retireChecklistVersion(versionId, now))) throw stateError("Hanya versi PUBLISHED yang dapat dipensiunkan");
}

// ---------- Sesi ----------

export async function createSession(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<SessionRecord> {
  const input = parseInput(createSessionSchema, raw);
  if (input.expiresAt.getTime() <= now.getTime()) {
    throw new AppError(422, "EXPIRES_IN_PAST", "Batas waktu tulis harus di masa depan");
  }
  const version = await store.findChecklistVersion(input.checklistVersionId);
  if (!version) throw notFound("Versi checklist");
  if (version.status !== "PUBLISHED") {
    throw new AppError(422, "VERSION_NOT_PUBLISHED", "Sesi hanya dapat memakai versi checklist berstatus PUBLISHED");
  }
  return store.createSession(input);
}

export async function activateSession(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<void> {
  const { sessionId } = parseInput(sessionRefSchema, raw);
  await store.transaction(async (tx) => {
    const session = await tx.findSession(sessionId);
    if (!session) throw notFound("Sesi");
    if (session.status !== "DRAFT") throw stateError("Hanya sesi DRAFT yang dapat diaktifkan");
    if (session.expiresAt.getTime() <= now.getTime()) {
      throw new AppError(422, "EXPIRES_IN_PAST", "Batas waktu tulis sudah lewat; perpanjang sebelum mengaktifkan");
    }
    const version = await tx.findChecklistVersion(session.checklistVersionId);
    if (!version || version.status === "DRAFT") {
      throw new AppError(422, "VERSION_NOT_PUBLISHED", "Versi checklist sesi belum diterbitkan");
    }
    if (!(await tx.activateSession(sessionId))) throw stateError("Sesi sudah tidak berstatus DRAFT");
  });
}

/** Mengatur ulang batas tulis sesi DRAFT sebelum aktivasi. */
export async function updateDraftSessionDeadline(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<void> {
  const { sessionId, to } = parseInput(extendSessionSchema, raw);
  const session = await store.findSession(sessionId);
  if (!session) throw notFound("Sesi");
  if (session.status !== "DRAFT") throw stateError("Batas waktu hanya dapat diubah saat sesi masih DRAFT");
  if (to.getTime() <= now.getTime()) {
    throw new AppError(422, "EXPIRES_IN_PAST", "Batas waktu tulis harus berada di masa depan");
  }
  if (!(await store.updateDraftSessionDeadline(sessionId, to))) throw stateError("Batas waktu sesi draf tidak dapat diperbarui");
}

/** Memperpanjang batas tulis. Hanya sesi ACTIVE, hanya ke masa depan. Tidak pernah membuka sesi CLOSED. */
export async function extendSession(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<void> {
  const { sessionId, to } = parseInput(extendSessionSchema, raw);
  const session = await store.findSession(sessionId);
  if (!session) throw notFound("Sesi");
  if (session.status !== "ACTIVE") throw stateError("Hanya sesi ACTIVE yang dapat diperpanjang");
  if (to.getTime() <= now.getTime() || to.getTime() <= session.expiresAt.getTime()) {
    throw new AppError(422, "EXTEND_NOT_FORWARD", "Batas waktu baru harus di masa depan dan lebih akhir dari yang sekarang");
  }
  if (!(await store.extendSession(sessionId, to))) throw stateError("Sesi tidak dapat diperpanjang");
}

/** Menutup sesi (satu arah). Wajib memilih accessUntil atau noAccess. */
export async function closeSession(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<void> {
  const { sessionId, accessUntil } = parseInput(closeSessionSchema, raw);
  if (accessUntil !== undefined && accessUntil.getTime() <= now.getTime()) {
    throw new AppError(422, "ACCESS_UNTIL_IN_PAST", "Batas akses auditor harus di masa depan");
  }
  const session = await store.findSession(sessionId);
  if (!session) throw notFound("Sesi");
  if (session.status !== "ACTIVE") throw stateError("Hanya sesi ACTIVE yang dapat ditutup");
  if (!(await store.closeSession(sessionId, now, accessUntil ?? null))) throw stateError("Sesi sudah tidak berstatus ACTIVE");
}

// ---------- Akun Auditor ----------

/**
 * Admin membuat akun login Auditor (email + kata sandi awal). Tidak ada undangan atau token: Auditor langsung
 * masuk lewat halaman login yang sama dengan Admin. Hanya hash kata sandi yang disimpan.
 */
export async function createAuditorAccount(store: AuditStore, raw: unknown): Promise<AuditorAccountRecord> {
  const input = parseInput(createAuditorAccountSchema, raw);
  const passwordHash = await hashPassword(input.password);
  try {
    return await store.createAuditorAccount({ email: input.email, name: input.name, passwordHash });
  } catch (e) {
    if (e instanceof UniqueViolationError) throw duplicate("Email Auditor");
    throw e;
  }
}

/** Menonaktifkan akun langsung memutus akses (dicek ulang pada setiap request). Data audit tidak berubah. */
export async function setAuditorAccountActive(store: AuditStore, raw: unknown): Promise<void> {
  const { accountId, isActive } = parseInput(setAuditorAccountActiveSchema, raw);
  if (!(await store.setAuditorAccountActive(accountId, isActive))) throw notFound("Akun auditor");
}

export async function resetAuditorPassword(store: AuditStore, raw: unknown): Promise<void> {
  const { accountId, password } = parseInput(resetAuditorPasswordSchema, raw);
  const passwordHash = await hashPassword(password);
  if (!(await store.setAuditorAccountPassword(accountId, passwordHash))) throw notFound("Akun auditor");
}

// ---------- Auditor pada sesi ----------

async function requireSession(store: AuditStore, sessionId: number): Promise<SessionRecord> {
  const session = await store.findSession(sessionId);
  if (!session) throw notFound("Sesi");
  return session;
}

/**
 * Admin menambahkan akun Auditor ke sesi dan menyatakan unit yang tidak boleh diaudit (self-audit).
 * Hanya pada sesi DRAFT atau selama canWrite. Satu akun hanya sekali per sesi.
 */
export async function addAuditorToSession(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<AuditorRecord> {
  const input = parseInput(addAuditorToSessionSchema, raw);
  const session = await requireSession(store, input.sessionId);
  if (session.status !== "DRAFT") assertCanWrite(session, now);
  const account = await store.findAuditorAccount(input.accountId);
  if (!account) throw notFound("Akun auditor");
  if (!account.isActive) throw new AppError(422, "ACCOUNT_INACTIVE", "Akun auditor tidak aktif");
  for (const departmentId of input.excludeDepartmentIds) {
    if (!(await store.departmentExists(departmentId))) throw notFound(`Departemen ${departmentId}`);
  }
  if (await store.findAuditorBySessionAccount(session.id, account.id)) throw duplicate("Auditor pada sesi ini");
  try {
    return await store.createAuditor({
      sessionId: session.id,
      accountId: account.id,
      name: account.name,
      excludedDepartmentIds: [...new Set(input.excludeDepartmentIds)],
    });
  } catch (e) {
    if (e instanceof UniqueViolationError) throw duplicate("Auditor pada sesi ini");
    throw e;
  }
}

/** Cabut: selalu diizinkan dan idempoten. Auditor langsung kehilangan akses ke sesi ini. */
export async function revokeAuditor(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<void> {
  const input = parseInput(auditorRefSchema, raw);
  const auditor = await store.findAuditor(input.sessionId, input.auditorId);
  if (!auditor) throw notFound("Auditor");
  await store.revokeAuditor(auditor.id, now);
}

/** Memulihkan akses auditor yang dicabut. Hanya pada sesi DRAFT atau selama canWrite. */
export async function restoreAuditor(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<void> {
  const input = parseInput(auditorRefSchema, raw);
  const session = await requireSession(store, input.sessionId);
  if (session.status !== "DRAFT") assertCanWrite(session, now);
  const auditor = await store.findAuditor(session.id, input.auditorId);
  if (!auditor) throw notFound("Auditor");
  await store.restoreAuditor(auditor.id);
}

/**
 * Mengaitkan akun ke keanggotaan lama yang belum punya akun (data sebelum akun individual), tanpa menyentuh
 * penugasan, jawaban, atau temuan yang sudah ada. Hanya pada sesi DRAFT atau selama canWrite.
 */
export async function linkAuditorAccount(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<void> {
  const input = parseInput(linkAuditorAccountSchema, raw);
  const session = await requireSession(store, input.sessionId);
  if (session.status !== "DRAFT") assertCanWrite(session, now);
  const auditor = await store.findAuditor(session.id, input.auditorId);
  if (!auditor) throw notFound("Auditor");
  if (auditor.accountId !== null) throw stateError("Auditor ini sudah memiliki akun");
  const account = await store.findAuditorAccount(input.accountId);
  if (!account) throw notFound("Akun auditor");
  if (!account.isActive) throw new AppError(422, "ACCOUNT_INACTIVE", "Akun auditor tidak aktif");
  if (await store.findAuditorBySessionAccount(session.id, account.id)) throw duplicate("Auditor pada sesi ini");
  try {
    if (!(await store.linkAuditorAccount(auditor.id, account.id))) throw stateError("Auditor ini sudah memiliki akun");
  } catch (e) {
    if (e instanceof UniqueViolationError) throw duplicate("Auditor pada sesi ini");
    throw e;
  }
}

// ---------- Penugasan ----------

/**
 * Admin membuat penugasan. Menolak unit yang dikecualikan bagi auditor (self-audit).
 * Hanya pada sesi DRAFT atau selama canWrite. Idempoten untuk target yang sama.
 */
export async function createAssignment(store: AuditStore, raw: unknown, now: Date = new Date()): Promise<AssignmentRecord> {
  const input = parseInput(createAssignmentSchema, raw);
  const session = await requireSession(store, input.sessionId);
  if (session.status !== "DRAFT" && !canWrite(session, now)) assertCanWrite(session, now);
  const auditor = await store.findAuditor(session.id, input.auditorId);
  if (!auditor) throw notFound("Auditor");
  if (!(await store.departmentExists(input.departmentId))) throw notFound("Departemen");

  assertNotExcluded(await store.listExclusions(auditor.id), input.departmentId);

  const existing = await store.findAssignmentByTarget(session.id, auditor.id, input.departmentId);
  if (existing) return existing;
  try {
    return await store.createAssignment({ sessionId: session.id, auditorId: auditor.id, departmentId: input.departmentId });
  } catch (e) {
    if (e instanceof UniqueViolationError) {
      const raced = await store.findAssignmentByTarget(session.id, auditor.id, input.departmentId);
      if (raced) return raced;
    }
    throw e;
  }
}
