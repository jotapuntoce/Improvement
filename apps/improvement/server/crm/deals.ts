// Los tratos de venta (pipeline) bajo la sección `clientes`: los lee quien la tenga; los crea y los
// mueve el dueño o quien la tenga en `empresa`. Cerrado ⇔ `ganado`/`perdido`, y la base lo cuida.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { client, deal, DEAL_STAGES } from "@jotapuntoce/db/schema";
import { findMembership, resolveSection } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export type DealStage = (typeof DEAL_STAGES)[number];
export type DealRow = typeof deal.$inferSelect;

export interface PipelineDeal {
  id: string;
  title: string;
  amountCents: number;
  currency: string;
  clientId: string;
  clientName: string;
  ownerProfileId: string | null;
  closedAt: Date | null;
}

const isUuid = (id: unknown): id is string => z.uuid().safeParse(id).success;

const MX_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
});

/** El primer día (`YYYY-MM-01`) del mes de `now`, contado en hora de Ciudad de México. */
export function mxMonthStart(now: Date): string {
  const p = Object.fromEntries(MX_DAY.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-01`;
}

const createDealSchema = z.object({
  clientId: z.uuid("Elige un cliente."),
  title: z.string().trim().min(3, "El trato lleva un título de al menos 3 letras.").max(160),
  amountCents: z.coerce.number().int().min(0, "El monto no puede ser negativo."),
  ownerProfileId: z.uuid().nullable(),
});

async function canWrite(userId: string, orgId: string) {
  return (await resolveSection(userId, orgId, "clientes")).scope === "empresa";
}

/** Abre un trato en `prospecto`. El cliente y el responsable tienen que ser de esta empresa. */
export async function createDeal(userId: string, orgId: string, input: unknown): Promise<Result<DealRow>> {
  if (!(await canWrite(userId, orgId))) return fail("No puedes abrir tratos.", "FORBIDDEN");
  const parsed = createDealSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const data = parsed.data;

  const [owned] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, data.clientId), eq(client.orgId, orgId)));
  if (!owned) return fail("Ese cliente no existe en esta empresa.", "NOT_FOUND");
  if (data.ownerProfileId && !(await findMembership(data.ownerProfileId, orgId))) {
    return fail("El responsable no es parte de esta empresa.", "NOT_FOUND");
  }

  const [row] = await db
    .insert(deal)
    .values({ orgId, clientId: data.clientId, title: data.title, amountCents: data.amountCents, ownerProfileId: data.ownerProfileId })
    .returning();
  if (!row) return fail("No se pudo guardar el trato.", "DB_ERROR");
  return { ok: true, data: row };
}

/** Mueve un trato a cualquier etapa; ganar o perder lo cierra, cualquier otra lo reabre. */
export async function moveDeal(userId: string, orgId: string, dealId: string, stage: unknown): Promise<Result<true>> {
  if (!(await canWrite(userId, orgId))) return fail("No puedes mover tratos.", "FORBIDDEN");
  const parsed = z.enum(DEAL_STAGES).safeParse(stage);
  if (!parsed.success) return fail("Esa etapa no existe.");
  if (!isUuid(dealId)) return fail("Ese trato no existe en esta empresa.", "NOT_FOUND");

  const closed = parsed.data === "ganado" || parsed.data === "perdido";
  const [row] = await db
    .update(deal)
    .set({ stage: parsed.data, closedAt: closed ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(deal.id, dealId), eq(deal.orgId, orgId)))
    .returning({ id: deal.id });
  if (!row) return fail("Ese trato no existe en esta empresa.", "NOT_FOUND");
  return { ok: true, data: true };
}

/** Los tratos agrupados por etapa, en el orden de DEAL_STAGES. Sin la sección, todas vacías. */
export async function listPipeline(
  userId: string,
  orgId: string,
): Promise<{ stage: DealStage; deals: PipelineDeal[] }[]> {
  const { scope } = await resolveSection(userId, orgId, "clientes");
  const rows =
    scope === "ninguno"
      ? []
      : await db
          .select({
            id: deal.id,
            title: deal.title,
            amountCents: deal.amountCents,
            currency: deal.currency,
            stage: deal.stage,
            clientId: deal.clientId,
            clientName: client.name,
            ownerProfileId: deal.ownerProfileId,
            closedAt: deal.closedAt,
          })
          .from(deal)
          .innerJoin(client, eq(client.id, deal.clientId))
          .where(eq(deal.orgId, orgId))
          .orderBy(asc(deal.createdAt));

  return DEAL_STAGES.map((stage) => ({
    stage,
    deals: rows.filter((r) => r.stage === stage).map(({ stage: _stage, ...rest }) => rest),
  }));
}
