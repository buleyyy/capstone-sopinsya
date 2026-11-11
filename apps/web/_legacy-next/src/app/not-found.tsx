import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container section">
      <div className="card state">
        <h1>Halaman tidak ditemukan</h1>
        <p className="note">Alamat yang Anda buka tidak tersedia.</p>
        <p>
          <Link href="/program">Lihat program pelatihan</Link>
        </p>
      </div>
    </div>
  );
}
