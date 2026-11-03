## Fase 5 — Tableros e inteligencia

El inicio de cada persona ahora es su tablero: tarjetas que agrega, sube, baja y quita, cada una
calculada con sus permisos. Improvement detecta lo que se está cayendo y lo explica cuando se le pide.
Calcula la salud de cada cliente, pronostica las ventas con la tasa real de cierre y compara el
proceso contra el de su giro. El dueño puede jugar con sus números en "¿Qué pasa si?". Lo que no se
arregla desde adentro se pasa a Summum.

**Plan:** `blueprints/improvement-odoo/fase-5-plan.md` (aprobado con G1–G11; el dueño lee las tarjetas de sus empleados, pedido el 2026-10-30).

### Qué entra
- **T1** Tabla `dashboard_card` con su RLS: cada quien lee lo suyo y el dueño lee las de su empresa. `ai_suggestion` suma la categoría `alerta`. Migraciones 0066 y 0067, ya aplicadas.
- **T2** `cards.ts`:
  - Agregar, subir/bajar y quitar.
  - Siembra el tablero inicial por rol (G4): el dueño recibe 5 tarjetas y el empleado 3.
  - Los datos de cada tipo salen por las mismas funciones con guard que sus pantallas. Sin acceso, la tarjeta dice "Ya no tienes acceso a esta app".
- **T3** El inicio es el tablero. "Agregar tarjeta" elige tipo, app y opciones. Las barras CSS usan el acento de la marca y llevan su valor en texto.
- **T4** Alertas con cinco reglas genéricas: trato quieto 14 días, cliente en riesgo con tratos abiertos, ticket abierto más de 7 días, objetivo vencido y fecha vencida en apps propias.
  - "Explícame" llama a la IA a demanda (`purpose: "alerta"`) y guarda el texto en `ai_suggestion`.
  - "Pedir ayuda a Summum" crea la necesidad y la deriva. Solo el dueño.
- **T5** Salud del cliente: cron diario `/api/cron/salud` (7:30 CDMX, `CRON_SECRET`).
  - Con su actividad más reciente: healthy hasta 30 días, neutral hasta 90 y at_risk después, o con un ticket abierto de más de 7 días.
  - Un cambio manual en los últimos 30 días gana.
- **T6** Pronóstico: el pipeline abierto de Ventas × la tasa real de cierre por etapa en 6 meses, leída del historial "Etapa:".
  - Con menos de 5 casos en una etapa usa la tasa global; sin cerrados lo dice y no inventa número.
  - Ingresos ganados del mes por opción de un campo de Ventas, contra la meta de cada una.
- **T7** Qué falta en tu proceso (`/proceso` y tarjeta). Compara contra la plantilla del giro: apps, etapas y campos faltantes. "Agregar" los crea con un clic y también se pueden pasar a Summum. Solo el dueño.
- **T8** ¿Qué pasa si? (`/que-pasa-si`, solo el dueño): los números reales de hoy y un simulador que recalcula en el navegador sin pedir nada al servidor.
- **T9** E2E `tablero.spec.ts`: tablero sembrado, agregar/subir/quitar, alerta a Summum, agregar un faltante y el simulador sin peticiones. Axe en inicio, alertas, proceso y ¿Qué pasa si?.

### Cambios al ejecutar
- **Barras** agrupan por etapa o por un campo de opción, no por mes ni por responsable. Ninguna app base tiene responsable genérico, y por mes pide una fecha que solo algunas apps tienen.
- **"Momentos importantes"** muestra objetivos cumplidos de la semana y aniversarios en el equipo, que es lo que `celebrations()` ya sabe. No hay fecha de cumpleaños en el perfil.
- **Drizzle y subconsultas:** dentro de un `sql` en un `select`, `${client.id}` sale sin el nombre de la tabla, así que `t.client_id = "id"` se ataba a la tabla de la subconsulta. En `health.ts` las columnas van escritas completas (`client.id`).
- **Faltantes:** "Pedir ayuda a Summum" también está en cada faltante, no solo en las alertas (G11 habla de los dos).

### Verificación
- `pnpm lint && pnpm typecheck` ✔
- `pnpm test`: improvement 494/494 y summum 120/120 ✔.
- `pnpm --filter improvement test:e2e`: 86/86 ✔, incluidos `tablero.spec.ts` 4/4 y `a11y.spec.ts` 20/20.

### Límites conocidos
- El pronóstico es solo de Ventas: las apps propias no tienen etapas que digan "cierra".
- Las alertas de fecha vencida recorren los registros de cada app propia en cada lectura. Con muchas apps grandes tocaría pasarlas a una consulta.
- El inicio de mes de los ingresos usa UTC-6 fijo: México no tiene horario de verano desde 2022.

### Queda para la Fase 6 (Canales)
- Calendario de trabajo interno (tarjeta y vista), captura por voz y WhatsApp, agente por rol.

### Pendiente fuera del código
- Nada nuevo: el cron de salud usa el mismo `CRON_SECRET`. Siguen pendientes Google Cloud para Drive (Fase 3) y el proveedor Google en Supabase Auth (D5 de la Fase 2).

Va encima del PR de la Fase 4 (jotapuntoce/Improvement#9).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
