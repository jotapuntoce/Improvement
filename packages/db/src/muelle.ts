// Crea un muelle (empresa padre) y sus dueños, y opcionalmente adopta los barcos huérfanos.
//
// El nombre entra por parámetro, nunca literal: packages/db es motor genérico. Los dueños se buscan
// por correo en `profile` y deben existir (que hayan entrado una vez a Improvement o a Summum).
//
// Uso:
//   pnpm db:muelle "<nombre>" <correo> [<correo>…] [--adoptar-barcos]
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { membership, organization, profile } from "./schema.ts";

process.loadEnvFile(".env.local");

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const adopt = args.includes("--adoptar-barcos");
  const [name, ...emails] = args.filter((a) => !a.startsWith("--"));
  if (!name || emails.length === 0) fail('Uso: pnpm db:muelle "<nombre>" <correo> [<correo>…] [--adoptar-barcos]');

  const url = process.env.DATABASE_URL_DIRECT;
  if (!url) fail("DATABASE_URL_DIRECT no está definida — este script nunca usa el pooler.");
  const sql = postgres(url, { prepare: false });
  const db = drizzle(sql);

  try {
    const owners = await db.select({ id: profile.id, email: profile.email }).from(profile).where(inArray(profile.email, emails));
    const missing = emails.filter((e) => !owners.some((o) => o.email === e));
    if (missing.length) fail(`No existe perfil para: ${missing.join(", ")}`);

    const slug = `${name.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")}-muelle`;
    await db.transaction(async (tx) => {
      const [dock] = await tx.insert(organization).values({ name, slug, kind: "muelle" }).returning();
      if (!dock) throw new Error("insert de muelle no devolvió fila");
      await tx.insert(membership).values(owners.map((o) => ({ userId: o.id, orgId: dock.id, role: "owner", acceptedAt: new Date() })));
      if (adopt) {
        const adopted = await tx
          .update(organization)
          .set({ parentOrgId: dock.id })
          .where(and(eq(organization.kind, "barco"), isNull(organization.parentOrgId)))
          .returning({ id: organization.id });
        console.log(`  ${adopted.length} barcos colgados del muelle.`);
      }
      console.log(`  Muelle "${name}" creado (${dock.id}) con ${owners.length} dueños.`);
    });
  } finally {
    await sql.end();
  }
}

main();
