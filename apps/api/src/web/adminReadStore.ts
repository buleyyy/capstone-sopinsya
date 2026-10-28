import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../utils/errors.js";

/**
 * Pembacaan data untuk halaman Admin + pengelolaan Pustaka SOP.
 * Dipisah dari AuditStore agar kontrak audit (dan test-nya) tidak berubah.
 * STATUS: belum pernah dijalankan terhadap database.
 */

export type VersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";
export type SessionStatusRow = "DRAFT" | "ACTIVE" | "CLOSED";
export type AuditorAccessState = "AKSES_TERSEDIA" | "DICABUT";

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
  eligibleAuditorCount: number;
  eligibleAssignmentCount: number;
}
export interface AuditorRow {
  id: number;
  name: string;
  state: AuditorAccessState;
  /** null = keanggotaan lama tanpa akun (belum dapat login). */
  accountId: number | null;
  email: string | null;
  accountActive: boolean;
  excluded: string[];
}
export interface AccountRow {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
  sessionCount: number;
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
export type TrainingResourceTypeRow = "VIDEO" | "BLOOKET" | "CASE_STUDY" | "SYLLABUS";
export interface TrainingResourceRow {
  id: number;
  categoryId: number;
  categoryName: string;
  type: TrainingResourceTypeRow;
  title: string;
  description: string | null;
  url: string;
  sortOrder: number;
  isPublished: boolean;
}

export interface AdminReadStore {
  listDepartments(): Promise<DepartmentRow[]>;
  listStandards(): Promise<StandardRow[]>;
  listVersions(): Promise<VersionRow[]>;
  getVersion(versionId: number): Promise<{ version: VersionRow; items: VersionItemRow[] } | null>;
  listSessions(): Promise<SessionRow[]>;
  listAuditorAccounts(): Promise<AccountRow[]>;
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
  listTrainingResources(): Promise<TrainingResourceRow[]>;
  createTrainingResource(data: { categoryId: number; type: TrainingResourceTypeRow; title: string; description: string | null; url: string; sortOrder: number; isPublished: boolean }): Promise<void>;
  setTrainingResourcePublished(id: number, isPublished: boolean): Promise<boolean>;
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
}

const duplicate = (what: string) => new AppError(409, "ALREADY_EXISTS", `${what} sudah ada`);

/** Keanggotaan auditor yang benar-benar dapat login: belum dicabut, punya akun, dan akun aktif. */
interface LoginReady {
  revokedAt: Date | null;
  accountId: number | null;
  account: { isActive: boolean } | null;
}
const isLoginReady = (a: LoginReady): boolean => a.revokedAt === null && a.accountId !== null && a.account?.isActive === true;

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
    auditors: LoginReady[];
    assignments: { departmentId: number; auditor: LoginReady }[];
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
      eligibleAuditorCount: r.auditors.filter(isLoginReady).length,
      eligibleAssignmentCount: r.assignments.filter((a) => isLoginReady(a.auditor)).length,
    };
  }

  async listSessions(): Promise<SessionRow[]> {
    const rows = await this.db.auditSession.findMany({
      orderBy: { id: "desc" },
      include: {
        checklistVersion: { include: { standard: true } },
        _count: { select: { auditors: true, assignments: true } },
        auditors: { include: { account: true } },
        assignments: { select: { departmentId: true, auditor: { include: { account: true } } } },
      },
    });
    return Promise.all(rows.map(async (r) => {
      const row = this.toSessionRow(r);
      const activeAssignments = r.assignments.filter((a) => isLoginReady(a.auditor));
      const checklistCounts = await Promise.all(activeAssignments.map((a) =>
        this.db.checklistItem.count({ where: { versionId: r.checklistVersionId, departmentId: a.departmentId } }),
      ));
      return { ...row, eligibleAssignmentCount: checklistCounts.filter((count) => count > 0).length };
    }));
  }

  async getSession(sessionId: number, now: Date = new Date()) {
    const s = await this.db.auditSession.findUnique({
      where: { id: sessionId },
      include: {
        checklistVersion: { include: { standard: true } },
        _count: { select: { auditors: true, assignments: true } },
        auditors: { orderBy: { id: "asc" }, include: { exclusions: { include: { department: true } }, account: true } },
        assignments: { orderBy: { id: "asc" }, include: { auditor: { include: { account: true } }, department: true } },
      },
    });
    if (!s) return null;

    const auditors: AuditorRow[] = s.auditors.map((a) => {
      const state: AuditorAccessState = a.revokedAt ? "DICABUT" : "AKSES_TERSEDIA";
      return {
        id: a.id,
        name: a.name,
        state,
        accountId: a.accountId,
        email: a.account?.email ?? null,
        accountActive: a.account?.isActive ?? false,
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

  async listAuditorAccounts(): Promise<AccountRow[]> {
    const rows = await this.db.auditorAccount.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: { _count: { select: { memberships: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      isActive: r.isActive,
      sessionCount: r._count.memberships,
    }));
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

  async listTrainingResources(): Promise<TrainingResourceRow[]> {
    const rows = await this.db.trainingResource.findMany({
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      include: { category: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id, categoryId: r.categoryId, categoryName: r.category.name,
      type: r.type, title: r.title, description: r.description, url: r.url,
      sortOrder: r.sortOrder, isPublished: r.isPublished,
    }));
  }

  async createTrainingResource(data: { categoryId: number; type: TrainingResourceTypeRow; title: string; description: string | null; url: string; sortOrder: number; isPublished: boolean }): Promise<void> {
    const category = await this.db.materialCategory.findUnique({ where: { id: data.categoryId }, select: { id: true } });
    if (!category) throw new AppError(404, "NOT_FOUND", "Program training tidak ditemukan");
    await this.db.trainingResource.create({ data });
  }

  async setTrainingResourcePublished(id: number, isPublished: boolean): Promise<boolean> {
    const r = await this.db.trainingResource.updateMany({ where: { id }, data: { isPublished } });
    return r.count > 0;
  }

  async setRoomPublished(roomId: number, isPublished: boolean): Promise<boolean> {
    const r = await this.db.materialCategory.updateMany({ where: { id: roomId }, data: { isPublished } });
    return r.count > 0;
  }

  async setDocumentPublished(documentId: number, isPublished: boolean): Promise<boolean> {
    const r = await this.db.sopDocument.updateMany({ where: { id: documentId }, data: { isPublished } });
    return r.count > 0;
  }
}
