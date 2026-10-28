import { notFound } from "next/navigation";
import { PlayIcon } from "@/components/Icons";
import { ProgramMeta } from "@/components/ProgramMeta";
import { ErrorState } from "@/components/StateMessage";
import { fetchProgram, getMeeting } from "@/lib/programs";

type Props = { params: Promise<{ slug: string; n: string }> };

export const dynamic = "force-dynamic";

/** ID video YouTube dari youtu.be/ID, youtube.com/watch?v=ID, atau youtube.com/embed/ID; selain itu null. */
function youtubeId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] ?? null;
    else if (host === "youtube.com" || host === "m.youtube.com") {
      id = u.pathname.startsWith("/embed/") ? (u.pathname.split("/")[2] ?? null) : u.searchParams.get("v");
    }
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export default async function VideoPage({ params }: Props) {
  const { slug, n } = await params;
  const result = await fetchProgram(slug);
  if (result.status === "not_found") notFound();
  if (result.status === "unavailable") {
    return (
      <div className="container section">
        <ErrorState message={result.message} />
      </div>
    );
  }
  const program = result.data;
  const meeting = getMeeting(program, Number(n));
  if (!meeting) notFound();

  return (
    <div className="container">
      <div className="page-head">
        <p className="crumb">
          {meeting.title} | {program.fullTitle}
        </p>
        <h1>Video Referensi {program.fullTitle}</h1>
        <ProgramMeta program={program} />
        <hr />
      </div>
      {meeting.videos.length === 0 && (
        <p className="note" role="status">
          Video referensi untuk pertemuan ini belum tersedia.
        </p>
      )}
      <ul className="videos">
        {meeting.videos.map((v) => {
          const id = youtubeId(v.url);
          if (id) {
            // Pratinjau langsung (YouTube mode privasi); tautan asli tetap tersedia di bawahnya.
            return (
              <li key={v.id} className="video-embed">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${id}`}
                  title={`${v.title} - ${program.fullTitle}`}
                  loading="lazy"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
                <a href={v.url ?? "#"} target="_blank" rel="noopener noreferrer">
                  {v.title} (buka di YouTube)
                </a>
              </li>
            );
          }
          const inner = (
            <>
              <span className="video-thumb">
                <PlayIcon />
              </span>
              <span>{v.title}</span>
              {!v.url && <span className="note"> (belum tersedia)</span>}
            </>
          );
          return (
            <li key={v.id}>
              {v.url ? (
                <a className="video" href={v.url} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              ) : (
                <span className="video video-off">{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
