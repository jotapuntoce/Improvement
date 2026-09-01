// Logger JSON propio, sin dependencia externa (blueprint §11 — pino/winston son de más de lo que
// esta app necesita). Cada llamada imprime una sola línea JSON a stdout/stderr.
import { randomUUID } from "node:crypto";

// Redacción por nombre de campo, no por heurística de contenido: simple, predecible, sin falsos
// negativos silenciosos (criterio #2).
const REDACTED_KEYS = new Set(["token", "password", "service_role_key", "api_key"]);
const REDACTED_VALUE = "[redacted]";

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

function redact(fields: LogFields): LogFields {
  const redacted: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    redacted[key] = REDACTED_KEYS.has(key) ? REDACTED_VALUE : value;
  }
  return redacted;
}

/**
 * WHEN dos líneas de log se generan dentro de la misma request THE SYSTEM SHALL compartir el mismo
 * request_id (criterio #3) — se pasa explícito en `fields.request_id` en cada call site (generado
 * una vez con newRequestId() al entrar a la request), nunca implícito vía AsyncLocalStorage: sin
 * dependencia extra, y queda claro en el código de qué request es cada línea.
 */
export function log(event: string, fields: LogFields = {}, level: LogLevel = "info"): void {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  };
  const serialized = JSON.stringify(line);

  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export function newRequestId(): string {
  return randomUUID();
}
