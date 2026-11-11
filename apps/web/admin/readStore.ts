import { Prisma, type PrismaClient } from "@prisma/client";
import type { FindingClass, FindingStatus } from "../../api/src/domain/auditSchemas.js";
import type { DocumentHeader, FindingFollowUp } from "../../api/src/domain/auditStore.js";
import { AppError } from "../../api/src/utils/errors.js";

/**
 * Pembacaan data untuk halaman Admin + pengelolaan Pustaka SOP.
 * Dipisah dari AuditStore agar kontrak audit (dan test-nya) tidak berubah.
 * STATUS: belum pernah dijalankan terhadap database.
 */

export type VersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";
export type SessionStatusRow = "DRAFT" | "ACTIVE" | "CLOSED";
export type InviteState = "BELUM_DIKLAIM" | "AKTIF" | "DICABUT" | "KEDALUWARSA";

export interface DepartmentRow { id: number; name: string }
export interface StandardRow { id: number; code: string; name: string }
export interface VersionRow {
  id: number;
  standardId: number;
  standardCode: string;
  versionLabel: string;
  status: VersionStatus;
  itemCount: number;
}
export interface VersionItemRow {
  id: number;
  departmentName: string;
  criteria: string;
  reference: string | null;
  sopCode: string | null;
  sortOrder: number;
}
export interface SessionRow {
  id: number;
  title: string;
  status: SessionStatusRow;
  expiresAt: Date;
  closedAt: Date | null;
  auditorAccessUntil: Date | null;
  versionId: number | null; // null = sesi tanpa Master Checklist
  versionLabel: string;
  standardCode: string;
  auditorCount: number;
  assignmentCount: number;
}
export interface AuditorRow {
  id: number;
  name: string;
  /** Penugasan akun: id dan email akun. Keduanya null untuk auditor lama hasil undangan (data historis). */
  userId: number | null;
  email: string | null;
  state: InviteState;
  excluded: string[];
}
export interface AssignmentRow {
  id: number;
  auditorId: number;
  auditorName: string;
  departmentId: number;
  departmentName: string;
  total: number;
  answered: number;
  ya: number;
  tidak: number;
  findings: number;
}
export interface SessionFindingRow {
  id: number;
  code: string;
  classification: "MAJOR" | "MINOR" | "OBSERVASI";
  status: "OPEN" | "CLOSED";
  departmentName: string;
  auditorName: string;
  problem: string;
}
export interface RoomRow {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isPublished: boolean;
  documentCount: number;
}
export interface DocumentRow {
  id: number;
  code: string;
  title: string;
  categoryId: number;
  roomName: string;
  departmentName: string | null;
  pdfUrl: string | null;
  isPublished: boolean;
}

export type TrainingResourceKind = "SILABUS" | "MATERI" | "STUDI_KASUS" | "VIDEO" | "BLOOKET" | "LINK_LAIN";
export type ParticipantTestKind = "PRE" | "POST";
export interface TrainingResourceRow {
  id: number; programSlug: string; meetingNo: number; type: TrainingResourceKind;
  title: string; description: string | null; url: string; sortOrder: number; isPublished: boolean;
}
export interface TrainingTestRow {
  id: number; programSlug: string; meetingNo: number; type: ParticipantTestKind; title: string;
  isActive: boolean; questionCount: number; attemptCount: number;
}
export interface TrainingQuestionRow { id: number; testId: number; programSlug: string; meetingNo: number; testType: ParticipantTestKind; text: string; isActive: boolean; answerCount: number; }
/** Satu percobaan Pre/Post-test peserta, lengkap dengan nilai. HANYA untuk Admin; tidak pernah dikirim ke peserta. */
export interface TrainingAttemptRow {
  id: number;
  testId: number;
  testTitle: string;
  programSlug: string;
  meetingNo: number;
  type: ParticipantTestKind;
  participantName: string;
  participantInstitution: string;
  correctCount: number;
  totalQuestions: number;
  score: number;
  submittedAt: Date;
}

export interface TrainingQuestionInput {
  text: string;
  options: { label: string; text: string; isCorrect: boolean }[];
}

// ---------- Kelola Program (Admin Course Builder: TrainingProgram/ProgramMeeting/MeetingResource) ----------

export type ProgramStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type MeetingResourceKind = "SOP" | "SYLLABUS" | "MATERIAL" | "CASE_STUDY" | "BLOOKET" | "VIDEO";

