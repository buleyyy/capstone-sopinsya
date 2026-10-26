import type { PrismaClient } from "@prisma/client";
import type {
  AttemptResult,
  GradedAttempt,
  GradingKey,
  ParticipantTestStore,
  PublicTest,
  SubmitAttemptInput,
  TestKind,
} from "../domain/participantTest.js";

/**
 * Implementasi Pre/Post-test dengan Prisma. Kunci jawaban (isCorrect) hanya dibaca di getGradingKey
 * dan tidak pernah dipilih (select) oleh getTest, sehingga tidak bisa ikut terkirim ke peserta.
 * STATUS: belum dijalankan terhadap database (butuh `prisma generate` dan migrasi).
 */
export class PrismaParticipantTestStore implements ParticipantTestStore {
  constructor(private readonly getClient: () => Promise<PrismaClient>) {}

  async getTest(programSlug: string, meetingNo: number, type: TestKind): Promise<PublicTest | null> {
    const db = await this.getClient();
    const row = await db.test.findFirst({
      where: { programSlug, meetingNo, type, isActive: true },
      select: {
        id: true,
        title: true,
        type: true,
        questions: {
          where: { isActive: true },
          orderBy: [{ orderNo: "asc" }, { id: "asc" }],
          select: {
            id: true,
            orderNo: true,
            text: true,
            options: { orderBy: { label: "asc" }, select: { id: true, label: true, text: true } },
          },
        },
      },
    });
    if (!row || row.questions.length === 0) return null;
    return { id: row.id, title: row.title, type: row.type, questions: row.questions };
  }

  async getGradingKey(testId: number): Promise<GradingKey | null> {
    const db = await this.getClient();
    const row = await db.test.findFirst({
      where: { id: testId, isActive: true },
      select: {
        id: true,
        questions: {
          where: { isActive: true },
          orderBy: [{ orderNo: "asc" }, { id: "asc" }],
          select: { id: true, options: { select: { id: true, isCorrect: true } } },
        },
      },
    });
    if (!row) return null;
    return {
      testId: row.id,
      questions: row.questions.map((q) => ({
        id: q.id,
        optionIds: q.options.map((o) => o.id),
        correctOptionId: q.options.find((o) => o.isCorrect)?.id ?? null,
      })),
    };
  }

  async findAttempt(testId: number, clientRequestId: string): Promise<AttemptResult | null> {
    const db = await this.getClient();
    const row = await db.testAttempt.findUnique({
      where: { testId_clientRequestId: { testId, clientRequestId } },
      select: {
        id: true,
        correctCount: true,
        totalQuestions: true,
        score: true,
        answers: { orderBy: { id: "asc" }, select: { questionId: true, optionId: true, isCorrect: true } },
      },
    });
    if (!row) return null;
    return {
      attemptId: row.id,
      correctCount: row.correctCount,
      totalQuestions: row.totalQuestions,
      score: row.score,
      results: row.answers.map((a) => ({ questionId: a.questionId, selectedOptionId: a.optionId, correct: a.isCorrect })),
    };
  }

  async saveAttempt(testId: number, input: SubmitAttemptInput, graded: GradedAttempt): Promise<AttemptResult> {
    const db = await this.getClient();
    try {
      const created = await db.testAttempt.create({
        data: {
          testId,
          participantName: input.participantName,
          participantInstitution: input.participantInstitution,
          clientRequestId: input.clientRequestId,
          correctCount: graded.correctCount,
          totalQuestions: graded.totalQuestions,
          score: graded.score,
          answers: {
            create: graded.results.map((r) => ({
              questionId: r.questionId,
              optionId: r.selectedOptionId,
              isCorrect: r.correct,
            })),
          },
        },
        select: { id: true },
      });
      return { attemptId: created.id, ...graded };
    } catch (err) {
      // Dua permintaan dengan clientRequestId sama bersamaan: yang kalah mengembalikan percobaan pemenang.
      if ((err as { code?: string }).code === "P2002") {
        const existing = await this.findAttempt(testId, input.clientRequestId);
        if (existing) return existing;
      }
      throw err;
    }
  }
}
