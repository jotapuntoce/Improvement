// Los planos de la organización. Sin ningún "use client": el form nativo con Server Action ya crea
// un plano sin JS, mismo criterio que /[org]/clientes.
import { revalidatePath } from "next/cache";
import { requireOrgMembership, requirePlatformAdminSession } from "@/server/auth/guard";
import { createAssembly, listAssemblies } from "@/server/assembly/mutations";

const inputStyle = {
  padding: "9px 12px",
  borderRadius: "10px",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  fontSize: "13px",
};

export default async function PlanosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  // Herramienta de Jose Carlos, no del cliente (decisión explícita suya): los planos son cómo él
  // diseña, y en apps/admin la vista equivalente ya es solo lectura. Los dos guards juntos, no uno:
  // platform admin dice QUIÉN, requireOrgMembership sigue diciendo A CUÁL org — un admin sin
  // membership en este org tampoco pasa. 404 y nunca 403, igual que el resto del guard.
  await requirePlatformAdminSession();
  const memberRow = await requireOrgMembership(orgId);

  const { data } = await listAssemblies(memberRow.userId, orgId);

  async function create(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const name = formData.get("name")?.toString().trim();
    if (!name) return;
    const description = formData.get("description")?.toString().trim() || null;
    await createAssembly(row.userId, orgId, { name, description });
    revalidatePath(`/${orgId}/planos`);
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
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      <header>
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Planos</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "6px 0 0" }}>
          Cada plano es un proyecto visto como piezas conectadas.
        </p>
      </header>

      <form action={create} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input name="name" placeholder="Nombre del plano" required style={inputStyle} />
        <input
          name="description"
          placeholder="De qué trata (opcional)"
          style={{ ...inputStyle, flex: 1, minWidth: "160px" }}
        />
        <button
          type="submit"
          style={{
            padding: "9px 16px",
            borderRadius: "10px",
            border: "none",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
            color: "var(--bg)",
          }}
        >
          + Nuevo plano
        </button>
      </form>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {data.assemblies.map((a) => (
          <li key={a.id}>
            <a
              href={`/${orgId}/planos/${a.id}`}
              style={{
                display: "block",
                padding: "16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <p style={{ fontWeight: 600, margin: 0 }}>{a.name}</p>
              {a.description && (
                <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "4px 0 0" }}>
                  {a.description}
                </p>
              )}
            </a>
          </li>
        ))}
        {data.assemblies.length === 0 && (
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Sin planos todavía. Crea el primero arriba.
          </p>
        )}
      </ul>
    </main>
  );
}
