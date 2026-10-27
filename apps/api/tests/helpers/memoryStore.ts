import {
  UniqueViolationError,
  type AnswerRecord,
  type AssignmentRecord,
  type AssignmentSummary,
  type AuditStore,
  type AuditorAccountCredential,
  type AuditorAccountRecord,
  type AuditorRecord,
  type AuthRecord,
  type ChecklistItemDetail,
  type ChecklistItemRecord,
  type ChecklistVersionRecord,
  type DepartmentRecord,
  type FindingCount,
  type FindingFollowUp,
  type FindingFollowUpRecord,
  type FindingHistoryRecord,
  type FindingRecord,
  type NewFinding,
  type SessionRecord,
  type StandardRecord,
} from "../../src/domain/auditStore.js";

type AccountRow = AuditorAccountRecord & { passwordHash: string };
type SessionRow = SessionRecord & { findingSeq: number };
type AnswerRow = AnswerRecord & { snapshot: Record<string, unknown> };

interface State {
  departments: DepartmentRecord[];
  standards: StandardRecord[];
  versions: ChecklistVersionRecord[];
  items: ChecklistItemRecord[];
  sessions: SessionRow[];
  accounts: AccountRow[];
  auditors: AuditorRecord[];
  exclusions: { auditorId: number; departmentId: number }[];
  assignments: AssignmentRecord[];
  answers: AnswerRow[];
  findings: FindingRecord[];
  history: FindingHistoryRecord[];
  seq: number;
}

/**
 * Penyimpanan in-memory yang meniru kontrak AuditStore, termasuk constraint unique,
 * filter per sesi, dan rollback transaksi. TIDAK dapat menguji konkurensi/kunci MySQL sungguhan.
 */
export class MemoryStore implements AuditStore {
  departments: DepartmentRecord[] = [];
  standards: StandardRecord[] = [];
  versions: ChecklistVersionRecord[] = [];
  items: ChecklistItemRecord[] = [];
  sessions: SessionRow[] = [];
  accounts: AccountRow[] = [];
  auditors: AuditorRecord[] = [];
  exclusions: { auditorId: number; departmentId: number }[] = [];
  assignments: AssignmentRecord[] = [];
  answers: AnswerRow[] = [];
  findings: FindingRecord[] = [];
  history: FindingHistoryRecord[] = [];
  private followUps = new Map<number, FindingFollowUp>();
  private seq = 1;

  private capture(): State {
    return structuredClone({
      departments: this.departments,
      standards: this.standards,
      versions: this.versions,
      items: this.items,
      sessions: this.sessions,
      accounts: this.accounts,
      auditors: this.auditors,
      exclusions: this.exclusions,
      assignments: this.assignments,
      answers: this.answers,
      findings: this.findings,
      history: this.history,
      seq: this.seq,
    });
  }

  private restore(s: State): void {
    this.departments = s.departments;
    this.standards = s.standards;
    this.versions = s.versions;
    this.items = s.items;
    this.sessions = s.sessions;
    this.accounts = s.accounts;
    this.auditors = s.auditors;
    this.exclusions = s.exclusions;
    this.assignments = s.assignments;
    this.answers = s.answers;
    this.findings = s.findings;
    this.history = s.history;
    this.seq = s.seq;
  }

  async transaction<T>(fn: (tx: AuditStore) => Promise<T>): Promise<T> {
    const before = this.capture();
    try {
      return await fn(this);
    } catch (err) {
      this.restore(before); // rollback seluruh perubahan
      throw err;
    }
  }

  // --- Master data ---
  async createDepartment(name: string): Promise<DepartmentRecord> {
    if (this.departments.some((d) => d.name === name)) throw new UniqueViolationError("name");
    const row = { id: this.seq++, name };
    this.departments.push(row);
    return row;
  }
  async departmentExists(id: number) { return this.departments.some((d) => d.id === id); }
  async listDepartments() { return [...this.departments]; }
  async createStandard(data: { code: string; name: string }): Promise<StandardRecord> {
    if (this.standards.some((s) => s.code === data.code)) throw new UniqueViolationError("code");
    const row = { id: this.seq++, ...data };
    this.standards.push(row);
    return row;
  }
  async standardExists(id: number) { return this.standards.some((s) => s.id === id); }

