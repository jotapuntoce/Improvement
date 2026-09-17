// Lecturas y escrituras de ensambles — "mutations.ts" es el nombre de módulo fijado por el blueprint
// (§9.6) aunque también exponga lecturas, igual que objectives/mutations.ts.
//
// Vocabulario: una conexión from → to significa "from va ANTES de to". "El login va antes del
// dashboard" es { from: login, to: dashboard }; "X va después de Y" es { from: Y, to: X }. La
// traducción desde lenguaje natural ocurre arriba, no aquí — este módulo solo conoce la primitiva
// direccional.
//
// Cada función empieza con assertMembership(userId, orgId): la regla de server/auth/guard.ts es que
// ninguna query confíe solo en RLS o solo en el guard de la ruta.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { assembly, assemblyConnection, assemblyEvent, assemblyPiece } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";

const NOT_FOUND = {
  ok: false as const,
  error: { code: "NOT_FOUND" as const, message: "El ensamble no existe en este org." },
};

function validationError(message: string) {
  return { ok: false as const, error: { code: "VALIDATION_ERROR" as const, message } };
}

/**
 * `.returning()` se tipa como array, pero un INSERT que no lanzó devolvió exactamente una fila. Si
 * aun así viene vacía es un fallo del driver, no un caso de negocio — por eso lanza en vez de
 * devolver un error tipado. Los UPDATE no usan esto: ahí la fila ausente sí es un caso real (alguien
 * borró la pieza mientras tanto) y se maneja como error de validación.
 */
function insertedRow<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`No se pudo insertar ${what}: la base no devolvió la fila.`);
  return row;
}

