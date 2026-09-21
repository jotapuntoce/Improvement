// Un solo lugar para reconocer un unique_violation de Postgres (código 23505) — lo usan
// permissions/mutations.ts y areas/mutations.ts para convertir la excepción del driver `postgres` en
// un Result tipado en vez de dejarla salir del Server Action (Code rule #6, CLAUDE.md).
//
// try/catch sobre el código y no un select previo: un select-then-insert deja una ventana entre las
// dos consultas donde dos requests concurrentes (el dueño con dos pestañas, o un doble submit) pasan
// el chequeo antes de que cualquiera escriba — el índice único sigue siendo la única fuente de verdad
// que no tiene esa carrera.
//
// Camina `.cause`: drizzle-orm envuelve el PostgresError crudo del driver `postgres` en su propio
// DrizzleQueryError ("Failed query: ...") con la causa original enganchada por Error.cause — el
// código 23505 vive ahí, no en el error que llega al catch.
export function isUniqueViolation(err: unknown): boolean {
  let current = err;
  while (current instanceof Error) {
    if ("code" in current && (current as { code?: unknown }).code === "23505") return true;
    current = current.cause;
  }
  return false;
}
