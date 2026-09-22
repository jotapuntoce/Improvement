// Mete en una empresa la información que ya tenía antes de Improvement: áreas, cartera y proyectos.
//
// Para qué: el motor de las siete fases observa lo que hay en la base. Con la empresa vacía, la
// fase de observación le pide al modelo que encuentre patrones en la nada, y el modelo inventa —
// que es lo peor que le puede pasar a un producto cuya única regla es que el dueño le crea. Esta
// es la foto de arranque: se corre una vez, con lo que la empresa ya opera hoy.
//
// La empresa entra por parámetro, nunca por nombre literal: `packages/db` es motor genérico y no
// puede saber que existe una empresa concreta (.claude/rules/motor-generico.md, Non-negotiable #2).
// Lo que se importa vive en un archivo JSON de afuera, no en una constante de aquí.
//
// LA GENTE NO SE IMPORTA, a propósito. Un empleado necesita una cuenta de Supabase Auth para
// entrar, y este script no puede crearla: la service-role key solo se toca desde apps/admin
// (Non-negotiable #3). Meter filas de `profile` con ids inventados dejaría a cada persona con dos
// identidades —la importada y la real del día que acepte su invitación— y los objetivos colgando
// de la equivocada. El equipo entra por el flujo de invitación, como siempre.
//
// Uso:
//   pnpm db:import <slug-o-id-de-la-empresa> <archivo.json>
//   pnpm db:import <slug-o-id> <archivo.json> --dry-run   (enseña qué haría, sin escribir)
//
// Formato del archivo (todo opcional salvo el nombre de cada cosa):
//
//   {
//     "areas":    [{ "name": "Ventas", "color": "#7c5cff", "description": "…", "icon": "ventas" }],
//     "clients":  [{ "name": "Acme", "area": "Ventas", "healthStatus": "healthy",
//                    "dealStage": "ganado", "dealValue": 120000, "notes": "…",
//                    "lastContactAt": "2026-09-01", "nextFollowUpAt": "2026-10-01" }],
//     "projects": [{ "name": "Portal", "area": "Operaciones", "detail": "…", "progress": 40,
//                    "status": "activo", "budget": 50000, "spent": 12000,
//                    "startAt": "2026-08-01", "dueAt": "2026-12-15", "risk": "medio" }]
//   }
//
// Idempotente por nombre: lo que ya existe con ese nombre en esa empresa se ACTUALIZA, no se
// duplica. Correr el comando dos veces por error no te deja la cartera repetida — que es
// exactamente el accidente que vuelve inservible una carga inicial.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { area, client, organization, project } from "./schema.ts";

process.loadEnvFile(".env.local");

/** Una fecha del JSON, o null. Una cadena que no es fecha se rechaza en vez de volverse "Invalid
 *  Date" y acabar como null silencioso en la base — un dato mal escrito tiene que doler ahora. */
function fecha(v: unknown, campo: string): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`${campo}: "${v}" no es una fecha.`);
  return d;
}

