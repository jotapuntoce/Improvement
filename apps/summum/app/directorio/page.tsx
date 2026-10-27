// Directorio público: negocios y afiliadas con opt-in y Sello Cénit vigente o en riesgo. Sin sesión.
import Link from "next/link";
import { listDirectory } from "@/server/directory/directory.ts";

export const metadata = { title: "Directorio · Summum System" };
export const dynamic = "force-dynamic";

const KIND_LABEL = { barco: "Negocio", afiliada: "Afiliada" } as const;
const VIGENCIA_LABEL = { vigente: "Vigente", en_riesgo: "En riesgo" } as const;

export default async function DirectorioPage() {
  const entries = await listDirectory();
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "24px" }}>
      <h1>Directorio Summum</h1>
      <ul>
        {entries.map((e) => (
          <li key={`${e.kind}-${e.slug}`}>
            <Link href={`/directorio/${e.slug}`}>{e.displayName}</Link> · {KIND_LABEL[e.kind]} · {VIGENCIA_LABEL[e.vigencia]} · Puntaje {e.score}
          </li>
        ))}
        {entries.length === 0 && <li>Aún no hay certificados en el directorio.</li>}
      </ul>
    </main>
  );
}
