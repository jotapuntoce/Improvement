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
| 2 | Arranque | ✅ Terminada 2026-11-12 (análisis con IA espera la llave) |
| 3 | Inicio, conversación, alertas y calendario | Siguiente |
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
- ~~**Sección 2:** la pantalla de Arranque no tiene botón de Salir.~~ Hecho en la sección 2.
- Rotar el secreto del cliente OAuth de Google (quedó escrito en un chat): Google Cloud → Clientes →
  Improvement web → Agregar secreto → pegarlo en Supabase → Providers → Google → desactivar el viejo.
- Opcional: que la sesión caduque tras días sin uso, o 2FA, si Jose Carlos lo pide.
- `.env.example` debería decir que `NEXT_PUBLIC_GOOGLE_CLIENT_ID` también lo usa el botón de Google
  (los permisos bloquean que Claude edite `.env*`).

## 2. Arranque — terminada 2026-11-12 (PR #16)

- Diseño (opción D): conversación de una pregunta a la vez con la tarjeta "Tu Improvement,
  armándose" en vivo — ruta arriba, texto a la izquierda, tarjeta a la derecha; en teléfono la
  tarjeta baja. Botón **Salir** en todas las pantallas.
- Flujo: crear empresa → **negocio** (consolidación, camino del cliente, áreas y encargados, roles,
  qué se detiene sin el dueño, herramientas) → marca → **resultado** (qué quiere ver primero, cómo
  debe funcionar su ERP/CRM, cómo lo quiere ver) → propuesta → importar. Respuestas en
  `owner_memory` (`topic 'arranque'`).
- Conocimiento de Improvement en `server/ai/knowledge.ts` (método 360°, modelo mental y manual del
  Director General de lo nano a lo industrial, motor de clientes, Profit First). Lo usan el primer
  análisis (`server/owner/diagnostico.ts`: observaciones + `org_need`, una vez por empresa) y la
  burbuja del dueño.
- **Hiperpersonalización sin IA** (`server/owner/estructura.ts`): la entrevista pide en listas los pasos
  del prospecto, los servicios, los pasos del trabajo (con "Paso: qué se hace") y si hay inventario.
  La propuesta arma con eso los tableros **Prospectos** y **Trabajos** (e **Inventario** con mínimo y
  punto de reorden) antes de las apps del giro; al aceptar, reglas activas: el último paso del
  prospecto abre su trabajo, y cada paso con tarea se la crea al dueño. La estructura interna la
  prescribe Improvement por etapa (manual del DG: nano/micro/pequeña + capas industrial e
  inventario) más áreas sin nadie y lo que depende del dueño, como necesidades. Probado local con la
  org de prueba (propuesta y 4 reglas activas ✅).
- Pruebas en producción (2026-11-12, org de prueba "Taller Prueba Arranque"): entrevista ✅,
  respuestas guardadas ✅, propuesta ✅, Salir ✅. **Análisis ❌ — `AI_UNAVAILABLE`**: ninguna llamada
  a la IA ha funcionado nunca en producción (`llm_calls` vacía en todos los orgs). Decidido:
  seguir sin IA por ahora; la suscripción de Claude no sirve para la API.
- Hiperpersonalización en producción (PR #17, org de prueba "Carpintería Prueba Hiper"): propuesta con
  Prospectos/Trabajos/Inventario y 10 necesidades ✅, 4 reglas activas ✅; prospecto movido a "Paga el
  anticipo" → su trabajo nace solo en Diseño ✅ con la tarea "medir y mandar el plano — Familia
  López" ✅; trabajo a Instalación → tarea "agendar con el cliente" ✅.
- Arreglado después de esa prueba: las apps con etapas abren en **tarjetas** por default (Lista
  sigue a un clic) y en la ficha de un registro las etapas son botones que lo mueven (misma vía
  `moveRecord`, disparan las automatizaciones).
- **Vistas por cliente** (`server/apps/views.ts`): catálogo lista · tarjetas · calendario (por un campo
  fecha) · números (conteos y sumas por etapa) · tabla agrupada (por un campo opción). Cada vista es
  configuración en `app_view` (tipo + campos), nunca código por cliente. Al cerrar el arranque,
  Improvement lee "¿Cómo lo quieres ver?" y deja a cada app la primera vista pedida que puede
  armar; el dueño la cambia con "Que abra así". Lo que no reconoce queda como necesidad. Sin IA lee
  palabras clave; con la llave, la IA llenará el mismo `ViewConfig` desde texto libre.
- **Dolor primero y plan para quitarle carga** (`server/owner/alivio.ts`): el arranque empieza en
  `/arranque/<org>/dolor` — qué le duele, qué carga (casillas), sucursales, el último fuego y a qué se
  dedicaría como director. Un catálogo de jugadas (nómina, caja, pagos, proveedores, inventario,
  contenido, RH, apertura y cierre, fuegos) arma "Lo hago yo / Lo delegas / Te quedas tú" en la
  propuesta, las apps con campo Sucursal y sus reglas activas (aviso de corte con diferencia, pedido
  cuando se acaba algo, nómina 2 días antes…). Lo que suelta queda como necesidad (lo que duele en
  severidad 3) y su foco como meta principal. Sin IA lee palabras clave.
- Pendiente: "delegar a" todavía es texto; las tareas son del dueño hasta que la Sección 8 (Equipo)
  convierta a sus encargados en personas reales y las reglas les asignen a ellos.

**Heredado:**
- **Llave de la API (cuando Jose Carlos decida):** crédito en console.anthropic.com → llave nueva →
  `ANTHROPIC_API_KEY` en Vercel (improvement) → redeploy. Después, en `/arranque/<org>/resultado`,
  "Analiza mi negocio" otra vez: analiza todo lo ya guardado. Sin llave también están apagados la
  burbuja, la lectura de PDF/foto y el mapeo en Importar, el copiloto de tareas, la atención y el
  siguiente movimiento del CRM, y las alertas.
- El error real del proveedor no se registra (`analyzeBusiness` solo devuelve `AI_UNAVAILABLE`);
  registrar `r.error` si al poner la llave sigue fallando.
- **Sección 3:** la burbuja ya carga el conocimiento; las observaciones del análisis viven en
  `owner_memory` (`topic 'observacion'`) y las necesidades en `org_need`.
- Las áreas y roles que cuenta el dueño no se convierten todavía en áreas ni empleados reales
  (Sección 8, Equipo). Las tareas de cada paso van al dueño hasta que haya equipo.
- **Secciones 5 y 7:** que las tarjetas se muevan solas por señales de fuera (WhatsApp, pagos); el
  cliente ganado aún no se crea en la app base Clientes (las reglas solo crean en apps propias).
- "Así me gusta, ármalo" tarda ~40 s en local contra el Supabase remoto (una consulta por campo) y el
  botón no muestra que está trabajando.
- No entró el modelo mental de contenido (26 KB); el E2E `registro.spec.ts` está actualizado pero
  no se ha corrido.
- Opcional: borrar las orgs de prueba "Taller Prueba Arranque" (`ab88051c-…`) y "Carpintería Prueba
  Hiper" (`11a6a528-…`).
