/**
 * Klien API Pre/Post-test (dipanggil dari browser). Harus sejalan dengan apps/api/src/domain/participantTest.ts.
 * Penilaian dilakukan server; browser hanya menampilkan hasil yang dikembalikan.
 */
import { apiUrl } from "./config";

export interface TestOption {
  id: number;
  label: string;
  text: string;
}

export interface TestQuestion {
  id: number;
  orderNo: number;
  text: string;
  options: TestOption[];
}

export interface TestData {
  id: number;
  title: string;
  type: "PRE" | "POST";
  questions: TestQuestion[];
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

export interface Participant {
  participantName: string;
  participantInstitution: string;
}

export type TestLoad =
  | { status: "ok"; test: TestData }
  | { status: "not_found" }
  | { status: "error"; message: string };

export type SubmitOutcome = { status: "ok"; result: AttemptResult } | { status: "error"; message: string };

const NETWORK_MESSAGE = "Tidak dapat terhubung ke server. Jawaban Anda masih tersimpan di layar, coba lagi.";

export async function loadTest(slug: string, meetingNo: number, kind: "Pre-test" | "Post-test"): Promise<TestLoad> {
  const type = kind === "Pre-test" ? "pre" : "post";
  try {
    const res = await fetch(apiUrl(`/api/public/programs/${slug}/pertemuan/${meetingNo}/tests/${type}`), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error", message: `Server mengembalikan status ${res.status}.` };
    const body = (await res.json()) as { success?: boolean; data?: TestData };
    if (!body.success || !body.data) return { status: "error", message: "Respons server tidak sesuai format." };
    return { status: "ok", test: body.data };
  } catch {
    return { status: "error", message: "Tidak dapat terhubung ke server. Coba lagi beberapa saat." };
  }
}

export async function submitAttempt(
  testId: number,
  payload: Participant & { clientRequestId: string; answers: { questionId: number; optionId: number | null }[] },
): Promise<SubmitOutcome> {
  try {
    const res = await fetch(apiUrl(`/api/public/tests/${testId}/attempts`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: AttemptResult;
      error?: { message?: string };
    } | null;
    if (res.ok && body?.success && body.data) return { status: "ok", result: body.data };
    return { status: "error", message: body?.error?.message ?? `Server mengembalikan status ${res.status}.` };
  } catch {
    return { status: "error", message: NETWORK_MESSAGE };
  }
}

/** ID unik per percobaan; dipakai server sebagai kunci idempotensi (klik Selesai ganda = satu percobaan). */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

const STORAGE_KEY = "sopinsya.participant";

/** Kemudahan per-browser: mengisi ulang nama/instansi. Gagal baca/tulis diabaikan. */
export function readSavedParticipant(): Participant | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Participant>;
    if (typeof v.participantName === "string" && typeof v.participantInstitution === "string") {
      return { participantName: v.participantName, participantInstitution: v.participantInstitution };
    }
  } catch {
    /* abaikan */
  }
  return null;
}

export function saveParticipant(p: Participant): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* abaikan */
  }
}
