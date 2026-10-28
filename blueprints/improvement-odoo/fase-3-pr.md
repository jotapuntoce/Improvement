## Fase 3 — Importación

El dueño trae lo que ya tiene (CSV, Excel, PDF, una foto o un archivo de Google Drive) a Clientes o
a sus apps propias. Improvement propone cómo acomodar cada columna, enseña la vista previa con los
errores renglón por renglón, importa solo cuando el dueño confirma, y puede deshacerlo.

**Plan:** `blueprints/improvement-odoo/fase-3-plan.md` (aprobado con E1–E6).

### Qué entra
- **T1** `import_job` y `record_origin` con RLS solo-dueño en la misma tanda (0062/0063, ya aplicadas).
- **T2** Lectura de CSV (`;` o `,`) y Excel con `read-excel-file` 9.3.12 (E3), y normalización por tipo de campo: dinero, número, fecha dd/mm/aaaa, sí/no y opciones sin acentos. Límites: 5 MB, 5,000 filas y 60 columnas.
- **T3** El gateway gana `extractStructured`: lee tablas de PDF y fotos y propone el mapeo (E4). Respeta el tope por hora, el reintento y la bitácora en `llm_calls`. Si no hay IA, se empareja por nombre.
- **T4** Jobs de punta a punta: borrador, vista previa con `schemaFor`, confirmación en bloques de 500 y deshacer. Al deshacer, se quedan los registros editados después y los clientes con ventas, proyectos, tickets, preferencias o experiencias (E5).
- **T5** Pantallas: "Importar" en cada app importable (solo el dueño), mapeo por columna (incluye "Campo nuevo de texto"), vista previa e historial con Deshacer.
- **T6** Google Drive con Picker y alcance `drive.file` (E2): el token sale del navegador y el servidor baja solo ese archivo de `googleapis.com`. Las Sheets se exportan a CSV.
- **T7** Paso 4 del arranque, "Trae lo que ya tienes", con salida "No tengo nada" (E6). Incluye el E2E de importar y deshacer.

### Verificación
- `pnpm lint && pnpm typecheck` ✔
- `pnpm test`: improvement 440/440 y summum 120/120 ✔. Las pruebas de admin no corren en el worktree porque no hay `.env.test`; ya era así antes.
- `pnpm --filter improvement test:e2e`: 68/68 ✔, incluidos `importar.spec.ts` y `registro.spec.ts` con el paso nuevo.

### Cambio en el gateway
El modelo pasa a `claude-opus-5-5` ($4/$20 por MTok) con fallback del lado del servidor
(`server-side-fallback-2026-07-01`).

### Pendiente fuera del código
- **Google Cloud (Drive):** habilitar Google Drive API y Google Picker API, configurar la pantalla de consentimiento y crear un ID de cliente OAuth (Aplicación web) con orígenes `http://localhost:3200` y el de producción. Crear una clave de API restringida a Picker y a esos orígenes.
- **Vercel:** cargar `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY` y `NEXT_PUBLIC_GOOGLE_APP_ID` (número de proyecto). Mientras falte alguna, el botón de Drive no aparece y la subida de archivos funciona igual.
- **D5 de la Fase 2 sigue pendiente:** el proveedor Google en Supabase Auth.

Va encima del PR de la Fase 2 (jotapuntoce/Improvement#7).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
