# La casa y el Diagnóstico 360 · Diseño

**Fecha:** 2026-10-06 · **Objetivo del plan:** O4 de `Improvement\jotapuntoce\05-por-donde-empezar.md` (la casa en el
panel), pieza 1 de 2. La pieza 2 es el CRM de cada empresa.
**Fuentes:** `Diagnostico_360_Contexto_y_12_Dimensiones.pdf` (el dueño, 2026-10-06); `improvement-edificio.md`
(pisos, etapas, fases); `costos.md`; la skill `improvement`.

## 1 · Qué se construye y qué no

**Se construye:**
1. **El Diagnóstico 360 dentro del motor, para toda empresa:**
   - el cuestionario de las 12 dimensiones;
   - el dueño lo contesta en la app;
   - Improvement lo evalúa;
   - el dueño lo aprueba con un clic;
   - al aprobarse quedan cargadas sus áreas, necesidades, objetivos y memoria.
2. **La casa:** JotaPuntoCe como una empresa más del motor, con Jose Carlos como dueño, y una tarjeta en el panel
   admin que la abre. Es la primera empresa que recorre el camino completo.

**No se construye aquí:**
- El CRM (pieza 2).
- Juntar las ramas `panel-clientes-platform-admin` y `chequeos` a `main` (se hace antes de ejecutar este plan).
- Las APIs para uso externo: la evaluación con la API de Anthropic, Meta, Google y la landing. Por decisión del
  dueño se ven "al final una vez que ya este listo para lanzamiento al público".
- El tablero del domingo (O7).
- Que el motor detecte solo cuándo subir de piso.

**Reglas del dueño que gobiernan el diseño:**
- "Prioriza la automatización para eliminar la friccion del cliente."
- Una sola aprobación al final.
- Todo interno hasta que Improvement funcione; después el motor replica el mismo resultado.

## 2 · Los conceptos (decididos con el dueño)

| Concepto | Qué es | Dónde vive |
|---|---|---|
| **Piso** | El nivel del negocio: su escala, sin tope (ej. 0–5 clientes, 6–11). Meta del siguiente: el doble | `organization.floor` (nuevo) y cada diagnóstico |
| **Proceso** | El camino dentro de cada piso. "esos no son 7 niveles, es el proceso": Arranque → Orden → Ritmo → Tracción → Sistema → Escala → Autonomía. Al llegar a Autonomía a esa escala, el piso está lleno: nuevo diagnóstico y piso siguiente (el loop) | `EVOLUTION_LEVELS` y `organization.evolution_level` (se quedan; cambia la palabra que ve el usuario: "paso del proceso", no "nivel") |
| **Etapas** | Los 7 cuartos de cada piso | `improvement-edificio.md` |
| **Dimensiones** | Las 12 del PDF, cada una con madurez del 1 al 5 | El cuestionario y el resultado del diagnóstico |

**Las 12 dimensiones agrupadas en las etapas:**

| Etapa | Dimensiones |
|---|---|
| 0 · Diagnóstico | El diagnóstico mismo |
| 1 · Clientes | 6 Marketing, marca y posicionamiento · 7 Ventas y desarrollo comercial |
| 2 · Entrega que sostiene | 3 Operaciones y procesos · 8 Experiencia del cliente y postventa · 10 Proveedores, compras y alianzas |
| 3 · Números y control | 2 Finanzas y salud económica · 11 Legal, fiscal, riesgos y gobierno |
| 4 · Equipo y procesos | 4 Personas, talento y empleados · 9 Tecnología, datos y automatización |
| 5 · Crecimiento | 12 Cultura, innovación, sostenibilidad y crecimiento |
| 6 · Dirección | 1 Estrategia, propósito y visión · 5 Dueño, liderazgo y vida personal |

**Escala de madurez (del PDF):** 1 No existe · 2 Informal · 3 Documentado · 4 Medido · 5 Optimizado/Automatizado.

## 3 · El cuestionario

**Un solo archivo**, versionado y genérico: `apps/improvement/server/diagnostico/cuestionario.ts`. Lo leen la app
(para mostrarlo) y la skill `improvement` (para evaluar), así los dos dan el mismo resultado. Sin giros, empresas
ni nombres (`.claude/rules/motor-generico.md`). Cambiar el texto obliga a subir `CUESTIONARIO_VERSION`, que queda
guardada en cada diagnóstico.

**Cada pregunta:**
```ts
{ id: "fin-02", dimension: 2, tipo: "madurez" | "evidencia" | "abierta" | "prioridad" | "escala",
  texto: "…", ayuda?: "…",
  opciones?: […],                      // madurez: las 5 de la escala, con el ejemplo de su dimensión
  aplicaSi?: { escala: "con_equipo" }, // se apaga cuando no aplica
  prellenado?: "chequeo" | "sitio" | "instagram" | "google" }  // se le muestra lo que ya se sabe para que confirme
```