/** Trae el ensamble solo si pertenece al org — el filtro por orgId es lo que aísla los tenants. */
async function findAssemblyInOrg(assemblyId: string, orgId: string) {
  const [row] = await db
    .select()
    .from(assembly)
    .where(and(eq(assembly.id, assemblyId), eq(assembly.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function listAssemblies(userId: string, orgId: string) {
  await assertMembership(userId, orgId);

  const rows = await db
    .select()
    .from(assembly)
    .where(eq(assembly.orgId, orgId))
    .orderBy(asc(assembly.name));

  return { ok: true as const, data: { assemblies: rows } };
}

/**
 * El plano completo: piezas + conexiones. El orden del recorrido NO se guarda — se deriva de las
 * conexiones al dibujar, así que aquí se devuelven crudas y ordenadas por creación para que el
 * layout sea estable entre renders.
 */
export async function loadAssembly(userId: string, orgId: string, assemblyId: string) {
  await assertMembership(userId, orgId);

  const found = await findAssemblyInOrg(assemblyId, orgId);
  if (!found) return NOT_FOUND;

  const [pieces, connections] = await Promise.all([
    db
      .select()
      .from(assemblyPiece)
      .where(eq(assemblyPiece.assemblyId, assemblyId))
      .orderBy(asc(assemblyPiece.createdAt)),
    db
      .select()
      .from(assemblyConnection)
      .where(eq(assemblyConnection.assemblyId, assemblyId))
      .orderBy(asc(assemblyConnection.createdAt)),
  ]);

  return { ok: true as const, data: { assembly: found, pieces, connections } };
}

export async function createAssembly(
  userId: string,
  orgId: string,
  input: { name: string; description?: string | null },
) {
  await assertMembership(userId, orgId);

  const name = input.name.trim();
  if (!name) return validationError("El ensamble necesita un nombre.");

  return db.transaction(async (tx) => {
    const created = insertedRow(
      await tx
        .insert(assembly)
        .values({ orgId, name, description: input.description ?? null })
        .returning(),
      "el ensamble",
    );

    await tx.insert(assemblyEvent).values({
      assemblyId: created.id,
      actorId: userId,
      eventType: "assembly_created",
      detail: { name },
    });

    return { ok: true as const, data: { assembly: created } };
  });
}

/** Una pieza nace suelta: sin conexiones. Se engancha después con connectPieces(). */
export async function addPiece(
  userId: string,
  orgId: string,
  assemblyId: string,
  input: { name: string; whatItDoes?: string | null },
) {
  await assertMembership(userId, orgId);

  const name = input.name.trim();
  if (!name) return validationError("La pieza necesita un nombre.");

  const found = await findAssemblyInOrg(assemblyId, orgId);
  if (!found) return NOT_FOUND;

  return db.transaction(async (tx) => {
    const created = insertedRow(
      await tx
        .insert(assemblyPiece)
        .values({ assemblyId, name, whatItDoes: input.whatItDoes ?? null })
        .returning(),
      "la pieza",
    );

    await tx.insert(assemblyEvent).values({
      assemblyId,
      pieceId: created.id,
      actorId: userId,
      eventType: "piece_added",
      detail: { name },
    });

    return { ok: true as const, data: { piece: created } };
  });
}

/**
 * La pieza evoluciona. Se guarda el valor anterior en el evento — sin eso, el historial diría "algo
 * cambió" sin poder mostrar qué, que es justo lo que sirve para ver cómo maduró el plano.
 */
export async function updatePiece(
  userId: string,
  orgId: string,
  assemblyId: string,
  pieceId: string,
  input: { name?: string; whatItDoes?: string | null },
) {
  await assertMembership(userId, orgId);

  const found = await findAssemblyInOrg(assemblyId, orgId);
  if (!found) return NOT_FOUND;

  const [current] = await db
    .select()
    .from(assemblyPiece)
    .where(and(eq(assemblyPiece.id, pieceId), eq(assemblyPiece.assemblyId, assemblyId)))
    .limit(1);
  if (!current) return validationError("Esa pieza no pertenece a este ensamble.");

  const name = input.name?.trim();
  if (name !== undefined && !name) return validationError("La pieza necesita un nombre.");

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(assemblyPiece)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(input.whatItDoes !== undefined ? { whatItDoes: input.whatItDoes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(assemblyPiece.id, pieceId))
      .returning();
    // El select de `current` ocurrió fuera de esta transacción: si alguien borró la pieza en el
    // intervalo, el update no matchea ninguna fila y hay que decirlo, no romper.
    if (!updated) return validationError("Esa pieza ya no existe.");

    await tx.insert(assemblyEvent).values({
      assemblyId,
      pieceId,
      actorId: userId,
      eventType: "piece_updated",
      detail: {
        before: { name: current.name, whatItDoes: current.whatItDoes },
        after: { name: updated.name, whatItDoes: updated.whatItDoes },
      },
    });

    return { ok: true as const, data: { piece: updated } };
  });
}

/**
 * Ensambla dos piezas: from va antes de to. Dos llamadas con el mismo `from` y distinto `to` forman
 * una bifurcación — por eso `conditionLabel` es lo que distingue cada rama ("si es móvil" / "si es
 * escritorio"), y por eso no hace falta una tabla aparte para bifurcaciones.
 *
 * No se rechazan ciclos: volver a una pieza anterior (del dashboard de vuelta al login) es un flujo
 * legítimo. El dibujante tolera ciclos; la base solo impide que una pieza se conecte consigo misma
 * (check assembly_connection_no_self_loop).
 */
export async function connectPieces(
  userId: string,
  orgId: string,
  assemblyId: string,
  input: { fromPieceId: string; toPieceId: string; conditionLabel?: string | null },
) {
  await assertMembership(userId, orgId);

  const { fromPieceId, toPieceId } = input;
  if (fromPieceId === toPieceId) {
    return validationError("Una pieza no puede conectarse consigo misma.");
  }

  const found = await findAssemblyInOrg(assemblyId, orgId);
  if (!found) return NOT_FOUND;

  // Ambas piezas se verifican contra este assemblyId: sin esto se podría enlazar una pieza de otro
  // ensamble (incluso de otro org) y corromper el grafo.
  const endpoints = await db
    .select({ id: assemblyPiece.id })
    .from(assemblyPiece)
    .where(
      and(
        eq(assemblyPiece.assemblyId, assemblyId),
        inArray(assemblyPiece.id, [fromPieceId, toPieceId]),
      ),
    );
  if (endpoints.length !== 2) return validationError("Ambas piezas deben existir en este ensamble.");

  const [existing] = await db
    .select({ id: assemblyConnection.id })
    .from(assemblyConnection)
    .where(
      and(
        eq(assemblyConnection.fromPieceId, fromPieceId),
        eq(assemblyConnection.toPieceId, toPieceId),
      ),
    )
    .limit(1);
  if (existing) return validationError("Esas piezas ya están conectadas en ese sentido.");

  return db.transaction(async (tx) => {
    const created = insertedRow(
      await tx
        .insert(assemblyConnection)
        .values({
          assemblyId,
          fromPieceId,
          toPieceId,
          conditionLabel: input.conditionLabel ?? null,
        })
        .returning(),
      "la conexión",
    );

    await tx.insert(assemblyEvent).values({
      assemblyId,
      pieceId: fromPieceId,
      actorId: userId,
      eventType: "connection_added",
      detail: { fromPieceId, toPieceId, conditionLabel: created.conditionLabel },
    });

    return { ok: true as const, data: { connection: created } };
  });
}
