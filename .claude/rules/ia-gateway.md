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
- Toda respuesta del modelo se valida con un esquema `zod` antes de escribirse en `ai_suggestion` o
  en `improvement_cycle`. Un solo reintento en fallo de validación, después falla explícito — nunca
  un loop de reintentos. En el motor, un fallo de validación **no avanza la fase**: el ciclo se
  queda donde estaba y la siguiente corrida lo vuelve a tomar.
- Cada llamada persiste el uso reportado por el proveedor (`input_tokens`, `output_tokens`,
  `cache_read_tokens`, `cache_write_tokens`, `cost_usd`) en `llm_calls` — nunca un conteo estimado por
  caracteres.
- El límite por org por hora se verifica **antes** de llamar al proveedor, no después. Es por
  propósito, no global: 10/hora para `suggestion`, 20/hora para `director` (una vuelta completa son
  cinco llamadas). El mismo `hasReachedHourlyLimit(orgId, purpose, max)` sirve a los dos.

## Contexto acumulado (el Director General)

Las llamadas del motor (`purpose: "director"`) NO usan una plantilla fija. `buildDirectorPrompt`
recibe el contexto completo y lo arma en cada llamada:

- **Se recalcula siempre, nunca se guarda en el ciclo.** Un ciclo abierto el lunes que se midiera el
  viernes con los datos del lunes mediría el pasado. Lo único que sí se congela son las métricas del
  experimento (`metrics.antes`), y se congelan a propósito: sin ellas no hay contra qué comparar.
- **Siempre lleva las vueltas anteriores cerradas** con su resultado, la decisión del dueño y lo que
  dijo al decidir. Sin eso, la vuelta doce vuelve a proponer lo que ya se rechazó dos veces.
- **Siempre lleva `ownerBrief()`** (`server/owner/memory.ts`): cómo piensa ESTE dueño.
- **Nunca lleva el `responsibility_level` de nadie**, ni juicios sobre personas. El Director General
  propone cambios al trabajo, no calificaciones — ver la cabecera de `prompts/director.ts`.
- Una sección vacía del contexto **se omite**, no se manda como "ninguno": un prompt lleno de
  encabezados vacíos le enseña al modelo a ignorar encabezados.

## Do not

- No agregues un segundo import del SDK "solo para este caso puntual" — todo pasa por el gateway.
- No repitas el prompt como una cadena inline en la ruta API — vive versionado en
  `apps/improvement/server/ai/prompts/`.
- No escribas en `improvement_cycle` desde `gateway.ts`. El gateway habla con el proveedor, valida y
  cobra el renglón de costo; quién avanza de fase es `server/improvement/phases.ts`. Si el gateway
  escribiera el ciclo, una falla del proveedor dejaría el estado a medias en dos módulos.

## El Análisis de Causa Raíz en el contrato

El Director General no razona libre: su método es el ACR, y los esquemas de
`prompts/director.ts` lo hacen obligatorio en vez de sugerirlo. Si un esquema se relaja, el método
se pierde sin que nada falle — por eso cada campo tiene una razón escrita al lado.

- **`inferencia` exige 3 a 7 porqués.** Con dos todavía se está en la causa inmediata, que es justo
  lo que el método existe para no confundir con la raíz.
- **`categoria` es un enum de las 6M**, no texto libre, y su catálogo espeja un check de la base.
  Con texto libre no se puede agrupar entre ciclos, y agrupar es para lo que sirve.
- **Cada tarea propuesta llena `atacaLaRaiz`.** Una tarea que no puede escribir esa frase es un
  parche, y sale más barato descubrirlo en la validación que tres meses después.
- **`laRaizSigueViva` es distinto de `result`.** Las tareas pueden completarse (exitoso) con la
  condición intacta. Confundirlos cierra el ciclo y deja el problema vivo.

**Do not:** no aflojes un `min()` de estos esquemas para que "pase" una respuesta del modelo. Una
fase que falla no avanza el ciclo (`phases.ts`), y ese reintento es el comportamiento correcto: un
diagnóstico a medias escrito en la base es peor que una fase que se repite mañana.
