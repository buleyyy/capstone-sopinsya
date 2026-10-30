"use client";

import { ProgramGrid } from "./ProgramCard";
import type { Program } from "@/lib/programs";

export function HomeProgramList({ programs }: { programs: Program[] }) {
  return (
    <section id="program" className="container section program-catalog" aria-labelledby="home-programs">
      <p className="eyebrow">PILIH PELATIHAN</p>
      <h2 id="home-programs" className="section-title">
        Program Pelatihan
      </h2>
      <p className="catalog-intro">Pilih program untuk melihat silabus, materi, studi kasus, dan evaluasi pembelajaran.</p>
      <ProgramGrid programs={programs} label="Daftar program pelatihan" />
    </section>
  );
}
