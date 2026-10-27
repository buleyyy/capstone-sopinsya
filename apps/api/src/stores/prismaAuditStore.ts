import { Prisma, type PrismaClient } from "@prisma/client";
import {
  UniqueViolationError,
  type AnswerRecord,
  type AssignmentRecord,
  type AssignmentSummary,
  type AuditStore,
  type AuditorAccountCredential,
  type AuditorAccountRecord,
  type AuditorRecord,
  type AuthRecord,
  type ChecklistItemDetail,
  type ChecklistItemRecord,
  type ChecklistVersionRecord,
  type DepartmentRecord,
  type FindingCount,
  type FindingFollowUp,
  type FindingFollowUpRecord,
  type FindingHistoryRecord,
  type FindingRecord,
  type NewFinding,
  type SessionRecord,
  type StandardRecord,
} from "../domain/auditStore.js";

type Db = PrismaClient | Prisma.TransactionClient;

/** Menerjemahkan P2002 (unique violation) menjadi UniqueViolationError agar service tidak bergantung pada Prisma. */
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

const toSession = (r: SessionRecord): SessionRecord => ({
  id: r.id,
  title: r.title,
  checklistVersionId: r.checklistVersionId,
  status: r.status,
  expiresAt: r.expiresAt,
  closedAt: r.closedAt,
  auditorAccessUntil: r.auditorAccessUntil,
});

// Sengaja memilih field satu per satu: kolom lama (inviteHash/tokenHash/claimedAt) tidak boleh ikut keluar dari store.
const toAuditor = (r: AuditorRecord): AuditorRecord => ({
  id: r.id,
  sessionId: r.sessionId,
  accountId: r.accountId,
  name: r.name,
  revokedAt: r.revokedAt,
});

// Hash kata sandi tidak pernah ikut keluar kecuali lewat findAuditorCredentialByEmail.
const toAccount = (r: AuditorAccountRecord): AuditorAccountRecord => ({
  id: r.id,
  email: r.email,
  name: r.name,
  isActive: r.isActive,
});

/**
 * Implementasi AuditStore dengan Prisma/MySQL.
 * STATUS: belum pernah dijalankan terhadap database (perilaku kunci/transaksi perlu diverifikasi).
 */
export class PrismaAuditStore implements AuditStore {
  constructor(private readonly db: Db) {}

  async transaction<T>(fn: (tx: AuditStore) => Promise<T>): Promise<T> {
    if ("$transaction" in this.db) {
      return this.db.$transaction(async (tx) => fn(new PrismaAuditStore(tx)));
    }
    return fn(this); // sudah berada di dalam transaksi
  }

  // --- Master data ---

  createDepartment(name: string): Promise<DepartmentRecord> {
    return unique(() => this.db.department.create({ data: { name } }));
  }

  async departmentExists(departmentId: number): Promise<boolean> {
    return (await this.db.department.count({ where: { id: departmentId } })) > 0;
  }

