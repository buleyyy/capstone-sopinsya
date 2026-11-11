import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/StateMessage";
import { fetchApi } from "@/lib/api";
import type { RoomDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const result = await fetchApi<RoomDetail>(`/api/public/rooms/${id}`);
  if (result.status === "not_found") notFound();

  return (
    <>
      <nav aria-label="Navigasi halaman" className="crumbs">
        <Link href="/Program">&larr; Semua Programpelatihan</Link>
      </nav>

      {result.status === "unavailable" && <ErrorState message={result.message} />}

      {result.status === "ok" && (
        <>
          <h1>{result.data.name}</h1>
          {result.data.description ? <p>{result.data.description}</p> : null}

          <h2>Materi dan dokumen</h2>
          {result.data.documents.length === 0 ? (
            <EmptyState title="Belum ada materi">
              Dokumen untuk Programini belum tersedia atau belum dipublikasikan.
            </EmptyState>
          ) : (
            <ul className="docs" aria-label="Daftar dokumen materi">
              {result.data.documents.map((d) => (
                <li key={d.id} className="card doc">
                  <div>
                    <strong>{d.title}</strong>
                    <div className="note">{d.code}</div>
                  </div>
                  {d.url ? (
                    <a className="button" href={d.url} target="_blank" rel="noopener noreferrer">
                      Buka dokumen
                    </a>
                  ) : (
                    <span className="note">Dokumen belum tersedia</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
