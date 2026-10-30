import { HomeProgramList } from "@/components/HomeProgramList";
import { PROGRAMS } from "@/lib/programs";

export default function HomePage() {
  return (
    <>
      <section className="hero-band" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">PLATFORM PEMBELAJARAN &amp; PELATIHAN</p>
            <h1 id="hero-title">
              Tingkatkan kompetensi
              <br />
              melalui pelatihan standar ISO
            </h1>
            <p className="hero-lead">
              Pelajari standar, pahami penerapannya, dan ikuti evaluasi pembelajaran dalam satu platform yang praktis.
            </p>
            <a href="#program" className="btn btn-primary">
              Jelajahi Program
            </a>
          </div>
          <div className="hero-card-outer" aria-hidden="true">
            <div className="hero-card">
              <p className="hero-card-eyebrow">SOPINSYA LEARNING</p>
              <p className="hero-card-title">
                Belajar terarah.
                <br />
                Kompetensi meningkat.
              </p>
              <span className="chip">ISO • SMK3 • Risk</span>
            </div>
          </div>
        </div>
      </section>

      <HomeProgramList programs={PROGRAMS} />
    </>
  );
}
