## Fase 4 — Tareas con Improvement y automatizaciones

Cada persona tiene una bandeja con sus tareas y sus objetivos pendientes. En cada tarea, Improvement
la divide en pasos, prepara lo que le toca y pide visto bueno según los permisos que la persona le
dio. El dueño arma reglas "cuando pasa esto, y si se cumple aquello, entonces haz esto", las prueba
sin consecuencias y las activa. Todo lo que hacen queda en la bitácora del registro.

**Plan:** `blueprints/improvement-odoo/fase-4-plan.md` (aprobado con F1–F9).

### Qué entra
- **T1** `task`, `task_step`, `agent_permission`, `automation_rule` y `automation_run`, con su RLS en la misma tanda (0064/0065, ya aplicadas).
- **T2** Bandeja (tareas y objetivos juntos, sin copiar filas) y el ciclo de una tarea: crear, pasos, cerrar y descartar. Si una tarea apunta a un objetivo, al cerrarla se llama a `completeObjective()` y paga como hoy. Las demás tareas no dan puntos (F2).
- **T3** Catálogo de acciones del copiloto: crear registro, mover etapa, actualizar campos, nota, borrador de mensaje y recordatorio. Permisos por persona y acción: "pregúntame siempre", "la primera vez" y "hazlo solo" (F3, F4).
- **T4** "Que Improvement lo prepare": una llamada `tarea_plan` devuelve de 2 a 8 pasos. Sin IA o con el tope alcanzado, la persona agrega los pasos a mano (F5).
- **T5** Pantallas: Tu bandeja, Apuntar una tarea, Qué hace Improvement solo, el espacio de trabajo de dos columnas y "Crear tarea sobre esto" desde cualquier registro.
- **T6** Motor por evento: creado, pasa a etapa y cambia un campo, desde `createRecord`, `moveRecord` y `saveCustomValues`, con condiciones y 7 acciones. Las cadenas se detienen a 3 niveles, cada regla nace en prueba y cada corrida queda en `automation_run` (F7–F9).
- **T7** Disparadores de tiempo (por fecha de un campo y por N días sin actividad) en `/api/cron/automatizaciones`. Corre diario a las 7:00 de CDMX, protegido con `CRON_SECRET`, y una regla no actúa dos veces el mismo día sobre el mismo registro (F6).
- **T8** Pantallas de automatizaciones: la lista con la última corrida, Nueva automatización (app, Cuando, Y si, Entonces), y el detalle con la regla en frases, "Probar con lo que ya tengo", Activar/Pausar y lo que ha hecho.
- **T9** E2E `tareas.spec.ts`. El dueño arma y activa una regla y mueve a Firulais a "En consulta". La tarea cae en la bandeja del empleado, que la trabaja paso a paso y la cierra. La bitácora muestra la automatización, el paso y el cierre. Incluye axe en la regla, la bandeja y el espacio de trabajo.

### Cambios al ejecutar
- **"Avisar" crea una tarea "Aviso: …"** en la bandeja de esa persona, con fecha de hoy. Un `reminder` sin objetivo no le llega a nadie. El correo llega en la Fase 6.
- **Clave del día en `automation_run`.** Las corridas por evento usan `día + uuid`, para que una regla pueda actuar varias veces al día sobre el mismo registro. El cron usa el día solo, que es lo que lo hace idempotente.
- **Espacio de trabajo:** las Server Actions inline capturaban funciones del render y la página tronaba ("Functions cannot be passed directly to Client Components"). Esas funciones pasaron a nivel de módulo. `a11y.spec.ts` ahora exige respuesta < 400 antes de correr axe, para no pasar sobre una página de error.
- **El copiloto con IA no está en el E2E:** costaría dinero y no es determinista. Lo cubre `tasks-copilot.test.ts` con un proveedor simulado.
- **Para que una regla le asigne una tarea a alguien, esa persona tiene que ver el registro.** Si no lo ve, la corrida queda en error con el motivo ("Esa persona no puede ver ese registro.").

### Verificación
- `pnpm lint && pnpm typecheck` ✔
- `pnpm test`: improvement 467/467 y summum 120/120 ✔.
- `pnpm --filter improvement test:e2e`: 77 ✔ y 1 flaky (`registro.spec.ts`, pasa al reintentar), incluido `tareas.spec.ts` 3/3.
- `playwright.config.ts` sube los topes a 60 s por prueba y 15 s por `expect`. Contra el Supabase remoto (~120 ms por consulta), tres pruebas viejas (agregar app, aceptar propuesta y cerrar la junta) quedaban al filo y fallaban por tiempo, no por error. Con más tiempo pasan sin tocar código.

### Límites conocidos
- Si dos corridas del cron se encimaran, podrían actuar dos veces sobre un registro. Con un cron diario no pasa.
- La lista de automatizaciones lee las últimas 500 corridas para encontrar la última de cada regla.

### Queda para la Fase 6 (Canales)
- Mensajes a clientes finales, WhatsApp, agenda en Google Calendar y plantillas aprobadas.
- El aviso por correo.
- Cron cada 15 min si se pasa a Vercel Pro: solo cambia el `schedule` en `apps/improvement/vercel.json`.

### Pendiente fuera del código
- Nada nuevo: el cron usa el mismo `CRON_SECRET` que los otros. Siguen pendientes Google Cloud para Drive (Fase 3) y el proveedor Google en Supabase Auth (D5 de la Fase 2).

Va encima del PR de la Fase 3 (jotapuntoce/Improvement#8).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
