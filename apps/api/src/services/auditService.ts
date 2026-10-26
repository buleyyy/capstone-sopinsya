import { assertCanAccess, assertCanWrite, canWrite, isInviteClaimable } from "../domain/auditRules.js";
import {
  claimSchema,
  closeFindingSchema,
  createFindingSchema,
  followUpSchema,
  idSchema,
  parseInput,
  saveAnswerSchema,
  type FindingClass,
} from "../domain/auditSchemas.js";
import type {
  AnswerRecord,
  AssignmentRecord,
  AssignmentSummary,
  AuditStore,
  AuditorRecord,
  ChecklistItemDetail,
  ChecklistItemRecord,
  FindingFollowUp,
  FindingFollowUpRecord,
  FindingHistoryRecord,
  FindingRecord,
  SessionRecord,
} from "../domain/auditStore.js";
import { UniqueViolationError } from "../domain/auditStore.js";
import { findingPayloadHash } from "../domain/payloadHash.js";
import { generateSessionToken, sha256Hex } from "../lib/tokens.js";
import { AppError } from "../utils/errors.js";

/**
 * Identitas pemanggil. Diisi middleware dari database (cookie sesi), TIDAK PERNAH dari body request.
 * `session` adalah keadaan sesi pada awal request; penulisan tetap diperiksa ulang di dalam transaksi.
 */
export interface AuditContext {
  sessionId: number;
  auditorId: number;
  checklistVersionId: number;
  session: SessionRecord;
}

const notFound = () => new AppError(404, "NOT_FOUND", "Data tidak ditemukan");

// ---------- Undangan dan sesi login ----------

export interface ClaimResult {
  auditor: AuditorRecord;
  session: SessionRecord;
  /** Token sesi untuk cookie. Hanya hash yang disimpan di database. */
  token: string;
}

/**
 * Klaim undangan. Undangan tidak dikenal, kedaluwarsa, dicabut, atau sudah diklaim -> 404 identik.
 * Undangan valid tetapi sesi tidak dapat diakses -> 403 (hanya dicapai pemegang token 256-bit yang sah).
 * Pemeriksaan sesi di sini hanya early fail; batas keamanan sebenarnya ada pada pemeriksaan setiap request.
 */
export async function claimInvitation(store: AuditStore, rawInput: unknown, now: Date = new Date()): Promise<ClaimResult> {
  const { token: inviteToken } = parseInput(claimSchema, rawInput);
  const inviteHash = sha256Hex(inviteToken);
  const notClaimable = () => new AppError(404, "INVITATION_NOT_FOUND", "Undangan tidak ditemukan atau tidak berlaku");

  const found = await store.findAuthByInviteHash(inviteHash);
  if (!found || !isInviteClaimable(found.auditor, now)) throw notClaimable();
  assertCanAccess(found.session, now);

  const token = generateSessionToken();
  const auditor = await store.claimInvitation(inviteHash, sha256Hex(token), now);
  if (!auditor) throw notClaimable(); // kalah balapan dengan klaim lain
  return { auditor, session: found.session, token };
}

/** Mengenali pemanggil dari token sesi (cookie). Dipakai middleware pada setiap request. */
export async function authenticate(store: AuditStore, sessionToken: string, now: Date = new Date()): Promise<AuditContext> {
  const found = await store.findAuthByTokenHash(sha256Hex(sessionToken));
  const unauthenticated = () => new AppError(401, "UNAUTHENTICATED", "Sesi login tidak valid");
  if (!found || found.auditor.revokedAt !== null || found.auditor.claimedAt === null) throw unauthenticated();
  assertCanAccess(found.session, now);
  return {
    sessionId: found.session.id,
    auditorId: found.auditor.id,
    checklistVersionId: found.session.checklistVersionId,
    session: found.session,
  };
}

const toContext = (found: { auditor: AuditorRecord; session: SessionRecord }): AuditContext => ({
  sessionId: found.session.id,
  auditorId: found.auditor.id,
  checklistVersionId: found.session.checklistVersionId,
  session: found.session,
});

/**
 * Login kata sandi bersama (tanpa undangan): kata sandi sudah diverifikasi pemanggil (WebSecurity).
 * Memilih akun Auditor pada sesi ACTIVE terbaru. Tidak ada sesi ACTIVE atau auditor -> 409 dengan petunjuk untuk Admin.
 */
export async function resolvePasswordLogin(store: AuditStore, now: Date = new Date()): Promise<AuditContext> {
  const found = await store.findPasswordLoginAuditor();
  if (!found) {
    throw new AppError(
      409,
      "NO_ACTIVE_AUDIT_SESSION",
      "Belum ada sesi audit aktif dengan akun Auditor. Minta Admin mengaktifkan sesi dan menambahkan auditor.",
    );
  }
  assertCanAccess(found.session, now);
  return toContext(found);
}

