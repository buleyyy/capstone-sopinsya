import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseStudyBoard } from "@/components/CaseStudyBoard";
import { ProgramMeta } from "@/components/ProgramMeta";
import { getMeeting, getProgram } from "@/lib/programs";

type Props = { params: Promise<{ slug: string; n: string }> };

export default async function StudiKasusPage({ params }: Props) {
  const { slug, n } = await params;
  const program = getProgram(slug);
  const meeting = program ? getMeeting(program, Number(n)) : undefined;
  if (!program || !meeting) notFound();

  return (
    <div className="container">
      <div className="page-head">
        <nav className="crumb" aria-label="Jejak halaman">
          <Link href={`/program/${program.slug}`}>Program</Link>
          <span aria-hidden="true"> › </span>
          <span aria-current="page">Studi Kasus</span>
          <span className="crumb-meeting"> · {meeting.title}</span>
        </nav>
        <h1>Studi Kasus {program.fullTitle}</h1>
        <ProgramMeta program={program} />
        <hr />
      </div>
      <CaseStudyBoard doc={meeting.studiKasus} />
    </div>
  );
}
