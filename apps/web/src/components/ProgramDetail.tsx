"use client";

import Link from "next/link";
import { useState } from "react";
import { DocListIcon, LinkIcon, PdfIcon } from "./Icons";
import { ProgramMeta } from "./ProgramMeta";
import { TestDialog } from "./TestDialog";
import type { Program, Meeting } from "@/lib/programs";

type Resource = { key: string; label: string; url: string | null; icon: React.ReactNode };

function ResourceList({ resources }: { resources: Resource[] }) {
  return (
    <ul className="content-resource-list">
      {resources.map((resource) => (
        <li key={resource.key}>
          {resource.url ? (
            <a className="row" href={resource.url} target="_blank" rel="noopener noreferrer">
              {resource.icon}<span>{resource.label}</span><span className="resource-action">Buka ↗</span>
            </a>
          ) : (
            <div className="row row-disabled" aria-disabled="true">
              {resource.icon}<span>{resource.label}</span><small>Belum tersedia</small>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function resourcesFor(meetings: Meeting[], pick: (meeting: Meeting) => { title: string; url: string | null }, label: string, icon: React.ReactNode): Resource[] {
  return meetings.map((meeting) => {
    const resource = pick(meeting);
    return {
      key: `${meeting.id}-${label}`,
      label: meetings.length > 1 ? `${resource.title} — ${meeting.title}` : resource.title,
      url: resource.url,
      icon,
    };
  });
}

export function ProgramDetail({ program }: { program: Program }) {
  const [test, setTest] = useState<{ kind: "Pre-test" | "Post-test"; meetingId: number } | null>(null);
  const meetings = program.meetings;

  return (
    <main className="container detail">
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
          <Link href="/#program" className="back-link">← Semua Program</Link>
          <h1>{program.fullTitle}</h1>
          <ProgramMeta program={program} />
          <p className="detail-desc">{program.description}</p>
        </div>
      </div>

      <nav className="program-outline" aria-label="Daftar bagian program">
        <a href="#silabus">Silabus</a>
        <a href="#materi">Materi</a>
        <a href="#studi-kasus">Studi Kasus</a>
        <a href="#pre-test">Pre-test</a>
        <a href="#post-test">Post-test</a>
        <a href="#kuis">Kuis</a>
        <a href="#video-referensi">Video</a>
        <a href="#pustaka-sop">Pustaka SOP</a>
        <a href="#ulasan">Rating &amp; Ulasan</a>
      </nav>

      <div className="program-content">
        <section id="silabus" className="content-section">
          <h2>Silabus</h2>
          <p className="content-help">Gambaran materi dan cakupan pembelajaran program.</p>
          <ResourceList resources={resourcesFor(meetings, (m) => m.silabus, "Silabus", <PdfIcon />)} />
        </section>

        <section id="materi" className="content-section">
          <h2>Materi Pelatihan</h2>
          <p className="content-help">Dokumen materi yang digunakan selama pelatihan.</p>
          <ResourceList resources={resourcesFor(meetings, (m) => m.materi, "Materi", <PdfIcon />)} />
        </section>

        <section id="studi-kasus" className="content-section">
          <h2>Studi Kasus</h2>
          <p className="content-help">Latihan penerapan materi melalui studi kasus.</p>
          <ResourceList resources={resourcesFor(meetings, (m) => m.studiKasus, "Studi Kasus", <DocListIcon />)} />
        </section>

        <section id="pre-test" className="content-section">
          <h2>Pre-test</h2>
          <p className="content-help">Ukur pemahaman awal sebelum mempelajari materi.</p>
          <ul className="content-resource-list">
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <button type="button" className="row" onClick={() => setTest({ kind: "Pre-test", meetingId: meeting.id })}>
                  <DocListIcon /><span>Pre-test — {meeting.title}</span><span className="resource-action">Mulai →</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section id="post-test" className="content-section">
          <h2>Post-test</h2>
          <p className="content-help">Evaluasi pemahaman setelah mempelajari materi.</p>
          <ul className="content-resource-list">
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <button type="button" className="row" onClick={() => setTest({ kind: "Post-test", meetingId: meeting.id })}>
                  <DocListIcon /><span>Post-test — {meeting.title}</span><span className="resource-action">Mulai →</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section id="kuis" className="content-section">
          <h2>Kuis Interaktif</h2>
          <p className="content-help">Perkuat pemahaman melalui kuis pelatihan.</p>
          <ResourceList resources={meetings.map((m) => ({
            key: `${m.id}-quiz`,
            label: `Kuis — ${m.title}`,
            url: m.blooketUrl,
            icon: <LinkIcon />,
          }))} />
        </section>

        <section id="video-referensi" className="content-section">
          <h2>Video Referensi</h2>
          <p className="content-help">Video pendukung untuk memperdalam pemahaman materi.</p>
          <ResourceList resources={meetings.flatMap((m) => m.videos.map((video) => ({
            key: `${m.id}-video-${video.id}`,
            label: meetings.length > 1 ? `${video.title} — ${m.title}` : video.title,
            url: video.url,
            icon: <LinkIcon />,
          })))} />
        </section>

        <section id="pustaka-sop" className="content-section">
          <h2>Pustaka SOP</h2>
          <p className="content-help">Referensi dokumen prosedur operasional standar terkait program.</p>
          <ResourceList resources={resourcesFor(meetings, (m) => m.sop, "Pustaka SOP", <PdfIcon />)} />
        </section>

        <section id="ulasan" className="content-section content-pending">
          <h2>Rating dan Ulasan</h2>
          <p className="content-help">Fitur pengiriman rating dan ulasan belum tersedia pada implementasi saat ini.</p>
        </section>
      </div>
    </main>
  );
}
