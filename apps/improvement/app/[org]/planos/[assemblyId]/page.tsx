// El plano dibujado, con el panel de "qué hace esta pieza" al lado. La pieza abierta viaja en la URL
// (?pieza=<id>) en vez de en estado de cliente: así el panel lo renderiza el servidor, funciona sin
// JS y el enlace a una pieza concreta se puede pasar a otra persona tal cual.
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AssemblyMap } from "@jotapuntoce/ui/assembly/AssemblyMap.tsx";
import { requireOrgMembership, requirePlatformAdminSession } from "@/server/auth/guard";
import { addPiece, connectPieces, loadAssembly, updatePiece } from "@/server/assembly/mutations";

const inputStyle = {
  padding: "9px 12px",
  borderRadius: "10px",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  fontSize: "13px",
};

const cardStyle = {
  padding: "16px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
};

const buttonStyle = {
  ...inputStyle,
  cursor: "pointer",
  fontWeight: 600,
};

export default async function PlanoPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; assemblyId: string }>;
  searchParams: Promise<{ pieza?: string }>;
}) {
  const { org: orgId, assemblyId } = await params;
  const { pieza } = await searchParams;
  // Mismo guard que la lista (../page.tsx): los planos son herramienta de Jose Carlos. Va en cada
  // página y no en un layout compartido a propósito — un layout no se re-ejecuta al navegar entre
  // rutas hermanas del lado del cliente, y un guard que a veces no corre no es un guard.
  await requirePlatformAdminSession();
  const memberRow = await requireOrgMembership(orgId);

  const result = await loadAssembly(memberRow.userId, orgId, assemblyId);
  if (!result.ok) notFound();

  const { assembly, pieces, connections } = result.data;
  const selected = pieces.find((p) => p.id === pieza) ?? null;
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const basePath = `/${orgId}/planos/${assemblyId}`;

  async function crearPieza(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const name = formData.get("name")?.toString().trim();
    if (!name) return;
    await addPiece(row.userId, orgId, assemblyId, {
      name,
      whatItDoes: formData.get("whatItDoes")?.toString().trim() || null,
    });
    revalidatePath(basePath);
  }

  async function ensamblar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const fromPieceId = formData.get("fromPieceId")?.toString();
    const toPieceId = formData.get("toPieceId")?.toString();
    if (!fromPieceId || !toPieceId) return;
    await connectPieces(row.userId, orgId, assemblyId, {
      fromPieceId,
      toPieceId,
      conditionLabel: formData.get("conditionLabel")?.toString().trim() || null,
    });
    revalidatePath(basePath);
  }

  async function guardarDetalle(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const pieceId = formData.get("pieceId")?.toString();
    if (!pieceId) return;
    await updatePiece(row.userId, orgId, assemblyId, pieceId, {
      whatItDoes: formData.get("whatItDoes")?.toString() ?? null,
    });
    revalidatePath(basePath);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-geist-sans), sans-serif",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        maxWidth: "1080px",
        margin: "0 auto",
      }}
    >
      <header>
        <a href={`/${orgId}/planos`} style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
          ← Planos
        </a>
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "8px 0 0" }}>{assembly.name}</h1>
        {assembly.description && (
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "6px 0 0" }}>
            {assembly.description}
          </p>
        )}
      </header>

      <section style={cardStyle}>
        <AssemblyMap
          pieces={pieces}
          connections={connections}
          selectedPieceId={selected?.id ?? null}
          hrefForPiece={(pieceId) => `${basePath}?pieza=${pieceId}`}
        />
        <p style={{ color: "var(--text-muted)", fontSize: "12px", margin: "12px 0 0" }}>
          Click en una pieza para ver qué hace. El contorno punteado marca una pieza creada pero
          todavía sin ensamblar.
        </p>
      </section>

      {selected && (
        <section style={{ ...cardStyle, borderColor: "var(--accent-1)" }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}
          >
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>{selected.name}</h2>
            <a href={basePath} style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
              Cerrar
            </a>
          </div>

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "10px 0 0",
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            {connections
              .filter((c) => c.toPieceId === selected.id)
              .map((c) => (
                <li key={`in-${c.id}`}>viene de: {byId.get(c.fromPieceId)?.name}</li>
              ))}
            {connections
              .filter((c) => c.fromPieceId === selected.id)
              .map((c) => (
                <li key={`out-${c.id}`}>
                  sigue a: {byId.get(c.toPieceId)?.name}
                  {c.conditionLabel ? ` (${c.conditionLabel})` : ""}
                </li>
              ))}
          </ul>

          <form action={guardarDetalle} style={{ marginTop: "12px" }}>
            <input type="hidden" name="pieceId" value={selected.id} />
            <textarea
              name="whatItDoes"
              defaultValue={selected.whatItDoes ?? ""}
              rows={5}
              placeholder="Todo lo que hace esta pieza…"
              style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
            />
            <button type="submit" style={{ ...buttonStyle, marginTop: "8px" }}>
              Guardar
            </button>
          </form>
        </section>
      )}

      <section style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <form action={crearPieza} style={{ ...cardStyle, flex: 1, minWidth: "280px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Nueva pieza</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <input name="name" placeholder="Nombre de la pieza" required style={inputStyle} />
            <input name="whatItDoes" placeholder="Qué hace (opcional)" style={inputStyle} />
            <button type="submit" style={buttonStyle}>
              + Crear suelta
            </button>
          </div>
        </form>

        <form action={ensamblar} style={{ ...cardStyle, flex: 1, minWidth: "280px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Ensamblar</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Esta pieza va antes…
              <select name="fromPieceId" required style={{ ...inputStyle, width: "100%" }}>
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              …de esta
              <select name="toPieceId" required style={{ ...inputStyle, width: "100%" }}>
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              name="conditionLabel"
              placeholder="Condición, si es una de dos opciones"
              style={inputStyle}
            />
            <button type="submit" style={buttonStyle}>
              Conectar
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
