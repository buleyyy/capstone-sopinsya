import { percent } from "./helpers.js";

/** Bentuk minimum baris register yang dibutuhkan ringkasan (dipenuhi RegisterRow Auditor dan AuditRegisterRow Admin). */
export interface RegisterLike {
  finding: { classification: string; status: string };
  followUp: { auditeeName: string | null };
}

/** Ringkasan register untuk kartu statistik Dashboard Audit (dipakai Auditor dan Admin agar angkanya selalu sama). */
export function registerStats(rows: RegisterLike[]) {
  const count = (c: string) => rows.filter((r) => r.finding.classification === c).length;
  const closed = rows.filter((r) => r.finding.status === "CLOSED").length;
  const auditees = [...new Set(rows.map((r) => r.followUp.auditeeName).filter((n): n is string => !!n))];
  return {
    total: rows.length,
    major: count("MAJOR"),
    minor: count("MINOR"),
    observasi: count("OBSERVASI"),
    open: rows.length - closed,
    closed,
    closedPct: percent(closed, rows.length),
    auditees,
  };
}
