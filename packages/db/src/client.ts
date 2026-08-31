// Cliente compartido por apps/admin y apps/improvement. Conecta contra DATABASE_URL (pooler,
// puerto 6543, transaction mode) — la conexión directa (DATABASE_URL_DIRECT) es exclusiva de
// migraciones/seed, nunca de este cliente en tiempo de ejecución (ver blueprint §9 paso 3, §10).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida — ver .env.example");
}

// prepare: false es obligatorio contra el pooler de Supabase en transaction mode, que no soporta
// prepared statements de sesión (ver knowledge/capabilities/database.md, "Connection pooling").
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
