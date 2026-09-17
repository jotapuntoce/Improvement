// CLI de ensambles — lo invoca la skill `assembly` para leer y escribir planos desde una
// conversación, sin pasar por el navegador.
//
// Herramienta LOCAL de operación, no camino de producto: usa el cliente `db` (rol postgres, bypasea
// RLS por diseño, igual que apps/admin con su service-role key). El camino que sí valida membership
// es apps/improvement/server/assembly/mutations.ts — este archivo nunca se importa desde una app.
//
// Las piezas se refieren por NOMBRE, no por uuid: quien lo usa dice "el login va antes del dashboard",
// no un identificador. El uuid solo aparece cuando hay ambigüedad.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";

// Igual que drizzle.config.ts: ruta ABSOLUTA a la raíz del monorepo, porque el cwd al invocarlo no
// es packages/db. El catch cubre el caso de que el entorno ya exporte DATABASE_URL.
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(monorepoRoot, ".env.local"));
} catch {
  // .env.local ausente — se asume entorno ya poblado.
}

const { db } = await import("./client.ts");
const { organization, profile, assembly, assemblyPiece, assemblyConnection, assemblyEvent } =
  await import("./schema.ts");

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

/**
 * Comparar sin acentos ni mayúsculas: quien escribe "mapa de construccion" se refiere al "Mapa de
 * construcción". Exigir el acento exacto solo produce un "no encuentro la pieza" inútil.
 */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Con una sola organización no tiene sentido pedirla; en cuanto haya más, se exige --org. */
async function resolveOrgId(flag?: string) {
  if (flag) return flag;
  const orgs = await db.select().from(organization);
  if (orgs.length === 1) return orgs[0]!.id;
  fail(`hay ${orgs.length} organizaciones, pasa --org <id>`);
}

async function resolveActorId() {
  const [row] = await db.select().from(profile).where(eq(profile.isPlatformAdmin, true)).limit(1);
  return row?.id ?? null;
}

async function findAssembly(ref: string) {
  const all = await db.select().from(assembly);
  const hit = all.find((a) => a.id === ref || norm(a.name) === norm(ref));
  if (!hit) fail(`no encuentro el plano "${ref}". Planos: ${all.map((a) => a.name).join(", ")}`);
  return hit;
}

async function findPiece(assemblyId: string, ref: string) {
  const all = await db
    .select()
    .from(assemblyPiece)
    .where(eq(assemblyPiece.assemblyId, assemblyId));
  const matches = all.filter((p) => p.id === ref || norm(p.name) === norm(ref));
  if (matches.length === 0) {
    fail(`no encuentro la pieza "${ref}". Piezas: ${all.map((p) => p.name).join(", ")}`);
  }
  if (matches.length > 1) fail(`"${ref}" es ambiguo, usa el uuid`);
  return matches[0]!;
}

async function logEvent(
  assemblyId: string,
  eventType: string,
  detail: Record<string, unknown>,
  pieceId?: string,
) {
  await db.insert(assemblyEvent).values({
    assemblyId,
    pieceId: pieceId ?? null,
    actorId: await resolveActorId(),
    eventType,
    detail,
  });
}

/** --clave valor → { clave: "valor" }; el resto queda como argumentos posicionales. */
function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = argv[++i] ?? "";
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

const [command, ...rest] = process.argv.slice(2);
const { flags, positional } = parseArgs(rest);

