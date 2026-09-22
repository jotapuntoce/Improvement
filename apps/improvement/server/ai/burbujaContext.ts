// Lo que la burbuja necesita saber antes de la primera palabra: con quién habla, de qué empresa, y
// si esa empresa ya tiene algo cargado.
//
// El inventario está aquí y no en el prompt por una razón de producto: es lo que hace que la
// transferencia inicial no sea una pantalla aparte. Un Director que ve la empresa vacía empieza a
// preguntar solo; uno que no la ve esperaría a que alguien llene formularios, que es justo lo que
// no queremos.
import { and, count, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, client, membership, organization, profile, project } from "@jotapuntoce/db/schema";
import { findMembership } from "../auth/guard.ts";
import { listOwnerMemory, ownerBrief } from "../owner/memory.ts";
import { loadRelacion, relacionEnPalabras } from "../improvement/relacion.ts";

export interface BurbujaCtx {
  nombre: string;
  empresa: string;
  esDueno: boolean;
  inventario: { areas: number; clientes: number; proyectos: number; empleados: number };
  /** Lo que el dueño le contó. Vacío para un empleado: ese retrato es del dueño, no de la empresa. */
  ownerBrief: string;
  /** Lo que llevan juntos, ya redactado. Vacío para un empleado por la misma razón. */
  relacion: string;
}

/**
 * Devuelve null si quien pregunta no es de esta empresa — el llamador contesta 404 con eso.
 *
 * Las cinco cuentas van en paralelo y son `count()` en SQL, no `.length` sobre filas traídas: la
 * burbuja abre en cada panel, así que esto corre seguido y no tiene por qué mover datos que nadie
 * va a leer.
 */
export async function loadBurbujaCtx(userId: string, orgId: string): Promise<BurbujaCtx | null> {
  const miembro = await findMembership(userId, orgId);
  if (!miembro) return null;

  const [empresa, yo, areas, clientes, proyectos, empleados] = await Promise.all([
    db.select({ name: organization.name }).from(organization).where(eq(organization.id, orgId)).limit(1),
    db.select({ fullName: profile.fullName }).from(profile).where(eq(profile.id, userId)).limit(1),
    db.select({ n: count() }).from(area).where(eq(area.orgId, orgId)),
    db.select({ n: count() }).from(client).where(eq(client.orgId, orgId)),
    db.select({ n: count() }).from(project).where(eq(project.orgId, orgId)),
    db.select({ n: count() }).from(membership).where(and(eq(membership.orgId, orgId))),
  ]);

  // El retrato del dueño y la relación solo se cargan si quien habla ES el dueño. No es
  // rendimiento: el agente de un empleado no tiene por qué saber cómo piensa su jefe ni qué
  // propuestas rechazó, y cargarlo "por si acaso" es la forma en que eso se filtra algún día.
  const esDueno = miembro.role === "owner";
  const [memoria, relacion] = esDueno
    ? await Promise.all([listOwnerMemory(userId, orgId), loadRelacion(orgId)])
    : [[], null];

  return {
    nombre: yo[0]?.fullName?.trim() || "el dueño",
    empresa: empresa[0]?.name ?? "tu empresa",
    esDueno,
    inventario: {
      areas: areas[0]?.n ?? 0,
      clientes: clientes[0]?.n ?? 0,
      proyectos: proyectos[0]?.n ?? 0,
      empleados: empleados[0]?.n ?? 0,
    },
    ownerBrief: memoria.length > 0 ? ownerBrief(memoria) : "",
    relacion: relacion ? relacionEnPalabras(relacion) : "",
  };
}
