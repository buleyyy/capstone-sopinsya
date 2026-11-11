import Link from "next/link";
import type { Program } from "@/lib/programs";

export function ProgramCard({ program }: { program: Program }) {
  return (
    <li className="pcard">
      <span className={`pbadge tone-${program.tone}`}>{program.code}</span>
      <h3>{program.title}</h3>
      <p className="pcard-sub">{program.subtitle}</p>
      <p className="pcard-desc">{program.summary}</p>
      <Link href={`/program/${program.slug}`} className="pcard-link">
        Lihat detail <span aria-hidden="true">→</span>
        <span className="sr-only"> {program.title}</span>
      </Link>
    </li>
  );
}

export function ProgramGrid({ programs, label }: { programs: Program[]; label: string }) {
  return (
    <ul className="pgrid" aria-label={label}>
      {programs.map((p) => (
        <ProgramCard key={p.slug} program={p} />
      ))}
    </ul>
  );
}
