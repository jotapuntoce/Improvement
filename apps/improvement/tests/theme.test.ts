// Tema por org: contraste AA (literales de blueprint oficinas-digitales §7) y el servidor que lo guarda.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { contrastRatio, themeIssues, themeStyle } from "@jotapuntoce/ui/theme.ts";
import { loadOrgTheme, setIndustryCustom, setOrgTheme } from "../server/companies/theme.ts";

const VERDE = { bg: "#05060b", textPrimary: "#f4f6fb", accent1: "#1fbe79", accent2: "#98e33b" };
const r2 = (n: number) => Math.round(n * 100) / 100;

describe("contraste", () => {
  it("WHEN se mide la tabla de referencia THE SYSTEM SHALL dar las razones de §7", () => {
    expect(r2(contrastRatio("#777777", "#ffffff"))).toBe(4.48);
    expect(r2(contrastRatio("#767676", "#ffffff"))).toBe(4.54);
    expect(r2(contrastRatio("#6b7386", "#05060b"))).toBe(4.26);
    expect(r2(contrastRatio("#f4f6fb", "#05060b"))).toBe(18.72);
    expect(r2(contrastRatio("#1fbe79", "#05060b"))).toBe(8.39);
    expect(r2(contrastRatio("#98e33b", "#05060b"))).toBe(12.9);
  });

  it("WHEN textPrimary es #6b7386 sobre #05060b THE SYSTEM SHALL reportarlo con 4.26; el verde pasa", () => {
    expect(themeIssues({ ...VERDE, textPrimary: "#6b7386" })).toEqual([{ field: "textPrimary", ratio: 4.26 }]);
    expect(themeIssues(VERDE)).toEqual([]);
  });

  it("WHEN se arma el style THE SYSTEM SHALL sobrescribir solo las cuatro CSS vars", () => {
    expect(themeStyle(VERDE)).toEqual({
      "--bg": "#05060b",
      "--text-primary": "#f4f6fb",
      "--accent-1": "#1fbe79",
      "--accent-2": "#98e33b",
    });
  });
});

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function orgConGente() {
  const [org] = await db
    .insert(organization)
    .values({ name: "t-theme", slug: `t-theme-${crypto.randomUUID()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const ids: Record<"owner" | "employee", string> = { owner: crypto.randomUUID(), employee: crypto.randomUUID() };
  for (const role of ["owner", "employee"] as const) {
    await db.insert(profile).values({ id: ids[role], email: `${ids[role]}@example.com` });
    profileIds.push(ids[role]);
    await db.insert(membership).values({ userId: ids[role], orgId: org.id, role, acceptedAt: new Date() });
  }
  return { orgId: org.id, ownerId: ids.owner, employeeId: ids.employee };
}

async function temaGuardado(orgId: string) {
  const [row] = await db.select({ theme: organization.theme }).from(organization).where(eq(organization.id, orgId));
  return row?.theme ?? null;
}

describe("setOrgTheme / loadOrgTheme", () => {
  it("WHEN un empleado guarda un tema THE SYSTEM SHALL devolver NOT_FOUND sin escribir", async () => {
    const { orgId, employeeId } = await orgConGente();
    const res = await setOrgTheme(employeeId, orgId, VERDE);
    expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await temaGuardado(orgId)).toBeNull();
  });

  it("WHEN el dueño guarda un tema que falla AA THE SYSTEM SHALL devolver CONTRAST sin cambiar la fila", async () => {
    const { orgId, ownerId } = await orgConGente();
    const res = await setOrgTheme(ownerId, orgId, { ...VERDE, textPrimary: "#6b7386" });
    expect(res).toMatchObject({
      ok: false,
      error: { code: "CONTRAST", message: "Contraste 4.26:1 — mínimo 4.5:1" },
    });
    expect(await temaGuardado(orgId)).toBeNull();
  });

  it("WHEN el dueño guarda un tema válido y luego null THE SYSTEM SHALL dejar el objeto y después null", async () => {
    const { orgId, ownerId, employeeId } = await orgConGente();
    expect(await setOrgTheme(ownerId, orgId, VERDE)).toEqual({ ok: true, data: VERDE });
    expect(await temaGuardado(orgId)).toEqual(VERDE);
    expect(await loadOrgTheme(employeeId, orgId)).toEqual(VERDE);

    expect(await setOrgTheme(ownerId, orgId, null)).toEqual({ ok: true, data: null });
    expect(await temaGuardado(orgId)).toBeNull();
    expect(await loadOrgTheme(ownerId, orgId)).toBeNull();
  });

  it("WHEN la fila trae un tema que no valida THE SYSTEM SHALL hacer que loadOrgTheme devuelva null", async () => {
    const { orgId, ownerId } = await orgConGente();
    await db.update(organization).set({ theme: { bg: "rojo" } }).where(eq(organization.id, orgId));
    expect(await loadOrgTheme(ownerId, orgId)).toBeNull();
    expect(await loadOrgTheme(crypto.randomUUID(), orgId)).toBeNull();
  });
});

describe("setIndustryCustom", () => {
  it("WHEN el dueño escribe un giro libre THE SYSTEM SHALL guardarlo recortado; vacío o > 80 se rechaza", async () => {
    const { orgId, ownerId, employeeId } = await orgConGente();
    expect(await setIndustryCustom(ownerId, orgId, "  Florería  ")).toEqual({ ok: true, data: "Florería" });
    expect(await setIndustryCustom(ownerId, orgId, "   ")).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await setIndustryCustom(ownerId, orgId, "x".repeat(81))).toMatchObject({ ok: false });
    expect(await setIndustryCustom(employeeId, orgId, "Otro")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