**Orden:**
1. **Confidencialidad:** para qué se usa lo que conteste y que se maneja con privacidad.
2. **Escala** (3–4 preguntas): personas, clientes al mes, ingreso aproximado y años operando. Deciden qué se apaga y
   el piso de partida. A un negocio de una persona no se le pregunta por organigramas.
3. **Las 12 dimensiones, por bloques**, empezando por la 5 (el dueño) y la 1 (estrategia). Cada bloque trae:
   - 1 a 3 de madurez;
   - 1 a 2 de evidencia;
   - 1 abierta.
4. **Prioridad:** sus 3 dolores más urgentes y el resultado que quiere en 90 días.

**Tamaño objetivo:** 35 a 50 preguntas encendidas para un negocio chico, unos 30–40 minutos.

**El texto lo escribe Claude en la Tarea 1 del plan, con la experiencia del director**
(`Expertos\director-general-ingenieria-industrial`) y las 12 dimensiones del PDF.
- 🚪 **Puerta:** el dueño aprueba el cuestionario antes de que se construya la pantalla.

## 4 · Los datos

**Tablas nuevas.** Las dos son org-scoped y llevan RLS en la misma migración: solo el **dueño** de la organización
las lee y escribe. Un empleado no ve el diagnóstico de su empresa.

`diagnosis`, un diagnóstico por empresa y por piso:

| Columna | Qué guarda |
|---|---|
| `id`, `org_id`, `floor` | De qué empresa y de qué piso |
| `status` | `contestando` → `evaluando` → `listo` → `aprobado` (o de `listo` regresa a `evaluando` con nota) |
| `questionnaire_version` | Con qué cuestionario se contestó |
| `result` (jsonb) | El resultado validado con zod (abajo); null hasta `listo` |
| `review_note` | Lo que escribió el dueño en "Algo no cuadra" |
| `submitted_at`, `ready_at`, `approved_at`, `approved_by`, `created_at`, `updated_at` | Fechas y quién aprobó |

Índice único: un solo diagnóstico abierto (no `aprobado`) por empresa.

`diagnosis_answer`, una respuesta por pregunta:
- Columnas: `diagnosis_id`, `org_id`, `question_id`, `value` (jsonb), `updated_at`.
- Único por `(diagnosis_id, question_id)`.
- Se puede corregir mientras el diagnóstico esté en `contestando`; al enviarlo queda fija.

**Cambios a tablas que ya existen:**
- `organization.is_home boolean default false`: la casa. Las listas de clientes del admin la excluyen.
- `organization.floor integer default 1`: el piso actual.
- `org_need.diagnosis_id`: de qué diagnóstico salió. Es nullable, porque las necesidades que el dueño crea a mano no
  tienen diagnóstico.
- `owner_memory.topic`: se agrega `'diagnostico'` al check.

**El resultado** (`diagnosisResultSchema`, zod, en `server/diagnostico/resultado.ts`):
```ts
{ negocio: { queEs, dueno, buscaDeVerdad, leQuitaElSueno },          // con sus palabras
  dimensiones: [{ dimension: 1..12, madurez: 1..5, puntaje: 0..100, citas: [""], sintomas: [""] }],  // las 12; las apagadas, null y por qué
  piso: { numero, rango: "0–5 clientes", porque },
  proceso: { paso: 0..6, porque },
  areas: [{ nombre, color }],                                        // las áreas de la empresa
  patogenos: [{ titulo, detalle, area, gravedad: 1..3, impacto, sintoma, dimension, summum: boolean }],
  blueprint: { d30: [objetivo], d90: [objetivo], d365: [objetivo] },
  criteriosParaSubir: [""],
  memoria: [{ pregunta?, respuesta }] }
// objetivo = { titulo, patogeno, area, peso: 0..100, tipo: "ipa"|"non_ipa", evidencia, fecha }
```
Los patógenos se ordenan con la regla fija: caja en riesgo → gravedad 3 → lo que desbloquea → resultado rápido y
visible. La UI los muestra en ese orden.

## 5 · El flujo

1. **Se abre.** Al recibir su empresa digital (primer diagnóstico) o al subir de piso, la empresa tiene un
   diagnóstico en `contestando`. Hoy lo abre Jose Carlos desde el admin con "Abrir diagnóstico del piso N".
2. **Contesta.** `/[org]/diagnostico`, solo para el dueño:
   - una pregunta a la vez, con el patrón de `/[org]/improvement`;
   - madurez con 5 botones con nombre; evidencia como número o dato; abiertas como texto libre;
   - prellenado: "Esto es lo que ya sé, ¿es así?";
   - avance por dimensión; se guarda cada respuesta y puede volver cuando quiera.
   Esta parte no usa IA.