export interface ProgramListRow {
  id: number;
  slug: string;
  code: string;
  title: string;
  category: string;
  status: ProgramStatus;
  isPublished: boolean;
  sortOrder: number;
  meetingCount: number;
  resourceCount: number;
  updatedAt: Date;
}

export interface ProgramResourceRow {
  id: number;
  meetingId: number;
  type: MeetingResourceKind;
  title: string;
  url: string;
  sortOrder: number;
  isPublished: boolean;
}

export interface ProgramMeetingRow {
  id: number;
  programId: number;
  number: number;
  title: string;
  sortOrder: number;
  isPublished: boolean;
  resources: ProgramResourceRow[];
}

export interface ProgramDetailRow {
  id: number;
  slug: string;
  code: string;
  title: string;
  fullTitle: string;
  subtitle: string;
  summary: string;
  description: string;
  duration: string;
  mode: string;
  trainer: string;
  category: string;
  tone: string;
  sortOrder: number;
  isPublished: boolean;
  status: ProgramStatus;
  meetings: ProgramMeetingRow[];
}

export interface ProgramInput {
  slug: string;
  code: string;
  title: string;
  fullTitle: string;
  subtitle: string;
  summary: string;
  description: string;
  duration: string;
  mode: string;
  trainer: string;
  category: string;
  tone: string;
  sortOrder: number;
}

export interface MeetingInput {
  number: number;
  title: string;
  sortOrder: number;
}

export interface ResourceInput {
  type: MeetingResourceKind;
  title: string;
  url: string;
  sortOrder: number;
  isPublished: boolean;
}

export interface ProgramReadiness {
  ready: boolean;
  reasons: string[];
}

/**
 * Syarat minimum sebelum status Published: program harus punya pertemuan, dan setidaknya satu
 * pertemuan punya konten yang sudah dipublikasikan (jenis apa pun), supaya katalog peserta tidak
 * pernah menampilkan program kosong. Ini aturan produk minimum (bukan dari RD); didokumentasikan
 * di laporan implementasi agar dapat dikonfirmasi ulang oleh klien bila perlu diperketat.
 */
export function evaluateProgramReadiness(meetings: ProgramMeetingRow[]): ProgramReadiness {
  const reasons: string[] = [];
  if (meetings.length === 0) reasons.push("Program belum memiliki pertemuan");
  const hasPublishedContent = meetings.some((m) => m.resources.some((r) => r.isPublished));
  if (!hasPublishedContent) reasons.push("Belum ada konten yang dipublikasikan pada pertemuan mana pun");
  return { ready: reasons.length === 0, reasons };
}

/**
 * Satu temuan pada register sebuah sesi audit (lintas auditor dan unit), HANYA BACA, untuk Dashboard Audit Admin.
 * Bentuknya (finding + followUp) sengaja sama dengan RegisterRow milik Auditor agar tampilan ringkasan dipakai bersama.
 */
export interface AuditRegisterRow {
  id: number;
  /** Kode tampil T-{sesi}-{urut}. */
  code: string;
  assignmentId: number;
  departmentName: string;
  auditorName: string;
  finding: { classification: FindingClass; status: FindingStatus; reference: string; problem: string };
  followUp: FindingFollowUp;
}

export interface SessionAuditRegister {
  /** null = header formulir belum pernah disimpan Auditor (route memakai nilai bawaan). */
  header: DocumentHeader | null;
  /** Nama auditor yang penugasannya belum dicabut pada sesi ini. */
  auditors: string[];
  /** Temuan yang belum dihapus lunak, urut menurut nomor temuan. */
  rows: AuditRegisterRow[];
}

