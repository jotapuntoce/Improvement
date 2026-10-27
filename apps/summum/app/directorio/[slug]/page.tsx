// Ficha pública de un negocio o una afiliada del directorio. Sin sesión; slug desconocido → 404.
import { notFound } from "next/navigation";
import { getDirectoryEntry } from "@/server/directory/directory.ts";

export const dynamic = "force-dynamic";

const KIND_LABEL = { barco: "Negocio", afiliada: "Afiliada" } as const;
const VIGENCIA_LABEL = { vigente: "Vigente", en_riesgo: "En riesgo" } as const;

export default async function FichaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = await getDirectoryEntry(slug);
  if (!entry) notFound();
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "24px" }}>
      <h1>{entry.displayName}</h1>
      <p>{KIND_LABEL[entry.kind]} · {VIGENCIA_LABEL[entry.vigencia]}</p>
      {entry.publicBio && <p>{entry.publicBio}</p>}
      <p>Puntaje {entry.score}</p>
      {entry.approvedAt && <p>Certificado desde {entry.approvedAt.toLocaleDateString("es-MX")}</p>}
    </main>
  );
}
