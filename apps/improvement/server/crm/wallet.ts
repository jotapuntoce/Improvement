// El monedero web del cliente final (/w/[token]): la única lectura de apps/improvement sin sesión.
// El token es la única llave; la lectura usa columnas explícitas y nunca devuelve ids, montos ni notas.
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, experienceGrant, loyaltyProgram, organization } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";
import { tierForClient } from "./loyalty.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export interface Wallet {
  orgName: string;
  clientName: string;
  tierName: string | null;
  perks: string | null;
  experiences: { title: string; grantedOn: string }[];
}

/** Emite (o reemite) el token del monedero de un cliente; el anterior deja de abrir. */
export async function issueWalletToken(userId: string, orgId: string, clientId: string): Promise<Result<string>> {
  if ((await resolveSection(userId, orgId, "clientes")).scope !== "empresa") {
    return { ok: false, error: { code: "FORBIDDEN", message: "No puedes generar enlaces de monedero." } };
  }
  const token = randomBytes(24).toString("base64url");
  const [row] = await db
    .update(client)
    .set({ walletToken: token, updatedAt: new Date() })
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .returning({ id: client.id });
  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "Ese cliente no es de esta empresa." } };
  return { ok: true, data: token };
}

/** Sin sesión. null si el token no tiene forma, no existe o el programa no tiene ninguna función prendida. */
export async function loadWallet(token: string): Promise<Wallet | null> {
  if (!TOKEN.test(token)) return null;
  const [row] = await db
    .select({ clientId: client.id, orgId: client.orgId, clientName: client.name, orgName: organization.name, features: loyaltyProgram.features })
    .from(client)
    .innerJoin(organization, eq(organization.id, client.orgId))
    .innerJoin(loyaltyProgram, eq(loyaltyProgram.orgId, client.orgId))
    .where(eq(client.walletToken, token));
  if (!row || !Object.values(row.features).some(Boolean)) return null;
  const tier = await tierForClient(row.orgId, row.clientId);
  const experiences = await db
    .select({ title: experienceGrant.title, grantedOn: experienceGrant.grantedOn })
    .from(experienceGrant)
    .where(eq(experienceGrant.clientId, row.clientId))
    .orderBy(desc(experienceGrant.grantedOn));
  return { orgName: row.orgName, clientName: row.clientName, tierName: tier?.name ?? null, perks: tier?.perks ?? null, experiences };
}