  // --- Versi dan item ---
  async createChecklistVersion(data: { standardId: number; versionLabel: string }): Promise<ChecklistVersionRecord> {
    if (this.versions.some((v) => v.standardId === data.standardId && v.versionLabel === data.versionLabel)) {
      throw new UniqueViolationError("standardId_versionLabel");
    }
    const row: ChecklistVersionRecord = { id: this.seq++, ...data, status: "DRAFT" };
    this.versions.push(row);
    return row;
  }
  async findChecklistVersion(id: number) { return this.versions.find((v) => v.id === id) ?? null; }
  async findLatestPublishedVersion() {
    return [...this.versions].filter((v) => v.status === "PUBLISHED").sort((a, b) => b.id - a.id)[0] ?? null;
  }
  async addChecklistItem(data: Omit<ChecklistItemRecord, "id">): Promise<ChecklistItemRecord | null> {
    const v = this.versions.find((x) => x.id === data.versionId);
    if (!v || v.status !== "DRAFT") return null;
    const row = { id: this.seq++, ...data };
    this.items.push(row);
    return row;
  }
  async countItemsInVersion(versionId: number) { return this.items.filter((i) => i.versionId === versionId).length; }
  async publishChecklistVersion(id: number, _now: Date) {
    const v = this.versions.find((x) => x.id === id);
    if (!v || v.status !== "DRAFT") return false;
    v.status = "PUBLISHED";
    return true;
  }
  async retireChecklistVersion(id: number, _now: Date) {
    const v = this.versions.find((x) => x.id === id);
    if (!v || v.status !== "PUBLISHED") return false;
    v.status = "RETIRED";
    return true;
  }
  async listItems(versionId: number, departmentId: number) {
    return this.items
      .filter((i) => i.versionId === versionId && i.departmentId === departmentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }
  async findItemDetail(versionId: number, itemId: number): Promise<ChecklistItemDetail | null> {
    const item = this.items.find((i) => i.id === itemId && i.versionId === versionId);
    if (!item) return null;
    const version = this.versions.find((v) => v.id === versionId);
    const standard = this.standards.find((s) => s.id === version?.standardId);
    const dept = this.departments.find((d) => d.id === item.departmentId);
    return {
      ...item,
      standardCode: standard?.code ?? "?",
      versionLabel: version?.versionLabel ?? "?",
      sopCode: null,
      sopTitle: null,
      departmentName: dept?.name ?? "?",
    };
  }
  async countChecklistItems(versionId: number, departmentId: number) {
    return this.items.filter((i) => i.versionId === versionId && i.departmentId === departmentId).length;
  }

  // --- Sesi ---
  async createSession(data: { title: string; checklistVersionId: number; expiresAt: Date }): Promise<SessionRecord> {
    const row: SessionRow = { id: this.seq++, ...data, status: "DRAFT", closedAt: null, auditorAccessUntil: null, findingSeq: 0 };
    this.sessions.push(row);
    return row;
  }
  async findSession(id: number) { return this.sessions.find((s) => s.id === id) ?? null; }
  async activateSession(id: number) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s || s.status !== "DRAFT") return false;
    s.status = "ACTIVE";
    return true;
  }
  async updateDraftSessionDeadline(id: number, to: Date) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s || s.status !== "DRAFT") return false;
    s.expiresAt = to;
    return true;
  }
  async extendSession(id: number, to: Date) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s || s.status !== "ACTIVE" || s.expiresAt.getTime() >= to.getTime()) return false;
    s.expiresAt = to;
    return true;
  }
  async closeSession(id: number, now: Date, auditorAccessUntil: Date | null) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s || s.status !== "ACTIVE") return false;
    s.status = "CLOSED";
    s.closedAt = now;
    s.auditorAccessUntil = auditorAccessUntil;
    return true;
  }
  async lockSessionForWrite(id: number, now: Date) {
    const s = this.sessions.find((x) => x.id === id);
    return !!s && s.status === "ACTIVE" && s.expiresAt.getTime() > now.getTime();
  }

  // --- Akun Auditor ---
  private publicAccount(r: AccountRow): AuditorAccountRecord {
    return { id: r.id, email: r.email, name: r.name, isActive: r.isActive };
  }
  async createAuditorAccount(d: { email: string; name: string; passwordHash: string }): Promise<AuditorAccountRecord> {
    if (this.accounts.some((a) => a.email === d.email)) throw new UniqueViolationError("email");
    const row: AccountRow = { id: this.seq++, ...d, isActive: true };
    this.accounts.push(row);
    return this.publicAccount(row);
  }
  async listAuditorAccounts() { return this.accounts.map((a) => this.publicAccount(a)); }
  async findAuditorAccount(id: number) {
    const r = this.accounts.find((a) => a.id === id);
    return r ? this.publicAccount(r) : null;
  }
  async findAuditorCredentialByEmail(email: string): Promise<AuditorAccountCredential | null> {
    const r = this.accounts.find((a) => a.email === email);
    return r ? { ...this.publicAccount(r), passwordHash: r.passwordHash } : null;
  }
  async setAuditorAccountActive(id: number, isActive: boolean) {
    const r = this.accounts.find((a) => a.id === id);
    if (!r) return false;
    r.isActive = isActive;
    return true;
  }
  async setAuditorAccountPassword(id: number, passwordHash: string) {
    const r = this.accounts.find((a) => a.id === id);
    if (!r) return false;
    r.passwordHash = passwordHash;
    return true;
  }

  // --- Auditor pada sesi ---
  async createAuditor(d: {
    sessionId: number;
    accountId: number;
    name: string;
    excludedDepartmentIds: number[];
  }): Promise<AuditorRecord> {
    if (this.auditors.some((a) => a.sessionId === d.sessionId && a.accountId === d.accountId)) {
      throw new UniqueViolationError("sessionId_accountId");
    }
    const { excludedDepartmentIds, ...rest } = d;
    const row: AuditorRecord = { id: this.seq++, ...rest, revokedAt: null };
    this.auditors.push(row);
    for (const departmentId of excludedDepartmentIds) this.exclusions.push({ auditorId: row.id, departmentId });
    return { ...row };
  }
  async findAuditor(sessionId: number, auditorId: number) {
    const r = this.auditors.find((a) => a.id === auditorId && a.sessionId === sessionId);
    return r ? { ...r } : null;
  }
  async findAuditorBySessionAccount(sessionId: number, accountId: number) {
    const r = this.auditors.find((a) => a.sessionId === sessionId && a.accountId === accountId);
    return r ? { ...r } : null;
  }
  async listMembershipsForAccount(accountId: number): Promise<AuthRecord[]> {
    const out: AuthRecord[] = [];
    for (const a of this.auditors.filter((x) => x.accountId === accountId && x.revokedAt === null)) {
      const session = this.sessions.find((s) => s.id === a.sessionId);
      if (session) out.push({ auditor: { ...a }, session });
    }
    return out;
  }
  async revokeAuditor(id: number, now: Date) {
    const a = this.auditors.find((x) => x.id === id);
    if (a) a.revokedAt = now;
  }
  async restoreAuditor(id: number) {
    const a = this.auditors.find((x) => x.id === id);
    if (a) a.revokedAt = null;
  }
  async linkAuditorAccount(id: number, accountId: number) {
    const a = this.auditors.find((x) => x.id === id);
    if (!a || a.accountId !== null) return false;
    if (this.auditors.some((x) => x.sessionId === a.sessionId && x.accountId === accountId)) {
      throw new UniqueViolationError("sessionId_accountId");
    }
    a.accountId = accountId;
    return true;
  }
  async listExclusions(auditorId: number) {
    return this.exclusions.filter((e) => e.auditorId === auditorId).map((e) => e.departmentId);
  }

  // --- Penugasan ---
  async createAssignment(d: { sessionId: number; auditorId: number; departmentId: number }): Promise<AssignmentRecord> {
    if (this.assignments.some((a) => a.sessionId === d.sessionId && a.auditorId === d.auditorId && a.departmentId === d.departmentId)) {
      throw new UniqueViolationError("sessionId_auditorId_departmentId");
    }
    const row = { id: this.seq++, ...d };
    this.assignments.push(row);
    return row;
  }
  async findAssignmentByTarget(sessionId: number, auditorId: number, departmentId: number) {
    return this.assignments.find((a) => a.sessionId === sessionId && a.auditorId === auditorId && a.departmentId === departmentId) ?? null;
  }
  async findAssignment(sessionId: number, id: number) {
    return this.assignments.find((a) => a.id === id && a.sessionId === sessionId) ?? null;
  }
  async listAssignments(sessionId: number, auditorId: number): Promise<AssignmentSummary[]> {
    return this.assignments
      .filter((a) => a.sessionId === sessionId && a.auditorId === auditorId)
      .map((a) => ({ ...a, departmentName: this.departments.find((d) => d.id === a.departmentId)?.name ?? "?" }));
  }

  // --- Jawaban ---
  async listAnswers(assignmentId: number): Promise<AnswerRecord[]> {
    return this.answers.filter((a) => a.assignmentId === assignmentId);
  }
  async upsertAnswer(d: {
    assignmentId: number;
    itemId: number;
    departmentId: number;
    result: AnswerRecord["result"];
    note: string | null;
    evidenceUrl: string | null;
    snapshot: Record<string, unknown>;
  }): Promise<AnswerRecord> {
    const existing = this.answers.find((a) => a.assignmentId === d.assignmentId && a.itemId === d.itemId);
    if (existing) {
      existing.result = d.result;
      existing.note = d.note;
      existing.evidenceUrl = d.evidenceUrl; // snapshot sengaja tidak diubah
      return existing;
    }
    const row: AnswerRow = { id: this.seq++, ...d };
    this.answers.push(row);
    return row;
  }
  async findAnswerInAssignment(assignmentId: number, answerId: number) {
    return this.answers.find((a) => a.id === answerId && a.assignmentId === assignmentId) ?? null;
  }
  async countAnswersByResult(assignmentId: number) {
    const mine = this.answers.filter((a) => a.assignmentId === assignmentId);
    return { YA: mine.filter((a) => a.result === "YA").length, TIDAK: mine.filter((a) => a.result === "TIDAK").length };
  }

  // --- Temuan ---
  async findFindingByRequest(assignmentId: number, clientRequestId: string) {
    return this.findings.find((f) => f.assignmentId === assignmentId && f.clientRequestId === clientRequestId) ?? null;
  }
  async bumpFindingSeq(sessionId: number, now: Date) {
    const s = this.sessions.find((x) => x.id === sessionId);
    if (!s || s.status !== "ACTIVE" || s.expiresAt.getTime() <= now.getTime()) return null;
    s.findingSeq += 1;
    return s.findingSeq;
  }
  async createFinding(data: NewFinding): Promise<FindingRecord> {
    if (this.findings.some((f) => f.assignmentId === data.assignmentId && f.clientRequestId === data.clientRequestId)) {
      throw new UniqueViolationError("assignmentId_clientRequestId");
    }
    if (this.findings.some((f) => f.sessionId === data.sessionId && f.seq === data.seq)) {
      throw new UniqueViolationError("sessionId_seq");
    }
    const { createdByAuditorId, ...rest } = data;
    const row: FindingRecord = { id: this.seq++, ...rest, status: "OPEN", closedAt: null };
    this.findings.push(row);
    this.history.push({
      id: this.seq++,
      findingId: row.id,
      fromStatus: null,
      toStatus: "OPEN",
      changedByAuditorId: createdByAuditorId,
      note: null,
      createdAt: new Date(),
    });
    return row;
  }
  async listFindings(assignmentId: number) {
    return this.findings.filter((f) => f.assignmentId === assignmentId).sort((a, b) => a.seq - b.seq);
  }
  async findFindingOwned(sessionId: number, auditorId: number, findingId: number) {
    const f = this.findings.find((x) => x.id === findingId && x.sessionId === sessionId);
    if (!f) return null;
    const a = this.assignments.find((x) => x.id === f.assignmentId);
    return a && a.auditorId === auditorId ? f : null;
  }
  async closeFinding(findingId: number, auditorId: number, note: string | null, now: Date) {
    const f = this.findings.find((x) => x.id === findingId);
    if (!f || f.status !== "OPEN") return false;
    f.status = "CLOSED";
    f.closedAt = now;
    this.history.push({
      id: this.seq++,
      findingId,
      fromStatus: "OPEN",
      toStatus: "CLOSED",
      changedByAuditorId: auditorId,
      note,
      createdAt: now,
    });
    return true;
  }
  async listFindingHistory(findingId: number) {
    return this.history.filter((h) => h.findingId === findingId);
  }
  async countFindings(assignmentId: number): Promise<FindingCount[]> {
    const map = new Map<string, FindingCount>();
    for (const f of this.findings.filter((x) => x.assignmentId === assignmentId)) {
      const key = `${f.classification}|${f.status}`;
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { classification: f.classification, status: f.status, count: 1 });
    }
    return [...map.values()];
  }

  async saveFindingFollowUp(findingId: number, data: FindingFollowUp) {
    this.followUps.set(findingId, { ...data });
  }
  async listFindingFollowUps(assignmentId: number): Promise<FindingFollowUpRecord[]> {
    const empty: FindingFollowUp = {
      rootCause: null,
      correction: null,
      correctionPic: null,
      correctionTarget: null,
      correctiveAction: null,
      correctiveActionPic: null,
      correctiveActionTarget: null,
      improvementAction: null,
      improvementPic: null,
      improvementTarget: null,
    };
    return this.findings
      .filter((f) => f.assignmentId === assignmentId)
      .sort((a, b) => a.seq - b.seq)
      .map((f) => ({ findingId: f.id, ...(this.followUps.get(f.id) ?? empty) }));
  }
}
