import type {
  AnswerResult,
  ChecklistVersionStatus,
  FindingClass,
  FindingStatus,
  SessionStatus,
} from "./auditSchemas.js";

/** Dilempar store bila constraint unique dilanggar (balapan); service memutuskan cara menanganinya. */
export class UniqueViolationError extends Error {
  constructor(public readonly target?: string) {
    super("Unique constraint violation");
    this.name = "UniqueViolationError";
  }
}

export interface StandardRecord { id: number; code: string; name: string }
export interface DepartmentRecord { id: number; name: string }
export interface ChecklistVersionRecord { id: number; standardId: number; versionLabel: string; status: ChecklistVersionStatus }
export interface ChecklistItemRecord {
  id: number;
  versionId: number;
  departmentId: number;
  sopId: number | null;
  criteria: string;
  reference: string | null;
  sortOrder: number;
}
/** Item beserta data pendukung untuk snapshot jawaban. */
export interface ChecklistItemDetail extends ChecklistItemRecord {
  standardCode: string;
  versionLabel: string;
  sopCode: string | null;
  sopTitle: string | null;
  departmentName: string;
}

export interface SessionRecord {
  id: number;
  title: string;
  checklistVersionId: number;
  status: SessionStatus;
  expiresAt: Date;
  closedAt: Date | null;
  auditorAccessUntil: Date | null;
}
export interface AuditorRecord {
  id: number;
  sessionId: number;
  name: string;
  inviteExpiresAt: Date;
  claimedAt: Date | null;
  revokedAt: Date | null;
}
export interface AuthRecord { auditor: AuditorRecord; session: SessionRecord }

export interface AssignmentRecord { id: number; sessionId: number; auditorId: number; departmentId: number }
export interface AssignmentSummary extends AssignmentRecord { departmentName: string }

export interface AnswerRecord {
  id: number;
  assignmentId: number;
  itemId: number;
  departmentId: number;
  result: AnswerResult | null;
  note: string | null;
  evidenceUrl: string | null;
}

export interface FindingRecord {
  id: number;
  sessionId: number;
  assignmentId: number;
  answerId: number | null;
  seq: number;
  clientRequestId: string;
  payloadHash: string;
  classification: FindingClass;
  problem: string;
  location: string;
  objectiveEvidence: string;
  reference: string;
  note: string | null;
  evidenceUrl: string | null;
  status: FindingStatus;
  closedAt: Date | null;
}
export type NewFinding = Omit<FindingRecord, "id" | "status" | "closedAt"> & { createdByAuditorId: number };

export interface FindingHistoryRecord {
  id: number;
  findingId: number;
  fromStatus: FindingStatus | null;
  toStatus: FindingStatus;
  changedByAuditorId: number;
  note: string | null;
  createdAt: Date;
}

export interface FindingCount { classification: FindingClass; status: FindingStatus; count: number }

/** Tindak lanjut temuan (kolom 5-7 formulir). Semua opsional; aturan per kategori ditegakkan service. */
export interface FindingFollowUp {
  rootCause: string | null;
  correction: string | null;
  correctionPic: string | null;
  correctionTarget: string | null;
  correctiveAction: string | null;
  correctiveActionPic: string | null;
  correctiveActionTarget: string | null;
  improvementAction: string | null;
  improvementPic: string | null;
  improvementTarget: string | null;
}
export interface FindingFollowUpRecord extends FindingFollowUp { findingId: number }

/**
 * Kontrak akses data. Setiap metode yang menerima sessionId WAJIB memfilter dengannya,
 * sehingga data sesi lain tidak pernah terbaca.
 *
 * Metode bersyarat (activate/extend/close/claim/publish/...) bersifat atomik dan mengembalikan
 * true/null bila kondisi tidak terpenuhi, sehingga tidak ada pemeriksaan-lalu-tulis yang bisa balapan.
 */
export interface AuditStore {
  /** Menjalankan fn dalam satu transaksi. Error yang dilempar membatalkan seluruh perubahan. */
  transaction<T>(fn: (tx: AuditStore) => Promise<T>): Promise<T>;

  // --- Master data ---
  createDepartment(name: string): Promise<DepartmentRecord>;
  departmentExists(departmentId: number): Promise<boolean>;
  listDepartments(): Promise<DepartmentRecord[]>;
  createStandard(data: { code: string; name: string }): Promise<StandardRecord>;
  standardExists(standardId: number): Promise<boolean>;

  // --- Versi dan item checklist ---
  createChecklistVersion(data: { standardId: number; versionLabel: string }): Promise<ChecklistVersionRecord>;
  findChecklistVersion(versionId: number): Promise<ChecklistVersionRecord | null>;
  /** Versi PUBLISHED dengan id terbesar (terbaru); null bila belum ada. */
  findLatestPublishedVersion(): Promise<ChecklistVersionRecord | null>;
  /** null bila versi tidak ada atau bukan DRAFT. */
  addChecklistItem(data: Omit<ChecklistItemRecord, "id">): Promise<ChecklistItemRecord | null>;
  countItemsInVersion(versionId: number): Promise<number>;
  /** DRAFT -> PUBLISHED. false bila bukan DRAFT. */
  publishChecklistVersion(versionId: number, now: Date): Promise<boolean>;
  /** PUBLISHED -> RETIRED. false bila bukan PUBLISHED. */
  retireChecklistVersion(versionId: number, now: Date): Promise<boolean>;
  listItems(versionId: number, departmentId: number): Promise<ChecklistItemRecord[]>;
  findItemDetail(versionId: number, itemId: number): Promise<ChecklistItemDetail | null>;
  countChecklistItems(versionId: number, departmentId: number): Promise<number>;

