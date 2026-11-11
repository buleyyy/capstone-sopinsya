import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-sopinsya.png" alt="" width={44} height={44} className="footer-logo" />
          <div>
            <p className="footer-brand">SopinsyaEducenter</p>
            <p className="footer-tagline">Pusat Pelatihan dan Sertifikasi Profesional</p>
          </div>
        </div>
        <div>
          <h2>Menu Utama</h2>
          <ul>
            <li>
              <Link href="/#program">Program</Link>
            </li>
            <li>
              <Link href="/tentang-kami">Tentang Kami</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2>Tentang Kami</h2>
          <ul>
            <li>
              <Link href="/tentang-kami#profil">Profil Sopinsya</Link>
            </li>
            <li>
              <Link href="/tentang-kami#visi-misi">Visi &amp; Misi</Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
