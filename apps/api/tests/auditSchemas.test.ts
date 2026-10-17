import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANSWER_PROGRESS, ANSWER_RESULTS, FINDING_CLASSES, SESSION_STATUSES,
  createFindingSchema, saveAnswerSchema,
} from "../src/domain/auditSchemas.js";

const enumValues = (schema: string, name: string): string[] => {
  const m = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(schema);
  if (!m?.[1]) throw new Error(`enum ${name} tidak ditemukan di schema.prisma`);
  return m[1].split("\n").map((l) => l.trim()).filter(Boolean);
};

describe("enum kode sinkron dengan prisma/schema.prisma", () => {
  const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
  it.each([
    ["AnswerResult", ANSWER_RESULTS],
    ["AnswerProgress", ANSWER_PROGRESS],
    ["FindingClass", FINDING_CLASSES],
    ["SessionStatus", SESSION_STATUSES],
  ])("%s", (name, values) => {
    expect(enumValues(schema, name)).toEqual([...values]);
  });
});

describe("saveAnswerSchema", () => {
  const base = { itemId: 1, progress: "DALAM_PROSES" };
  it("menerima YA/TIDAK dan menolak nilai lain (mis. N/A)", () => {
    expect(saveAnswerSchema.safeParse({ ...base, result: "YA" }).success).toBe(true);
    expect(saveAnswerSchema.safeParse({ ...base, result: "TIDAK" }).success).toBe(true);
    expect(saveAnswerSchema.safeParse({ ...base, result: "NA" }).success).toBe(false);
    expect(saveAnswerSchema.safeParse({ ...base, result: "ya" }).success).toBe(false);
  });
  it("status tidak dikenal ditolak", () => {
    expect(saveAnswerSchema.safeParse({ itemId: 1, progress: "DONE" }).success).toBe(false);
  });
  it("SELESAI wajib punya hasil", () => {
    expect(saveAnswerSchema.safeParse({ itemId: 1, progress: "SELESAI" }).success).toBe(false);
    expect(saveAnswerSchema.safeParse({ itemId: 1, progress: "SELESAI", result: "YA" }).success).toBe(true);
  });
  it("BELUM_DIKERJAKAN tidak boleh punya hasil", () => {
    expect(saveAnswerSchema.safeParse({ itemId: 1, progress: "BELUM_DIKERJAKAN", result: "YA" }).success).toBe(false);
    expect(saveAnswerSchema.safeParse({ itemId: 1, progress: "BELUM_DIKERJAKAN" }).success).toBe(true);
  });
  it("tautan bukti: hanya https tanpa kredensial; kosong dianggap null", () => {
    const ok = saveAnswerSchema.parse({ ...base, evidenceUrl: "https://drive.example/bukti.pdf" });
    expect(ok.evidenceUrl).toBe("https://drive.example/bukti.pdf");
    expect(saveAnswerSchema.parse({ ...base, evidenceUrl: "  " }).evidenceUrl).toBeNull();
    for (const bad of ["http://x.example/a", "javascript:alert(1)", "https://user:pw@x.example/a", "bukan url"]) {
      expect(saveAnswerSchema.safeParse({ ...base, evidenceUrl: bad }).success, bad).toBe(false);
    }
  });
});

describe("createFindingSchema", () => {
  const base = { classification: "MINOR", problem: "p", location: "l", objectiveEvidence: "e", reference: "r" };
  it("menerima PLOR lengkap dan menolak klasifikasi di luar Major/Minor/Observasi", () => {
    expect(createFindingSchema.safeParse(base).success).toBe(true);
    expect(createFindingSchema.safeParse({ ...base, classification: "FATAL" }).success).toBe(false);
  });
  it.each(["problem", "location", "objectiveEvidence", "reference"])("%s wajib diisi", (field) => {
    expect(createFindingSchema.safeParse({ ...base, [field]: "  " }).success).toBe(false);
    const { [field as keyof typeof base]: _omit, ...rest } = base;
    expect(createFindingSchema.safeParse(rest).success).toBe(false);
  });
});