  // --- Sesi ---
  createSession(data: { title: string; checklistVersionId: number; expiresAt: Date }): Promise<SessionRecord>;
  findSession(sessionId: number): Promise<SessionRecord | null>;
  /** Sesi ACTIVE dengan id terbesar (terbaru); null bila tidak ada. Dipertahankan untuk kompatibilitas helper login lama. */
  findLatestActiveSession(): Promise<SessionRecord | null>;
  /** DRAFT -> ACTIVE. false bila bukan DRAFT. */
  activateSession(sessionId: number): Promise<boolean>;
  /** Mengganti batas waktu hanya untuk sesi DRAFT; to harus divalidasi service agar berada di masa depan. */
  updateDraftSessionDeadline(sessionId: number, to: Date): Promise<boolean>;
  /** Hanya ACTIVE dan hanya ke masa depan (to > expiresAt saat ini). */
  extendSession(sessionId: number, to: Date): Promise<boolean>;
  /** ACTIVE -> CLOSED. false bila bukan ACTIVE. */
  closeSession(sessionId: number, now: Date, auditorAccessUntil: Date | null): Promise<boolean>;
  /**
   * Mengunci baris sesi (shared lock) dan memastikan canWrite pada saat ini.
   * HARUS dipanggil di dalam transaction() sebelum menulis jawaban.
   */
  lockSessionForWrite(sessionId: number, now: Date): Promise<boolean>;

  // --- Auditor dan undangan ---
  createAuditor(data: {
    sessionId: number;
    name: string;
    inviteHash: string;
    inviteExpiresAt: Date;
    excludedDepartmentIds: number[];
  }): Promise<AuditorRecord>;
  findAuditor(sessionId: number, auditorId: number): Promise<AuditorRecord | null>;
  findAuthByInviteHash(inviteHash: string): Promise<AuthRecord | null>;
  findAuthByTokenHash(tokenHash: string): Promise<AuthRecord | null>;
  /** Auditor + sesinya berdasarkan id (dipakai cookie Auditor bertanda tangan). */
  findAuthByAuditorId(auditorId: number): Promise<AuthRecord | null>;
  /**
   * Akun Auditor untuk login kata sandi bersama: auditor yang belum dicabut dengan id terkecil
   * pada sesi ACTIVE terbaru. null bila tidak ada sesi ACTIVE atau auditor.
   */
  findPasswordLoginAuditor(): Promise<AuthRecord | null>;
  /** Klaim undangan legacy; tidak dipakai oleh login password role Auditor. */
  claimInvitation(inviteHash: string, tokenHash: string, now: Date): Promise<AuditorRecord | null>;
  clearAuditorToken(auditorId: number): Promise<void>;
  reissueInvitation(auditorId: number, inviteHash: string, inviteExpiresAt: Date): Promise<void>;
  revokeAuditor(auditorId: number, now: Date): Promise<void>;
  listExclusions(auditorId: number): Promise<number[]>;

  // --- Penugasan ---
  createAssignment(data: { sessionId: number; auditorId: number; departmentId: number }): Promise<AssignmentRecord>;
  findAssignmentByTarget(sessionId: number, auditorId: number, departmentId: number): Promise<AssignmentRecord | null>;
  findAssignment(sessionId: number, assignmentId: number): Promise<AssignmentRecord | null>;
  listAssignments(sessionId: number, auditorId: number): Promise<AssignmentSummary[]>;

  // --- Jawaban ---
  listAnswers(assignmentId: number): Promise<AnswerRecord[]>;
  /** Snapshot hanya ditulis saat baris dibuat; pembaruan tidak mengubahnya. */
  upsertAnswer(data: {
    assignmentId: number;
    itemId: number;
    departmentId: number;
    result: AnswerResult | null;
    note: string | null;
    evidenceUrl: string | null;
    snapshot: Record<string, unknown>;
  }): Promise<AnswerRecord>;
  findAnswerInAssignment(assignmentId: number, answerId: number): Promise<AnswerRecord | null>;
  countAnswersByResult(assignmentId: number): Promise<{ YA: number; TIDAK: number }>;

  // --- Temuan ---
  findFindingByRequest(assignmentId: number, clientRequestId: string): Promise<FindingRecord | null>;
  /** Menaikkan findingSeq hanya jika canWrite (satu statement). null bila sesi tidak dapat ditulis. */
  bumpFindingSeq(sessionId: number, now: Date): Promise<number | null>;
  /** Menyisipkan temuan OPEN beserta riwayat awal. Melempar UniqueViolationError pada balapan. */
  createFinding(data: NewFinding): Promise<FindingRecord>;
  listFindings(assignmentId: number): Promise<FindingRecord[]>;
  /** Temuan milik auditor di sesi tersebut; null bila bukan miliknya. */
  findFindingOwned(sessionId: number, auditorId: number, findingId: number): Promise<FindingRecord | null>;
  /** OPEN -> CLOSED beserta riwayat. false bila sudah CLOSED. */
  closeFinding(findingId: number, auditorId: number, note: string | null, now: Date): Promise<boolean>;
  listFindingHistory(findingId: number): Promise<FindingHistoryRecord[]>;
  countFindings(assignmentId: number): Promise<FindingCount[]>;
  /** Menyimpan tindak lanjut (menimpa seluruh kolom tindak lanjut temuan ini). */
  saveFindingFollowUp(findingId: number, data: FindingFollowUp): Promise<void>;
  /** Tindak lanjut semua temuan pada satu penugasan. */
  listFindingFollowUps(assignmentId: number): Promise<FindingFollowUpRecord[]>;
}
