import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgramDetail } from "@/components/ProgramDetail";
import { ErrorState } from "@/components/StateMessage";
import { fetchProgram } from "@/lib/programs";

type Props = { params: Promise<{ slug: string }> };

// Konten program dikelola Admin di database dan harus selalu segar; tidak ada halaman statis.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await fetchProgram(slug);
  return { title: result.status === "ok" ? `${result.data.fullTitle} - Sopinsya` : "Program tidak ditemukan" };
}

export default async function ProgramDetailPage({ params }: Props) {
  const { slug } = await params;
  const result = await fetchProgram(slug);
  if (result.status === "not_found") notFound();
  if (result.status === "unavailable") {
    return (
      <div className="container section">
        <ErrorState message={result.message} />
      </div>
    );
  }
  return <ProgramDetail program={result.data} />;
}
