import Link from "next/link";
import { HomeProgramList } from "@/components/HomeProgramList";
import { ErrorState } from "@/components/StateMessage";
import { fetchPrograms } from "@/lib/programs";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const programs = await fetchPrograms();
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
            <p className="hero-lead">Pelajari standar, pahami penerapannya, dan ikuti evaluasi pembelajaran dalam satu platform yang praktis.</p>
            <Link href="/program" className="btn btn-primary">
              Jelajahi Pelatihan
            </Link>
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

      {programs.status === "ok" ? (
        <HomeProgramList programs={programs.data} />
      ) : (
        <section className="container section" aria-labelledby="home-programs">
          <h2 id="home-programs" className="section-title">
            Pelatihan tersedia
          </h2>
          <ErrorState message={programs.status === "unavailable" ? programs.message : "Daftar program tidak ditemukan."} />
        </section>
      )}

      <section className="container section" aria-labelledby="features">
        <h2 id="features" className="section-title">
          Program Pelatihan
        </h2>
        <div className="feature">
          <div className="photo photo-iso" role="img" aria-label="Peserta mengikuti pelatihan di ruang rapat" />
          <div className="feature-card">
            <h3>Pelatihan ISO</h3>
            <p>
              Pelajari persyaratan standar ISO, penerapannya pada proses kerja, serta evaluasi pemahaman melalui pre-test dan post-test pada
              setiap pertemuan.
            </p>
            <Link href="/program" className="btn btn-primary">
              Lihat
            </Link>
          </div>
        </div>
        <div className="feature feature-reverse">
          <div className="feature-card">
            <h3>Pelatihan Ahli K3 Umum</h3>
            <p>
              Bekali diri dengan pemahaman keselamatan dan kesehatan kerja untuk membangun lingkungan kerja yang lebih aman dan patuh pada
              ketentuan.
            </p>
            <Link href="/program" className="btn btn-primary">
              Lihat
            </Link>
          </div>
          <div className="photo photo-k3" role="img" aria-label="Petugas K3 meninjau lokasi kerja" />
        </div>
      </section>
    </>
  );
}
