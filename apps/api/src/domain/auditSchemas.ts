import { z } from "zod";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../lib/passwords.js";
import { AppError } from "../utils/errors.js";

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

/** Tautan bukti: hanya https dan tanpa kredensial di dalam URL. Kosong dianggap tidak ada. */
const evidenceUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .max(1024)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === "https:" && u.username === "" && u.password === "";
      } catch {
        return false;
      }
    }, "Tautan bukti harus berupa URL https:// tanpa kredensial")
    .nullish()
    .transform((v) => v ?? null),
);

// ---------- Auditor ----------

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
  checklistVersionId: id,
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

const accountPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter`)
  .max(MAX_PASSWORD_LENGTH, `Kata sandi maksimal ${MAX_PASSWORD_LENGTH} karakter`);

/** Akun Auditor (email + kata sandi) dibuat Admin. Email disimpan huruf kecil dan menjadi identitas login. */
export const createAuditorAccountSchema = z.object({
  name: text(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(160)
    .regex(/^[^\s@]+@[^\s@]+$/, "Email tidak valid"),
  password: accountPassword,
});

export const setAuditorAccountActiveSchema = z.object({ accountId: id, isActive: z.boolean() });

export const resetAuditorPasswordSchema = z.object({ accountId: id, password: accountPassword });

/** Pengecualian self-audit wajib dinyatakan eksplisit: daftar unit, atau noExclusions. */
export const addAuditorToSessionSchema = z
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

export const auditorRefSchema = z.object({ sessionId: id, auditorId: id });

/** Mengaitkan akun ke keanggotaan auditor lama (data sebelum akun individual) yang belum punya akun. */
export const linkAuditorAccountSchema = z.object({ sessionId: id, auditorId: id, accountId: id });

export const createAssignmentSchema = z.object({ sessionId: id, auditorId: id, departmentId: id });

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
