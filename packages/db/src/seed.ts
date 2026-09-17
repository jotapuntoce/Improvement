// Llena una empresa con datos de demostración: áreas, equipo, objetivos, cartera e indicadores.
//
// Para qué: un cliente que entra a su panel recién creado ve seis ceros y una lista de pendientes
// vacía, y no hay forma de que entienda para qué sirve el producto. Este seed deja la empresa como
// se ve cuando YA está operando, para poder enseñársela antes de que exista de verdad.
//
// La empresa entra por parámetro, nunca por nombre literal: `packages/db` es motor genérico y no
// puede saber que existe un cliente llamado Jaime o una empresa llamada Taller Digital
// (.claude/rules/motor-generico.md, Non-negotiable #2 de CLAUDE.md). Los datos de adentro sí son un
// giro concreto —una constructora— porque son datos, no lógica: para otro giro se cambia la
// constante, no el código.
//
// Uso:
//   pnpm db:seed <slug-o-id-de-la-empresa> [--reset]
//
// --reset borra los datos de demostración anteriores de esa empresa antes de escribir. Sin él, el
// comando se niega a correr sobre una empresa que ya tiene áreas — para que nunca duplique la
// cartera de un cliente real por un comando corrido dos veces.
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  area,
  client,
  employeePointsLedger,
  membership,
  objective,
  orgBuildStage,
  orgKpi,
  organization,
  profile,
} from "./schema.ts";

process.loadEnvFile(".env.local");

const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

/** El giro de la demostración. Cambiar esto cambia la empresa que se enseña; el código no se entera. */
const AREAS = [
  { name: "Autorizaciones", color: "#7c5cff" },
  { name: "Construcción", color: "#f59e0b" },
  { name: "Ventas", color: "#22d3ee" },
  { name: "Postventa", color: "#10b981" },
] as const;

const EQUIPO = ["Lucía Ramírez", "Andrés Peña", "Mariana Cota"];

/** `area` indexa AREAS; `due` son días desde hoy (negativo = ya venció). */
const OBJETIVOS = [
  { area: 0, title: "Autorizar proyecto Residencial Las Lomas", weight: 90, due: -3, status: "in_progress" },
  { area: 0, title: "Revisar expediente Torre Centro", weight: 70, due: 4, status: "pending" },
  { area: 0, title: "Firmar licencia de construcción Casa Bosques", weight: 60, due: 12, status: "pending" },
  { area: 1, title: "Terminar cimentación Torre Centro", weight: 85, due: 9, status: "in_progress" },
  { area: 1, title: "Colado de losa nivel 3", weight: 60, due: 21, status: "pending" },
  { area: 1, title: "Entregar obra Casa Bosques", weight: 95, due: -10, status: "completed" },
  { area: 1, title: "Cerrar bitácora Residencial Del Valle", weight: 50, due: -25, status: "completed" },
  { area: 2, title: "Cerrar venta del lote 14", weight: 80, due: 6, status: "in_progress" },
  { area: 2, title: "Cotización para cliente corporativo", weight: 65, due: -1, status: "pending" },
  { area: 2, title: "Seguimiento a prospectos del mes", weight: 40, due: 15, status: "in_progress" },
  { area: 3, title: "Atender garantía de Casa 22", weight: 75, due: 2, status: "pending" },
  { area: 3, title: "Encuesta de satisfacción trimestral", weight: 35, due: 28, status: "pending" },
] as const;

const CARTERA = [
  { name: "Grupo Inmobiliario Norte", healthStatus: "healthy" },
  { name: "Constructora Peninsular", healthStatus: "healthy" },
  { name: "Desarrollos Altavista", healthStatus: "at_risk" },
  { name: "Familia Beltrán", healthStatus: "healthy" },
];

/**
 * Los cuatro indicadores del giro, cada uno con SU conexión.
 *
 * Tres salen solos de los objetivos de su área y se mueven cuando el equipo trabaja; "Ventas" queda
 * en `manual` a propósito, porque no existe todavía una tabla de ventas de la que salga — es el caso
 * que muestra el escape: el número se captura y el día que haya de dónde sacarlo, se repunta la fila
 * sin tocar el panel.
 */