/** Mengenali pemanggil dari id auditor pada cookie bertanda tangan. Status sesi dibaca ulang pada setiap request. */
export async function authenticateById(store: AuditStore, auditorId: number, now: Date = new Date()): Promise<AuditContext> {
  const found = await store.findAuthByAuditorId(auditorId);
  if (!found || found.auditor.revokedAt !== null) throw new AppError(401, "UNAUTHENTICATED", "Sesi login tidak valid");
  assertCanAccess(found.session, now);
  return toContext(found);
}

/** Logout (L2): token dikosongkan; auditor butuh undangan baru dari Admin untuk masuk lagi. */
export async function logout(store: AuditStore, ctx: AuditContext): Promise<void> {
  await store.clearAuditorToken(ctx.auditorId);
}

export interface MeResult {
  auditorId: number;
  sessionId: number;
  sessionTitle: string;
  sessionStatus: SessionRecord["status"];
  expiresAt: Date;
  auditorAccessUntil: Date | null;
  canWrite: boolean;
}

export async function getMe(store: AuditStore, ctx: AuditContext, now: Date = new Date()): Promise<MeResult> {
  const session = await store.findSession(ctx.sessionId);
  if (!session) throw notFound();
  return {
    auditorId: ctx.auditorId,
    sessionId: session.id,
    sessionTitle: session.title,
    sessionStatus: session.status,
    expiresAt: session.expiresAt,
    auditorAccessUntil: session.auditorAccessUntil,
    canWrite: canWrite(session, now),
  };
}

// ---------- Penugasan dan checklist ----------

export const listMyAssignments = (store: AuditStore, ctx: AuditContext): Promise<AssignmentSummary[]> =>
  store.listAssignments(ctx.sessionId, ctx.auditorId);

/**
 * Memuat penugasan milik pemanggil. Penugasan sesi lain atau milik auditor lain dijawab 404
 * (bukan 403) agar keberadaannya tidak terungkap.
 */
async function loadOwnAssignment(store: AuditStore, ctx: AuditContext, assignmentId: number): Promise<AssignmentRecord> {
  const id = parseInput(idSchema, assignmentId);
  const a = await store.findAssignment(ctx.sessionId, id);
  if (!a || a.sessionId !== ctx.sessionId || a.auditorId !== ctx.auditorId) throw notFound();
  return a;
}

export interface ChecklistEntry extends ChecklistItemRecord {
  result: AnswerRecord["result"];
  note: string | null;
  evidenceUrl: string | null;
  answerId: number | null;
}

/** Checklist = item dari versi yang terikat pada sesi, untuk unit penugasan, digabung jawaban. */
export async function getChecklist(store: AuditStore, ctx: AuditContext, assignmentId: number): Promise<ChecklistEntry[]> {
  const assignment = await loadOwnAssignment(store, ctx, assignmentId);
  const [items, answers] = await Promise.all([
    store.listItems(ctx.checklistVersionId, assignment.departmentId),
    store.listAnswers(assignment.id),
  ]);
  const byItem = new Map(answers.map((a) => [a.itemId, a]));
  return items.map((item) => {
    const a = byItem.get(item.id);
    return {
      ...item,
      result: a?.result ?? null,
      note: a?.note ?? null,
      evidenceUrl: a?.evidenceUrl ?? null,
      answerId: a?.id ?? null,
    };
  });
}

const buildSnapshot = (item: ChecklistItemDetail): Record<string, unknown> => ({
  schemaVersion: 1,
  itemId: item.id,
  versionId: item.versionId,
  standardCode: item.standardCode,
  versionLabel: item.versionLabel,
  criteria: item.criteria,
  reference: item.reference,
  sortOrder: item.sortOrder,
  sopCode: item.sopCode,
  sopTitle: item.sopTitle,
  departmentId: item.departmentId,
  departmentName: item.departmentName,
});

// ---------- Jawaban ----------

