// El hub de Dirección: las secciones de Dirección que esta persona ve (Visión, Scorecard semanal,
// Issues, Junta semanal), con el nombre que el dueño les puso. 404 si no ve ninguna.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgMembership } from "@/server/auth/guard.ts";
import { loadDireccionNav } from "@/server/direccion/nav.ts";

export default async function DireccionPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const m = await requireOrgMembership(orgId);
  const sections = await loadDireccionNav(m.userId, orgId);
  if (sections.length === 0) notFound();

  return (
    <main className="config-page">
      <h1 className="config-title">Dirección</h1>
      <ul className="equipo-list">
        {sections.map((s) => (
          <li key={s.slug} className="config-card">
            <Link href={`/${orgId}/direccion/${s.slug}`} className="config-card-title">
              {s.label}
            </Link>
            <p className="config-hint">{s.hint}</p>
          </li>
        ))}
      </ul>
      <Link href={`/${orgId}/objetivos`}>← Volver a objetivos</Link>
    </main>
  );
}