switch (command) {
  case "list": {
    const orgId = await resolveOrgId(flags.org);
    const rows = await db.select().from(assembly).where(eq(assembly.orgId, orgId));
    console.log(JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, description: r.description })), null, 2));
    break;
  }

  // El volcado completo que lee la skill para auditar: piezas, qué hace cada una y cómo se enlazan.
  case "show": {
    const target = await findAssembly(positional[0] ?? fail("uso: show <plano>"));
    const pieces = await db
      .select()
      .from(assemblyPiece)
      .where(eq(assemblyPiece.assemblyId, target.id));
    const connections = await db
      .select()
      .from(assemblyConnection)
      .where(eq(assemblyConnection.assemblyId, target.id));
    const nameOf = new Map(pieces.map((p) => [p.id, p.name]));
    const linked = new Set(connections.flatMap((c) => [c.fromPieceId, c.toPieceId]));

    console.log(
      JSON.stringify(
        {
          plano: { id: target.id, name: target.name, description: target.description },
          piezas: pieces.map((p) => ({
            id: p.id,
            nombre: p.name,
            queHace: p.whatItDoes,
            sinEnsamblar: !linked.has(p.id),
          })),
          conexiones: connections.map((c) => ({
            antes: nameOf.get(c.fromPieceId),
            despues: nameOf.get(c.toPieceId),
            condicion: c.conditionLabel,
          })),
        },
        null,
        2,
      ),
    );
    break;
  }

  case "create": {
    const orgId = await resolveOrgId(flags.org);
    const name = positional[0] ?? fail("uso: create <nombre> [--desc texto]");
    const [row] = await db
      .insert(assembly)
      .values({ orgId, name, description: flags.desc ?? null })
      .returning();
    if (!row) fail("no se creó el plano");
    await logEvent(row.id, "assembly_created", { name });
    console.log(JSON.stringify({ ok: true, id: row.id, name: row.name }));
    break;
  }

  case "piece": {
    const target = await findAssembly(positional[0] ?? fail("uso: piece <plano> <nombre> [--does texto]"));
    const name = positional[1] ?? fail("falta el nombre de la pieza");
    const [row] = await db
      .insert(assemblyPiece)
      .values({ assemblyId: target.id, name, whatItDoes: flags.does ?? null })
      .returning();
    if (!row) fail("no se creó la pieza");
    await logEvent(target.id, "piece_added", { name }, row.id);
    console.log(JSON.stringify({ ok: true, id: row.id, nombre: row.name }));
    break;
  }

  case "update": {
    const target = await findAssembly(positional[0] ?? fail("uso: update <plano> <pieza> --does texto"));
    const piece = await findPiece(target.id, positional[1] ?? fail("falta la pieza"));
    if (flags.does === undefined) fail("falta --does");
    const [row] = await db
      .update(assemblyPiece)
      .set({ whatItDoes: flags.does, updatedAt: new Date() })
      .where(eq(assemblyPiece.id, piece.id))
      .returning();
    if (!row) fail("no se actualizó la pieza");
    // El before/after es lo que después deja ver cómo maduró el plano.
    await logEvent(
      target.id,
      "piece_updated",
      { before: { whatItDoes: piece.whatItDoes }, after: { whatItDoes: row.whatItDoes } },
      piece.id,
    );
    console.log(JSON.stringify({ ok: true, nombre: row.name }));
    break;
  }

  // connect A B  =  "A va antes de B". "B va después de A" es la misma llamada con los argumentos
  // en ese mismo orden; traducir la frase es tarea de quien llama, no de aquí.
  case "connect": {
    const target = await findAssembly(positional[0] ?? fail("uso: connect <plano> <antes> <despues> [--if condición]"));
    const from = await findPiece(target.id, positional[1] ?? fail("falta la pieza de origen"));
    const to = await findPiece(target.id, positional[2] ?? fail("falta la pieza de destino"));
    if (from.id === to.id) fail("una pieza no puede conectarse consigo misma");

    const [dup] = await db
      .select()
      .from(assemblyConnection)
      .where(
        and(
          eq(assemblyConnection.fromPieceId, from.id),
          eq(assemblyConnection.toPieceId, to.id),
        ),
      )
      .limit(1);
    if (dup) fail(`"${from.name}" ya va antes de "${to.name}"`);

    await db.insert(assemblyConnection).values({
      assemblyId: target.id,
      fromPieceId: from.id,
      toPieceId: to.id,
      conditionLabel: flags.if ?? null,
    });
    await logEvent(
      target.id,
      "connection_added",
      { antes: from.name, despues: to.name, condicion: flags.if ?? null },
      from.id,
    );
    console.log(JSON.stringify({ ok: true, antes: from.name, despues: to.name }));
    break;
  }

  // Desensambla sin borrar las piezas — para cuando un camino directo se reemplaza por uno que
  // pasa por otra pieza.
  case "disconnect": {
    const target = await findAssembly(positional[0] ?? fail("uso: disconnect <plano> <antes> <despues>"));
    const from = await findPiece(target.id, positional[1] ?? fail("falta la pieza de origen"));
    const to = await findPiece(target.id, positional[2] ?? fail("falta la pieza de destino"));

    const [row] = await db
      .delete(assemblyConnection)
      .where(and(eq(assemblyConnection.fromPieceId, from.id), eq(assemblyConnection.toPieceId, to.id)))
      .returning();
    if (!row) fail(`"${from.name}" no va antes de "${to.name}"`);

    await logEvent(target.id, "connection_removed", { antes: from.name, despues: to.name }, from.id);
    console.log(JSON.stringify({ ok: true, antes: from.name, despues: to.name }));
    break;
  }

  // Borra la pieza y, en cascada, sus conexiones (assembly_connection.on delete cascade) — usar
  // cuando una pieza se fusiona con otra, no cuando solo cambió de lugar.
  case "remove-piece": {
    const target = await findAssembly(positional[0] ?? fail("uso: remove-piece <plano> <pieza>"));
    const piece = await findPiece(target.id, positional[1] ?? fail("falta la pieza"));

    await logEvent(target.id, "piece_removed", { name: piece.name }, piece.id);
    await db.delete(assemblyPiece).where(eq(assemblyPiece.id, piece.id));
    console.log(JSON.stringify({ ok: true, nombre: piece.name }));
    break;
  }

  default:
    console.log(
      [
        "Comandos:",
        "  list                                        planos de la organización",
        "  show <plano>                                volcado completo (para auditar)",
        "  create <nombre> [--desc texto]              plano nuevo",
        "  piece <plano> <nombre> [--does texto]       pieza suelta, sin ensamblar",
        "  update <plano> <pieza> --does texto         reescribe qué hace una pieza",
        "  connect <plano> <antes> <despues> [--if c]  ensambla: <antes> va antes de <despues>",
        "  disconnect <plano> <antes> <despues>        desensambla, sin borrar las piezas",
        "  remove-piece <plano> <pieza>                borra la pieza y sus conexiones",
      ].join("\n"),
    );
}

process.exit(0);
