/**
 * Pre-test / Post-test peserta (publik, tanpa login). Kontrak ini SENGAJA sempit:
 * kunci jawaban (isCorrect) tidak pernah ada di tipe yang dikirim ke peserta.
 * Penilaian hanya dilakukan di server lewat gradeAttempt().
 */
import { AppError } from "../utils/errors.js";

export type TestKind = "PRE" | "POST";

export interface PublicTestOption {
  id: number;
  label: string;
  text: string;
}

export interface PublicTestQuestion {
  id: number;
  orderNo: number;
  text: string;
  options: PublicTestOption[];
}

export interface PublicTest {
  id: number;
  title: string;
  type: TestKind;
  questions: PublicTestQuestion[];
}

/** Kunci penilaian: hanya dipakai di server. */
export interface GradingKey {
  testId: number;
  questions: { id: number; optionIds: number[]; correctOptionId: number | null }[];
}

export interface AnswerInput {
  questionId: number;
  /** null = soal tidak dijawab (dihitung salah). */
  optionId: number | null;
}

export interface SubmitAttemptInput {
  participantName: string;
  participantInstitution: string;
  clientRequestId: string;
  answers: AnswerInput[];
}

export interface QuestionResult {
  questionId: number;
  selectedOptionId: number | null;
  correct: boolean;
}

export interface AttemptResult {
  attemptId: number;
  correctCount: number;
  totalQuestions: number;
  score: number;
  results: QuestionResult[];
}

export interface GradedAttempt {
  correctCount: number;
  totalQuestions: number;
  score: number;
  results: QuestionResult[];
}

export interface ParticipantTestStore {
  /** null bila tes tidak ada, tidak aktif, atau belum punya soal aktif. Tanpa kunci jawaban. */
  getTest(programSlug: string, meetingNo: number, type: TestKind): Promise<PublicTest | null>;
  /** null bila tes tidak ada atau tidak aktif. */
  getGradingKey(testId: number): Promise<GradingKey | null>;
  findAttempt(testId: number, clientRequestId: string): Promise<AttemptResult | null>;
  /** Menyimpan percobaan beserta jawabannya. Bila clientRequestId sudah ada, mengembalikan percobaan yang ada. */
  saveAttempt(testId: number, input: SubmitAttemptInput, graded: GradedAttempt): Promise<AttemptResult>;
}

/** Skor = (benar / total) x 100, dibulatkan. Contoh desain: 2 benar dari 10 soal = 20. */
export function computeScore(correctCount: number, totalQuestions: number): number {
  if (totalQuestions <= 0) return 0;
  return Math.round((correctCount / totalQuestions) * 100);
}

/**
 * Menilai jawaban terhadap kunci. Soal yang tidak dikirim atau optionId null dihitung salah.
 * Menolak (400) soal yang bukan milik tes, opsi yang bukan milik soalnya, dan soal ganda.
 */
export function gradeAttempt(key: GradingKey, answers: AnswerInput[]): GradedAttempt {
  const byQuestion = new Map(key.questions.map((q) => [q.id, q]));
  const given = new Map<number, number | null>();

  for (const a of answers) {
    const q = byQuestion.get(a.questionId);
    if (!q) throw new AppError(400, "INVALID_QUESTION", "Ada soal yang bukan bagian dari tes ini");
    if (given.has(a.questionId)) throw new AppError(400, "DUPLICATE_ANSWER", "Satu soal hanya boleh dijawab satu kali");
    if (a.optionId !== null && !q.optionIds.includes(a.optionId)) {
      throw new AppError(400, "INVALID_OPTION", "Ada opsi yang bukan milik soalnya");
    }
    given.set(a.questionId, a.optionId);
  }

  const results: QuestionResult[] = key.questions.map((q) => {
    const selected = given.get(q.id) ?? null;
    return {
      questionId: q.id,
      selectedOptionId: selected,
      correct: selected !== null && selected === q.correctOptionId,
    };
  });
  const correctCount = results.filter((r) => r.correct).length;
  const totalQuestions = key.questions.length;
  return { correctCount, totalQuestions, score: computeScore(correctCount, totalQuestions), results };
}
