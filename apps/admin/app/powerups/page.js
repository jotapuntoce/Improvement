// CRUD del catálogo global de PowerUps. Server Component + Server Actions contra la base real —
// mismo patrón que app/prospects/actions.js (db normal, sin service-role key: esta tabla no tiene
// RLS que Jose Carlos necesite bypasear vía service-role, el rol de Postgres de la app ya la lee y
// escribe completa).
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { powerupPartner } from "@jotapuntoce/db/schema";
import { db } from "../../lib/db.js";

async function createPartner(formData) {
  "use server";
  const businessName = formData.get("businessName")?.toString().trim();
  const category = formData.get("category")?.toString().trim();
  const discountDescription = formData.get("discountDescription")?.toString().trim();
  const redemptionInstructions = formData.get("redemptionInstructions")?.toString().trim();
  const pointsCost = Number(formData.get("pointsCost"));

  if (
    !businessName ||
    !category ||
    !discountDescription ||
    !redemptionInstructions ||
    !Number.isFinite(pointsCost) ||
    pointsCost <= 0
  ) {
    return; // validación mínima — el form se vuelve a mostrar tal cual, sin guardado parcial
  }

  await db.insert(powerupPartner).values({
    businessName,
    category,
    discountDescription,
    redemptionInstructions,
    pointsCost,
  });

  revalidatePath("/powerups");
}

export default async function PowerupsPage() {
  const partners = await db.select().from(powerupPartner).orderBy(powerupPartner.createdAt);

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          <h2>Catálogo de PowerUps</h2>
          <p className="topbar-subtitle">
            Desactivar un partner lo oculta del catálogo de todos los orgs sin borrar los canjes
            históricos que ya lo referencian.
          </p>
        </div>
      </section>

      <form action={createPartner} className="toolbar" style={{ flexWrap: "wrap" }}>
        <input className="input" name="businessName" placeholder="Nombre del negocio" required />
        <input className="input" name="category" placeholder="Categoría" required />
        <input
          className="input"
          name="discountDescription"
          placeholder="Descripción del descuento"
          required
        />
        <input
          className="input"
          name="redemptionInstructions"
          placeholder="Instrucciones de canje"
          required
        />
        <input
          className="input"
          name="pointsCost"
          type="number"
          min="1"
          placeholder="Costo en puntos"
          required
          style={{ maxWidth: "140px" }}
        />
        <button type="submit" className="btn btn-primary">
          + Nuevo partner
        </button>
      </form>

      {partners.length === 0 ? (
        <p className="empty-hint">Sin partners todavía.</p>
      ) : (
        <section className="product-grid">
          {partners.map((partner) => {
            async function toggleActive() {
              "use server";
              await db
                .update(powerupPartner)
                .set({ isActive: !partner.isActive })
                .where(eq(powerupPartner.id, partner.id));
              revalidatePath("/powerups");
            }

            return (
              <article key={partner.id} className="product-card">
                <div className="product-body">
                  <div className="product-header">
                    <h3>{partner.businessName}</h3>
                    <span className="price-tag">{partner.pointsCost} pts</span>
                  </div>
                  <span className="category-chip" style={{ "--chip-color": "var(--accent-2)" }}>
                    {partner.category}
                  </span>
                  <p className="product-desc">{partner.discountDescription}</p>
                  <span
                    className="status-badge"
                    style={{
                      position: "static",
                      alignSelf: "flex-start",
                      "--status-color": partner.isActive ? "var(--success)" : "var(--text-muted)",
                    }}
                  >
                    {partner.isActive ? "Activo" : "Inactivo"}
                  </span>
                  <form action={toggleActive}>
                    <button type="submit" className={partner.isActive ? "btn btn-danger" : "btn btn-ghost"}>
                      {partner.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
