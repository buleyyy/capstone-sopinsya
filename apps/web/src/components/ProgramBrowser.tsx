"use client";

import { useId, useMemo, useState } from "react";
import { ChevronIcon, SearchIcon } from "./Icons";
import { ProgramGrid } from "./ProgramCard";
import { useJoined } from "@/lib/useJoined";
import type { Program } from "@/lib/programs";

export function ProgramBrowser({ programs }: { programs: Program[] }) {
  const uid = useId();
  const { slugs } = useJoined();
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<string[]>([]);

  const categories = useMemo(() => Array.from(new Set(programs.map((p) => p.category))), [programs]);

  const q = query.trim().toLowerCase();
  const matches = (p: Program) =>
    (cats.length === 0 || cats.includes(p.category)) &&
    (q === "" || `${p.title} ${p.subtitle} ${p.summary}`.toLowerCase().includes(q));

  const all = programs.filter(matches);
  const joined = all.filter((p) => slugs.includes(p.slug));

  function toggle(cat: string) {
    setCats((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  return (
    <div className="browser">
      <aside className="filter-card" aria-label="Filter program pelatihan">
        <h2>Filter Program Pelatihan</h2>
        <fieldset>
          <legend>Kategori</legend>
          <label className="check">
            <input type="checkbox" checked={cats.length === 0} onChange={() => setCats([])} />
            <span>Semua</span>
          </label>
          {categories.map((c) => (
            <label key={c} className="check">
              <input type="checkbox" checked={cats.includes(c)} onChange={() => toggle(c)} />
              <span>{c}</span>
            </label>
          ))}
        </fieldset>
      </aside>

      <div className="browser-main">
        <div className="search-row">
          <div className="field">
            <label htmlFor={`${uid}-q`} className="sr-only">
              Cari pelatihan
            </label>
            <input id={`${uid}-q`} type="search" placeholder="Cari Pelatihan" value={query} onChange={(e) => setQuery(e.target.value)} />
            <SearchIcon className="field-icon" />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-c`} className="sr-only">
              Kategori
            </label>
            <select id={`${uid}-c`} value={cats.length === 1 ? cats[0] : ""} onChange={(e) => setCats(e.target.value ? [e.target.value] : [])}>
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronIcon className="field-icon" />
          </div>
        </div>

        <section aria-labelledby={`${uid}-joined`}>
          <h2 id={`${uid}-joined`} className="section-title">
            Pelatihan yang diikuti
          </h2>
          {joined.length > 0 ? (
            <ProgramGrid programs={joined} label="Pelatihan yang diikuti" />
          ) : (
            <p className="note">Belum ada pelatihan yang diikuti. Buka detail program lalu pilih &quot;Ikuti Pelatihan&quot;.</p>
          )}
        </section>

        <section aria-labelledby={`${uid}-all`}>
          <h2 id={`${uid}-all`} className="section-title">
            Daftar Pelatihan
          </h2>
          {all.length > 0 ? (
            <ProgramGrid programs={all} label="Daftar pelatihan" />
          ) : (
            <div className="card state" role="status">
              <h3>Pelatihan tidak ditemukan</h3>
              <p className="note">Ubah kata kunci atau kategori yang dipilih.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
