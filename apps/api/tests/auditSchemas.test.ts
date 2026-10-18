import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANSWER_RESULTS,
  CHECKLIST_VERSION_STATUSES,
  FINDING_CLASSES,
  FINDING_STATUSES,
  SESSION_STATUSES,
  closeSessionSchema,
  createAuditorSchema,
  createFindingSchema,
  saveAnswerSchema,
} from "../src/domain/auditSchemas.js";
import { findingPayloadHash } from "../src/domain/payloadHash.js";

// Project ini CommonJS (tanpa "type": "module"), jadi import.meta tidak boleh dipakai.
// __dirname tersedia di CJS (tsc) dan disuplai oleh vitest; resolve() menangani separator Windows.
const schemaPath = resolve(__dirname, "..", "prisma", "schema.prisma");
const schemaText = readFileSync(schemaPath, "utf8");

function enumValues(name: string): string[] {
  const m = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(schemaText);
  if (!m?.[1]) throw new Error(`enum ${name} tidak ditemukan di schema.prisma`);
  return m[1].split(/\s+/).filter(Boolean);
}

describe("enum domain identik dengan schema.prisma", () => {
  it.each([
    ["AnswerResult", ANSWER_RESULTS],
    ["FindingClass", FINDING_CLASSES],
    ["FindingStatus", FINDING_STATUSES],
    ["SessionStatus", SESSION_STATUSES],
    ["ChecklistVersionStatus", CHECKLIST_VERSION_STATUSES],
  ] as const)("%s", (name, values) => {
    expect(enumValues(name)).toEqual([...values]);
  });

  it("jawaban hanya YA dan TIDAK (tanpa N/A)", () => {
    expect([...ANSWER_RESULTS]).toEqual(["YA", "TIDAK"]);
  });
});

describe("saveAnswerSchema", () => {
  it("menerima YA, TIDAK, dan null/kosong (belum dijawab)", () => {
    expect(saveAnswerSchema.parse({ result: "YA" }).result).toBe("YA");
    expect(saveAnswerSchema.parse({ result: "TIDAK" }).result).toBe("TIDAK");
    expect(saveAnswerSchema.parse({ result: null }).result).toBeNull();
    expect(saveAnswerSchema.parse({}).result).toBeNull();
  });
  it("menolak N/A dan nilai lain", () => {
    expect(saveAnswerSchema.safeParse({ result: "N/A" }).success).toBe(false);
    expect(saveAnswerSchema.safeParse({ result: "ya" }).success).toBe(false);
  });
  it("tautan bukti hanya https tanpa kredensial; kosong dianggap tidak ada", () => {
    expect(saveAnswerSchema.safeParse({ evidenceUrl: "http://x.test/a" }).success).toBe(false);
    expect(saveAnswerSchema.safeParse({ evidenceUrl: "https://u:p@x.test/a" }).success).toBe(false);
    expect(saveAnswerSchema.safeParse({ evidenceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(saveAnswerSchema.parse({ evidenceUrl: "" }).evidenceUrl).toBeNull();
    expect(saveAnswerSchema.parse({ evidenceUrl: "https://x.test/a" }).evidenceUrl).toBe("https://x.test/a");
  });
});

const validFinding = {
  clientRequestId: "req-00000001",
  classification: "MAJOR",
  problem: "p",
  location: "l",
  objectiveEvidence: "o",
  reference: "r",
};

describe("createFindingSchema", () => {
  it("menerima temuan lengkap dan menormalkan opsional menjadi null", () => {
    const r = createFindingSchema.parse(validFinding);
    expect(r.answerId).toBeNull();
    expect(r.note).toBeNull();
    expect(r.evidenceUrl).toBeNull();
  });
  it("menolak clientRequestId pendek atau berkarakter aneh, dan klasifikasi tak dikenal", () => {
    expect(createFindingSchema.safeParse({ ...validFinding, clientRequestId: "short" }).success).toBe(false);
    expect(createFindingSchema.safeParse({ ...validFinding, clientRequestId: "bad id with spaces" }).success).toBe(false);
    expect(createFindingSchema.safeParse({ ...validFinding, classification: "FATAL" }).success).toBe(false);
  });
  it("menolak PLOR kosong", () => {
    expect(createFindingSchema.safeParse({ ...validFinding, problem: "   " }).success).toBe(false);
  });
});

describe("findingPayloadHash", () => {
  const base = createFindingSchema.parse(validFinding);
  it("deterministik dan tidak bergantung pada clientRequestId", () => {
    const other = createFindingSchema.parse({ ...validFinding, clientRequestId: "req-99999999" });
    expect(findingPayloadHash(base)).toBe(findingPayloadHash(other));
    expect(findingPayloadHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("berubah bila isi berubah", () => {
    const changed = createFindingSchema.parse({ ...validFinding, problem: "lain" });
    expect(findingPayloadHash(base)).not.toBe(findingPayloadHash(changed));
  });
});

describe("closeSessionSchema dan createAuditorSchema (pilihan eksplisit)", () => {
  it("penutupan wajib memilih tepat satu: accessUntil atau noAccess", () => {
    expect(closeSessionSchema.safeParse({ sessionId: 1 }).success).toBe(false);
    expect(closeSessionSchema.safeParse({ sessionId: 1, noAccess: true, accessUntil: "2030-01-01" }).success).toBe(false);
    expect(closeSessionSchema.safeParse({ sessionId: 1, noAccess: true }).success).toBe(true);
    expect(closeSessionSchema.safeParse({ sessionId: 1, accessUntil: "2030-01-01" }).success).toBe(true);
  });
  it("undangan wajib menyatakan pengecualian: daftar unit atau noExclusions", () => {
    expect(createAuditorSchema.safeParse({ sessionId: 1, name: "A" }).success).toBe(false);
    expect(createAuditorSchema.safeParse({ sessionId: 1, name: "A", noExclusions: true, excludeDepartmentIds: [2] }).success).toBe(false);
    expect(createAuditorSchema.safeParse({ sessionId: 1, name: "A", noExclusions: true }).success).toBe(true);
    expect(createAuditorSchema.safeParse({ sessionId: 1, name: "A", excludeDepartmentIds: [2] }).success).toBe(true);
  });
});