export async function saveAnswer(
  store: AuditStore,
  ctx: AuditContext,
  assignmentId: number,
  itemId: number,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<AnswerRecord> {
  const input = parseInput(saveAnswerSchema, rawInput);
  const validItemId = parseInput(idSchema, itemId);
  const assignment = await loadOwnAssignment(store, ctx, assignmentId);
  assertCanWrite(ctx.session, now); // early fail; pemeriksaan sebenarnya di dalam transaksi

  // Item harus berasal dari versi yang terikat pada sesi DAN dari unit yang sedang diaudit.
  const item = await store.findItemDetail(ctx.checklistVersionId, validItemId);
  if (!item || item.departmentId !== assignment.departmentId) {
    throw new AppError(422, "ITEM_NOT_IN_CHECKLIST", "Poin checklist bukan bagian dari checklist penugasan ini");
  }

  const write = () =>
    store.transaction(async (tx) => {
      if (!(await tx.lockSessionForWrite(ctx.sessionId, now))) {
        throw new AppError(403, "SESSION_NOT_WRITABLE", "Sesi tidak menerima perubahan (ditutup atau melewati batas waktu)");
      }
      return tx.upsertAnswer({
        assignmentId: assignment.id,
        itemId: item.id,
        departmentId: assignment.departmentId,
        result: input.result,
        note: input.note,
        evidenceUrl: input.evidenceUrl,
        snapshot: buildSnapshot(item),
      });
    });

  try {
    return await write();
  } catch (err) {
    // Dua request pertama bersamaan untuk item yang sama: yang kalah mengulang sebagai pembaruan.
    if (err instanceof UniqueViolationError) return write();
    throw err;
  }
}

// ---------- Temuan ----------

export interface CreateFindingResult {
  finding: FindingRecord;
  /** false bila ini pengulangan permintaan yang sama (idempotent replay). */
  created: boolean;
}

const idempotencyConflict = () =>
  new AppError(409, "IDEMPOTENCY_CONFLICT", "clientRequestId sudah dipakai dengan isi temuan yang berbeda");

export async function createFinding(
  store: AuditStore,
  ctx: AuditContext,
  assignmentId: number,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<CreateFindingResult> {
  const input = parseInput(createFindingSchema, rawInput);
  const assignment = await loadOwnAssignment(store, ctx, assignmentId);

  if (input.answerId !== null) {
    const answer = await store.findAnswerInAssignment(assignment.id, input.answerId);
    if (!answer) {
      throw new AppError(422, "ANSWER_ASSIGNMENT_MISMATCH", "Jawaban checklist bukan bagian dari penugasan ini");
    }
  }

  const payloadHash = findingPayloadHash(input);
  const replay = (existing: FindingRecord): CreateFindingResult => {
    if (existing.payloadHash !== payloadHash) throw idempotencyConflict();
    return { finding: existing, created: false };
  };

  // Pengulangan permintaan (klik ganda/retry) dijawab dari data lama, tanpa memeriksa canWrite lagi.
  const prior = await store.findFindingByRequest(assignment.id, input.clientRequestId);
  if (prior) return replay(prior);

  assertCanWrite(ctx.session, now); // early fail

  try {
    const finding = await store.transaction(async (tx) => {
      // Satu statement: mengunci baris sesi, memeriksa canWrite, dan menaikkan nomor.
      const seq = await tx.bumpFindingSeq(ctx.sessionId, now);
      if (seq === null) {
        throw new AppError(403, "SESSION_NOT_WRITABLE", "Sesi tidak menerima perubahan (ditutup atau melewati batas waktu)");
      }
      return tx.createFinding({
        sessionId: ctx.sessionId,
        assignmentId: assignment.id,
        answerId: input.answerId,
        seq,
        clientRequestId: input.clientRequestId,
        payloadHash,
        classification: input.classification,
        problem: input.problem,
        location: input.location,
        objectiveEvidence: input.objectiveEvidence,
        reference: input.reference,
        note: input.note,
        evidenceUrl: input.evidenceUrl,
        createdByAuditorId: ctx.auditorId,
      });
    });
    return { finding, created: true };
  } catch (err) {
    // Balapan: request lain dengan kunci sama menang. Transaksi ini sudah dibatalkan (nomor tidak terpakai).
    if (err instanceof UniqueViolationError) {
      const existing = await store.findFindingByRequest(assignment.id, input.clientRequestId);
      if (existing) return replay(existing);
    }
    throw err;
  }
}

export async function listFindings(store: AuditStore, ctx: AuditContext, assignmentId: number): Promise<FindingRecord[]> {
  const assignment = await loadOwnAssignment(store, ctx, assignmentId);
  return store.listFindings(assignment.id);
}

export interface CloseFindingResult {
  finding: FindingRecord;
  /** false bila temuan sudah CLOSED sebelumnya (tidak ada riwayat baru). */
  changed: boolean;
}

/** Menutup temuan sendiri. Berlaku selama sesi dapat diakses (canAccess); idempoten. */
export async function closeFinding(
  store: AuditStore,
  ctx: AuditContext,
  findingId: number,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<CloseFindingResult> {
  const { note } = parseInput(closeFindingSchema, rawInput ?? {});
  const id = parseInput(idSchema, findingId);
  assertCanAccess(ctx.session, now);

  const existing = await store.findFindingOwned(ctx.sessionId, ctx.auditorId, id);
  if (!existing) throw notFound();
  if (existing.status === "CLOSED") return { finding: existing, changed: false };

  const changed = await store.transaction((tx) => tx.closeFinding(existing.id, ctx.auditorId, note, now));
  const finding = await store.findFindingOwned(ctx.sessionId, ctx.auditorId, id);
  if (!finding) throw notFound();
  return { finding, changed };
}

const FOLLOW_UP_CAPA_FIELDS = [
  "rootCause",
  "correction",
  "correctionPic",
  "correctionTarget",
  "correctiveAction",
  "correctiveActionPic",
  "correctiveActionTarget",
] as const;
const FOLLOW_UP_IMPROVEMENT_FIELDS = ["improvementAction", "improvementPic", "improvementTarget"] as const;

/**
 * Menyimpan tindak lanjut temuan milik sendiri (menimpa seluruh kolom tindak lanjut).
 * Aturan formulir: Major/Minor memakai akar penyebab, koreksi, dan tindakan korektif; Observasi hanya
 * tindakan peningkatan. Berlaku selama sesi dapat diakses (canAccess), seperti menutup temuan.
 */
export async function saveFindingFollowUp(
  store: AuditStore,
  ctx: AuditContext,
  findingId: number,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<FindingFollowUp> {
  const input = parseInput(followUpSchema, rawInput ?? {});
  const id = parseInput(idSchema, findingId);
  assertCanAccess(ctx.session, now);

  const existing = await store.findFindingOwned(ctx.sessionId, ctx.auditorId, id);
  if (!existing) throw notFound();

  const hasCapa = FOLLOW_UP_CAPA_FIELDS.some((k) => input[k] !== null);
  const hasImprovement = FOLLOW_UP_IMPROVEMENT_FIELDS.some((k) => input[k] !== null);
  if (existing.classification === "OBSERVASI" && hasCapa) {
    throw new AppError(
      422,
      "FOLLOWUP_NOT_ALLOWED",
      "Temuan Observasi tidak memakai akar penyebab, koreksi, dan tindakan korektif. Isi tindakan peningkatan saja.",
    );
  }
  if (existing.classification !== "OBSERVASI" && hasImprovement) {
    throw new AppError(
      422,
      "FOLLOWUP_NOT_ALLOWED",
      "Tindakan peningkatan hanya untuk temuan Observasi. Temuan Major/Minor memakai akar penyebab, koreksi, dan tindakan korektif.",
    );
  }

  await store.saveFindingFollowUp(existing.id, input);
  return input;
}

export async function listFindingFollowUps(
  store: AuditStore,
  ctx: AuditContext,
  assignmentId: number,
): Promise<FindingFollowUpRecord[]> {
  const assignment = await loadOwnAssignment(store, ctx, assignmentId);
  return store.listFindingFollowUps(assignment.id);
}

export async function getFindingHistory(
  store: AuditStore,
  ctx: AuditContext,
  findingId: number,
): Promise<FindingHistoryRecord[]> {
  const id = parseInput(idSchema, findingId);
  const existing = await store.findFindingOwned(ctx.sessionId, ctx.auditorId, id);
  if (!existing) throw notFound();
  return store.listFindingHistory(existing.id);
}

// ---------- Dashboard ----------

export interface DashboardEntry {
  assignmentId: number;
  departmentId: number;
  departmentName: string;
  totalItems: number;
  answered: number;
  ya: number;
  tidak: number;
  unanswered: number;
  findings: {
    total: number;
    open: number;
    closed: number;
    byClassification: Record<FindingClass, number>;
  };
}

export async function getDashboard(store: AuditStore, ctx: AuditContext): Promise<DashboardEntry[]> {
  const assignments = await store.listAssignments(ctx.sessionId, ctx.auditorId);
  return Promise.all(
    assignments.map(async (a): Promise<DashboardEntry> => {
      const [totalItems, counts, findingCounts] = await Promise.all([
        store.countChecklistItems(ctx.checklistVersionId, a.departmentId),
        store.countAnswersByResult(a.id),
        store.countFindings(a.id),
      ]);
      const byClassification: Record<FindingClass, number> = { MAJOR: 0, MINOR: 0, OBSERVASI: 0 };
      let open = 0;
      let closed = 0;
      for (const f of findingCounts) {
        byClassification[f.classification] += f.count;
        if (f.status === "OPEN") open += f.count;
        else closed += f.count;
      }
      const answered = counts.YA + counts.TIDAK;
      return {
        assignmentId: a.id,
        departmentId: a.departmentId,
        departmentName: a.departmentName,
        totalItems,
        answered,
        ya: counts.YA,
        tidak: counts.TIDAK,
        unanswered: Math.max(totalItems - answered, 0),
        findings: { total: open + closed, open, closed, byClassification },
      };
    }),
  );
}
