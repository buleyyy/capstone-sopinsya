import { z } from "zod";
import { parseInput } from "../domain/auditSchemas.js";
import { UniqueViolationError } from "../domain/auditStore.js";
import {
  OPTION_LABELS,
  TONES,
  httpsOrNull,
  type AdminTest,
  type MeetingRecord,
  type MeetingTree,
  type ProgramRecord,
  type ProgramTree,
  type ResourceRecord,
  type TestKind,
  type TrainingAdminStore,
} from "../domain/training.js";
import { AppError } from "../utils/errors.js";

/** Operasi Admin untuk program, pertemuan, sumber belajar, dan soal pre/post-test. Otorisasi ada di lapisan web. */

const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} tidak ditemukan`);
const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);

const text = (max: number) => z.string().trim().min(1, "Wajib diisi").max(max, `Maksimal ${max} karakter`);
const sortOrder = z.number().int().min(0).max(100000);
const httpsUrl = z
  .string()
  .trim()
  .max(1024)
  .refine((v) => httpsOrNull(v) !== null, "URL harus diawali https:// dan tanpa nama pengguna/kata sandi");

export const slugSchema = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug hanya huruf kecil, angka, dan tanda hubung (mis. iso-9001)");

export const programSchema = z.object({
  code: text(10),
  title: text(80),
  fullTitle: text(120),
  subtitle: text(160),
  summary: text(300),
  description: text(4000),
  duration: text(40),
  mode: text(40),
  trainer: text(120),
  category: text(60),
  tone: z.enum(TONES),
  sortOrder,
  isPublished: z.boolean(),
});
const createProgramSchema = programSchema.extend({ slug: slugSchema });

export const meetingSchema = z.object({ title: text(160), sortOrder, isPublished: z.boolean() });
const createMeetingSchema = meetingSchema.extend({ number: z.number().int().min(1, "Nomor minimal 1").max(50, "Nomor maksimal 50") });

export const resourceSchema = z.object({
  type: z.enum(["SOP", "SYLLABUS", "MATERIAL", "CASE_STUDY", "BLOOKET", "VIDEO"]),
  title: text(200),
  url: httpsUrl,
  sortOrder,
  isPublished: z.boolean(),
});

export const testMetaSchema = z.object({ title: text(160), isActive: z.boolean() });

export const questionSchema = z
  .object({
    orderNo: z.number().int().min(0).max(1000),
    text: text(2000),
    options: z.array(z.object({ label: z.string(), text: text(500) })).length(4, "Isi keempat opsi (A-D)"),
    correctLabel: z.enum(OPTION_LABELS),
  })
  .superRefine((v, ctx) => {
    v.options.forEach((o, i) => {
      if (o.label !== OPTION_LABELS[i]) ctx.addIssue({ code: "custom", path: ["options", i], message: "Label opsi harus A, B, C, D berurutan" });
    });
  });

// ---------- Program ----------

export async function createProgram(store: TrainingAdminStore, raw: unknown): Promise<ProgramRecord> {
  const { slug, ...data } = parseInput(createProgramSchema, raw);
  try {
    return await store.createProgram(slug, data);
  } catch (e) {
    if (e instanceof UniqueViolationError) throw conflict("Slug sudah dipakai program lain", "ALREADY_EXISTS");
    throw e;
  }
}

export async function updateProgram(store: TrainingAdminStore, programId: number, raw: unknown): Promise<void> {
  const data = parseInput(programSchema, raw);
  if (!(await store.updateProgram(programId, data))) throw notFound("Program");
}

/** Program yang masih memiliki pertemuan tidak dapat dihapus; tarik dari publik (draf) bila hanya ingin disembunyikan. */
export async function deleteProgram(store: TrainingAdminStore, programId: number): Promise<void> {
  const tree = await store.getProgramTree(programId);
  if (!tree) throw notFound("Program");
  if (tree.meetings.length > 0) throw conflict("Hapus semua pertemuan lebih dulu, atau ubah status program menjadi draf.", "HAS_MEETINGS");
  if (!(await store.deleteProgram(programId))) throw notFound("Program");
}

// ---------- Pertemuan ----------

export async function loadMeetingContext(
  store: TrainingAdminStore,
  programId: number,
  meetingId: number,
): Promise<{ program: ProgramTree; meeting: MeetingTree }> {
  const program = await store.getProgramTree(programId);
  const meeting = program?.meetings.find((m) => m.id === meetingId);
  if (!program || !meeting) throw notFound("Pertemuan");
  return { program, meeting };
}

export async function createMeeting(store: TrainingAdminStore, programId: number, raw: unknown): Promise<MeetingRecord> {
  const { number, ...data } = parseInput(createMeetingSchema, raw);
  if (!(await store.getProgramTree(programId))) throw notFound("Program");
  try {
    return await store.createMeeting(programId, number, data);
  } catch (e) {
    if (e instanceof UniqueViolationError) throw conflict(`Pertemuan ${number} sudah ada pada program ini`, "ALREADY_EXISTS");
    throw e;
  }
}

export async function updateMeeting(store: TrainingAdminStore, programId: number, meetingId: number, raw: unknown): Promise<void> {
  const data = parseInput(meetingSchema, raw);
  await loadMeetingContext(store, programId, meetingId);
  if (!(await store.updateMeeting(meetingId, data))) throw notFound("Pertemuan");
}

/** Pertemuan yang sudah memiliki tes tidak dihapus (riwayat jawaban peserta terikat); gunakan status draf. */
export async function deleteMeeting(store: TrainingAdminStore, programId: number, meetingId: number): Promise<void> {
  const { program, meeting } = await loadMeetingContext(store, programId, meetingId);
  if (await store.hasTests(program.slug, meeting.number)) {
    throw conflict("Pertemuan ini sudah memiliki pre/post-test. Ubah statusnya menjadi draf alih-alih menghapus.", "HAS_TESTS");
  }
  if (!(await store.deleteMeeting(meetingId))) throw notFound("Pertemuan");
}

// ---------- Sumber belajar ----------

async function ownResource(store: TrainingAdminStore, meetingId: number, resourceId: number): Promise<ResourceRecord> {
  const r = await store.findResource(resourceId);
  if (!r || r.meetingId !== meetingId) throw notFound("Sumber belajar");
  return r;
}

export async function createResource(store: TrainingAdminStore, programId: number, meetingId: number, raw: unknown): Promise<void> {
  const data = parseInput(resourceSchema, raw);
  await loadMeetingContext(store, programId, meetingId);
  await store.createResource(meetingId, { ...data, url: httpsOrNull(data.url) ?? data.url });
}

export async function updateResource(
  store: TrainingAdminStore,
  programId: number,
  meetingId: number,
  resourceId: number,
  raw: unknown,
): Promise<void> {
  const data = parseInput(resourceSchema, raw);
  await loadMeetingContext(store, programId, meetingId);
  await ownResource(store, meetingId, resourceId);
  if (!(await store.updateResource(resourceId, { ...data, url: httpsOrNull(data.url) ?? data.url }))) throw notFound("Sumber belajar");
}

export async function deleteResource(store: TrainingAdminStore, programId: number, meetingId: number, resourceId: number): Promise<void> {
  await loadMeetingContext(store, programId, meetingId);
  await ownResource(store, meetingId, resourceId);
  if (!(await store.deleteResource(resourceId))) throw notFound("Sumber belajar");
}

// ---------- Pre-test / Post-test ----------

/** Membuka editor tes; tes dibuat (kosong, nonaktif sampai ada soal) saat pertama kali dibuka. */
export async function openTest(store: TrainingAdminStore, programId: number, meetingId: number, kind: TestKind): Promise<AdminTest> {
  const { program, meeting } = await loadMeetingContext(store, programId, meetingId);
  const label = kind === "PRE" ? "Pre-test" : "Post-test";
  return store.ensureTest(program.slug, meeting.number, kind, `${label} ${program.fullTitle} - ${meeting.title}`);
}

export async function updateTest(store: TrainingAdminStore, test: AdminTest, raw: unknown): Promise<void> {
  const data = parseInput(testMetaSchema, raw);
  if (data.isActive && !test.questions.some((q) => q.isActive)) {
    throw new AppError(422, "TEST_HAS_NO_QUESTIONS", "Tambahkan minimal satu soal aktif sebelum mengaktifkan tes");
  }
  if (!(await store.updateTest(test.id, data))) throw notFound("Tes");
}

async function ownQuestion(store: TrainingAdminStore, test: AdminTest, questionId: number) {
  const q = await store.findQuestion(questionId);
  if (!q || q.testId !== test.id) throw notFound("Soal");
  return q;
}

export async function addQuestion(store: TrainingAdminStore, test: AdminTest, raw: unknown): Promise<void> {
  await store.createQuestion(test.id, parseInput(questionSchema, raw));
}

export async function updateQuestion(store: TrainingAdminStore, test: AdminTest, questionId: number, raw: unknown): Promise<void> {
  const data = parseInput(questionSchema, raw);
  await ownQuestion(store, test, questionId);
  if (!(await store.updateQuestion(questionId, data))) throw notFound("Soal");
}

export async function setQuestionActive(store: TrainingAdminStore, test: AdminTest, questionId: number, isActive: boolean): Promise<void> {
  await ownQuestion(store, test, questionId);
  if (!(await store.setQuestionActive(questionId, isActive))) throw notFound("Soal");
}

/** Soal yang sudah dijawab peserta tidak dihapus (menjaga riwayat nilai); nonaktifkan saja. */
export async function deleteQuestion(store: TrainingAdminStore, test: AdminTest, questionId: number): Promise<void> {
  const q = await ownQuestion(store, test, questionId);
  if (q.answerCount > 0) {
    throw conflict("Soal ini sudah dijawab peserta sehingga tidak dapat dihapus. Nonaktifkan soal agar tidak tampil.", "HAS_ANSWERS");
  }
  if (!(await store.deleteQuestion(questionId))) throw notFound("Soal");
}
