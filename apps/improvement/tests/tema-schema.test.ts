// organization.theme, organization.industry_custom y las categorías nuevas de ai_suggestion contra el
// Supabase de desarrollo (mismo patrón que tests/crm-schema.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, organization } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

async function org(values: Partial<typeof organization.$inferInsert> = {}) {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-tema", slug: `t-tema-${crypto.randomUUID()}`, ...values })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row;
}

describe("organization.theme", () => {
  it("WHEN se inserta con theme THE SYSTEM SHALL leer el mismo objeto; sin theme, null", async () => {
    const theme = { bg: "#05060b", textPrimary: "#f4f6fb", accent1: "#1fbe79", accent2: "#98e33b" };
    const conTema = await org({ theme });
    const [leido] = await db.select({ theme: organization.theme }).from(organization).where(eq(organization.id, conTema.id));
    expect(leido?.theme).toEqual(theme);

    const sinTema = await org();
    const [vacio] = await db.select({ theme: organization.theme }).from(organization).where(eq(organization.id, sinTema.id));
    expect(vacio?.theme).toBeNull();
  });
});

describe("organization.industry_custom", () => {
  it("WHEN industry_custom tiene 81 caracteres THE SYSTEM SHALL rechazar el insert", async () => {
    await expect(org({ industry: "otro", industryCustom: "x".repeat(81) })).rejects.toThrow();
    const ok = await org({ industry: "otro", industryCustom: "x".repeat(80) });
    expect(ok.industryCustom).toHaveLength(80);
  });
});

describe("ai_suggestion.category", () => {
  it("WHEN la categoría es oficina o agente THE SYSTEM SHALL aceptarla; inventada se rechaza", async () => {
    const { id: orgId } = await org();
    for (const category of ["oficina", "agente"]) {
      const [row] = await db
        .insert(aiSuggestion)
        .values({ orgId, category, suggestionText: "t", basedOn: [] })
        .returning();
      expect(row?.category).toBe(category);
    }
    await expect(
      db.insert(aiSuggestion).values({ orgId, category: "inventada", suggestionText: "t", basedOn: [] }),
    ).rejects.toThrow();
  });
});
