"use client";

import { ProgramGrid } from "./ProgramCard";
import { useJoined } from "@/lib/useJoined";
import type { Program } from "@/lib/programs";

/** Daftar di beranda: pelatihan yang diikuti bila ada, jika belum maka semua program tersedia. */
export function HomeProgramList({ programs }: { programs: Program[] }) {
  const { slugs } = useJoined();
  const joined = programs.filter((p) => slugs.includes(p.slug));
  const hasJoined = joined.length > 0;

  return (
    <section className="container section" aria-labelledby="home-programs">
      <h2 id="home-programs" className="section-title">
        {hasJoined ? "Pelatihan yang diikuti" : "Pelatihan tersedia"}
      </h2>
      <ProgramGrid programs={hasJoined ? joined : programs} label={hasJoined ? "Pelatihan yang diikuti" : "Pelatihan tersedia"} />
    </section>
  );
}
