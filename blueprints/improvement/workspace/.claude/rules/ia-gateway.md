---
description: Un solo gateway de IA, model id nunca hardcodeado
paths:
  - "apps/improvement/server/ai/**"
---

- `@anthropic-ai/sdk` se importa en exactamente un archivo de todo el repo:
  `apps/improvement/server/ai/gateway.ts`. Ningún componente, ruta ni Server Action importa el SDK
  directo.
- Antes de escribir o modificar cualquier llamada al modelo, invoca la skill `claude-api` y copia el
  model id, precio y parámetros vigentes de ahí. Nunca escribas un id de modelo de memoria.
- El model id vive en configuración/entorno, nunca inline en el call site.
- Toda respuesta del modelo se valida con un esquema `zod` antes de escribirse en `ai_suggestion`. Un
  solo reintento en fallo de validación, después falla explícito — nunca un loop de reintentos.
- Cada llamada persiste el uso reportado por el proveedor (`input_tokens`, `output_tokens`,
  `cache_read_tokens`, `cache_write_tokens`, `cost_usd`) en `llm_calls` — nunca un conteo estimado por
  caracteres.
- El límite de 10 solicitudes por org por hora se verifica **antes** de llamar al proveedor, no
  después.

## Do not

- No agregues un segundo import del SDK "solo para este caso puntual" — todo pasa por el gateway.
- No repitas el prompt como una cadena inline en la ruta API — vive versionado en
  `apps/improvement/server/ai/prompts/`.
