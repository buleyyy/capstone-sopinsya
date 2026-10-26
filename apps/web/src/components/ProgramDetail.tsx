"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronIcon, DocListIcon, LinkIcon, PdfIcon } from "./Icons";
import { ProgramMeta } from "./ProgramMeta";
import { TestDialog } from "./TestDialog";
import { useJoined } from "@/lib/useJoined";
import type { Program } from "@/lib/programs";

/** Baris tautan eksternal (tab baru). url null = tampil nonaktif "Belum tersedia". */
function ExternalRow({ url, label, icon }: { url: string | null; label: string; icon: React.ReactNode }) {
  if (url) {
    return (
      <a className="row" href={url} target="_blank" rel="noopener noreferrer">
        {icon} <span>{label}</span>
      </a>
    );
  }
  return (
    <span className="row row-disabled">
      {icon} <span>{label}</span>
      <small>Belum tersedia</small>
    </span>
  );
}

export function ProgramDetail({ program }: { program: Program }) {
  const uid = useId();
  const { slugs, join } = useJoined();
  const joined = slugs.includes(program.slug);
  const [open, setOpen] = useState<number[]>([program.meetings[0]?.id ?? 0]);
  const [test, setTest] = useState<{ kind: "Pre-test" | "Post-test"; meetingId: number } | null>(null);

  function toggle(id: number) {
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="container detail">
      {test && (
        <TestDialog
          key={`${test.kind}-${test.meetingId}`}
          kind={test.kind}
          programTitle={program.fullTitle}
          programSlug={program.slug}
          meetingId={test.meetingId}
          onClose={() => setTest(null)}
        />
      )}
      <div className="detail-top">
        <div className="illustration" role="img" aria-label="Ilustrasi program pelatihan" />
        <div>
          <h1>{program.fullTitle}</h1>
          <ProgramMeta program={program} />
          <p className="detail-desc">{program.description}</p>
        </div>
      </div>

      {!joined ? (
        <div className="join-wrap">
          <button type="button" className="btn btn-primary btn-wide" onClick={() => join(program.slug)}>
            Ikuti Pelatihan
          </button>
        </div>
      ) : (
        <div className="meetings">
          {program.meetings.map((m) => {
            const isOpen = open.includes(m.id);
            const panelId = `${uid}-m${m.id}`;
            const base = `/program/${program.slug}/pertemuan/${m.id}`;
            return (
              <section key={m.id} className="meeting">
                <h2>
                  <button type="button" className="meeting-head" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(m.id)}>
                    <span>{m.title}</span>
                    <span className={`circle${isOpen ? " up" : ""}`}>
                      <ChevronIcon size={16} />
                    </span>
                  </button>
                </h2>
                {isOpen && (
                  <ul id={panelId} className="rows">
                    <li>
                      <ExternalRow url={m.sop.url} label="Pustaka SOP" icon={<PdfIcon />} />
                    </li>
                    <li>
                      <ExternalRow url={m.silabus.url} label="Silabus" icon={<PdfIcon />} />
                    </li>
                    <li>
                      <ExternalRow url={m.materi.url} label="Materi" icon={<PdfIcon />} />
                    </li>
                    <li>
                      <Link className="row" href={`${base}/studi-kasus`}>
                        <DocListIcon /> <span>Studi Kasus</span>
                      </Link>
                    </li>
                    <li>
                      <button type="button" className="row" onClick={() => setTest({ kind: "Pre-test", meetingId: m.id })}>
                        <DocListIcon /> <span>Pre-test</span>
                      </button>
                    </li>
                    <li>
                      <button type="button" className="row" onClick={() => setTest({ kind: "Post-test", meetingId: m.id })}>
                        <DocListIcon /> <span>Post-test</span>
                      </button>
                    </li>
                    <li>
                      <ExternalRow url={m.blooketUrl} label="Kuis Blooket" icon={<LinkIcon />} />
                    </li>
                    <li>
                      <Link className="row" href={`${base}/video`}>
                        <LinkIcon /> <span>Video Referensi</span>
                      </Link>
                    </li>
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