3. **Envía.** Pasa a `evaluando`. El admin muestra "Diagnósticos por evaluar".
4. **Se evalúa (interno).** La skill `improvement` usa un solo script, `apps/improvement/scripts/diagnostico.ts`
   (Node 24 corre TypeScript sin `tsx`):
   - `leer <id>`: imprime las respuestas, el cuestionario y lo que ya se sabe (expediente del Chequeo si existe).
   - `guardar <id> <resultado.json>`: valida contra `diagnosisResultSchema` y llama a
     `saveDiagnosisResult(id, resultado)`. Pasa a `listo`.
   Con API, la app llama a la misma `saveDiagnosisResult`. Cada evaluación interna se anota en `costos.md` §4.
5. **Revisa.** `/[org]/diagnostico` en `listo` muestra una sola página:
   1. lo que entendí de ti;
   2. las 12 barras de madurez agrupadas por etapa;
   3. el piso y el paso del proceso, con su porqué;
   4. los 3–5 patógenos que más pesan;
   5. el plan de 30, 90 y 365 días;
   6. qué hace falta para subir.

   Dos botones:
   - **"Sí, así es"** → `approveDiagnosis`.
   - **"Algo no cuadra"** + nota → regresa a `evaluando` con `review_note`; se corrige y se vuelve a mostrar.
6. **Se aprueba** (`approveDiagnosis`, una transacción y solo si el estado es `listo`). Crea:
   - las áreas que falten, por nombre, sin duplicar;
   - las necesidades con `diagnosis_id`;
   - los objetivos del blueprint con su necesidad, área, peso, tipo, evidencia y fecha;
   - la memoria con `topic='diagnostico'`;
   - `organization.floor` y `evolution_level`.

   Al final pasa a `aprobado`. Repetir el clic no duplica nada.
7. **Sube de piso.** Jose Carlos (o el dueño, cuando se cumplan los criterios) abre el diagnóstico del piso
   siguiente. El anterior queda aprobado como historia.

## 6 · La casa

- **La fila de JotaPuntoCe:** `is_home = true`, `floor = 1` y Jose Carlos como `owner`. La crea un script de datos
  (`packages/db/src/seed-casa.ts`), no código del motor. Ningún archivo de `server/**` la nombra; el admin la
  encuentra por `is_home`.
- **Panel admin:** la recepción abre con la tarjeta "JotaPuntoCe · mi empresa", que lleva a
  `${NEXT_PUBLIC_IMPROVEMENT_URL}/<org>` (su edificio, luego su oficina). Las listas de clientes la excluyen.
- **Su diagnóstico del piso 1:** sale de los documentos 00–05 ya firmados. Claude lo pasa al formato del resultado,
  lo guarda directo en `listo` (sin el paso 2, porque las respuestas ya existen) y Jose Carlos lo aprueba desde su
  oficina. Es la primera prueba del camino completo.

## 7 · Errores y bordes

| Caso | Qué pasa |
|---|---|
| `guardar` con un resultado inválido | zod lo rechaza con la lista de campos; no cambia nada |
| Aprobar dos veces o en otro estado | El guard de estado lo vuelve un no-op con `{ ok: false, code: "ESTADO" }` |
| Un empleado abre `/[org]/diagnostico` | 404 (`findOwnerMembership`), igual que `/[org]/improvement` |
| Respuestas viejas al cambiar el cuestionario | Cada diagnóstico guarda su versión; la evaluación lee el cuestionario de esa versión |
| Pregunta apagada por la escala | No se muestra; la dimensión sale con `madurez: null` y su razón |
| Lectura directa por PostgREST con el JWT de un empleado | La RLS solo deja pasar al dueño de esa organización |

## 8 · Pruebas

- Unitarias:
  - `diagnosisResultSchema` (válido, faltantes, rangos);
  - el filtro de `aplicaSi` por escala;
  - el orden de los patógenos.
- Integración contra Supabase:
  - `saveDiagnosisResult` y `approveDiagnosis` crean exactamente las filas esperadas;
  - `approveDiagnosis` es idempotente;
  - la RLS del dueño frente al empleado en las dos tablas nuevas.
- Prueba real: la casa recorre `listo → aprobado` con el diagnóstico de JotaPuntoCe y su oficina muestra los
  objetivos.
- Gate: `pnpm lint && pnpm typecheck && pnpm test`.

## 9 · Costo

- **Hoy:** $0. La evaluación la hace Claude en el chat, y contestar y aprobar no usa IA.
- **Con API (al lanzamiento):** $3–6 USD por diagnóstico, según `costos.md` §2.
