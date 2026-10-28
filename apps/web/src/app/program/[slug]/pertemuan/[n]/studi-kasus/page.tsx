import { notFound } from "next/navigation";
import { CaseStudyBoard } from "@/components/CaseStudyBoard";
import { ProgramMeta } from "@/components/ProgramMeta";
import { ErrorState } from "@/components/StateMessage";
import { fetchProgram, getMeeting } from "@/lib/programs";

type Props = { params: Promise<{ slug: string; n: string }> };

export const dynamic = "force-dynamic";

export default async function StudiKasusPage({ params }: Props) {
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
        <h1>Studi Kasus {program.fullTitle}</h1>
        <ProgramMeta program={program} />
        <hr />
      </div>
      <CaseStudyBoard doc={meeting.studiKasus} />
    </div>
  );
}