  listDepartments(): Promise<DepartmentRecord[]> {
    return this.db.department.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } });
  }

  createStandard(data: { code: string; name: string }): Promise<StandardRecord> {
    return unique(() => this.db.auditStandard.create({ data }));
  }

  async standardExists(standardId: number): Promise<boolean> {
    return (await this.db.auditStandard.count({ where: { id: standardId } })) > 0;
  }

  // --- Versi dan item checklist ---

  createChecklistVersion(data: { standardId: number; versionLabel: string }): Promise<ChecklistVersionRecord> {
    return unique(() => this.db.checklistVersion.create({ data }));
  }

  findChecklistVersion(versionId: number): Promise<ChecklistVersionRecord | null> {
    return this.db.checklistVersion.findUnique({ where: { id: versionId } });
  }

  findLatestPublishedVersion(): Promise<ChecklistVersionRecord | null> {
    return this.db.checklistVersion.findFirst({ where: { status: "PUBLISHED" }, orderBy: { id: "desc" } });
  }

  async addChecklistItem(data: Omit<ChecklistItemRecord, "id">): Promise<ChecklistItemRecord | null> {
    // Catatan: pemeriksaan DRAFT dan insert tidak dikunci terhadap publikasi bersamaan.
    // Risiko diterima: operasi hanya dari CLI Admin.
    const version = await this.db.checklistVersion.findUnique({ where: { id: data.versionId }, select: { status: true } });
    if (!version || version.status !== "DRAFT") return null;
    return this.db.checklistItem.create({ data });
  }

  countItemsInVersion(versionId: number): Promise<number> {
    return this.db.checklistItem.count({ where: { versionId } });
  }

  async publishChecklistVersion(versionId: number, now: Date): Promise<boolean> {
    const r = await this.db.checklistVersion.updateMany({
      where: { id: versionId, status: "DRAFT" },
      data: { status: "PUBLISHED", publishedAt: now },
    });
    return r.count === 1;
  }

  async retireChecklistVersion(versionId: number, now: Date): Promise<boolean> {
    const r = await this.db.checklistVersion.updateMany({
      where: { id: versionId, status: "PUBLISHED" },
      data: { status: "RETIRED", retiredAt: now },
    });
    return r.count === 1;
  }

  listItems(versionId: number, departmentId: number): Promise<ChecklistItemRecord[]> {
    return this.db.checklistItem.findMany({
      where: { versionId, departmentId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  async findItemDetail(versionId: number, itemId: number): Promise<ChecklistItemDetail | null> {
    const row = await this.db.checklistItem.findFirst({
      where: { id: itemId, versionId },
      include: {
        department: { select: { name: true } },
        sop: { select: { code: true, title: true } },
        version: { select: { versionLabel: true, standard: { select: { code: true } } } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      versionId: row.versionId,
      departmentId: row.departmentId,
      sopId: row.sopId,
      criteria: row.criteria,
      reference: row.reference,
      sortOrder: row.sortOrder,
      standardCode: row.version.standard.code,
      versionLabel: row.version.versionLabel,
      sopCode: row.sop?.code ?? null,
      sopTitle: row.sop?.title ?? null,
      departmentName: row.department.name,
    };
  }

  countChecklistItems(versionId: number, departmentId: number): Promise<number> {
    return this.db.checklistItem.count({ where: { versionId, departmentId } });
  }

  // --- Sesi ---

  async createSession(data: { title: string; checklistVersionId: number; expiresAt: Date }): Promise<SessionRecord> {
    return toSession(await this.db.auditSession.create({ data }));
  }

  async findSession(sessionId: number): Promise<SessionRecord | null> {
    const r = await this.db.auditSession.findUnique({ where: { id: sessionId } });
    return r ? toSession(r) : null;
  }

  async activateSession(sessionId: number): Promise<boolean> {
    const r = await this.db.auditSession.updateMany({
      where: { id: sessionId, status: "DRAFT" },
      data: { status: "ACTIVE" },
    });
    return r.count === 1;
  }

  async updateDraftSessionDeadline(sessionId: number, to: Date): Promise<boolean> {
    const r = await this.db.auditSession.updateMany({
      where: { id: sessionId, status: "DRAFT" },
      data: { expiresAt: to },
    });
    return r.count === 1;
  }

  async extendSession(sessionId: number, to: Date): Promise<boolean> {
    const r = await this.db.auditSession.updateMany({
      where: { id: sessionId, status: "ACTIVE", expiresAt: { lt: to } },
      data: { expiresAt: to },
    });
    return r.count === 1;
  }

  async closeSession(sessionId: number, now: Date, auditorAccessUntil: Date | null): Promise<boolean> {
    const r = await this.db.auditSession.updateMany({
      where: { id: sessionId, status: "ACTIVE" },
      data: { status: "CLOSED", closedAt: now, auditorAccessUntil },
    });
    return r.count === 1;
  }

  async lockSessionForWrite(sessionId: number, now: Date): Promise<boolean> {
    // Shared lock: penulis jawaban boleh paralel, tetapi penutupan sesi (UPDATE) menunggu mereka selesai.
    // `FOR SHARE` membutuhkan MySQL 8.0+ (belum diverifikasi di environment ini).
    const rows = await this.db.$queryRaw<{ id: number }[]>(
      Prisma.sql`SELECT id FROM AuditSession WHERE id = ${sessionId} AND status = 'ACTIVE' AND expiresAt > ${now} FOR SHARE`,
    );
    return rows.length === 1;
  }

  // --- Akun Auditor ---

  async createAuditorAccount(data: { email: string; name: string; passwordHash: string }): Promise<AuditorAccountRecord> {
    return toAccount(await unique(() => this.db.auditorAccount.create({ data })));
  }

  async listAuditorAccounts(): Promise<AuditorAccountRecord[]> {
    const rows = await this.db.auditorAccount.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] });
    return rows.map(toAccount);
  }

  async findAuditorAccount(accountId: number): Promise<AuditorAccountRecord | null> {
    const r = await this.db.auditorAccount.findUnique({ where: { id: accountId } });
    return r ? toAccount(r) : null;
  }

  async findAuditorCredentialByEmail(email: string): Promise<AuditorAccountCredential | null> {
    const r = await this.db.auditorAccount.findUnique({ where: { email } });
    return r ? { ...toAccount(r), passwordHash: r.passwordHash } : null;
  }

  async setAuditorAccountActive(accountId: number, isActive: boolean): Promise<boolean> {
    const r = await this.db.auditorAccount.updateMany({ where: { id: accountId }, data: { isActive } });
    return r.count === 1;
  }

  async setAuditorAccountPassword(accountId: number, passwordHash: string): Promise<boolean> {
    const r = await this.db.auditorAccount.updateMany({ where: { id: accountId }, data: { passwordHash } });
    return r.count === 1;
  }

  // --- Auditor pada sesi (keanggotaan) ---

  async createAuditor(data: {
    sessionId: number;
    accountId: number;
    name: string;
    excludedDepartmentIds: number[];
  }): Promise<AuditorRecord> {
    const { excludedDepartmentIds, ...rest } = data;
    const row = await unique(() =>
      this.db.auditor.create({
        data: { ...rest, exclusions: { create: excludedDepartmentIds.map((departmentId) => ({ departmentId })) } },
      }),
    );
    return toAuditor(row);
  }

  async findAuditor(sessionId: number, auditorId: number): Promise<AuditorRecord | null> {
    const r = await this.db.auditor.findFirst({ where: { id: auditorId, sessionId } });
    return r ? toAuditor(r) : null;
  }

  async findAuditorBySessionAccount(sessionId: number, accountId: number): Promise<AuditorRecord | null> {
    const r = await this.db.auditor.findFirst({ where: { sessionId, accountId } });
    return r ? toAuditor(r) : null;
  }

  async listMembershipsForAccount(accountId: number): Promise<AuthRecord[]> {
    const rows = await this.db.auditor.findMany({
      where: { accountId, revokedAt: null },
      include: { session: true },
      orderBy: { id: "asc" },
    });
    return rows.map((r) => ({ auditor: toAuditor(r), session: toSession(r.session) }));
  }

  async revokeAuditor(auditorId: number, now: Date): Promise<void> {
    await this.db.auditor.update({ where: { id: auditorId }, data: { revokedAt: now } });
  }

  async restoreAuditor(auditorId: number): Promise<void> {
    await this.db.auditor.update({ where: { id: auditorId }, data: { revokedAt: null } });
  }

  async linkAuditorAccount(auditorId: number, accountId: number): Promise<boolean> {
    // Satu UPDATE bersyarat: hanya keanggotaan yang masih tanpa akun yang dapat dikaitkan.
    const r = await unique(() => this.db.auditor.updateMany({ where: { id: auditorId, accountId: null }, data: { accountId } }));
    return r.count === 1;
  }

  async listExclusions(auditorId: number): Promise<number[]> {
    const rows = await this.db.auditorExclusion.findMany({ where: { auditorId }, select: { departmentId: true } });
    return rows.map((r) => r.departmentId);
  }

  // --- Penugasan ---

  createAssignment(data: { sessionId: number; auditorId: number; departmentId: number }): Promise<AssignmentRecord> {
    return unique(() => this.db.auditAssignment.create({ data }));
  }

  findAssignmentByTarget(sessionId: number, auditorId: number, departmentId: number): Promise<AssignmentRecord | null> {
    return this.db.auditAssignment.findFirst({ where: { sessionId, auditorId, departmentId } });
  }

  findAssignment(sessionId: number, assignmentId: number): Promise<AssignmentRecord | null> {
    return this.db.auditAssignment.findFirst({ where: { id: assignmentId, sessionId } });
  }

  async listAssignments(sessionId: number, auditorId: number): Promise<AssignmentSummary[]> {
    const rows = await this.db.auditAssignment.findMany({
      where: { sessionId, auditorId },
      orderBy: { id: "asc" },
      include: { department: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      auditorId: r.auditorId,
      departmentId: r.departmentId,
      departmentName: r.department.name,
    }));
  }

  // --- Jawaban ---

  listAnswers(assignmentId: number): Promise<AnswerRecord[]> {
    return this.db.checklistAnswer.findMany({ where: { assignmentId } });
  }

  upsertAnswer(data: {
    assignmentId: number;
    itemId: number;
    departmentId: number;
    result: AnswerRecord["result"];
    note: string | null;
    evidenceUrl: string | null;
    snapshot: Record<string, unknown>;
  }): Promise<AnswerRecord> {
    const { snapshot, ...rest } = data;
    return unique(() =>
      this.db.checklistAnswer.upsert({
        where: { assignmentId_itemId: { assignmentId: data.assignmentId, itemId: data.itemId } },
        create: { ...rest, itemSnapshot: snapshot as Prisma.InputJsonObject },
        update: { result: data.result, note: data.note, evidenceUrl: data.evidenceUrl }, // snapshot tidak berubah
      }),
    );
  }

  findAnswerInAssignment(assignmentId: number, answerId: number): Promise<AnswerRecord | null> {
    return this.db.checklistAnswer.findFirst({ where: { id: answerId, assignmentId } });
  }

  async countAnswersByResult(assignmentId: number): Promise<{ YA: number; TIDAK: number }> {
    const [ya, tidak] = await Promise.all([
      this.db.checklistAnswer.count({ where: { assignmentId, result: "YA" } }),
      this.db.checklistAnswer.count({ where: { assignmentId, result: "TIDAK" } }),
    ]);
    return { YA: ya, TIDAK: tidak };
  }

  // --- Temuan ---

  findFindingByRequest(assignmentId: number, clientRequestId: string): Promise<FindingRecord | null> {
    return this.db.finding.findUnique({ where: { assignmentId_clientRequestId: { assignmentId, clientRequestId } } });
  }

  async bumpFindingSeq(sessionId: number, now: Date): Promise<number | null> {
    // Satu statement: mengunci baris, memeriksa canWrite, dan menaikkan nomor.
    const r = await this.db.auditSession.updateMany({
      where: { id: sessionId, status: "ACTIVE", expiresAt: { gt: now } },
      data: { findingSeq: { increment: 1 } },
    });
    if (r.count !== 1) return null;
    const s = await this.db.auditSession.findUniqueOrThrow({ where: { id: sessionId }, select: { findingSeq: true } });
    return s.findingSeq;
  }

  createFinding(data: NewFinding): Promise<FindingRecord> {
    const { createdByAuditorId, ...finding } = data;
    return unique(() =>
      this.db.finding.create({
        data: {
          ...finding,
          history: { create: { fromStatus: null, toStatus: "OPEN", changedByAuditorId: createdByAuditorId, note: null } },
        },
      }),
    );
  }

  listFindings(assignmentId: number): Promise<FindingRecord[]> {
    return this.db.finding.findMany({ where: { assignmentId }, orderBy: { seq: "asc" } });
  }

  findFindingOwned(sessionId: number, auditorId: number, findingId: number): Promise<FindingRecord | null> {
    return this.db.finding.findFirst({ where: { id: findingId, sessionId, assignment: { auditorId } } });
  }

  async closeFinding(findingId: number, auditorId: number, note: string | null, now: Date): Promise<boolean> {
    const r = await this.db.finding.updateMany({
      where: { id: findingId, status: "OPEN" },
      data: { status: "CLOSED", closedAt: now },
    });
    if (r.count !== 1) return false;
    await this.db.findingStatusHistory.create({
      data: { findingId, fromStatus: "OPEN", toStatus: "CLOSED", changedByAuditorId: auditorId, note },
    });
    return true;
  }

  listFindingHistory(findingId: number): Promise<FindingHistoryRecord[]> {
    return this.db.findingStatusHistory.findMany({ where: { findingId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  }

  async countFindings(assignmentId: number): Promise<FindingCount[]> {
    const rows = await this.db.finding.findMany({ where: { assignmentId }, select: { classification: true, status: true } });
    const map = new Map<string, FindingCount>();
    for (const r of rows) {
      const key = `${r.classification}|${r.status}`;
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { classification: r.classification, status: r.status, count: 1 });
    }
    return [...map.values()];
  }

  async saveFindingFollowUp(findingId: number, data: FindingFollowUp): Promise<void> {
    await this.db.finding.update({ where: { id: findingId }, data });
  }

  async listFindingFollowUps(assignmentId: number): Promise<FindingFollowUpRecord[]> {
    const rows = await this.db.finding.findMany({
      where: { assignmentId },
      orderBy: { seq: "asc" },
      select: {
        id: true,
        rootCause: true,
        correction: true,
        correctionPic: true,
        correctionTarget: true,
        correctiveAction: true,
        correctiveActionPic: true,
        correctiveActionTarget: true,
        improvementAction: true,
        improvementPic: true,
        improvementTarget: true,
      },
    });
    return rows.map(({ id, ...rest }) => ({ findingId: id, ...rest }));
  }
}
