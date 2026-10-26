import { z } from "zod";
import path from "node:path";
import { config } from "dotenv";

// apps/api/src/config -> naik dua level ke apps/api/.env
config({ path: path.resolve(__dirname, "../../.env") });

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    // Opsional di Fase 1: API tetap boleh berjalan tanpa database.
    DATABASE_URL: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .refine((v) => v.startsWith("mysql://"), "DATABASE_URL harus berformat mysql://")
        .optional(),
    ),
    // Origin aplikasi (Express melayani EJS pada satu origin). Dipakai pemeriksaan Origin/CSRF.
    APP_ORIGIN: z.preprocess(emptyToUndefined, z.string().url().optional()),
    // Rahasia penurunan token CSRF. Wajib (>= 32 karakter) di production; jangan pernah di-commit.
    CSRF_SECRET: z.preprocess(emptyToUndefined, z.string().min(32, "CSRF_SECRET minimal 32 karakter").optional()),
    // Kata sandi Admin untuk halaman /admin (satu akun untuk UAT). Kosong = halaman Admin dinonaktifkan.
    ADMIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(8, "ADMIN_PASSWORD minimal 8 karakter").optional()),
    // Kata sandi bersama untuk role Auditor; email role bawaan auditor@sopinsya.
    AUDITOR_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(8, "AUDITOR_PASSWORD minimal 8 karakter").optional()),
    ADMIN_LOGIN_EMAIL: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().min(3).max(120).optional()),
    // Email role Auditor (bawaan: auditor@sopinsya).
    AUDITOR_LOGIN_EMAIL: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().min(3).max(120).optional()),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === "production") {
      if (!v.CSRF_SECRET) ctx.addIssue({ code: "custom", path: ["CSRF_SECRET"], message: "CSRF_SECRET wajib di production" });
      if (!v.APP_ORIGIN) ctx.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "APP_ORIGIN wajib di production" });
      if (v.ADMIN_PASSWORD && v.ADMIN_PASSWORD.length < 12) {
        ctx.addIssue({ code: "custom", path: ["ADMIN_PASSWORD"], message: "ADMIN_PASSWORD minimal 12 karakter di production" });
      }
      if (v.AUDITOR_PASSWORD && v.AUDITOR_PASSWORD.length < 12) {
        ctx.addIssue({ code: "custom", path: ["AUDITOR_PASSWORD"], message: "AUDITOR_PASSWORD minimal 12 karakter di production" });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Memvalidasi variabel environment. Pesan error tidak memuat nilai (agar kredensial tidak bocor ke log). */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Konfigurasi environment tidak valid:\n${issues}`);
  }
  return result.data;
}
