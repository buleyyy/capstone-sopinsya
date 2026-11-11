import { z } from "zod";
import { AppError } from "../utils/errors.js";
import { LOCAL_EVIDENCE_PATH } from "./evidenceFile.js";

// Harus identik dengan enum di prisma/schema.prisma (dijaga oleh tests/auditSchemas.test.ts).
export const ANSWER_RESULTS = ["YA", "TIDAK"] as const;
export const FINDING_CLASSES = ["MAJOR", "MINOR", "OBSERVASI"] as const;
export const FINDING_STATUSES = ["OPEN", "CLOSED"] as const;
export const SESSION_STATUSES = ["DRAFT", "ACTIVE", "CLOSED"] as const;
export const CHECKLIST_VERSION_STATUSES = ["DRAFT", "PUBLISHED", "RETIRED"] as const;

export type AnswerResult = (typeof ANSWER_RESULTS)[number];
export type FindingClass = (typeof FINDING_CLASSES)[number];
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type ChecklistVersionStatus = (typeof CHECKLIST_VERSION_STATUSES)[number];

const id = z.number().int().positive();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const idSchema = id;

/**
 * Tautan bukti: URL https tanpa kredensial, atau tautan lokal ke berkas yang diunggah (/auditor/bukti/<id>/<nama>).
 * Kosong dianggap tidak ada.
 */
const evidenceUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .max(1024)
    .refine((v) => {
      if (LOCAL_EVIDENCE_PATH.test(v)) return true;
      try {
        const u = new URL(v);
        return u.protocol === "https:" && u.username === "" && u.password === "";
      } catch {
        return false;
      }
    }, "Tautan bukti harus berupa URL https:// tanpa kredensial, atau berkas yang diunggah")
    .nullish()
    .transform((v) => v ?? null),
);

/** Tanggal formulir YYYY-MM-DD (input type=date). Kosong dianggap tidak ada. */
const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat TTTT-BB-HH")
    .refine((v) => {
      // Round-trip: V8 menggeser tanggal seperti 2026-02-31 menjadi 2026-03-03, jadi hasilnya harus sama dengan input.
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "Tanggal tidak valid")
    .nullish()
    .transform((v) => v ?? null),
);

// ---------- Auditor ----------

export const claimSchema = z.object({ token: z.string().trim().min(32).max(128) });

/** Jawaban: hanya YA, TIDAK, atau null (belum dijawab). */
export const saveAnswerSchema = z.object({
  result: z.enum(ANSWER_RESULTS).nullish().transform((v) => v ?? null),
  note: optionalText(4000),
  evidenceUrl,
});

export const createFindingSchema = z.object({
  clientRequestId: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Hanya huruf, angka, '-' dan '_'"),
  answerId: id.nullish().transform((v) => v ?? null),
  classification: z.enum(FINDING_CLASSES),
  problem: text(4000),
  location: text(1000),
  objectiveEvidence: text(4000),
  reference: text(1000),
  note: optionalText(4000),
  evidenceUrl,
});

export const closeFindingSchema = z.object({ note: optionalText(2000) });

/**
 * Tindak lanjut temuan. Aturan kategori ditegakkan service: Major/Minor memakai akar penyebab, koreksi, dan
 * tindakan korektif; Observasi hanya tindakan peningkatan.
 */
export const followUpSchema = z.object({
  rootCause: optionalText(4000),
  correction: optionalText(4000),
  correctionPic: optionalText(160),
  correctionTarget: optionalText(80),
  correctiveAction: optionalText(4000),
  correctiveActionPic: optionalText(160),
  correctiveActionTarget: optionalText(80),
  improvementAction: optionalText(4000),
  improvementPic: optionalText(160),
  improvementTarget: optionalText(80),
  improvementEvidenceUrl: evidenceUrl,
  auditeeName: optionalText(160),
  reportedDate: optionalDate,
  followedUpDate: optionalDate,
  verifiedDate: optionalDate,
  verifierName: optionalText(160),
  verificationResult: optionalText(4000),
  correctionEvidenceUrl: evidenceUrl,
  correctiveActionEvidenceUrl: evidenceUrl,
});

/** Header formulir Laporan Ketidaksesuaian dan Tindakan Korektif (Auditor boleh mengubah). */
export const documentHeaderSchema = z.object({
  organization: text(160),
  subtitle: text(200),
  formTitle: text(200),
  formCode: text(40),
  revision: text(40),
  issuedAt: z.string().trim().max(40).default(""),
});

// ---------- Admin ----------

export const createStandardSchema = z.object({
  code: text(40).transform((v) => v.toUpperCase()),
  name: text(160),
});

export const createDepartmentSchema = z.object({ name: text(120) });

export const createVersionSchema = z.object({ standardId: id, versionLabel: text(40) });

