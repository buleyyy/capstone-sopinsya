import { z } from "zod";

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
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === "production") {
      if (!v.CSRF_SECRET) ctx.addIssue({ code: "custom", path: ["CSRF_SECRET"], message: "CSRF_SECRET wajib di production" });
      if (!v.APP_ORIGIN) ctx.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "APP_ORIGIN wajib di production" });
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