export interface AdminReadStore {
  listDepartments(): Promise<DepartmentRow[]>;
  listStandards(): Promise<StandardRow[]>;
  listVersions(): Promise<VersionRow[]>;
  getVersion(versionId: number): Promise<{ version: VersionRow; items: VersionItemRow[] } | null>;
  listSessions(): Promise<SessionRow[]>;
  getSession(sessionId: number, now?: Date): Promise<
    | {
        session: SessionRow;
        auditors: AuditorRow[];
        assignments: AssignmentRow[];
        findings: SessionFindingRow[];
      }
    | null
  >;
  /** Register temuan seluruh auditor pada satu sesi (Dashboard Audit Admin). Tidak mengubah data. */
  getSessionAuditRegister(sessionId: number): Promise<SessionAuditRegister>;
  listRooms(): Promise<RoomRow[]>;
  listDocuments(): Promise<DocumentRow[]>;
  createRoom(data: { name: string; description: string | null; sortOrder: number; isPublished: boolean }): Promise<RoomRow>;
  createDocument(data: {
    code: string;
    title: string;
    categoryId: number;
    departmentId: number | null;
    pdfUrl: string | null;
    isPublished: boolean;
  }): Promise<void>;
  setRoomPublished(roomId: number, isPublished: boolean): Promise<boolean>;
  setDocumentPublished(documentId: number, isPublished: boolean): Promise<boolean>;
  listTrainingResources(): Promise<TrainingResourceRow[]>;
  createTrainingResource(data: Omit<TrainingResourceRow, "id">): Promise<TrainingResourceRow>;
  updateTrainingResource(id: number, data: Omit<TrainingResourceRow, "id">): Promise<boolean>;
  setTrainingResourcePublished(id: number, isPublished: boolean): Promise<boolean>;
  listTrainingTests(): Promise<TrainingTestRow[]>;
  listTrainingQuestions(): Promise<TrainingQuestionRow[]>;
  saveTrainingTest(data: { programSlug: string; meetingNo: number; type: ParticipantTestKind; title: string; isActive: boolean }): Promise<void>;
  saveTrainingTestStatus(testId: number, isActive: boolean): Promise<boolean>;
  addTrainingQuestion(testId: number, data: TrainingQuestionInput): Promise<void>;
  setTrainingQuestionActive(questionId: number, isActive: boolean): Promise<boolean>;
  /** Percobaan tes terbaru lebih dulu, dibatasi (default 2000) agar halaman tetap ringan. */
  listTrainingAttempts(limit?: number): Promise<TrainingAttemptRow[]>;

  // ---------- Kelola Program ----------
  listPrograms(): Promise<ProgramListRow[]>;
  getProgram(programId: number): Promise<ProgramDetailRow | null>;
  findProgramBySlug(slug: string, excludeId?: number): Promise<{ id: number } | null>;
  createProgram(data: ProgramInput): Promise<ProgramDetailRow>;
  updateProgram(programId: number, data: ProgramInput): Promise<boolean>;
  /** Menolak (AppError 409 PROGRAM_HAS_MEETINGS) bila program masih punya pertemuan. */
  deleteProgram(programId: number): Promise<boolean>;
  setProgramStatus(programId: number, status: ProgramStatus): Promise<boolean>;
  createMeeting(programId: number, data: MeetingInput): Promise<ProgramMeetingRow | null>;
  updateMeeting(programId: number, meetingId: number, data: MeetingInput): Promise<boolean>;
  /** Menolak (AppError 409 MEETING_HAS_RESOURCES) bila pertemuan masih punya konten. */
  deleteMeeting(programId: number, meetingId: number): Promise<boolean>;
  swapMeetingOrder(programId: number, meetingId: number, direction: "up" | "down"): Promise<boolean>;
  createResource(programId: number, meetingId: number, data: ResourceInput): Promise<ProgramResourceRow | null>;
  updateResource(programId: number, meetingId: number, resourceId: number, data: ResourceInput): Promise<boolean>;
  deleteResource(programId: number, meetingId: number, resourceId: number): Promise<boolean>;
  setResourcePublished(programId: number, meetingId: number, resourceId: number, isPublished: boolean): Promise<boolean>;
  swapResourceOrder(programId: number, meetingId: number, resourceId: number, direction: "up" | "down"): Promise<boolean>;

  // ---------- Konten situs (Pengaturan Admin) ----------
  /** Nilai JSON tersimpan untuk key, atau null bila belum pernah disimpan. */
  getSiteContent(key: string): Promise<unknown | null>;
  saveSiteContent(key: string, value: Prisma.InputJsonValue): Promise<void>;
}

const duplicate = (what: string) => new AppError(409, "ALREADY_EXISTS", `${what} sudah ada`);

async function guardUnique<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw duplicate(what);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      throw new AppError(422, "INVALID_REFERENCE", "Data rujukan tidak ditemukan");
    }
    throw e;
  }
}

export class PrismaAdminReadStore implements AdminReadStore {
  constructor(private readonly db: PrismaClient) {}

  async listDepartments(): Promise<DepartmentRow[]> {
    const rows = await this.db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    return rows;
  }