export const addItemSchema = z.object({
  versionId: id,
  departmentId: id,
  sopId: id.nullish().transform((v) => v ?? null),
  criteria: text(4000),
  reference: optionalText(255),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

export const versionRefSchema = z.object({ versionId: id });

export const createSessionSchema = z.object({
  title: text(160),
  // OPSIONAL: sesi tidak lagi wajib memakai Master Checklist.
  checklistVersionId: id.nullish().transform((v) => v ?? null),
  expiresAt: z.coerce.date(),
});

export const sessionRefSchema = z.object({ sessionId: id });

export const extendSessionSchema = z.object({ sessionId: id, to: z.coerce.date() });

/** Penutupan sesi wajib memilih salah satu: --access-until <tanggal> atau --no-access. */
export const closeSessionSchema = z
  .object({
    sessionId: id,
    accessUntil: z.coerce.date().optional(),
    noAccess: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const hasDate = v.accessUntil !== undefined;
    const noAccess = v.noAccess === true;
    if (hasDate === noAccess) {
      ctx.addIssue({
        code: "custom",
        path: ["accessUntil"],
        message: "Tentukan tepat satu: accessUntil (tanggal) atau noAccess",
      });
    }
  });

/** Pengecualian self-audit wajib dinyatakan eksplisit: daftar unit, atau noExclusions. */
export const createAuditorSchema = z
  .object({
    sessionId: id,
    name: text(120),
    excludeDepartmentIds: z.array(id).max(50).default([]),
    noExclusions: z.boolean().default(false),
    inviteTtlHours: z.number().int().min(1).max(24 * 30).default(168),
  })
  .superRefine((v, ctx) => {
    const hasList = v.excludeDepartmentIds.length > 0;
    if (hasList === v.noExclusions) {
      ctx.addIssue({
        code: "custom",
        path: ["excludeDepartmentIds"],
        message: "Tentukan tepat satu: daftar unit terlarang (excludeDepartmentIds) atau noExclusions",
      });
    }
  });

export const auditorRefSchema = z.object({
  sessionId: id,
  auditorId: id,
  inviteTtlHours: z.number().int().min(1).max(24 * 30).default(168),
});

export const createAssignmentSchema = z.object({ sessionId: id, auditorId: id, departmentId: id });

// ---------- Akun (autentikasi internal) ----------

export const USER_ROLES = ["ADMIN", "AUDITOR"] as const;
export type UserRoleName = (typeof USER_ROLES)[number];

const accountEmail = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Email terlalu pendek")
  .max(160)
  .regex(/^[^\s@]+@[^\s@]+$/, "Format email tidak valid");

/** bcrypt hanya memakai 72 byte pertama, sehingga batas atas dinyatakan dalam byte. */
export const passwordSchema = z
  .string()
  .min(10, "Kata sandi minimal 10 karakter")
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Kata sandi maksimal 72 byte");

/** Kosong = dibuatkan otomatis oleh sistem. */
const optionalPassword = z.preprocess((v) => (typeof v === "string" && v === "" ? undefined : v), passwordSchema.optional());

export const createAccountSchema = z.object({ email: accountEmail, name: text(120), password: optionalPassword });
export const updateAccountSchema = z.object({ accountId: id, email: accountEmail, name: text(120) });
export const accountRefSchema = z.object({ accountId: id });
export const setAccountActiveSchema = z.object({ accountId: id, isActive: z.boolean() });
export const resetPasswordSchema = z.object({ accountId: id, password: optionalPassword });
export const bootstrapAdminSchema = z.object({
  email: accountEmail,
  name: text(120).default("Administrator"),
  password: z.string().min(12, "Kata sandi Admin awal minimal 12 karakter").refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Kata sandi maksimal 72 byte"),
});

/** Penugasan akun Auditor ke sesi; pengecualian self-audit tetap wajib dinyatakan eksplisit. */
export const assignAccountSchema = z
  .object({
    sessionId: id,
    accountId: id,
    excludeDepartmentIds: z.array(id).max(50).default([]),
    noExclusions: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const hasList = v.excludeDepartmentIds.length > 0;
    if (hasList === v.noExclusions) {
      ctx.addIssue({
        code: "custom",
        path: ["excludeDepartmentIds"],
        message: "Tentukan tepat satu: daftar unit terlarang (excludeDepartmentIds) atau noExclusions",
      });
    }
  });

export type ClaimInput = z.output<typeof claimSchema>;
export type SaveAnswerInput = z.output<typeof saveAnswerSchema>;
export type CreateFindingInput = z.output<typeof createFindingSchema>;
export type CloseFindingInput = z.output<typeof closeFindingSchema>;
export type FollowUpInput = z.output<typeof followUpSchema>;

/** Mem-parse input; kegagalan menjadi AppError 422 dengan daftar masalah per field. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw new AppError(
    422,
    "VALIDATION_ERROR",
    "Input tidak valid",
    r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}
