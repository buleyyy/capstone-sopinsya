"use client";

import { useId, useRef, useState } from "react";
import { CloseIcon, CommentIcon, PdfIcon } from "./Icons";
import type { Doc } from "@/lib/programs";

/**
 * Papan pengumpulan tugas studi kasus.
 * PRATINJAU: berkas dan komentar hanya disimpan di memori halaman (hilang saat dimuat ulang).
 * Penyimpanan ke server menunggu keputusan E-6 (unggah file atau hanya URL).
 */
export function CaseStudyBoard({ doc }: { doc: Doc }) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState<string[]>([]);

  const submitted = fileName !== null;

  return (
    <>
      <div className="file-card">
        <div className="file-card-text">
          {doc.url ? (
            <a href={doc.url} target="_blank" rel="noopener noreferrer">
              {doc.title}
            </a>
          ) : (
            <span className="file-title">{doc.title}</span>
          )}
          <span className="file-type">{doc.url?.includes("/drive/folders/") ? "Folder Google Drive" : "PDF"}</span>
        </div>
        <div className="file-card-icon">
          <PdfIcon size={56} />
        </div>
      </div>

      <section className="submission" aria-labelledby={`${uid}-sub`}>
        <div className="submission-head">
          <h2 id={`${uid}-sub`}>Pengumpulan Tugas</h2>
          <span aria-live="polite">{submitted ? "Telah diserahkan" : "Belum diserahkan"}</span>
        </div>

        {submitted && (
          <div className="file-card file-card-small">
            <div className="file-card-text">
              <span className="file-title">{fileName}</span>
              <span className="file-type">PDF</span>
            </div>
            <div className="file-card-icon">
              <PdfIcon size={44} />
            </div>
            <button type="button" className="file-remove" onClick={() => setFileName(null)} aria-label={`Hapus ${fileName}`}>
              <CloseIcon size={18} />
            </button>
          </div>
        )}

        <div className="submission-actions">
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept=".pdf,.doc,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFileName(f.name);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn btn-primary btn-block" onClick={() => inputRef.current?.click()}>
            Tambah atau Unggah
          </button>
          <button type="button" className="btn btn-outline btn-block" aria-expanded={commenting} onClick={() => setCommenting((v) => !v)}>
            <CommentIcon /> Tambahkan komentar
          </button>
        </div>

        {commenting && (
          <div className="comment-box">
            <label htmlFor={`${uid}-c`} className="sr-only">
              Komentar
            </label>
            <textarea id={`${uid}-c`} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tulis komentar" />
            <button
              type="button"
              className="btn btn-primary"
              disabled={draft.trim() === ""}
              onClick={() => {
                setComments((c) => [...c, draft.trim()]);
                setDraft("");
              }}
            >
              Kirim
            </button>
          </div>
        )}

        {comments.length > 0 && (
          <ul className="comments" aria-label="Komentar">
            {comments.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}

        <p className="note">Pratinjau: berkas dan komentar belum tersimpan ke server.</p>
      </section>
    </>
  );
}