  async listStandards(): Promise<StandardRow[]> {
    return this.db.auditStandard.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });
  }

  async listVersions(): Promise<VersionRow[]> {
    const rows = await this.db.checklistVersion.findMany({
      orderBy: [{ standardId: "asc" }, { id: "desc" }],
      include: { standard: true, _count: { select: { items: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      standardId: r.standardId,
      standardCode: r.standard.code,
      versionLabel: r.versionLabel,
      status: r.status,
      itemCount: r._count.items,
    }));
  }

  async getVersion(versionId: number): Promise<{ version: VersionRow; items: VersionItemRow[] } | null> {
    const r = await this.db.checklistVersion.findUnique({
      where: { id: versionId },
      include: {
        standard: true,
        _count: { select: { items: true } },
        items: {
          orderBy: [{ departmentId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
          include: { department: true, sop: true },
        },
      },
    });
    if (!r) return null;
    return {
      version: {
        id: r.id,
        standardId: r.standardId,
        standardCode: r.standard.code,
        versionLabel: r.versionLabel,
        status: r.status,
        itemCount: r._count.items,
      },
      items: r.items.map((i) => ({
        id: i.id,
        departmentName: i.department.name,
        criteria: i.criteria,
        reference: i.reference,
        sopCode: i.sop?.code ?? null,
        sortOrder: i.sortOrder,
      })),
    };
  }

  private toSessionRow(r: {
    id: number;
    title: string;
    status: SessionStatusRow;
    expiresAt: Date;
    closedAt: Date | null;
    auditorAccessUntil: Date | null;
    checklistVersionId: number | null;
    checklistVersion: { versionLabel: string; standard: { code: string } } | null;
    _count: { auditors: number; assignments: number };
  }): SessionRow {
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      expiresAt: r.expiresAt,
      closedAt: r.closedAt,
      auditorAccessUntil: r.auditorAccessUntil,
      versionId: r.checklistVersionId,
      versionLabel: r.checklistVersion?.versionLabel ?? "Tanpa checklist",
      standardCode: r.checklistVersion?.standard.code ?? "",
      auditorCount: r._count.auditors,
      assignmentCount: r._count.assignments,
    };
  }

  async listSessions(): Promise<SessionRow[]> {
    const rows = await this.db.auditSession.findMany({
      orderBy: { id: "desc" },
      include: {
        checklistVersion: { include: { standard: true } },
        _count: { select: { auditors: true, assignments: true } },
      },
    });
    return rows.map((r) => this.toSessionRow(r));
  }

  async getSession(sessionId: number, now: Date = new Date()) {
    const s = await this.db.auditSession.findUnique({
      where: { id: sessionId },
      include: {
        checklistVersion: { include: { standard: true } },
        _count: { select: { auditors: true, assignments: true } },
        auditors: {
          orderBy: { id: "asc" },
          include: { exclusions: { include: { department: true } }, account: { select: { email: true } } },
        },
        assignments: { orderBy: { id: "asc" }, include: { auditor: true, department: true } },
      },
    });
    if (!s) return null;

    const auditors: AuditorRow[] = s.auditors.map((a) => {
      let state: InviteState;
      if (a.revokedAt) state = "DICABUT";
      else if (a.userId !== null) state = "AKTIF"; // penugasan akun: aktif selama tidak dicabut
      else if (a.claimedAt) state = "AKTIF";
      else if (a.inviteExpiresAt.getTime() <= now.getTime()) state = "KEDALUWARSA";
      else state = "BELUM_DIKLAIM";
      return {
        id: a.id,
        name: a.name,
        userId: a.userId,
        email: a.account?.email ?? null,
        state,
        excluded: a.exclusions.map((e) => e.department.name),
      };
    });

    const assignments: AssignmentRow[] = [];
    for (const a of s.assignments) {
      const [total, ya, tidak, findings] = await Promise.all([
        s.checklistVersionId === null
          ? Promise.resolve(0)
          : this.db.checklistItem.count({ where: { versionId: s.checklistVersionId, departmentId: a.departmentId } }),
        this.db.checklistAnswer.count({ where: { assignmentId: a.id, result: "YA" } }),
        this.db.checklistAnswer.count({ where: { assignmentId: a.id, result: "TIDAK" } }),
        this.db.finding.count({ where: { assignmentId: a.id, deletedAt: null } }),
      ]);
      assignments.push({
        id: a.id,
        auditorId: a.auditorId,
        auditorName: a.auditor.name,
        departmentId: a.departmentId,
        departmentName: a.department.name,
        total,
        answered: ya + tidak,
        ya,
        tidak,
        findings,
      });
    }

    const findingRows = await this.db.finding.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: { seq: "asc" },
      include: { assignment: { include: { auditor: true, department: true } } },
    });
    const findings: SessionFindingRow[] = findingRows.map((f) => ({
      id: f.id,
      code: `T-${f.sessionId}-${f.seq}`,
      classification: f.classification,
      status: f.status,
      departmentName: f.assignment.department.name,
      auditorName: f.assignment.auditor.name,
      problem: f.problem,
    }));

    return { session: this.toSessionRow(s), auditors, assignments, findings };
  }

  async getSessionAuditRegister(sessionId: number): Promise<SessionAuditRegister> {
    const [header, auditors, findings] = await Promise.all([
      this.db.auditDocumentHeader.findUnique({ where: { sessionId } }),
      this.db.auditor.findMany({ where: { sessionId, revokedAt: null }, orderBy: { id: "asc" }, select: { name: true } }),
      this.db.finding.findMany({
        where: { sessionId, deletedAt: null },
        orderBy: { seq: "asc" },
        include: { assignment: { include: { auditor: true, department: true } } },
      }),
    ]);
    return {
      header: header
        ? {
            organization: header.organization,
            subtitle: header.subtitle,
            formTitle: header.formTitle,
            formCode: header.formCode,
            revision: header.revision,
            issuedAt: header.issuedAt,
          }
        : null,
      auditors: [...new Set(auditors.map((a) => a.name))],
      rows: findings.map((f) => ({
        id: f.id,
        code: `T-${f.sessionId}-${f.seq}`,
        assignmentId: f.assignmentId,
        departmentName: f.assignment.department.name,
        auditorName: f.assignment.auditor.name,
        finding: { classification: f.classification, status: f.status, reference: f.reference, problem: f.problem },
        followUp: {
          rootCause: f.rootCause,
          correction: f.correction,
          correctionPic: f.correctionPic,
          correctionTarget: f.correctionTarget,
          correctiveAction: f.correctiveAction,
          correctiveActionPic: f.correctiveActionPic,
          correctiveActionTarget: f.correctiveActionTarget,
          improvementAction: f.improvementAction,
          improvementPic: f.improvementPic,
          improvementTarget: f.improvementTarget,
          improvementEvidenceUrl: f.improvementEvidenceUrl,
          auditeeName: f.auditeeName,
          reportedDate: f.reportedDate,
          followedUpDate: f.followedUpDate,
          verifiedDate: f.verifiedDate,
          verifierName: f.verifierName,
          verificationResult: f.verificationResult,
          correctionEvidenceUrl: f.correctionEvidenceUrl,
          correctiveActionEvidenceUrl: f.correctiveActionEvidenceUrl,
        },
      })),
    };
  }

  async listRooms(): Promise<RoomRow[]> {
    const rows = await this.db.materialCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { _count: { select: { sopDocuments: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      sortOrder: r.sortOrder,
      isPublished: r.isPublished,
      documentCount: r._count.sopDocuments,
    }));
  }

  async listDocuments(): Promise<DocumentRow[]> {
    const rows = await this.db.sopDocument.findMany({
      orderBy: [{ code: "asc" }],
      include: { category: true, department: true },
    });
    return rows.map((d) => ({
      id: d.id,
      code: d.code,
      title: d.title,
      categoryId: d.categoryId,
      roomName: d.category.name,
      departmentName: d.department?.name ?? null,
      pdfUrl: d.pdfUrl,
      isPublished: d.isPublished,
    }));
  }

  async createRoom(data: {
    name: string;
    description: string | null;
    sortOrder: number;
    isPublished: boolean;
  }): Promise<RoomRow> {
    const r = await guardUnique("Program", () => this.db.materialCategory.create({ data }));
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      sortOrder: r.sortOrder,
      isPublished: r.isPublished,
      documentCount: 0,
    };
  }

  async createDocument(data: {
    code: string;
    title: string;
    categoryId: number;
    departmentId: number | null;
    pdfUrl: string | null;
    isPublished: boolean;
  }): Promise<void> {
    await guardUnique("Dokumen dengan kode ini", () => this.db.sopDocument.create({ data }));
  }

  async setRoomPublished(roomId: number, isPublished: boolean): Promise<boolean> {
    const r = await this.db.materialCategory.updateMany({ where: { id: roomId }, data: { isPublished } });
    return r.count > 0;
  }

  async setDocumentPublished(documentId: number, isPublished: boolean): Promise<boolean> {
    const r = await this.db.sopDocument.updateMany({ where: { id: documentId }, data: { isPublished } });
    return r.count > 0;
  }

  async listTrainingResources(): Promise<TrainingResourceRow[]> {
    return this.db.trainingResource.findMany({
      orderBy: [{ programSlug: "asc" }, { meetingNo: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, programSlug: true, meetingNo: true, type: true, title: true, description: true, url: true, sortOrder: true, isPublished: true },
    });
  }

  async createTrainingResource(data: Omit<TrainingResourceRow, "id">): Promise<TrainingResourceRow> {
    return this.db.trainingResource.create({ data });
  }

  async updateTrainingResource(id: number, data: Omit<TrainingResourceRow, "id">): Promise<boolean> {
    const r = await this.db.trainingResource.updateMany({ where: { id }, data });
    return r.count > 0;
  }

  async setTrainingResourcePublished(id: number, isPublished: boolean): Promise<boolean> {
    const r = await this.db.trainingResource.updateMany({ where: { id }, data: { isPublished } });
    return r.count > 0;
  }

  async listTrainingTests(): Promise<TrainingTestRow[]> {
    const rows = await this.db.test.findMany({
      orderBy: [{ programSlug: "asc" }, { meetingNo: "asc" }, { type: "asc" }],
      include: { _count: { select: { questions: true, attempts: true } } },
    });
    return rows.map((r) => ({
      id: r.id, programSlug: r.programSlug, meetingNo: r.meetingNo, type: r.type, title: r.title,
      isActive: r.isActive, questionCount: r._count.questions, attemptCount: r._count.attempts,
    }));
  }

  async listTrainingQuestions(): Promise<TrainingQuestionRow[]> {
    const rows = await this.db.testQuestion.findMany({
      orderBy: [{ testId: "asc" }, { orderNo: "asc" }, { id: "asc" }],
      include: { test: true, _count: { select: { answers: true } } },
    });
    return rows.map((q) => ({
      id: q.id, testId: q.testId, programSlug: q.test.programSlug, meetingNo: q.test.meetingNo,
      testType: q.test.type, text: q.text, isActive: q.isActive, answerCount: q._count.answers,
    }));
  }

  async saveTrainingTest(data: { programSlug: string; meetingNo: number; type: ParticipantTestKind; title: string; isActive: boolean }): Promise<void> {
    await this.db.test.upsert({
      where: { programSlug_meetingNo_type: { programSlug: data.programSlug, meetingNo: data.meetingNo, type: data.type } },
      create: data,
      update: { title: data.title, isActive: data.isActive },
    });
  }

  async saveTrainingTestStatus(testId: number, isActive: boolean): Promise<boolean> {
    const r = await this.db.test.updateMany({ where: { id: testId }, data: { isActive } });
    return r.count > 0;
  }

  async addTrainingQuestion(testId: number, data: TrainingQuestionInput): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const question = await tx.testQuestion.create({
        data: { testId, text: data.text, orderNo: await tx.testQuestion.count({ where: { testId } }) + 1 },
        select: { id: true },
      });
      await tx.testOption.createMany({
        data: data.options.map((option) => ({ questionId: question.id, ...option })),
      });
    });
  }

  async setTrainingQuestionActive(questionId: number, isActive: boolean): Promise<boolean> {
    const r = await this.db.testQuestion.updateMany({ where: { id: questionId }, data: { isActive } });
    return r.count > 0;
  }

  async listTrainingAttempts(limit = 2000): Promise<TrainingAttemptRow[]> {
    const rows = await this.db.testAttempt.findMany({
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(limit, 1), 5000),
      select: {
        id: true,
        testId: true,
        participantName: true,
        participantInstitution: true,
        correctCount: true,
        totalQuestions: true,
        score: true,
        submittedAt: true,
        test: { select: { title: true, programSlug: true, meetingNo: true, type: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      testId: r.testId,
      testTitle: r.test.title,
      programSlug: r.test.programSlug,
      meetingNo: r.test.meetingNo,
      type: r.test.type,
      participantName: r.participantName,
      participantInstitution: r.participantInstitution,
      correctCount: r.correctCount,
      totalQuestions: r.totalQuestions,
      score: r.score,
      submittedAt: r.submittedAt,
    }));
  }

  // ---------- Kelola Program ----------

  private toResourceRow(r: {
    id: number; meetingId: number; type: MeetingResourceKind; title: string; url: string; sortOrder: number; isPublished: boolean;
  }): ProgramResourceRow {
    return { id: r.id, meetingId: r.meetingId, type: r.type, title: r.title, url: r.url, sortOrder: r.sortOrder, isPublished: r.isPublished };
  }

  private toMeetingRow(m: {
    id: number; programId: number; number: number; title: string; sortOrder: number; isPublished: boolean;
    resources: { id: number; meetingId: number; type: MeetingResourceKind; title: string; url: string; sortOrder: number; isPublished: boolean }[];
  }): ProgramMeetingRow {
    return {
      id: m.id, programId: m.programId, number: m.number, title: m.title, sortOrder: m.sortOrder, isPublished: m.isPublished,
      resources: m.resources.map((r) => this.toResourceRow(r)),
    };
  }

  async listPrograms(): Promise<ProgramListRow[]> {
    const rows = await this.db.trainingProgram.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        _count: { select: { meetings: true } },
        meetings: { select: { _count: { select: { resources: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      code: r.code,
      title: r.title,
      category: r.category,
      status: r.status,
      isPublished: r.isPublished,
      sortOrder: r.sortOrder,
      meetingCount: r._count.meetings,
      resourceCount: r.meetings.reduce((sum, m) => sum + m._count.resources, 0),
      updatedAt: r.updatedAt,
    }));
  }

  async getProgram(programId: number): Promise<ProgramDetailRow | null> {
    const p = await this.db.trainingProgram.findUnique({
      where: { id: programId },
      include: {
        meetings: {
          orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
          include: { resources: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { id: "asc" }] } },
        },
      },
    });
    if (!p) return null;
    return {
      id: p.id, slug: p.slug, code: p.code, title: p.title, fullTitle: p.fullTitle, subtitle: p.subtitle,
      summary: p.summary, description: p.description, duration: p.duration, mode: p.mode, trainer: p.trainer,
      category: p.category, tone: p.tone, sortOrder: p.sortOrder, isPublished: p.isPublished, status: p.status,
      meetings: p.meetings.map((m) => this.toMeetingRow(m)),
    };
  }

  async findProgramBySlug(slug: string, excludeId?: number): Promise<{ id: number } | null> {
    return this.db.trainingProgram.findFirst({
      where: excludeId ? { slug, id: { not: excludeId } } : { slug },
      select: { id: true },
    });
  }

  async createProgram(data: ProgramInput): Promise<ProgramDetailRow> {
    const p = await guardUnique("Program dengan slug ini", () =>
      this.db.trainingProgram.create({ data: { ...data, isPublished: false, status: "DRAFT" } }),
    );
    return {
      id: p.id, slug: p.slug, code: p.code, title: p.title, fullTitle: p.fullTitle, subtitle: p.subtitle,
      summary: p.summary, description: p.description, duration: p.duration, mode: p.mode, trainer: p.trainer,
      category: p.category, tone: p.tone, sortOrder: p.sortOrder, isPublished: p.isPublished, status: p.status,
      meetings: [],
    };
  }

  async updateProgram(programId: number, data: ProgramInput): Promise<boolean> {
    const r = await guardUnique("Program dengan slug ini", () =>
      this.db.trainingProgram.updateMany({ where: { id: programId }, data }),
    );
    return r.count > 0;
  }

  async deleteProgram(programId: number): Promise<boolean> {
    const meetingCount = await this.db.programMeeting.count({ where: { programId } });
    if (meetingCount > 0) throw new AppError(409, "PROGRAM_HAS_MEETINGS", "Hapus semua pertemuan program ini terlebih dahulu");
    const r = await this.db.trainingProgram.deleteMany({ where: { id: programId } });
    return r.count > 0;
  }

  async setProgramStatus(programId: number, status: ProgramStatus): Promise<boolean> {
    const r = await this.db.trainingProgram.updateMany({
      where: { id: programId },
      data: { status, isPublished: status === "PUBLISHED" },
    });
    return r.count > 0;
  }

  async createMeeting(programId: number, data: MeetingInput): Promise<ProgramMeetingRow | null> {
    const program = await this.db.trainingProgram.findUnique({ where: { id: programId }, select: { id: true } });
    if (!program) return null;
    const m = await guardUnique("Nomor pertemuan ini", () =>
      this.db.programMeeting.create({
        data: { programId, number: data.number, title: data.title, sortOrder: data.sortOrder, isPublished: false },
      }),
    );
    return { id: m.id, programId: m.programId, number: m.number, title: m.title, sortOrder: m.sortOrder, isPublished: m.isPublished, resources: [] };
  }

  async updateMeeting(programId: number, meetingId: number, data: MeetingInput): Promise<boolean> {
    const r = await guardUnique("Nomor pertemuan ini", () =>
      this.db.programMeeting.updateMany({
        where: { id: meetingId, programId },
        data: { number: data.number, title: data.title, sortOrder: data.sortOrder },
      }),
    );
    return r.count > 0;
  }

  async deleteMeeting(programId: number, meetingId: number): Promise<boolean> {
    const meeting = await this.db.programMeeting.findFirst({ where: { id: meetingId, programId }, select: { id: true } });
    if (!meeting) return false;
    const resourceCount = await this.db.meetingResource.count({ where: { meetingId } });
    if (resourceCount > 0) throw new AppError(409, "MEETING_HAS_RESOURCES", "Hapus semua konten pertemuan ini terlebih dahulu");
    const r = await this.db.programMeeting.deleteMany({ where: { id: meetingId, programId } });
    return r.count > 0;
  }

  async swapMeetingOrder(programId: number, meetingId: number, direction: "up" | "down"): Promise<boolean> {
    const meetings = await this.db.programMeeting.findMany({
      where: { programId },
      orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
      select: { id: true, sortOrder: true },
    });
    const idx = meetings.findIndex((m) => m.id === meetingId);
    if (idx === -1) return false;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= meetings.length) return false;
    const a = meetings[idx]!;
    const b = meetings[swapIdx]!;
    await this.db.$transaction([
      this.db.programMeeting.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
      this.db.programMeeting.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
    ]);
    return true;
  }

  private async meetingBelongsToProgram(programId: number, meetingId: number): Promise<boolean> {
    const m = await this.db.programMeeting.findFirst({ where: { id: meetingId, programId }, select: { id: true } });
    return Boolean(m);
  }

  async createResource(programId: number, meetingId: number, data: ResourceInput): Promise<ProgramResourceRow | null> {
    if (!(await this.meetingBelongsToProgram(programId, meetingId))) return null;
    const r = await this.db.meetingResource.create({
      data: { meetingId, type: data.type, title: data.title, url: data.url, sortOrder: data.sortOrder, isPublished: data.isPublished },
    });
    return this.toResourceRow(r);
  }

  async updateResource(programId: number, meetingId: number, resourceId: number, data: ResourceInput): Promise<boolean> {
    if (!(await this.meetingBelongsToProgram(programId, meetingId))) return false;
    const r = await this.db.meetingResource.updateMany({
      where: { id: resourceId, meetingId },
      data: { type: data.type, title: data.title, url: data.url, sortOrder: data.sortOrder, isPublished: data.isPublished },
    });
    return r.count > 0;
  }

  async deleteResource(programId: number, meetingId: number, resourceId: number): Promise<boolean> {
    if (!(await this.meetingBelongsToProgram(programId, meetingId))) return false;
    const r = await this.db.meetingResource.deleteMany({ where: { id: resourceId, meetingId } });
    return r.count > 0;
  }

  async setResourcePublished(programId: number, meetingId: number, resourceId: number, isPublished: boolean): Promise<boolean> {
    if (!(await this.meetingBelongsToProgram(programId, meetingId))) return false;
    const r = await this.db.meetingResource.updateMany({ where: { id: resourceId, meetingId }, data: { isPublished } });
    return r.count > 0;
  }

  async swapResourceOrder(programId: number, meetingId: number, resourceId: number, direction: "up" | "down"): Promise<boolean> {
    if (!(await this.meetingBelongsToProgram(programId, meetingId))) return false;
    const resources = await this.db.meetingResource.findMany({
      where: { meetingId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, sortOrder: true },
    });
    const idx = resources.findIndex((r) => r.id === resourceId);
    if (idx === -1) return false;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= resources.length) return false;
    const a = resources[idx]!;
    const b = resources[swapIdx]!;
    await this.db.$transaction([
      this.db.meetingResource.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
      this.db.meetingResource.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
    ]);
    return true;
  }

  async getSiteContent(key: string): Promise<unknown | null> {
    const r = await this.db.siteContent.findUnique({ where: { key }, select: { value: true } });
    return r ? r.value : null;
  }

  async saveSiteContent(key: string, value: Prisma.InputJsonValue): Promise<void> {
    await this.db.siteContent.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}
