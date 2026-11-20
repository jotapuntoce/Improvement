// Butacas: mapas de recinto como datos, funciones y taquilla con el mapa en vivo (SeatMapLive). Quién ve
// qué lo deciden requireSection("butacas") en la página, el guard de server/seats/** y RLS en Realtime.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { getSessionAccessToken, getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { listVenueMaps, loadSeatMap, sellAtBox } from "@/server/seats/boxOffice.ts";
import { closeSession, createVenueMap, createVenueSession, listSessions, publishSession } from "@/server/seats/venues.ts";
import { SeatMapLive } from "./SeatMapLive.tsx";

const TZ = "America/Mexico_City";
// ponytail: offset fijo UTC-6 (sin horario de verano desde 2022), igual que la agenda.
const OFFSET = "-06:00";
const KIND_LABEL: Record<string, string> = {
  teatro: "Teatro (filas y butacas)",
  restaurante: "Restaurante (mesas de 4)",
  antro: "Antro (mesas de 4)",
  bodas: "Bodas (mesas de 10)",
  eventos: "Eventos (mesas de 10)",
  lotes: "Lotes (manzanas y lotes)",
};
const STATUS_LABEL: Record<string, string> = { borrador: "Borrador", a_la_venta: "A la venta", cerrada: "Cerrada" };
const when = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const field = (formData: FormData, name: string) => formData.get(name)?.toString().trim() ?? "";

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }, ok = pagina): never {
  if (!result.ok) redirect(`${pagina}${pagina.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina.split("?")[0]!);
  redirect(ok);
}

async function actor() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return userId;
}

/** Los dos números del formulario según el tipo: filas×butacas, mesas×personas o manzanas×lotes. */
function layoutParams(kind: string, a: string, b: string) {
  if (kind === "teatro") return { rows: a, seatsPerRow: b };
  if (kind === "lotes") return { blocks: a, lotsPerBlock: b };
  return b ? { tables: a, seatsPerTable: b } : { tables: a };
}

export default async function ButacasPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ s?: string; error?: string; vendidos?: string }>;
}) {
  const { org: orgId } = await params;
  const { s, error, vendidos } = await searchParams;
  const { membership } = await requireSection(orgId, "butacas");
  const userId = membership.userId;
  const pagina = `/${orgId}/butacas`;

  const [maps, sessions, accessToken] = await Promise.all([listVenueMaps(userId, orgId), listSessions(userId, orgId), getSessionAccessToken()]);
  if (!maps.ok || !sessions.ok) notFound();
  const actual = sessions.data.find((x) => x.id === s) ?? sessions.data.find((x) => x.status === "a_la_venta");
  const seatMap = actual ? await loadSeatMap(userId, orgId, actual.id) : null;

  async function nuevoMapa(formData: FormData) {
    "use server";
    const kind = field(formData, "kind");
    finish(
      pagina,
      await createVenueMap(await actor(), orgId, { name: field(formData, "name"), kind, params: layoutParams(kind, field(formData, "a"), field(formData, "b")) }),
    );
  }

  async function nuevaFuncion(formData: FormData) {
    "use server";
    const pesos = Number(field(formData, "price"));
    finish(
      pagina,
      await createVenueSession(await actor(), orgId, {
        mapId: field(formData, "mapId"),
        title: field(formData, "title"),
        startsAt: `${field(formData, "date")}T${field(formData, "time")}:00${OFFSET}`,
        priceCents: Number.isFinite(pesos) ? Math.round(pesos * 100) : -1,
      }),
    );
  }

  async function publicar(formData: FormData) {
    "use server";
    const id = field(formData, "sessionId");
    finish(pagina, await publishSession(await actor(), orgId, id), `${pagina}?s=${id}`);
  }

  async function cerrar(formData: FormData) {
    "use server";
    const id = field(formData, "sessionId");
    finish(pagina, await closeSession(await actor(), orgId, id), `${pagina}?s=${id}`);
  }

  async function vender(formData: FormData) {
    "use server";
    const id = field(formData, "sessionId");
    const back = `${pagina}?s=${id}`;
    const seatIds = formData.getAll("seatId").map(String);
    const r = await sellAtBox(await actor(), orgId, { sessionId: id, seatIds, buyerName: field(formData, "buyerName") });
    finish(back, r, r.ok ? `${back}&vendidos=${r.data.sold}` : back);
  }

  const realtime =
    accessToken && env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? { accessToken, url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
      : null;

  return (
    <main className="config-page" style={{ maxWidth: "64rem" }}>
      <h1 className="config-title">Butacas</h1>
      {error && (
        <p role="alert" className="invite-error">
          {error}
        </p>
      )}
      {vendidos && (
        <p role="status" className="config-hint">
          Vendidos en taquilla: {vendidos}.
        </p>
      )}

      <section className="config-card" aria-labelledby="funciones">
        <h2 id="funciones" className="config-card-title">
          Funciones
        </h2>
        {sessions.data.length === 0 && <p className="config-hint">Todavía no hay funciones.</p>}
        <ul className="equipo-list">
          {sessions.data.map((f) => (
            <li key={f.id}>
              <Link href={`${pagina}?s=${f.id}`} aria-current={f.id === actual?.id ? "page" : undefined} className="panel-btn-ghost">
                {f.title}
              </Link>{" "}
              · {when.format(f.startsAt)} · {f.mapName} · {money.format(f.priceCents / 100)} · {STATUS_LABEL[f.status] ?? f.status}
              {f.status !== "cerrada" && (
                <form action={f.status === "borrador" ? publicar : cerrar} className="inline">
                  <input type="hidden" name="sessionId" value={f.id} />{" "}
                  <button type="submit" className="panel-btn-ghost" aria-label={`${f.status === "borrador" ? "Publicar" : "Cerrar"}: ${f.title}`}>
                    {f.status === "borrador" ? "Publicar" : "Cerrar"}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {actual && seatMap?.ok && (
        <form action={vender} className="config-form config-card" aria-label="Taquilla">
          <h2 className="config-card-title">
            Taquilla · {actual.title} · {STATUS_LABEL[actual.status] ?? actual.status}
          </h2>
          <input type="hidden" name="sessionId" value={actual.id} />
          <SeatMapLive sessionId={actual.id} seats={seatMap.data.seats} realtime={realtime} />
          {actual.status === "a_la_venta" && (
            <>
              <label className="permiso-field">
                <span>Nombre del comprador (opcional)</span>
                <input name="buyerName" maxLength={80} className="config-input" />
              </label>
              <button type="submit" className="panel-cta">
                Vender en taquilla
              </button>
            </>
          )}
        </form>
      )}

      <form action={nuevaFuncion} className="config-form config-card" aria-label="Nueva función">
        <h2 className="config-card-title">Nueva función</h2>
        {maps.data.length === 0 ? (
          <p className="config-hint">Primero crea un mapa.</p>
        ) : (
          <>
            <label className="permiso-field">
              <span>Mapa</span>
              <select name="mapId" required className="config-input">
                {maps.data.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="permiso-field">
              <span>Título de la función</span>
              <input name="title" required maxLength={120} className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Fecha</span>
              <input name="date" type="date" required className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Hora</span>
              <input name="time" type="time" required defaultValue="20:00" className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Precio por lugar (MXN)</span>
              <input name="price" type="number" min={0} step="0.01" required className="config-input" />
            </label>
            <button type="submit" className="panel-cta">
              Crear función
            </button>
          </>
        )}
      </form>

      <form action={nuevoMapa} className="config-form config-card" aria-label="Nuevo mapa">
        <h2 className="config-card-title">Nuevo mapa</h2>
        <label className="permiso-field">
          <span>Nombre del mapa</span>
          <input name="name" required maxLength={80} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Tipo de lugar</span>
          <select name="kind" className="config-input" defaultValue="teatro">
            {Object.keys(KIND_LABEL).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="permiso-field">
          <span>Filas, mesas o manzanas</span>
          <input name="a" type="number" min={1} max={60} required className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Butacas por fila, personas por mesa o lotes por manzana</span>
          <input name="b" type="number" min={1} className="config-input" />
        </label>
        <p className="config-hint">Hasta 2000 lugares por mapa. En mesas, deja vacío el segundo número para usar el tamaño de siempre.</p>
        <button type="submit" className="panel-cta">
          Crear mapa
        </button>
      </form>
    </main>
  );
}
