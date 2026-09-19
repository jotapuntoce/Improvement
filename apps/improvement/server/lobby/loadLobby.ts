// Lo que la recepción pone a la vista, en una sola carga.
//
// La recepción no es una pantalla más: es la primera que ve el dueño al entrar a su empresa, y
// enseña seis cosas a la vez. Cargarlas desde la ruta sería seis loaders sueltos que nadie puede
// mirar juntos; aquí están las seis, y se ve de un vistazo qué se consulta y con qué permiso.
//
// Dos reglas que este archivo sostiene:
//
//  1. Un número que la persona no puede ver no se convierte en cero: se queda en `undefined` y el
//     mueble lo dibuja como una raya. Si el dueño apagó Clientes, o alguien no tiene alcance, su
//     pantalla da 404 — que la pared del lobby cantara el número sería una fuga chica pero real, y
//     además una contradicción con ese 404.
//  2. Qué mueble abre qué sección es código (el mapa de abajo), pero cómo se llama y si se abre es
//     dato: sale de organization.section_labels vía loadVisibleSections. El dueño decide.
//
// `mapa` no tiene mueble a propósito: en qué etapa va la empresa lo cuenta el edificio desde
// afuera (Building.tsx), y contarlo dos veces en dos lugares distintos es pedir que se
// contradigan.
import { and, count, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, objective, profile } from "@jotapuntoce/db/schema";
import { saludo } from "@jotapuntoce/ui/building/greeting.ts";
import type { LobbyZona } from "@jotapuntoce/ui/building/lobbyPlano.ts";
import { assertMembership } from "../auth/guard.ts";
import { loadVisibleSections } from "../permissions/loadSections.ts";
import { listActivePowerups, pointsBalance } from "../powerups/mutations.ts";
import { listProjects } from "../projects/mutations.ts";
import { loadTeamStatus } from "../employees/loadTeamStatus.ts";

/** Qué mueble de la recepción abre cada sección. Las que no están aquí no tienen mueble. */
const ZONA_DE_SECCION: Record<string, LobbyZona> = {
  objetivos: "objetivos",
  equipo: "equipo",
  clientes: "clientes",
  powerups: "powerups",
};

/** El color del marco de un retrato: cómo va esa persona con sus objetivos. */
const COLOR_DE_ESTADO: Record<string, string> = {
  alerta: "var(--danger)",
  activo: "var(--building-accent)",
  ok: "var(--success)",
};

export interface LobbyPuertaInfo {
  zona: LobbyZona;
  slug: string;
  /** El nombre que el dueño le puso a esa sección, o el de fábrica. */
  label: string;
}

export interface LobbyGraph {
  team: { id: string; name: string; color: string }[];
  projects: { id: string; name: string; progress: number; areaColor: string | null }[];
  objectivesOpen?: number;
  clientsCount?: number;
  powerupsCount?: number;
  /** El parte del día de quien atiende, ya resuelto en el servidor. */
  greeting: string;
  /** Los muebles que sí se abren para esta persona, con su nombre. */
  puertas: LobbyPuertaInfo[];
  /** Las secciones visibles que no tienen mueble — hoy solo el mapa de construcción. */
  sueltas: { slug: string; label: string }[];
}

export async function loadLobby(userId: string, orgId: string): Promise<LobbyGraph> {
  await assertMembership(userId, orgId);

  const secciones = await loadVisibleSections(userId, orgId);
  const visible = new Set(secciones.map((s) => s.slug));

  const [equipo, projects, quien, balance, catalogo] = await Promise.all([
    // El equipo sale del loader compartido, con su filtro de platform admins ya puesto: es uno de
    // los tres lugares que listan personas de un org, y no hay un cuarto.
    loadTeamStatus(userId, orgId),
    listProjects(userId, orgId),
    db.select({ fullName: profile.fullName }).from(profile).where(eq(profile.id, userId)).limit(1),
    pointsBalance(userId),
    listActivePowerups(),
  ]);

  const [metas, cuentas, entregas] = await Promise.all([
    visible.has("objetivos")
      ? db
          .select({ n: count() })
          .from(objective)
          .where(and(eq(objective.orgId, orgId), ne(objective.status, "completed")))
      : null,
    visible.has("clientes")
      ? db.select({ n: count() }).from(client).where(eq(client.orgId, orgId))
      : null,
    // Lo que está detenido esperando al dueño: entregado, con evidencia, y el revisor todavía no
    // opina. Es lo primero que dice el saludo porque es lo único que bloquea a alguien más.
    db
      .select({ n: count() })
      .from(objective)
      .where(
        and(
          eq(objective.orgId, orgId),
          eq(objective.status, "completed"),
          eq(objective.reviewStatus, "sin_revisar"),
          isNotNull(objective.evidenceValue),
        ),
      ),
  ]);

  // "Por canjear" es lo que esta persona alcanza a canjear HOY con sus puntos, no el tamaño del
  // catálogo: un número que no depende de ti no es un pendiente tuyo.
  const powerupsCount = visible.has("powerups")
    ? catalogo.filter((p) => p.pointsCost <= balance).length
    : undefined;

  const objectivesOpen = metas ? Number(metas[0]?.n ?? 0) : undefined;
  const clientsCount = cuentas ? Number(cuentas[0]?.n ?? 0) : undefined;

  const puertas: LobbyPuertaInfo[] = [];
  const sueltas: { slug: string; label: string }[] = [];
  for (const s of secciones) {
    const zona = ZONA_DE_SECCION[s.slug];
    if (zona) puertas.push({ zona, slug: s.slug, label: s.label });
    else sueltas.push({ slug: s.slug, label: s.label });
  }

  return {
    team: equipo.map((p) => ({
      id: p.id,
      name: p.name,
      color: COLOR_DE_ESTADO[p.status] ?? "var(--building-accent)",
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      progress: p.progress,
      areaColor: p.areaColor,
    })),
    objectivesOpen,
    clientsCount,
    powerupsCount,
    greeting: saludo({
      nombre: quien[0]?.fullName,
      entregasPorRevisar: Number(entregas[0]?.n ?? 0),
      objetivosAbiertos: objectivesOpen,
      proyectosActivos: projects.length,
      powerupsPorCanjear: powerupsCount,
    }),
    puertas,
    sueltas,
  };
}
