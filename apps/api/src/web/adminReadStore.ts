import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../utils/errors.js";

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
  versionId: number;
  versionLabel: string;
  standardCode: string;
  auditorCount: number;
  assignmentCount: number;
}
export interface AuditorRow {
  id: number;
  name: string;
  state: InviteState;
  inviteExpiresAt: Date;
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
export interface TrainingQuestionInput {
  text: string;
  options: { label: string; text: string; isCorrect: boolean }[];
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
  setTrainingResourcePublished(id: number, isPublished: boolean): Promise<boolean>;
  listTrainingTests(): Promise<TrainingTestRow[]>;
  saveTrainingTest(data: { programSlug: string; meetingNo: number; type: ParticipantTestKind; title: string; isActive: boolean }): Promise<void>;
  addTrainingQuestion(testId: number, data: TrainingQuestionInput): Promise<void>;
  setTrainingQuestionActive(questionId: number, isActive: boolean): Promise<boolean>;
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
    checklistVersionId: number;
    checklistVersion: { versionLabel: string; standard: { code: string } };
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
      versionLabel: r.checklistVersion.versionLabel,
      standardCode: r.checklistVersion.standard.code,
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
        auditors: { orderBy: { id: "asc" }, include: { exclusions: { include: { department: true } } } },
        assignments: { orderBy: { id: "asc" }, include: { auditor: true, department: true } },
      },
    });
    if (!s) return null;

    const auditors: AuditorRow[] = s.auditors.map((a) => {
      let state: InviteState;
      if (a.revokedAt) state = "DICABUT";
      else if (a.claimedAt) state = "AKTIF";
      else if (a.inviteExpiresAt.getTime() <= now.getTime()) state = "KEDALUWARSA";
      else state = "BELUM_DIKLAIM";
      return {
        id: a.id,
        name: a.name,
        state,
        inviteExpiresAt: a.inviteExpiresAt,
        excluded: a.exclusions.map((e) => e.department.name),
      };
    });

    const assignments: AssignmentRow[] = [];
    for (const a of s.assignments) {
      const [total, ya, tidak, findings] = await Promise.all([
        this.db.checklistItem.count({ where: { versionId: s.checklistVersionId, departmentId: a.departmentId } }),
        this.db.checklistAnswer.count({ where: { assignmentId: a.id, result: "YA" } }),
        this.db.checklistAnswer.count({ where: { assignmentId: a.id, result: "TIDAK" } }),
        this.db.finding.count({ where: { assignmentId: a.id } }),
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
      where: { sessionId },
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

  async saveTrainingTest(data: { programSlug: string; meetingNo: number; type: ParticipantTestKind; title: string; isActive: boolean }): Promise<void> {
    await this.db.test.upsert({
      where: { programSlug_meetingNo_type: { programSlug: data.programSlug, meetingNo: data.meetingNo, type: data.type } },
      create: data,
      update: { title: data.title, isActive: data.isActive },
    });
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
}
