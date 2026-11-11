import { describe, expect, it } from "vitest";
import { parseQuestionLines, slugify } from "../../web/admin/programRoutes.js";

describe("Impor soal Kelola Konten Program", () => {
  it("membaca baris dipisah | maupun TAB dan menandai kunci", () => {
    const out = parseQuestionLines("Apa tujuan ISO 37001? | Cegah suap | Keuangan | SDM | Pajak | a\nSoal dua\tYa\tTidak\tB");
    expect(out).toHaveLength(2);
    expect(out[0]!.options.filter((o) => o.isCorrect).map((o) => o.label)).toEqual(["A"]);
    expect(out[1]!.options.map((o) => o.label)).toEqual(["A", "B"]);
    expect(out[1]!.options.find((o) => o.isCorrect)?.text).toBe("Tidak");
  });

  it("menolak seluruh impor bila satu baris tidak valid", () => {
    expect(() => parseQuestionLines("Soal | A saja | A")).toThrow(/baris 1/);
    expect(() => parseQuestionLines("Soal | Ya | Tidak | D")).toThrow(/kunci "D"/);
    expect(() => parseQuestionLines("   \n  ")).toThrow(/kosong/);
  });

  it("membuat slug dari nama program", () => {
    expect(slugify("ISO 37001:2025")).toBe("iso-37001-2025");
    expect(slugify("  Sistem Manajemen Mutu! ")).toBe("sistem-manajemen-mutu");
  });
});
