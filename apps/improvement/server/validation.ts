// El primer mensaje de un error de zod, para devolverlo como VALIDATION_ERROR.
import type { z } from "zod";

export const firstIssue = (e: z.ZodError, fallback = "Datos inválidos.") => e.issues[0]?.message ?? fallback;