const INDICADORES = [
  { label: "Autorización de proyectos", hint: "Proyectos esperando tu firma", source: "objetivos", areaIndex: 0, config: { estado: "abiertos" }, format: "numero", manualValue: null },
  { label: "Avances de construcción", hint: "Entregas cerradas en obra", source: "objetivos", areaIndex: 1, config: { estado: "completados" }, format: "numero", manualValue: null },
  { label: "Ventas", hint: "Cerrado en el trimestre", source: "manual", areaIndex: null, config: {}, format: "dinero", manualValue: 4_850_000 },
  { label: "Servicio postventa", hint: "Garantías y atenciones abiertas", source: "objetivos", areaIndex: 3, config: { estado: "abiertos" }, format: "numero", manualValue: null },
] as const;

/** Hasta dónde llegó la construcción de la empresa digital. El resto quedan bloqueadas. */
const FASE_ACTUAL = 6;

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  const target = process.argv[2];
  const reset = process.argv.includes("--reset");

  if (!target || target.startsWith("--")) {
    fail("Uso: pnpm db:seed <slug-o-id-de-la-empresa> [--reset]");
  }

  const url = process.env.DATABASE_URL_DIRECT;
  if (!url) fail("DATABASE_URL_DIRECT no está definida — el seed nunca usa el pooler.");

  const sql = postgres(url, { prepare: false });
  const db = drizzle(sql);

  try {
    // Por slug o por id: quien corre esto tiene a la mano lo que ve en la URL del panel, que puede
    // ser cualquiera de los dos.
    const isUuid = /^[0-9a-f-]{36}$/i.test(target);
    const [org] = await db
      .select()
      .from(organization)
      .where(isUuid ? eq(organization.id, target) : eq(organization.slug, target))
      .limit(1);

    if (!org) fail(`No existe ninguna empresa con slug o id "${target}".`);

    const existing = await db.select({ id: area.id }).from(area).where(eq(area.orgId, org.id));
    if (existing.length > 0 && !reset) {
      fail(
        `"${org.name}" ya tiene ${existing.length} áreas. Corre con --reset si quieres reemplazar ` +
          `sus datos de demostración, o elige otra empresa.`,
      );
    }

    if (reset) {
      // employee_points_ledger referencia objective con onDelete: restrict, así que va primero o el
      // borrado de objetivos falla en cuanto alguien haya ganado un punto.
      await db.delete(employeePointsLedger).where(eq(employeePointsLedger.orgId, org.id));
      await db.delete(objective).where(eq(objective.orgId, org.id));
      await db.delete(area).where(eq(area.orgId, org.id));
      await db.delete(client).where(eq(client.orgId, org.id));
    }

    // Fuera del --reset: los indicadores se reemplazan siempre. Toda empresa nace con seis por
    // defecto (defaultOrgKpis), así que insertar los cuatro del giro encima dejaría diez — más del
    // máximo que la tarjeta dibuja. El seed define qué mide esta empresa, no agrega a lo que había.
    await db.delete(orgKpi).where(eq(orgKpi.orgId, org.id));

    const areaRows = await db
      .insert(area)
      .values(AREAS.map((a) => ({ orgId: org.id, name: a.name, color: a.color })))
      .returning({ id: area.id, name: area.name });

    // Perfiles sin usuario de Supabase Auth: son gente de adorno para que el panel se vea habitado,
    // no cuentas con las que alguien vaya a entrar. Cuando el equipo real llegue, entra por
    // invitación como cualquier empleado.
    const team: string[] = [];
    for (const fullName of EQUIPO) {
      const userId = crypto.randomUUID();
      const slug = fullName.toLowerCase().replace(/\s+/g, ".").normalize("NFD").replace(/[̀-ͯ]/g, "");
      await db.insert(profile).values({ id: userId, email: `${slug}@demo.local`, fullName });
      await db.insert(membership).values({ userId, orgId: org.id, role: "employee", acceptedAt: new Date() });
      team.push(userId);
    }

    await db.insert(objective).values(
      OBJETIVOS.map((o, i) => ({
        orgId: org.id,
        areaId: areaRows[o.area]?.id ?? null,
        title: o.title,
        impactWeight: o.weight,
        // Reparte el trabajo entre el equipo en vez de dejarlo todo en una persona: así la vista de
        // responsabilidad enseña algo cuando se le muestre al cliente.
        assignedEmployeeId: team[i % team.length] ?? null,
        status: o.status,
        dueDate: days(o.due),
        completedAt: o.status === "completed" ? days(o.due) : null,
      })),
    );

    await db
      .insert(client)
      .values(CARTERA.map((c) => ({ orgId: org.id, name: c.name, healthStatus: c.healthStatus })));

    await db.insert(orgKpi).values(
      INDICADORES.map((k, position) => ({
        orgId: org.id,
        label: k.label,
        hint: k.hint,
        source: k.source,
        config:
          k.areaIndex === null
            ? k.config
            : { ...k.config, areaId: areaRows[k.areaIndex]?.id ?? null },
        manualValue: k.manualValue,
        format: k.format,
        position,
      })),
    );

    // El mapa de construcción hasta la fase en curso — una empresa con objetivos vivos no puede
    // seguir marcada en "Solicitud recibida".
    const stages = await db.select().from(orgBuildStage).where(eq(orgBuildStage.orgId, org.id));

    // No las crea si faltan: los nombres de las fases viven en packages/ui y packages/db no importa
    // nada interno del monorepo (tabla de boundaries de CLAUDE.md). Una empresa creada antes de que
    // se sembraran las 8 se queda corta, y eso hay que verlo, no descubrirlo en el panel del cliente.
    if (stages.length > 0 && stages.length < 8) {
      console.warn(
        `\n  Ojo: "${org.name}" solo tiene ${stages.length} de las 8 fases de construcción — se creó ` +
          `antes de que se sembraran completas. El rastreador va a verse incompleto hasta que se ` +
          `agreguen las que faltan desde apps/admin.`,
      );
    }

    if (stages.length > 0) {
      const done = stages.filter((s) => s.stageOrder < FASE_ACTUAL).map((s) => s.id);
      const current = stages.filter((s) => s.stageOrder === FASE_ACTUAL).map((s) => s.id);
      const locked = stages.filter((s) => s.stageOrder > FASE_ACTUAL).map((s) => s.id);
      if (done.length) {
        await db
          .update(orgBuildStage)
          .set({ status: "completada", completedAt: new Date() })
          .where(inArray(orgBuildStage.id, done));
      }
      if (current.length) {
        await db
          .update(orgBuildStage)
          .set({ status: "en_progreso", completedAt: null })
          .where(inArray(orgBuildStage.id, current));
      }
      if (locked.length) {
        await db
          .update(orgBuildStage)
          .set({ status: "bloqueada", completedAt: null })
          .where(inArray(orgBuildStage.id, locked));
      }
    }

    const [owner] = await db
      .select({ email: profile.email })
      .from(membership)
      .innerJoin(profile, eq(profile.id, membership.userId))
      .where(and(eq(membership.orgId, org.id), eq(membership.role, "owner")))
      .limit(1);

    console.log(`
  Listo — "${org.name}" quedó poblada:

    ${areaRows.length} áreas        ${AREAS.map((a) => a.name).join(", ")}
    ${EQUIPO.length} personas     ${EQUIPO.join(", ")}
    ${OBJETIVOS.length} objetivos    ${OBJETIVOS.filter((o) => o.due < 0 && o.status !== "completed").length} vencidos, para que la lista de pendientes tenga qué ordenar
    ${CARTERA.length} clientes     uno marcado en riesgo
    ${INDICADORES.length} indicadores  ${INDICADORES.map((k) => k.label).join(", ")}
    fase ${FASE_ACTUAL} de 8

  Entra con ${owner?.email ?? "la cuenta del dueño"} y ábrelo en /empresas
`);
  } finally {
    await sql.end();
  }
}

await main();
