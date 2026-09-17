// Integración real contra el proyecto Supabase de desarrollo (blueprint §13), mismo patrón que
// tests/clients.test.ts. Cada test limpia su organization en afterEach — assembly.org_id es cascade,
// así que piezas, conexiones y eventos desaparecen con el org.
//
// Se prueba la frontera de connectPieces, que es donde vive la lógica no trivial: qué enlace se
// acepta y cuál corrompería el grafo.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership } from "@jotapuntoce/db/schema";
import { addPiece, connectPieces, createAssembly, loadAssembly } from "../server/assembly/mutations.ts";

async function makeOrg(nameSuffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${nameSuffix}`, slug: `test-org-asm-${nameSuffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

async function makeMember(orgId: string, role: "owner" | "employee") {
  const userId = crypto.randomUUID();
  const [p] = await db
    .insert(profile)
    .values({ id: userId, email: `${userId}@example.com` })
    .returning();
  if (!p) throw new Error("insert de profile no devolvió fila");
  await db.insert(membership).values({ userId, orgId, role, acceptedAt: new Date() });
  return userId;
}

// Cada fixture son ~5 viajes a la base remota (org, profile, membership, ensamble) y cada test arma
// varias piezas y conexiones encima — el default de 5s de vitest no alcanza. Mismo remedio y misma
// razón que apps/admin/tests/prospects.test.js:106.
const SLOW_DB_TIMEOUT_MS = 20_000;

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

/** Org + miembro + ensamble vacío, que es el punto de partida de todos los tests de abajo. */
async function makeAssemblyFixture(suffix: string) {
  const org = await makeOrg(suffix);
  createdOrgIds.push(org.id);
  const userId = await makeMember(org.id, "owner");
  createdProfileIds.push(userId);

  const created = await createAssembly(userId, org.id, { name: `Plano ${suffix}` });
  if (!created.ok) throw new Error("createAssembly falló en el fixture");
  return { org, userId, assemblyId: created.data.assembly.id };
}

async function makePiece(userId: string, orgId: string, assemblyId: string, name: string) {
  const result = await addPiece(userId, orgId, assemblyId, { name });
  if (!result.ok) throw new Error(`addPiece falló para ${name}`);
  return result.data.piece;
}

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
  }
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(sql`${profile.id} = ${userId}`);
  }
});

describe("loadAssembly", () => {
  it("WHEN un miembro del org A solicita un ensamble del org B THE SYSTEM SHALL devolver 404", async () => {
    const a = await makeAssemblyFixture("iso-a");
    const b = await makeAssemblyFixture("iso-b");

    await expect(loadAssembly(a.userId, b.org.id, b.assemblyId)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  }, SLOW_DB_TIMEOUT_MS);
});

describe("connectPieces", () => {
  it(
    "WHEN se intenta conectar una pieza que pertenece a otro ensamble THE SYSTEM SHALL rechazar " +
      "el enlace en vez de cruzar los dos grafos",
    async () => {
      const mine = await makeAssemblyFixture("cross-1");
      const other = await makeAssemblyFixture("cross-2");

      const login = await makePiece(mine.userId, mine.org.id, mine.assemblyId, "Login");
      const ajena = await makePiece(other.userId, other.org.id, other.assemblyId, "Dashboard ajeno");

      const result = await connectPieces(mine.userId, mine.org.id, mine.assemblyId, {
        fromPieceId: login.id,
        toPieceId: ajena.id,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    },
    SLOW_DB_TIMEOUT_MS,
  );

  it(
    "WHEN una misma pieza se conecta a dos destinos distintos THE SYSTEM SHALL aceptar ambas como " +
      "una bifurcación, pero rechazar repetir el mismo enlace dos veces",
    async () => {
      const { userId, org, assemblyId } = await makeAssemblyFixture("bifurc");

      const auth = await makePiece(userId, org.id, assemblyId, "Auth");
      const movil = await makePiece(userId, org.id, assemblyId, "Vista móvil");
      const escritorio = await makePiece(userId, org.id, assemblyId, "Vista escritorio");

      // Las dos ramas de la bifurcación: mismo origen, distinto destino y condición.
      const ramaA = await connectPieces(userId, org.id, assemblyId, {
        fromPieceId: auth.id,
        toPieceId: movil.id,
        conditionLabel: "si es móvil",
      });
      const ramaB = await connectPieces(userId, org.id, assemblyId, {
        fromPieceId: auth.id,
        toPieceId: escritorio.id,
        conditionLabel: "si es escritorio",
      });

      expect(ramaA.ok).toBe(true);
      expect(ramaB.ok).toBe(true);

      // El mismo enlace otra vez no es una segunda rama, es un duplicado.
      const repetida = await connectPieces(userId, org.id, assemblyId, {
        fromPieceId: auth.id,
        toPieceId: movil.id,
      });
      expect(repetida.ok).toBe(false);

      const loaded = await loadAssembly(userId, org.id, assemblyId);
      if (!loaded.ok) throw new Error("loadAssembly falló tras armar la bifurcación");
      expect(loaded.data.connections.length).toBe(2);
    },
    SLOW_DB_TIMEOUT_MS,
  );
});
