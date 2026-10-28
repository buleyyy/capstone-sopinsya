import { UniqueViolationError } from "../../src/domain/auditStore.js";
import type {
  AdminTest,
  MeetingInput,
  MeetingRecord,
  ProgramInput,
  ProgramRecord,
  ProgramTree,
  PublicProgramStore,
  QuestionInput,
  ResourceInput,
  ResourceRecord,
  TestKind,
  TrainingAdminStore,
} from "../../src/domain/training.js";

interface QuestionRow {
  id: number;
  testId: number;
  orderNo: number;
  text: string;
  isActive: boolean;
  options: { id: number; label: string; text: string; isCorrect: boolean }[];
}
interface TestRow {
  id: number;
  programSlug: string;
  meetingNo: number;
  type: TestKind;
  title: string;
  isActive: boolean;
}

/** Penyimpanan di memori untuk menguji service/route program tanpa database. Perilaku mengikuti PrismaTrainingStore. */
export class MemoryTrainingStore implements PublicProgramStore, TrainingAdminStore {
  programs: ProgramRecord[] = [];
  meetings: MeetingRecord[] = [];
  resources: ResourceRecord[] = [];
  tests: TestRow[] = [];
  questions: QuestionRow[] = [];
  /** questionId -> jumlah jawaban peserta (disetel test untuk mensimulasikan riwayat). */
  answers = new Map<number, number>();
  private seq = 1;

