## Fase 6 — Canales

Cada persona habla con Improvement desde cualquier pantalla, por voz o texto: el dueño con el
Director General y cada empleado con el agente de su rol. Lo que se dice se puede apuntar como tarea
sin salir de la pantalla, y todo lo que tiene fecha vive en un calendario.

**Plan:** `blueprints/improvement-odoo/fase-6-plan.md` (H1–H5, armado el 2026-11-02 con lo que Jose Carlos ya había decidido: burbuja por rol, calendario de trabajo interno y comunicación diferida).

### Qué entra
- **T1** Tabla `agent_message` con su RLS: solo la persona lee su conversación, ni el dueño la de un empleado. `dashboard_card` suma el tipo `calendario`. Migraciones 0068 y 0069, ya aplicadas.
- **T2** `server/conversation/agent.ts`:
  - **Apuntar:** tarea propia, sin IA.
  - **Preguntar:** el dueño manda su memoria de dueño; un empleado, su rol, sus apps y su bandeja. Pasa por `extractStructured` (`purpose: "conversacion"`), que no escribe en `ai_suggestion`. Si la IA falla, la pregunta queda guardada.
- **T3** `server/calendar/agenda.ts`: tareas y objetivos con fecha y campos fecha de las apps propias que la persona ve, por día en CDMX.
- **T4** Pantallas y tarjeta:
  - Burbuja verde en todas las pantallas del negocio: voz con la Web Speech API del navegador, sin dependencia; sin soporte no hay micrófono.
  - `/conversacion` y `/calendario`, con su enlace en la barra.
  - Tarjeta "Próximos 7 días".
- **T5** E2E `canales.spec.ts`: el empleado apunta desde la burbuja en Clientes y lo encuentra en su bandeja. Ve su tarea con fecha en el calendario y abre su conversación. Axe en el panel, el calendario y la conversación.

### Cambios al ejecutar
- **"Preguntar" no está en el E2E:** costaría dinero y no es determinista. Lo cubre `conversation.test.ts` con un proveedor simulado.
- **La burbuja detecta el micrófono con `useSyncExternalStore`:** un `setState` dentro de un efecto lo marcaba el lint de React.

### Verificación
- `pnpm lint && pnpm typecheck` ✔
- `pnpm test`: improvement 501/501 y summum 120/120 ✔.
- `pnpm --filter improvement test:e2e`: 88/88 ✔.

### No entra (decidido)
- **WhatsApp y correo hacia afuera:** siguen en pausa, como lo pidió Jose Carlos, hasta entregar la empresa digital. El camino ya está decidido: MCP de Gmail, y WhatsApp gratis partiendo de `apps/admin/lib/whatsapp.js`.
- **Calendario con bloques que Improvement reacomoda (estilo Motion), lote del mes y hábitos con puntos:** pieza propia, con decisiones del dueño.

### Pendiente fuera del código
- Nada nuevo. Siguen pendientes Google Cloud para Drive (Fase 3) y el proveedor Google en Supabase Auth (D5 de la Fase 2).

Va encima del PR de la Fase 5.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
