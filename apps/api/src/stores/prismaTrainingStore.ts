import type { PrismaClient } from "@prisma/client";
import { UniqueViolationError } from "../domain/auditStore.js";
import type {
  AdminTest,
  MeetingInput,
  MeetingRecord,
  MeetingTree,
  ProgramInput,
  ProgramRecord,
  ProgramTree,
  PublicProgramStore,
  QuestionInput,
  ResourceInput,
  ResourceRecord,
  TestKind,
  TrainingAdminStore,
} from "../domain/training.js";

/**
 * Implementasi Prisma untuk program ISO, pertemuan, sumber belajar, dan editor pre/post-test.
 * Filter isPublished untuk API publik diterapkan di SINI (batas keamanan), bukan di UI.
 * STATUS: belum dijalankan terhadap database (butuh `prisma generate` dan migrasi 20261028120000).
 */

const orderPrograms = [{ sortOrder: "asc" as const }, { id: "asc" as const }];
const orderMeetings = [{ sortOrder: "asc" as const }, { number: "asc" as const }];
const orderResources = [{ sortOrder: "asc" as const }, { id: "asc" as const }];

async function unique<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw new UniqueViolationError("unique");
    throw err;
  }
}

// Memilih field satu per satu agar kolom internal (createdAt/updatedAt) tidak ikut keluar dari store.
const toProgram = (r: ProgramRecord): ProgramRecord => ({
  id: r.id,
  slug: r.slug,
  code: r.code,
  title: r.title,
  fullTitle: r.fullTitle,
  subtitle: r.subtitle,
  summary: r.summary,
  description: r.description,
  duration: r.duration,
  mode: r.mode,
  trainer: r.trainer,
  category: r.category,
  tone: r.tone,
  sortOrder: r.sortOrder,
  isPublished: r.isPublished,
});
const toMeeting = (m: MeetingRecord): MeetingRecord => ({
  id: m.id,
  programId: m.programId,
  number: m.number,
  title: m.title,
  sortOrder: m.sortOrder,
  isPublished: m.isPublished,
});
const toResource = (x: ResourceRecord): ResourceRecord => ({
  id: x.id,
  meetingId: x.meetingId,
  type: x.type,
  title: x.title,
  url: x.url,
  sortOrder: x.sortOrder,
  isPublished: x.isPublished,
});
const toTree = (r: ProgramRecord & { meetings: (MeetingRecord & { resources: ResourceRecord[] })[] }): ProgramTree => ({
  ...toProgram(r),
  meetings: r.meetings.map((m): MeetingTree => ({ ...toMeeting(m), resources: m.resources.map(toResource) })),
});

export class PrismaTrainingStore implements PublicProgramStore, TrainingAdminStore {
  constructor(private readonly getClient: () => Promise<PrismaClient>) {}

  // ---------- Publik ----------

  async listPublished(): Promise<ProgramTree[]> {
    const db = await this.getClient();
    const rows = await db.trainingProgram.findMany({
      where: { isPublished: true },
      orderBy: orderPrograms,
      include: {
        meetings: {
          where: { isPublished: true },
          orderBy: orderMeetings,
          include: { resources: { where: { isPublished: true }, orderBy: orderResources } },
        },
      },
    });
    return rows.map(toTree);
  }

  async getPublished(slug: string): Promise<ProgramTree | null> {
    const db = await this.getClient();
    const row = await db.trainingProgram.findFirst({
      where: { slug, isPublished: true },
      include: {
        meetings: {
          where: { isPublished: true },
          orderBy: orderMeetings,
          include: { resources: { where: { isPublished: true }, orderBy: orderResources } },
        },
      },
    });
    return row ? toTree(row) : null;
  }

  // ---------- Admin: program ----------

  async listPrograms(): Promise<(ProgramRecord & { meetingCount: number })[]> {
    const db = await this.getClient();
    const rows = await db.trainingProgram.findMany({
      orderBy: orderPrograms,
      include: { _count: { select: { meetings: true } } },
    });
    return rows.map((r) => ({ ...toProgram(r), meetingCount: r._count.meetings }));
  }

  async getProgramTree(programId: number): Promise<ProgramTree | null> {
    const db = await this.getClient();
    const row = await db.trainingProgram.findUnique({
      where: { id: programId },
      include: { meetings: { orderBy: orderMeetings, include: { resources: { orderBy: orderResources } } } },
    });
    return row ? toTree(row) : null;
  }

  async createProgram(slug: string, data: ProgramInput): Promise<ProgramRecord> {
    const db = await this.getClient();
    return toProgram(await unique(() => db.trainingProgram.create({ data: { slug, ...data } })));
  }

  async updateProgram(programId: number, data: ProgramInput): Promise<boolean> {
    const db = await this.getClient();
    const r = await db.trainingProgram.updateMany({ where: { id: programId }, data });
    return r.count === 1;
  }

  async countMeetings(programId: number): Promise<number> {
    const db = await this.getClient();
    return db.programMeeting.count({ where: { programId } });
  }

  async deleteProgram(programId: number): Promise<boolean> {
    const db = await this.getClient();
    const r = await db.trainingProgram.deleteMany({ where: { id: programId } });
    return r.count === 1;
  }

  // ---------- Admin: pertemuan ----------

  async findMeeting(meetingId: number): Promise<MeetingRecord | null> {
    const db = await this.getClient();
    const r = await db.programMeeting.findUnique({ where: { id: meetingId } });
    return r ? toMeeting(r) : null;
  }

