/**
 * Program pelatihan ISO, pertemuan, dan sumber belajarnya. TERPISAH dari MaterialCategory (13 kamar BNSP).
 * Kontrak publik sengaja sempit dan berbentuk sama dengan tipe `Program` di apps/web/src/lib/programs.ts.
 * Pemfilteran isPublished dilakukan di store (batas keamanan) dan diulang di toPublicProgram (pertahanan berlapis).
 */

export type MeetingResourceType = "SOP" | "SYLLABUS" | "MATERIAL" | "CASE_STUDY" | "BLOOKET" | "VIDEO";
export const MEETING_RESOURCE_TYPES: readonly MeetingResourceType[] = ["SOP", "SYLLABUS", "MATERIAL", "CASE_STUDY", "BLOOKET", "VIDEO"];
export const TONES = ["blue", "teal", "navy"] as const;
export type Tone = (typeof TONES)[number];

export const RESOURCE_LABEL: Record<MeetingResourceType, string> = {
  SOP: "Pustaka SOP",
  SYLLABUS: "Silabus",
  MATERIAL: "Materi / PDF",
  CASE_STUDY: "Studi kasus",
  BLOOKET: "Kuis Blooket",
  VIDEO: "Video referensi",
};

export interface ProgramRecord {
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
}

export interface MeetingRecord {
  id: number;
  programId: number;
  number: number;
  title: string;
  sortOrder: number;
  isPublished: boolean;
}

export interface ResourceRecord {
  id: number;
  meetingId: number;
  type: MeetingResourceType;
  title: string;
  url: string;
  sortOrder: number;
  isPublished: boolean;
}

export interface MeetingTree extends MeetingRecord {
  resources: ResourceRecord[];
}

export interface ProgramTree extends ProgramRecord {
  meetings: MeetingTree[];
}

// ---------- Publik ----------

export interface PublicDoc {
  title: string;
  url: string | null;
}
export interface PublicVideo {
  id: number;
  title: string;
  url: string | null;
}
export interface PublicMeeting {
  /** Nomor pertemuan (dipakai pada URL dan pada API tes). */
  id: number;
  title: string;
  sop: PublicDoc;
  silabus: PublicDoc;
  materi: PublicDoc;
  studiKasus: PublicDoc;
  blooketUrl: string | null;
  videos: PublicVideo[];
}
export interface PublicProgram {
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
  tone: Tone;
  meetings: PublicMeeting[];
}

export interface PublicProgramStore {
  /** Hanya program terbit, berurutan sortOrder lalu id; pertemuan dan sumber yang terbit saja. */
  listPublished(): Promise<ProgramTree[]>;
  /** null bila slug tidak ada ATAU program belum terbit. */
  getPublished(slug: string): Promise<ProgramTree | null>;
}

/** Hanya URL https tanpa kredensial yang diteruskan ke pengunjung; selain itu dianggap tidak ada. */
export function httpsOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.username === "" && u.password === "" ? u.toString() : null;
  } catch {
    return null;
  }
}

const bySort = <T extends { sortOrder: number; id: number }>(a: T, b: T) => a.sortOrder - b.sortOrder || a.id - b.id;

/**
 * Memetakan pohon basis data ke bentuk yang dipakai UI peserta. Satu slot (SOP, silabus, materi, studi kasus,
 * Blooket) memakai sumber terbit pertama menurut urutan; video dapat lebih dari satu.
 */
export function toPublicProgram(p: ProgramTree): PublicProgram {
  const meetings = p.meetings
    .filter((m) => m.isPublished)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.number - b.number)
    .map((m): PublicMeeting => {
      const live = m.resources.filter((r) => r.isPublished && httpsOrNull(r.url) !== null).sort(bySort);
      const first = (type: MeetingResourceType, fallback: string): PublicDoc => {
        const r = live.find((x) => x.type === type);
        return r ? { title: r.title, url: httpsOrNull(r.url) } : { title: fallback, url: null };
      };
      return {
        id: m.number,
        title: m.title,
        sop: first("SOP", `Pustaka SOP ${p.fullTitle}`),
        silabus: first("SYLLABUS", `Silabus ${p.fullTitle}`),
        materi: first("MATERIAL", `Materi Pelatihan ${p.title}`),
        studiKasus: first("CASE_STUDY", `Studi Kasus ${p.title}`),
        blooketUrl: httpsOrNull(live.find((x) => x.type === "BLOOKET")?.url),
        videos: live.filter((x) => x.type === "VIDEO").map((v) => ({ id: v.id, title: v.title, url: httpsOrNull(v.url) })),
      };
    });
  return {
    slug: p.slug,
    code: p.code,
    title: p.title,
    fullTitle: p.fullTitle,
    subtitle: p.subtitle,
    summary: p.summary,
    description: p.description,
    duration: p.duration,
    mode: p.mode,
    trainer: p.trainer,
    category: p.category,
    tone: (TONES as readonly string[]).includes(p.tone) ? (p.tone as Tone) : "blue",
    meetings,
  };
}

