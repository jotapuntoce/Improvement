// La transacción de Drizzle como tipo, para funciones que corren dentro o fuera de una.
import type { db } from "@jotapuntoce/db";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
