// Vista global de planos: todos los ensambles de todas las organizaciones, dibujados de corrido.
// Solo lectura a propósito — el AssemblyMap se monta SIN `hrefForPiece`, así que las piezas no son
// enlaces. Editar un plano se hace desde apps/improvement, dentro de su organización; aquí es para
// mirar el conjunto de un vistazo.
import Link from "next/link";
import { assembly, assemblyConnection, assemblyPiece, organization } from "@jotapuntoce/db/schema";
import { AssemblyMap } from "@jotapuntoce/ui/assembly/AssemblyMap.tsx";
import { db } from "../../lib/db.js";
import { requirePlatformAdmin } from "../../lib/auth.js";

export default async function PlanosPage() {
  await requirePlatformAdmin();

  // Cuatro lecturas completas y agrupado en memoria: son tablas chicas y esta pantalla las recorre
  // todas de todos modos. Un join por plano serían N+1 queries para el mismo resultado.
  const [orgs, assemblies, pieces, connections] = await Promise.all([
    db.select().from(organization),
    db.select().from(assembly).orderBy(assembly.createdAt),
    db.select().from(assemblyPiece).orderBy(assemblyPiece.createdAt),
    db.select().from(assemblyConnection).orderBy(assemblyConnection.createdAt),
  ]);

  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          <Link href="/" className="page-back-link">
            ← Dashboard
          </Link>
          <h2>Planos</h2>
          <p className="topbar-subtitle">
            Los proyectos de todas las organizaciones, vistos como piezas conectadas. Solo lectura.
          </p>
        </div>
      </section>

      {assemblies.length === 0 && <p className="topbar-subtitle">Todavía no hay planos.</p>}

      {assemblies.map((plano) => {
        const misPiezas = pieces.filter((p) => p.assemblyId === plano.id);
        const misConexiones = connections.filter((c) => c.assemblyId === plano.id);
        const sueltas = misPiezas.filter(
          (p) => !misConexiones.some((c) => c.fromPieceId === p.id || c.toPieceId === p.id),
        );

        return (
          <section
            key={plano.id}
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              marginTop: "16px",
            }}
          >
            <header style={{ marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "16px" }}>{plano.name}</h3>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                {orgName.get(plano.orgId) ?? "organización desconocida"} · {misPiezas.length} piezas ·{" "}
                {misConexiones.length} conexiones
                {sueltas.length > 0 && ` · ${sueltas.length} sin ensamblar`}
              </p>
            </header>

            <AssemblyMap pieces={misPiezas} connections={misConexiones} />
          </section>
        );
      })}
    </div>
  );
}