  private tree(p: ProgramRecord, onlyPublished: boolean): ProgramTree {
    const meetings = this.meetings
      .filter((m) => m.programId === p.id && (!onlyPublished || m.isPublished))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.number - b.number)
      .map((m) => ({
        ...m,
        resources: this.resources
          .filter((r) => r.meetingId === m.id && (!onlyPublished || r.isPublished))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
      }));
    return { ...p, meetings };
  }

  // ---- publik ----
  async listPublished() {
    return this.programs
      .filter((p) => p.isPublished)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((p) => this.tree(p, true));
  }
  async getPublished(slug: string) {
    const p = this.programs.find((x) => x.slug === slug && x.isPublished);
    return p ? this.tree(p, true) : null;
  }

  // ---- program ----
  async listPrograms() {
    return [...this.programs]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((p) => ({ ...p, meetingCount: this.meetings.filter((m) => m.programId === p.id).length }));
  }
  async getProgramTree(programId: number) {
    const p = this.programs.find((x) => x.id === programId);
    return p ? this.tree(p, false) : null;
  }
  async createProgram(slug: string, data: ProgramInput) {
    if (this.programs.some((p) => p.slug === slug)) throw new UniqueViolationError("slug");
    const row: ProgramRecord = { id: this.seq++, slug, ...data };
    this.programs.push(row);
    return { ...row };
  }
  async updateProgram(programId: number, data: ProgramInput) {
    const p = this.programs.find((x) => x.id === programId);
    if (!p) return false;
    Object.assign(p, data);
    return true;
  }
  async countMeetings(programId: number) {
    return this.meetings.filter((m) => m.programId === programId).length;
  }
  async deleteProgram(programId: number) {
    if (this.meetings.some((m) => m.programId === programId)) throw new Error("FK Restrict");
    const before = this.programs.length;
    this.programs = this.programs.filter((p) => p.id !== programId);
    return this.programs.length < before;
  }

  // ---- pertemuan ----
  async findMeeting(meetingId: number) {
    const m = this.meetings.find((x) => x.id === meetingId);
    return m ? { ...m } : null;
  }
  async createMeeting(programId: number, number: number, data: MeetingInput) {
    if (this.meetings.some((m) => m.programId === programId && m.number === number)) throw new UniqueViolationError("programId_number");
    const row: MeetingRecord = { id: this.seq++, programId, number, ...data };
    this.meetings.push(row);
    return { ...row };
  }
  async updateMeeting(meetingId: number, data: MeetingInput) {
    const m = this.meetings.find((x) => x.id === meetingId);
    if (!m) return false;
    Object.assign(m, data);
    return true;
  }
  async deleteMeeting(meetingId: number) {
    this.resources = this.resources.filter((r) => r.meetingId !== meetingId);
    const before = this.meetings.length;
    this.meetings = this.meetings.filter((m) => m.id !== meetingId);
    return this.meetings.length < before;
  }
  async hasTests(programSlug: string, meetingNo: number) {
    return this.tests.some((t) => t.programSlug === programSlug && t.meetingNo === meetingNo);
  }

  // ---- sumber ----
  async findResource(resourceId: number) {
    const r = this.resources.find((x) => x.id === resourceId);
    return r ? { ...r } : null;
  }
  async createResource(meetingId: number, data: ResourceInput) {
    const row: ResourceRecord = { id: this.seq++, meetingId, ...data };
    this.resources.push(row);
    return { ...row };
  }
  async updateResource(resourceId: number, data: ResourceInput) {
    const r = this.resources.find((x) => x.id === resourceId);
    if (!r) return false;
    Object.assign(r, data);
    return true;
  }
  async deleteResource(resourceId: number) {
    const before = this.resources.length;
    this.resources = this.resources.filter((r) => r.id !== resourceId);
    return this.resources.length < before;
  }

  // ---- tes ----
  private adminTest(t: TestRow): AdminTest {
    return {
      ...t,
      questions: this.questions
        .filter((q) => q.testId === t.id)
        .sort((a, b) => a.orderNo - b.orderNo || a.id - b.id)
        .map((q) => ({
          id: q.id,
          orderNo: q.orderNo,
          text: q.text,
          isActive: q.isActive,
          answerCount: this.answers.get(q.id) ?? 0,
          options: q.options.map((o) => ({ ...o })),
        })),
    };
  }
  async findTest(programSlug: string, meetingNo: number, type: TestKind) {
    const t = this.tests.find((x) => x.programSlug === programSlug && x.meetingNo === meetingNo && x.type === type);
    return t ? this.adminTest(t) : null;
  }
  async ensureTest(programSlug: string, meetingNo: number, type: TestKind, title: string) {
    let t = this.tests.find((x) => x.programSlug === programSlug && x.meetingNo === meetingNo && x.type === type);
    if (!t) {
      t = { id: this.seq++, programSlug, meetingNo, type, title, isActive: false };
      this.tests.push(t);
    }
    return this.adminTest(t);
  }
  async updateTest(testId: number, data: { title: string; isActive: boolean }) {
    const t = this.tests.find((x) => x.id === testId);
    if (!t) return false;
    Object.assign(t, data);
    return true;
  }
  async findQuestion(questionId: number) {
    const q = this.questions.find((x) => x.id === questionId);
    return q ? { id: q.id, testId: q.testId, answerCount: this.answers.get(q.id) ?? 0 } : null;
  }
  async createQuestion(testId: number, data: QuestionInput) {
    this.questions.push({
      id: this.seq++,
      testId,
      orderNo: data.orderNo,
      text: data.text,
      isActive: true,
      options: data.options.map((o) => ({ id: this.seq++, label: o.label, text: o.text, isCorrect: o.label === data.correctLabel })),
    });
  }
  async updateQuestion(questionId: number, data: QuestionInput) {
    const q = this.questions.find((x) => x.id === questionId);
    if (!q) return false;
    q.orderNo = data.orderNo;
    q.text = data.text;
    for (const o of data.options) {
      const row = q.options.find((x) => x.label === o.label);
      if (row) Object.assign(row, { text: o.text, isCorrect: o.label === data.correctLabel });
    }
    return true;
  }
  async setQuestionActive(questionId: number, isActive: boolean) {
    const q = this.questions.find((x) => x.id === questionId);
    if (!q) return false;
    q.isActive = isActive;
    return true;
  }
  async deleteQuestion(questionId: number) {
    if ((this.answers.get(questionId) ?? 0) > 0) return false;
    const before = this.questions.length;
    this.questions = this.questions.filter((q) => q.id !== questionId);
    return this.questions.length < before;
  }
}
