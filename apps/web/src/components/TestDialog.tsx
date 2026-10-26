"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Dialog } from "./Dialog";
import { CloseIcon } from "./Icons";
import {
  loadTest,
  newRequestId,
  readSavedParticipant,
  saveParticipant,
  submitAttempt,
  type AttemptResult,
  type TestLoad,
} from "@/lib/participantTest";

type Phase = "identity" | "working" | "done";

/**
 * Pre-test / Post-test dikerjakan langsung di website (bukan Google Form).
 * Soal diambil dari API tanpa kunci jawaban; penilaian dilakukan server saat "Selesai".
 */
export function TestDialog({
  kind,
  programTitle,
  programSlug,
  meetingId,
  onClose,
}: {
  kind: "Pre-test" | "Post-test";
  programTitle: string;
  programSlug: string;
  meetingId: number;
  onClose: () => void;
}) {
  const uid = useId();
  const titleId = `${uid}-title`;

  const [load, setLoad] = useState<TestLoad | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [phase, setPhase] = useState<Phase>("identity");
  const [name, setName] = useState(() => readSavedParticipant()?.participantName ?? "");
  const [institution, setInstitution] = useState(() => readSavedParticipant()?.participantInstitution ?? "");
  const [formError, setFormError] = useState("");

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [requestId, setRequestId] = useState(() => newRequestId());

  useEffect(() => {
    let cancelled = false;
    loadTest(programSlug, meetingId, kind).then((r) => {
      if (!cancelled) setLoad(r);
    });
    return () => {
      cancelled = true;
    };
  }, [programSlug, meetingId, kind, reloadKey]);

  const test = load?.status === "ok" ? load.test : null;
  const total = test?.questions.length ?? 0;
  const answered = test ? test.questions.filter((q) => answers[q.id] !== undefined).length : 0;
  const blanks = total - answered;
  const resultByQuestion = useMemo(() => new Map(result?.results.map((r) => [r.questionId, r]) ?? []), [result]);

  function startTest(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const i = institution.trim();
    if (!n || !i) {
      setFormError("Nama dan instansi wajib diisi.");
      return;
    }
    setFormError("");
    setName(n);
    setInstitution(i);
    saveParticipant({ participantName: n, participantInstitution: i });
    setPhase("working");
  }

  function reset() {
    setAnswers({});
    setConfirmBlank(false);
    setSubmitError("");
  }

  function choose(questionId: number, optionId: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    setConfirmBlank(false);
  }

  function finish() {
    if (blanks > 0 && !confirmBlank) {
      setConfirmBlank(true);
      return;
    }
    void submit();
  }

  async function submit() {
    if (!test || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const outcome = await submitAttempt(test.id, {
      participantName: name.trim(),
      participantInstitution: institution.trim(),
      clientRequestId: requestId,
      answers: test.questions.map((q) => ({ questionId: q.id, optionId: answers[q.id] ?? null })),
    });
    setSubmitting(false);
    setConfirmBlank(false);
    if (outcome.status === "ok") {
      setResult(outcome.result);
      setPhase("done");
    } else {
      setSubmitError(outcome.message);
    }
  }

  function again() {
    setRequestId(newRequestId());
    setAnswers({});
    setResult(null);
    setConfirmBlank(false);
    setSubmitError("");
    setPhase("working");
  }

  const subtitle =
    phase === "done" && result ? (
      <>
        Anda berhasil menjawab <strong>{result.correctCount}</strong> dari {result.totalQuestions} pertanyaan dengan benar
      </>
    ) : !test ? null : phase === "identity" ? (
      "Isi data diri untuk memulai"
    ) : (
      "Selamat mengerjakan"
    );

  return (
    <Dialog labelledBy={titleId} onClose={onClose} className={`dlg-test${test && phase !== "identity" ? " dlg-tall" : ""}`}>
      <div className="dlg-head">
        <div>
          <h2 id={titleId}>{kind}</h2>
          <p className="dlg-sub" aria-live="polite">
            {subtitle}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
          <CloseIcon />
        </button>
      </div>

      {load === null && (
        <div className="dlg-body">
          <p className="note" role="status">
            Memuat soal...
          </p>
        </div>
      )}

      {load?.status === "not_found" && (
        <div className="dlg-body">
          <p className="note">Soal untuk {kind.toLowerCase()} ini belum tersedia.</p>
        </div>
      )}

      {load?.status === "error" && (
        <>
          <div className="dlg-body">
            <p className="form-error" role="alert">
              {load.message}
            </p>
          </div>
          <div className="dlg-foot">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setLoad(null);
                setReloadKey((k) => k + 1);
              }}
            >
              Coba lagi
            </button>
          </div>
        </>
      )}

      {test && phase === "identity" && (
        <form className="dlg-form" onSubmit={startTest} noValidate>
          <p className="note">
            {kind} {programTitle} terdiri dari {total} soal. Nama dan instansi dipakai agar hasil Anda dapat dicatat oleh penyelenggara.
          </p>
          <div className="form-row">
            <label htmlFor={`${uid}-nama`}>Nama</label>
            <input
              id={`${uid}-nama`}
              type="text"
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={formError !== "" && name.trim() === ""}
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor={`${uid}-instansi`}>Instansi</label>
            <input
              id={`${uid}-instansi`}
              type="text"
              autoComplete="organization"
              maxLength={160}
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              aria-invalid={formError !== "" && institution.trim() === ""}
              required
            />
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="dlg-actions">
            <button type="submit" className="btn btn-primary">
              Mulai
            </button>
          </div>
        </form>
      )}

      {test && phase !== "identity" && (
        <>
          <div className="dlg-progress">
            <div className="dlg-progress-row">
              <strong>{programTitle}</strong>
              <span>
                Soal {phase === "done" ? total : answered} dari {total}
              </span>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-label="Jumlah soal terjawab"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={phase === "done" ? total : answered}
            >
              <span style={{ width: `${((phase === "done" ? total : answered) / total) * 100}%` }} />
            </div>
          </div>

          <div className="dlg-body">
            {test.questions.map((q, qi) => {
              const res = resultByQuestion.get(q.id);
              const selected = phase === "done" ? (res?.selectedOptionId ?? null) : (answers[q.id] ?? null);
              return (
                <fieldset key={q.id} className="question">
                  <legend className="sr-only">Pertanyaan {qi + 1}</legend>
                  <div className="q-tags" aria-hidden="true">
                    <span className="qtag">Pertanyaan {qi + 1}</span>
                  </div>
                  {phase === "done" && res && (
                    <span className={`badge ${res.correct ? "badge-ok" : "badge-bad"}`}>{res.correct ? "Benar" : "Salah"}</span>
                  )}
                  <p className="q-text">{q.text}</p>
                  <div className="options">
                    {q.options.map((opt) => (
                      <label key={opt.id} className={`option${selected === opt.id ? " selected" : ""}${phase === "done" ? " locked" : ""}`}>
                        <input
                          type="radio"
                          className="sr-only"
                          name={`${uid}-q${q.id}`}
                          checked={selected === opt.id}
                          disabled={phase === "done" || submitting}
                          onChange={() => choose(q.id, opt.id)}
                        />
                        <span className="option-label">Opsi {opt.label}</span>
                        <span className="option-text">{opt.text}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>

          <div className="dlg-foot">
            {phase === "done" && result ? (
              <>
                <p className="score">
                  Skor Anda adalah <strong>{result.score}</strong>
                </p>
                <button type="button" className="btn btn-primary" onClick={again}>
                  Ulang
                </button>
              </>
            ) : (
              <>
                {confirmBlank && (
                  <div className="confirm-box" role="alert">
                    <p>
                      {blanks} dari {total} soal belum dijawab. Soal yang kosong dihitung salah.
                    </p>
                    <div className="dlg-actions">
                      <button type="button" className="btn btn-outline" onClick={() => setConfirmBlank(false)} disabled={submitting}>
                        Kembali mengerjakan
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={submitting}>
                        {submitting ? "Mengirim..." : "Tetap selesai"}
                      </button>
                    </div>
                  </div>
                )}
                {submitError && (
                  <p className="form-error" role="alert">
                    {submitError}
                  </p>
                )}
                {!confirmBlank && (
                  <div className="dlg-actions">
                    <button type="button" className="btn btn-outline" onClick={reset} disabled={submitting || answered === 0}>
                      Reset
                    </button>
                    <button type="button" className="btn btn-primary" onClick={finish} disabled={submitting}>
                      {submitting ? "Mengirim..." : "Selesai"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
