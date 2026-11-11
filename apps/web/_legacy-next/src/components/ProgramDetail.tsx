"use client";

import Link from "next/link";
import { useState } from "react";
import { BookIcon, ChevronIcon, ChevronRightIcon, DocListIcon, LinkIcon, PdfIcon, UserIcon } from "./Icons";
import { PdfDialog } from "./PdfDialog";
import { TestDialog } from "./TestDialog";
import { useJoined } from "@/lib/useJoined";
import type { Meeting, Program } from "@/lib/programs";

/** Hanya URL yang jelas berupa berkas PDF yang ditanam di pop up; folder Drive dan situs lain dibuka di tab baru. */
function isPdfUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

type Row =
  | { key: string; label: string; kind: "pdf"; url: string | null; icon: React.ReactNode }
  | { key: string; label: string; kind: "link"; href: string; external: boolean; icon: React.ReactNode }
  | { key: string; label: string; kind: "test"; test: "Pre-test" | "Post-test"; meetingId: number; icon: React.ReactNode }
  | { key: string; label: string; kind: "missing"; icon: React.ReactNode };

function Section({ title, rows, onOpenPdf, onOpenTest }: {
  title: string;
  rows: Row[];
  onOpenPdf: (title: string, url: string) => void;
  onOpenTest: (kind: "Pre-test" | "Post-test", meetingId: number) => void;
}) {
  return (
    <details className="pd-sec">
      <summary>
        <span className="pd-ico" aria-hidden="true"><BookIcon /></span>
        <span className="pd-sec-title">{title}</span>
        <span className="pd-chev" aria-hidden="true"><ChevronIcon /></span>
      </summary>
      {rows.length === 0 ? (
        <p className="pd-empty">Belum ada konten pada bagian ini.</p>
      ) : (
        <ul className="pd-rows">
          {rows.map((row) => (
            <li key={row.key}>
              {row.kind === "missing" && (
                <div className="pd-row pd-row-off" aria-disabled="true">
                  {row.icon}<span>{row.label}</span><small>Belum tersedia</small>
                </div>
              )}
              {row.kind === "pdf" && row.url === null && (
                <div className="pd-row pd-row-off" aria-disabled="true">
                  {row.icon}<span>{row.label}</span><small>Belum tersedia</small>
                </div>
              )}
              {row.kind === "pdf" && row.url !== null && isPdfUrl(row.url) && (
                <button type="button" className="pd-row" onClick={() => onOpenPdf(row.label, row.url as string)}>
                  {row.icon}<span>{row.label}</span><ChevronRightIcon className="pd-row-go" />
                </button>
              )}
              {row.kind === "pdf" && row.url !== null && !isPdfUrl(row.url) && (
                <a className="pd-row" href={row.url} target="_blank" rel="noopener noreferrer">
                  {row.icon}<span>{row.label}</span><ChevronRightIcon className="pd-row-go" />
                </a>
              )}
              {row.kind === "link" && (row.external ? (
                <a className="pd-row" href={row.href} target="_blank" rel="noopener noreferrer">
                  {row.icon}<span>{row.label}</span><ChevronRightIcon className="pd-row-go" />
                </a>
              ) : (
                <Link className="pd-row" href={row.href}>
                  {row.icon}<span>{row.label}</span><ChevronRightIcon className="pd-row-go" />
                </Link>
              ))}
              {row.kind === "test" && (
                <button type="button" className="pd-row" onClick={() => onOpenTest(row.test, row.meetingId)}>
                  {row.icon}<span>{row.label}</span><ChevronRightIcon className="pd-row-go" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function docRows(meetings: Meeting[], pick: (m: Meeting) => { title: string; url: string | null }, tag: string): Row[] {
  return meetings.map((m) => {
    const d = pick(m);
    return {
      key: `${m.id}-${tag}`,
      label: meetings.length > 1 ? `${d.title} — ${m.title}` : d.title,
      kind: "pdf" as const,
      url: d.url,
      icon: <PdfIcon size={34} />,
    };
  });
}

export function ProgramDetail({ program }: { program: Program }) {
  const { slugs, join } = useJoined();
  const joined = slugs.includes(program.slug);
  const [test, setTest] = useState<{ kind: "Pre-test" | "Post-test"; meetingId: number } | null>(null);
  const [pdf, setPdf] = useState<{ title: string; url: string } | null>(null);
  const meetings = program.meetings;
  const multi = meetings.length > 1;
  const label = (m: Meeting, base: string) => (multi ? `${base} — ${m.title}` : base);

  const studiKasus: Row[] = meetings.map((m) => ({
    key: `${m.id}-sk`,
    label: label(m, m.studiKasus.title),
    kind: "link",
    href: `/program/${program.slug}/pertemuan/${m.id}/studi-kasus`,
    external: false,
    icon: <PdfIcon size={34} />,
  }));
  const tests = (kind: "Pre-test" | "Post-test"): Row[] =>
    meetings.map((m) => ({
      key: `${m.id}-${kind}`,
      label: label(m, kind),
      kind: "test",
      test: kind,
      meetingId: m.id,
      icon: <DocListIcon size={34} />,
    }));
  const quiz: Row[] = meetings.map((m) =>
    m.blooketUrl
      ? { key: `${m.id}-quiz`, label: label(m, "Quiz Game"), kind: "link", href: m.blooketUrl, external: true, icon: <LinkIcon size={34} /> }
      : { key: `${m.id}-quiz`, label: label(m, "Quiz Game"), kind: "missing", icon: <LinkIcon size={34} /> },
  );
  const videos: Row[] = meetings
    .filter((m) => m.videos.length > 0)
    .map((m) => ({
      key: `${m.id}-video`,
      label: label(m, `Video Referensi (${m.videos.length})`),
      kind: "link",
      href: `/program/${program.slug}/pertemuan/${m.id}/video`,
      external: false,
      icon: <LinkIcon size={34} />,
    }));

  return (
    <div className="pd">
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
      {pdf && <PdfDialog title={pdf.title} url={pdf.url} onClose={() => setPdf(null)} />}

      <div className="container">
        <section className="pd-hero" aria-labelledby="pd-title">
          <div className="pd-cover" role="img" aria-label="Ilustrasi program pelatihan" />
          <div>
            <Link href="/#program" className="back-link">← Semua Program</Link>
            <h1 id="pd-title" className="pd-title">{program.fullTitle}</h1>
            <p className="pd-trainer"><UserIcon size={16} /> Trainer: {program.trainer}</p>
            <p className="pd-desc">{program.description}</p>
            {!joined && (
              <button type="button" className="btn btn-action" onClick={() => join(program.slug)}>
                Ikuti Pelatihan
              </button>
            )}
          </div>
        </section>

        {joined ? (
          <div className="pd-acc">
            <Section title="Silabus" rows={docRows(meetings, (m) => m.silabus, "silabus")} onOpenPdf={(t, u) => setPdf({ title: t, url: u })} onOpenTest={(k, id) => setTest({ kind: k, meetingId: id })} />
            <Section title="Materi" rows={docRows(meetings, (m) => m.materi, "materi")} onOpenPdf={(t, u) => setPdf({ title: t, url: u })} onOpenTest={(k, id) => setTest({ kind: k, meetingId: id })} />
            <Section title="Studi Kasus" rows={studiKasus} onOpenPdf={(t, u) => setPdf({ title: t, url: u })} onOpenTest={(k, id) => setTest({ kind: k, meetingId: id })} />
            <Section title="Pre-test" rows={tests("Pre-test")} onOpenPdf={(t, u) => setPdf({ title: t, url: u })} onOpenTest={(k, id) => setTest({ kind: k, meetingId: id })} />
            <Section title="Post-test" rows={tests("Post-test")} onOpenPdf={(t, u) => setPdf({ title: t, url: u })} onOpenTest={(k, id) => setTest({ kind: k, meetingId: id })} />
            <Section title="Quiz Game" rows={quiz} onOpenPdf={(t, u) => setPdf({ title: t, url: u })} onOpenTest={(k, id) => setTest({ kind: k, meetingId: id })} />
            <Section title="Video Referensi" rows={videos} onOpenPdf={(t, u) => setPdf({ title: t, url: u })} onOpenTest={(k, id) => setTest({ kind: k, meetingId: id })} />
            <Section title="Pustaka SOP" rows={docRows(meetings, (m) => m.sop, "sop")} onOpenPdf={(t, u) => setPdf({ title: t, url: u })} onOpenTest={(k, id) => setTest({ kind: k, meetingId: id })} />
          </div>
        ) : (
          <p className="pd-gate">Klik <strong>Ikuti Pelatihan</strong> untuk membuka silabus, materi, tes, dan sumber belajar program ini.</p>
        )}

        <section className="pd-reviews" aria-labelledby="pd-rev">
          <div className="pd-reviews-head">
            <h2 id="pd-rev">Rating &amp; Ulasan</h2>
            <p>Pengalaman peserta yang telah mengikuti pelatihan ini</p>
          </div>
          <div className="pd-reviews-empty" role="status">
            Rating dan ulasan akan ditampilkan di sini setelah fitur penyimpanan ulasan tersedia. Belum ada ulasan untuk program ini.
          </div>
        </section>
      </div>
    </div>
  );
}
