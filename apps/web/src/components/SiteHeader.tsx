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
        <Link href="/" className="brand">
          SOPINSYA
        </Link>
        <nav aria-label="Menu utama" className="nav">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={l.active(pathname) ? "active" : undefined}>
              {l.label}
            </Link>
          ))}
          {CONTACT_IS_EXTERNAL ? (
            <a href={CONTACT_HREF} className="pill" target="_blank" rel="noopener noreferrer">
              Hubungi Kami
            </a>
          ) : (
            <Link href={CONTACT_HREF} className="pill">
              Hubungi Kami
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
