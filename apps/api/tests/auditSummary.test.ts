import { describe, expect, it } from "vitest";
import { registerStats } from "../../web/shared/auditSummary.js";

const row = (classification: string, status: string, auditeeName: string | null = null) => ({
  finding: { classification, status },
  followUp: { auditeeName },
});

describe("registerStats (ringkasan Dashboard Audit Auditor/Admin)", () => {
  it("register kosong menghasilkan nol dan 0% selesai", () => {
    expect(registerStats([])).toEqual({
      total: 0, major: 0, minor: 0, observasi: 0, open: 0, closed: 0, closedPct: 0, auditees: [],
    });
  });

  it("menghitung kategori, status, persentase selesai, dan auditi unik", () => {
    const s = registerStats([
      row("OBSERVASI", "CLOSED", "Astari"),
      row("MINOR", "CLOSED", "Astari"),
      row("MINOR", "OPEN", "Rafi"),
      row("MAJOR", "OPEN"),
    ]);
    expect(s).toMatchObject({ total: 4, major: 1, minor: 2, observasi: 1, closed: 2, open: 2, closedPct: 50 });
    expect(s.auditees).toEqual(["Astari", "Rafi"]);
  });
});