// ---------- Admin ----------

export type ProgramInput = Omit<ProgramRecord, "id" | "slug">;
export type MeetingInput = Omit<MeetingRecord, "id" | "programId" | "number">;
export type ResourceInput = Omit<ResourceRecord, "id" | "meetingId">;

export type TestKind = "PRE" | "POST";
export const OPTION_LABELS = ["A", "B", "C", "D"] as const;

export interface AdminOption {
  id: number;
  label: string;
  text: string;
  isCorrect: boolean;
}
export interface AdminQuestion {
  id: number;
  orderNo: number;
  text: string;
  isActive: boolean;
  answerCount: number;
  options: AdminOption[];
}
export interface AdminTest {
  id: number;
  programSlug: string;
  meetingNo: number;
  type: TestKind;
  title: string;
  isActive: boolean;
  questions: AdminQuestion[];
}
export interface QuestionInput {
  orderNo: number;
  text: string;
  /** Tepat empat opsi A-D, berurutan. */
  options: { label: string; text: string }[];
  correctLabel: string;
}

export interface TrainingAdminStore {
  listPrograms(): Promise<(ProgramRecord & { meetingCount: number })[]>;
  getProgramTree(programId: number): Promise<ProgramTree | null>;
  /** Melempar UniqueViolationError bila slug sudah ada. */
  createProgram(slug: string, data: ProgramInput): Promise<ProgramRecord>;
  updateProgram(programId: number, data: ProgramInput): Promise<boolean>;
  countMeetings(programId: number): Promise<number>;
  deleteProgram(programId: number): Promise<boolean>;

  findMeeting(meetingId: number): Promise<MeetingRecord | null>;
  /** Melempar UniqueViolationError bila nomor sudah dipakai pada program itu. */
  createMeeting(programId: number, number: number, data: MeetingInput): Promise<MeetingRecord>;
  updateMeeting(meetingId: number, data: MeetingInput): Promise<boolean>;
  /** Menghapus pertemuan beserta sumbernya dalam satu transaksi. */
  deleteMeeting(meetingId: number): Promise<boolean>;
  /** Apakah ada Test (aktif atau tidak) untuk pertemuan ini; pertemuan bertes tidak boleh dihapus. */
  hasTests(programSlug: string, meetingNo: number): Promise<boolean>;

  findResource(resourceId: number): Promise<ResourceRecord | null>;
  createResource(meetingId: number, data: ResourceInput): Promise<ResourceRecord>;
  updateResource(resourceId: number, data: ResourceInput): Promise<boolean>;
  deleteResource(resourceId: number): Promise<boolean>;

  findTest(programSlug: string, meetingNo: number, type: TestKind): Promise<AdminTest | null>;
  /** Membuat tes bila belum ada; bila sudah ada, mengembalikannya tanpa perubahan. */
  ensureTest(programSlug: string, meetingNo: number, type: TestKind, title: string): Promise<AdminTest>;
  updateTest(testId: number, data: { title: string; isActive: boolean }): Promise<boolean>;
  findQuestion(questionId: number): Promise<{ id: number; testId: number; answerCount: number } | null>;
  createQuestion(testId: number, data: QuestionInput): Promise<void>;
  /** Memperbarui soal dan keempat opsinya di tempat (id opsi tetap) agar jawaban lama tetap valid. */
  updateQuestion(questionId: number, data: QuestionInput): Promise<boolean>;
  setQuestionActive(questionId: number, isActive: boolean): Promise<boolean>;
  /** Hanya bila belum ada jawaban peserta; selain itu false (gunakan nonaktifkan). */
  deleteQuestion(questionId: number): Promise<boolean>;
}
