import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <p className="footer-brand">SOPINSYA</p>
        <div>
          <h2>Tentang Kami</h2>
          <ul>
            <li>
              <Link href="/tentang-kami#profil">Profil Sopinsya</Link>
            </li>
            <li>
              <Link href="/tentang-kami#visi-misi">Visi &amp; Misi</Link>
            </li>
            <li>
              <Link href="/tentang-kami#tim">Tim Kami</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2>Menu Utama</h2>
          <ul>
            <li>
              <Link href="/#program">Program</Link>
            </li>
            <li>
              <Link href="/tentang-kami#kontak">Hubungi Kami</Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
