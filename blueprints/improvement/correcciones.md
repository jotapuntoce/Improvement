# Correcciones de Improvement — recorrido sección por sección

Empezó el 2026-11-03. **Cada sección se trabaja en su propia sesión de Claude Code** (para no saturar
una sola). La sesión nueva lee este archivo primero: aquí está el método, el estado de cada sección y
lo pendiente que se heredó.

## Cómo se trabaja una sección

1. **Recorrido en vivo.** Abrir la app en producción (`https://jotapuntoce.com/improvement`) en el
   navegador y mostrarle a Jose Carlos cómo se ve y qué hace hoy cada pantalla de la sección.
2. **Paso 1 — Diseño.** Le gusta la base (negro + degradado verde `#1fbe79 → #98e33b`, isotipo de
   cerebro en red); se *personaliza*, no se rehace. Mostrar las especificaciones actuales señaladas y
   2–3 opciones inspiradas en apps modernas, en el navegador, antes de tocar código (skill
   `aplicar-diseno`). Él elige; se construye en el código real.
3. **Paso 2 — Funcionamiento.** Probar cada flujo de punta a punta en producción con él (lista de
   pruebas ✅/❌). Lo que falle se arregla en esa misma sección.
4. **Entrega.** Rama nueva desde `origin/main` (worktree `.worktrees/improvement-odoo`), gate
   `pnpm lint && pnpm typecheck && pnpm test`, commit. **El push y el merge los hace Jose Carlos**
   (`git push -u origin <rama>`, luego `gh pr merge <n> --repo jotapuntoce/Improvement --merge`);
   Claude abre el PR. Vercel despliega solo; verificar en `https://jotapuntoce.com/improvement/api/health`.
5. **Cerrar.** Marcar la sección aquí como terminada, con lo que quedó pendiente para la siguiente.

Notas de entorno: la app vive en `jotapuntoce.com/improvement` (basePath `NEXT_PUBLIC_BASE_PATH`,
rewrite del proyecto Vercel jotapuntoce-site); Supabase `vnmgtottbxihvizlheem`; correos por Resend
desde `improvement@jotapuntoce.com` (plantillas en `correos-supabase.md`). El navegador integrado de
la app de Claude no abre la ventana de Google (FedCM): esa prueba se hace en Chrome.

## Secciones

| # | Sección | Estado |
|---|---|---|
| 1 | Entrada (`/login`, `/registro`, `/recuperar`, `/auth/*`, `/invitacion`) | ✅ Terminada 2026-11-05 |
| 2 | Arranque | Siguiente |
| 3 | Inicio, conversación, alertas y calendario | — |
| 4 | Aplicaciones (ERP/CRM, importar) | — |
| 5 | Tareas, automatizaciones, proceso y "¿Qué pasa si?" | — |
| 6 | Mapa, objetivos, necesidades, proyectos y planos | — |
| 7 | Clientes, cobros y postventa | — |
| 8 | Equipo | — |
| 9 | Dirección | — |
| 10 | Configuración, marca y perfil | — |
| 11 | Empresas (tu cartera), powerups y monedero | — |

## 1. Entrada — terminada 2026-11-05 (PRs #12, #13, #14)

- Diseño: login con pantalla dividida (historia + tarjeta), registro "Crea tu Improvement" con red
  neuronal creciendo, isotipo de Improvement (`components/brand/Isotipo.tsx`).
- Registro con confirmación por correo (enlace a `jotapuntoce.com/.../auth/callback?token_hash=…`,
  canjeado con `verifyOtp`); correos con isotipo animado, ya llegan a Recibidos.
- "¿Olvidaste tu contraseña?" (`/recuperar` → `/auth/nueva-contrasena`).
- "Continuar con Google" en login y registro con el botón oficial de Google (`BotonGoogle.tsx`,
  `signInWithIdToken`): la pantalla de Google dice "jotapuntoce.com". Proyecto Google Cloud
  "Improvement" (org summumsystem.com), cliente "Improvement web".
- Sesión que se renueva sola (`SesionViva.tsx`); páginas privadas mandan al login sin sesión.
- Pruebas completas en producción: registro, entrar/contraseña equivocada, recuperar, Google y
  sesión protegida — todas ✅.

Decidido: el remitente `improvement@jotapuntoce.com` se queda **sin foto de perfil** en Gmail (no se
paga licencia ni subdominio). Existe el grupo de Workspace `improvement@jotapuntoce.com` (dueño
josecarlos@summumsystem.com) que recibe las respuestas.

**Heredado a otras secciones:**
- **Sección 2:** la pantalla de Arranque **no tiene botón de Salir** (hoy solo en Empresas y
  Configuración). Agregarlo.
- Rotar el secreto del cliente OAuth de Google (quedó escrito en un chat): Google Cloud → Clientes →
  Improvement web → Agregar secreto → pegarlo en Supabase → Providers → Google → desactivar el viejo.
- Opcional: que la sesión caduque tras días sin uso, o 2FA, si Jose Carlos lo pide.
- `.env.example` debería decir que `NEXT_PUBLIC_GOOGLE_CLIENT_ID` también lo usa el botón de Google
  (los permisos bloquean que Claude edite `.env*`).
