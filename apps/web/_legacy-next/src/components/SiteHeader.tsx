"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CONTACT_HREF, CONTACT_IS_EXTERNAL } from "@/lib/config";

const LINKS = [
  { href: "/#program", label: "Program", active: (p: string) => p === "/" || p.startsWith("/program") },
  { href: "/tentang-kami", label: "Tentang Kami", active: (p: string) => p.startsWith("/tentang-kami") },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container header-row">
        <Link href="/" className="brand" aria-label="SopinsyaEducenter, ke beranda">
          {/* Berkas logo: apps/web/public/images/logo-sopinsya.png */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-sopinsya.png" alt="" width={40} height={40} className="brand-logo" />
          <span className="brand-text">
            <span className="brand-name">SopinsyaEducenter</span>
            <span className="brand-sub">Peserta</span>
          </span>
        </Link>
        <nav aria-label="Menu utama" className="nav">
          <div className="nav-group">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={l.active(pathname) ? "active" : undefined} aria-current={l.active(pathname) ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </div>
          {CONTACT_IS_EXTERNAL ? (
            <a href={CONTACT_HREF} className="pill" target="_blank" rel="noopener noreferrer">
              Konsultasi
            </a>
          ) : (
            <Link href={CONTACT_HREF} className="pill">
              Konsultasi
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