/** Un número del JSON como lo quiere numeric(14,2), o null. */
function monto(v: unknown, campo: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${campo}: "${v}" no es un monto válido.`);
  return n.toFixed(2);
}

/** Los mismos cinco tonos que ofrece la pantalla de áreas (server/areas/mutations.ts). Están
 *  repetidos aquí y no importados porque `packages/db` no puede depender de `apps/*` (boundary de
 *  CLAUDE.md), y un color de área es dato, no lógica: si la paleta cambia allá, lo peor que pasa
 *  aquí es que una carga inicial entre con un tono viejo que el dueño reasigna en un clic. */
const TONOS = ["#7c5cff", "#22d3ee", "#f59e0b", "#10b981", "#f87171"];

function texto(v: unknown): string | null {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
}

interface Archivo {
  areas?: Record<string, unknown>[];
  clients?: Record<string, unknown>[];
  projects?: Record<string, unknown>[];
}

async function main() {
  const [destino, ruta, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");

  if (!destino || !ruta) {
    console.error("Uso: pnpm db:import <slug-o-id-de-la-empresa> <archivo.json> [--dry-run]");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL_DIRECT (o DATABASE_URL) en .env.local");

  const datos = JSON.parse(readFileSync(ruta, "utf8")) as Archivo;
  const sql = postgres(url, { prepare: false });
  const db = drizzle(sql);

  try {
    // Por slug o por id: quien corre esto tiene el slug a la mano, no un uuid. La forma completa
    // y no "¿tiene guiones?" — los slugs también los llevan, y tratar uno como uuid hace que
    // Postgres reviente con un error de casteo en vez de decir "no encontré esa empresa".
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(destino);
    const [org] = await db
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .where(esUuid ? eq(organization.id, destino) : eq(organization.slug, destino))
      .limit(1);

    if (!org) throw new Error(`No encontré ninguna empresa con slug o id "${destino}".`);

    console.log(`\n  Empresa: ${org.name}${dryRun ? "   (--dry-run: no se escribe nada)" : ""}\n`);

    // --- Áreas primero: los clientes y los proyectos se cuelgan de ellas por NOMBRE, porque un
    //     archivo escrito por una persona no trae uuids.
    const areasPorNombre = new Map<string, string>();
    for (const row of await db.select({ id: area.id, name: area.name }).from(area).where(eq(area.orgId, org.id))) {
      areasPorNombre.set(row.name.toLowerCase(), row.id);
    }

    let areasNuevas = 0;
    for (const a of datos.areas ?? []) {
      const nombre = texto(a.name);
      if (!nombre) throw new Error("Un área del archivo no trae nombre.");
      const existente = areasPorNombre.get(nombre.toLowerCase());

      const valores = {
        description: texto(a.description),
        icon: texto(a.icon),
        ...(texto(a.color) ? { color: String(a.color) } : {}),
      };

      if (existente) {
        if (!dryRun) await db.update(area).set(valores).where(eq(area.id, existente));
        console.log(`  · área actualizada   ${nombre}`);
      } else if (dryRun) {
        // Se apunta igual en el mapa, con un id de mentira: en una corrida real esta área SI
        // existiría cuando toque colgarle clientes y proyectos, y sin esto el simulacro avisaba
        // de áreas faltantes que nunca van a faltar. Una alarma falsa en la única pantalla que
        // sirve para revisar antes de escribir es peor que ninguna alarma.
        areasPorNombre.set(nombre.toLowerCase(), "(se crearía)");
        console.log(`  + área nueva         ${nombre}`);
        areasNuevas++;
      } else {
        // `color` es notNull sin default en el esquema, así que en un alta no puede faltar: si el
        // archivo no lo trae, se reparte la paleta en orden en vez de pintar todo del mismo tono.
        const tono = texto(a.color) ?? TONOS[areasPorNombre.size % TONOS.length]!;
        const [nueva] = await db
          .insert(area)
          .values({ orgId: org.id, name: nombre, ...valores, color: tono })
          .returning({ id: area.id });
        if (nueva) areasPorNombre.set(nombre.toLowerCase(), nueva.id);
        console.log(`  + área nueva         ${nombre}`);
        areasNuevas++;
      }
    }

    /** El área a la que apunta una fila, por nombre. Un nombre que no existe se avisa y se deja
     *  en null: mejor un cliente sin área que la carga entera abortada por una errata. */
    function areaDe(nombre: unknown, de: string): string | null {
      const n = texto(nombre);
      if (!n) return null;
      const id = areasPorNombre.get(n.toLowerCase());
      if (!id) console.warn(`    ! ${de}: no existe el área "${n}" — queda sin área.`);
      return id ?? null;
    }

    // --- Cartera
    const clientesPorNombre = new Map<string, string>();
    for (const row of await db.select({ id: client.id, name: client.name }).from(client).where(eq(client.orgId, org.id))) {
      clientesPorNombre.set(row.name.toLowerCase(), row.id);
    }

    let clientesNuevos = 0;
    for (const c of datos.clients ?? []) {
      const nombre = texto(c.name);
      if (!nombre) throw new Error("Un cliente del archivo no trae nombre.");

      const valores = {
        areaId: areaDe(c.area, `cliente ${nombre}`),
        notes: texto(c.notes),
        lastContactAt: fecha(c.lastContactAt, `cliente ${nombre}.lastContactAt`),
        nextFollowUpAt: fecha(c.nextFollowUpAt, `cliente ${nombre}.nextFollowUpAt`),
        dealValue: monto(c.dealValue, `cliente ${nombre}.dealValue`),
        ...(texto(c.healthStatus) ? { healthStatus: String(c.healthStatus) } : {}),
        ...(texto(c.dealStage) ? { dealStage: String(c.dealStage) } : {}),
        ...(Array.isArray(c.riskFactors) ? { riskFactors: c.riskFactors } : {}),
        updatedAt: new Date(),
      };

      const existente = clientesPorNombre.get(nombre.toLowerCase());
      if (existente) {
        if (!dryRun) await db.update(client).set(valores).where(eq(client.id, existente));
        console.log(`  · cliente actualizado ${nombre}`);
      } else {
        if (!dryRun) await db.insert(client).values({ orgId: org.id, name: nombre, ...valores });
        console.log(`  + cliente nuevo       ${nombre}`);
        clientesNuevos++;
      }
    }

    // --- Proyectos
    const proyectosPorNombre = new Map<string, string>();
    for (const row of await db.select({ id: project.id, name: project.name }).from(project).where(eq(project.orgId, org.id))) {
      proyectosPorNombre.set(row.name.toLowerCase(), row.id);
    }

    let proyectosNuevos = 0;
    for (const p of datos.projects ?? []) {
      const nombre = texto(p.name);
      if (!nombre) throw new Error("Un proyecto del archivo no trae nombre.");

      const avance = p.progress === undefined ? 0 : Number(p.progress);
      if (!Number.isInteger(avance) || avance < 0 || avance > 100) {
        throw new Error(`proyecto ${nombre}.progress: "${p.progress}" no es un entero de 0 a 100.`);
      }

      const valores = {
        areaId: areaDe(p.area, `proyecto ${nombre}`),
        detail: texto(p.detail),
        progress: avance,
        startAt: fecha(p.startAt, `proyecto ${nombre}.startAt`),
        dueAt: fecha(p.dueAt, `proyecto ${nombre}.dueAt`),
        budget: monto(p.budget, `proyecto ${nombre}.budget`),
        spent: monto(p.spent, `proyecto ${nombre}.spent`),
        ...(texto(p.status) ? { status: String(p.status) } : {}),
        ...(texto(p.risk) ? { risk: String(p.risk) } : {}),
        updatedAt: new Date(),
      };

      const existente = proyectosPorNombre.get(nombre.toLowerCase());
      if (existente) {
        if (!dryRun) await db.update(project).set(valores).where(eq(project.id, existente));
        console.log(`  · proyecto actualizado ${nombre}`);
      } else {
        if (!dryRun) await db.insert(project).values({ orgId: org.id, name: nombre, ...valores });
        console.log(`  + proyecto nuevo       ${nombre}`);
        proyectosNuevos++;
      }
    }

    // Las dependencias entre proyectos se dejan fuera del archivo a propósito: quién espera a
    // quién es una decisión de coordinación que el dueño toma mirando el tablero, no un dato que
    // venga en la hoja de cálculo de la que sale esta carga.
    console.log(`
  Listo${dryRun ? " (simulado)" : ""}: ${areasNuevas} áreas, ${clientesNuevos} clientes y ${proyectosNuevos} proyectos nuevos.

  Falta la gente: este script no crea cuentas. Invita a tu equipo desde /[org]/equipo y, cuando
  acepten, asígnales su área ahí mismo. Después de eso Improvement ya tiene qué observar.
`);
  } finally {
    await sql.end();
  }
}

await main();