  async createMeeting(programId: number, number: number, data: MeetingInput): Promise<MeetingRecord> {
    const db = await this.getClient();
    return toMeeting(await unique(() => db.programMeeting.create({ data: { programId, number, ...data } })));
  }

  async updateMeeting(meetingId: number, data: MeetingInput): Promise<boolean> {
    const db = await this.getClient();
    const r = await db.programMeeting.updateMany({ where: { id: meetingId }, data });
    return r.count === 1;
  }

  async deleteMeeting(meetingId: number): Promise<boolean> {
    const db = await this.getClient();
    const [, meeting] = await db.$transaction([
      db.meetingResource.deleteMany({ where: { meetingId } }),
      db.programMeeting.deleteMany({ where: { id: meetingId } }),
    ]);
    return meeting.count === 1;
  }

  async hasTests(programSlug: string, meetingNo: number): Promise<boolean> {
    const db = await this.getClient();
    return (await db.test.count({ where: { programSlug, meetingNo } })) > 0;
  }

  // ---------- Admin: sumber belajar ----------

  async findResource(resourceId: number): Promise<ResourceRecord | null> {
    const db = await this.getClient();
    const r = await db.meetingResource.findUnique({ where: { id: resourceId } });
    return r ? toResource(r) : null;
  }

  async createResource(meetingId: number, data: ResourceInput): Promise<ResourceRecord> {
    const db = await this.getClient();
    return toResource(await db.meetingResource.create({ data: { meetingId, ...data } }));
  }

  async updateResource(resourceId: number, data: ResourceInput): Promise<boolean> {
    const db = await this.getClient();
    const r = await db.meetingResource.updateMany({ where: { id: resourceId }, data });
    return r.count === 1;
  }

  async deleteResource(resourceId: number): Promise<boolean> {
    const db = await this.getClient();
    const r = await db.meetingResource.deleteMany({ where: { id: resourceId } });
    return r.count === 1;
  }

  // ---------- Admin: pre/post-test ----------

  async findTest(programSlug: string, meetingNo: number, type: TestKind): Promise<AdminTest | null> {
    const db = await this.getClient();
    const row = await db.test.findUnique({
      where: { programSlug_meetingNo_type: { programSlug, meetingNo, type } },
      include: {
        questions: {
          orderBy: [{ orderNo: "asc" }, { id: "asc" }],
          include: { options: { orderBy: { label: "asc" } }, _count: { select: { answers: true } } },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      programSlug: row.programSlug,
      meetingNo: row.meetingNo,
      type: row.type,
      title: row.title,
      isActive: row.isActive,
      questions: row.questions.map((q) => ({
        id: q.id,
        orderNo: q.orderNo,
        text: q.text,
        isActive: q.isActive,
        answerCount: q._count.answers,
        options: q.options.map((o) => ({ id: o.id, label: o.label, text: o.text, isCorrect: o.isCorrect })),
      })),
    };
  }

  async ensureTest(programSlug: string, meetingNo: number, type: TestKind, title: string): Promise<AdminTest> {
    const db = await this.getClient();
    await db.test.upsert({
      where: { programSlug_meetingNo_type: { programSlug, meetingNo, type } },
      update: {},
      // Tes baru nonaktif sampai Admin menambahkan soal dan mengaktifkannya.
      create: { programSlug, meetingNo, type, title, isActive: false },
    });
    const test = await this.findTest(programSlug, meetingNo, type);
    if (!test) throw new Error("Tes tidak ditemukan setelah dibuat");
    return test;
  }

  async updateTest(testId: number, data: { title: string; isActive: boolean }): Promise<boolean> {
    const db = await this.getClient();
    const r = await db.test.updateMany({ where: { id: testId }, data });
    return r.count === 1;
  }

  async findQuestion(questionId: number): Promise<{ id: number; testId: number; answerCount: number } | null> {
    const db = await this.getClient();
    const r = await db.testQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, testId: true, _count: { select: { answers: true } } },
    });
    return r ? { id: r.id, testId: r.testId, answerCount: r._count.answers } : null;
  }

  async createQuestion(testId: number, data: QuestionInput): Promise<void> {
    const db = await this.getClient();
    await db.testQuestion.create({
      data: {
        testId,
        orderNo: data.orderNo,
        text: data.text,
        options: {
          create: data.options.map((o) => ({ label: o.label, text: o.text, isCorrect: o.label === data.correctLabel })),
        },
      },
    });
  }

  async updateQuestion(questionId: number, data: QuestionInput): Promise<boolean> {
    const db = await this.getClient();
    const exists = await db.testQuestion.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!exists) return false;
    await db.$transaction([
      db.testQuestion.update({ where: { id: questionId }, data: { orderNo: data.orderNo, text: data.text } }),
      ...data.options.map((o) =>
        db.testOption.updateMany({ where: { questionId, label: o.label }, data: { text: o.text, isCorrect: o.label === data.correctLabel } }),
      ),
    ]);
    return true;
  }

  async setQuestionActive(questionId: number, isActive: boolean): Promise<boolean> {
    const db = await this.getClient();
    const r = await db.testQuestion.updateMany({ where: { id: questionId }, data: { isActive } });
    return r.count === 1;
  }

  async deleteQuestion(questionId: number): Promise<boolean> {
    const db = await this.getClient();
    if ((await db.testAttemptAnswer.count({ where: { questionId } })) > 0) return false;
    const [, question] = await db.$transaction([
      db.testOption.deleteMany({ where: { questionId } }),
      db.testQuestion.deleteMany({ where: { id: questionId } }),
    ]);
    return question.count === 1;
  }
}
