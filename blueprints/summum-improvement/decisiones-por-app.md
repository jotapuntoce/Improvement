# Summum System + Improvement — decisiones por app de referencia

Insumo para `/architect-brownfield`. Cada app se recorrió en el navegador y con REA (tabla de rutas del bundle);
José Carlos decidió qué función entra. Fuente de la visión: `Summum System/ADN/Esto-es-Summum.md`.

## Auditoría de partida (2026-10-22)

- `blueprints/improvement`: FAIL (13 blocker). 17/17 tareas `done`, pero describe el "gemelo digital gamificado";
  no cubre el expediente clínico, necesidades/IPA, revisor, evolución ni el puerto a Summum que ya existen en código.
- `Summum System/blueprints/summum-system`: FAIL (18 blocker). 0/20 tareas; modelo viejo de matching.
  `apps/summum` se construyó fuera del blueprint (plan "casco del muelle": muelle/barcos, Stripe Connect, comisiones).
- Conclusión: un solo blueprint brownfield para los dos, construido desde estas decisiones.

## App 1 — Ninety (ninety.io) → Improvement: dirección del negocio

Módulos reales (REA, `app.ninety.io`): vto, goals, swot, rocks + milestones, todos, issues (IDS), scorecard /
kpi-manager, meetings (L10) + headlines, accountability-chart, 1-on-1, feedback quarterly/annual, people-analyzer,
fit-check, knowledge, mastery, assessments, surveys, partner-hub, referral, become-a-partner.

Entra en Improvement:
- Dirección: **Scorecard de KPIs**, **Issues + IDS** (forma de trabajar los patógenos / `org_need`),
  **Junta semanal L10**, **Visión (V/TO)**.
- Personas: **Accountability Chart**, **1-on-1 y feedback**, **People Analyzer**, **Portal de conocimiento**.
- Usuarios: **J.C. (director externo) + dueño + equipo** — los empleados ven sus propios rocks/to-dos y entran a la junta.
- Afiliadas: "**es el modelo del Partner Hub**" (implementadores certificados con referidos).
  ⚠️ Choca con *Esto es Summum* (afiliadas = especialistas de áreas que no son de J.C.) — por resolver en App 2.

## App 2 — Skool (skool.com, Next.js) → Summum + Improvement: capacitación, comunidad, referidos

Módulos reales (REA): `[group]` feed, polls, chat, members, `classroom/[course]`, calendar, `live/[call]`,
leaderboards / rankings / games / performance (niveles 1-9), plans, affiliates (compensations, referred-groups,
payout), discovery, map.

- **Afiliadas = dos tipos** (resuelve el ⚠️ de App 1): implementadores certificados del método Summum **y**
  especialistas de área. Mismo Pacto, mismo Sello, distinto rol.
- Entra: **Classroom por nivel**, **Comunidad (feed)**, **Niveles y leaderboard**, **Calendario + en vivo**.
- Referidos: **link para todos** — afiliadas y clientes; quien trae un cliente cobra durante el recorrido de ese cliente.
  Se monta sobre el muelle/Stripe Connect que ya existe en `apps/summum`, no en paralelo.
- Ubicación: **las dos apps** — Summum: red de afiliadas + Pacto. Improvement: portal interno por empresa para sus empleados.
- ⚠️ Leaderboard dentro de Improvement choca con el Non-Goal "ranking comparativo entre empleados" (riesgo de
  vigilancia laboral). Propuesta: leaderboard solo en Summum (afiliadas/socios); en Improvement, niveles personales sin tabla.
- ⚠️ Medir el Pacto con puntos toca datos de salud (LFPDPPP: consentimiento expreso); a empleados solo se ofrece.

## App 3 — B Corp, directorio público (bcorporation.net) → Summum: Sello Cénit

Perfil público (ej. Patagonia): sede, giro, países, "certificada desde", puntaje total vs mínimo (80) vs mediana
(50.9), puntaje por área, historial de puntajes por año, reporte de transparencia. REA: Next.js SSR, la regla de
certificación vive en servidor (no hay lógica en el bundle).

- **Cómo se gana:** cumplir los **requisitos del método Summum** que suman el puntaje mínimo. Ejemplos dados por J.C.:
  venta tipo *pull*, método 90/10, 10% de retorno a los clientes, valor agregado, automatización…
  ⬜ Pendiente: lista completa de requisitos, cuánto vale cada uno y el mínimo (cruzar con `Marco-Estrategico-Summum-360.md`).
- **Público:** **directorio con perfil + sello** (aplica a negocios y a afiliadas).
- **Vigencia:** **continuo + revisión** — la app vigila KPIs y Pacto; si caen: vigente → en riesgo → re-evaluación → suspendido.
- **Certifica:** **la app calcula** el puntaje desde el expediente de Improvement; **J.C. y Ricardo aprueban**.

## App 4 — Bonusly (bonusly.com) → Improvement: reconocimiento y premios

REA bloqueado por el challenge de Cloudflare de `bonus.ly` (no se evade); se usó la documentación pública:
peer recognition con presupuesto mensual ligado a valores, catálogo de rewards, check-ins, celebraciones, insights.

- **Puntos:** solo salen de **completar objetivos** (sin peer points). **Summum proporciona los rewards según el puntaje.**
- **Premios (PowerUps):** **solo la red Summum** — beneficios de afiliadas/negocios de la red. Conecta las dos apps:
  el empleado de un cliente canjea en una afiliada → la afiliada gana clientes. Reemplaza el "catálogo global de
  negocios aliados externos" del blueprint viejo.
- Extras que entran: **celebraciones automáticas**, **check-ins semanales** (base NOM-035 / bloque 8),
  **insights de cultura** para dueño y J.C.

## App 5 — Habitica (habitica.com, open source) → Summum: el Pacto

Módulos reales (REA): tasks (habits/dailies/todos/rewards), cron diario (falla → pierde HP), `user/sleep`
("posada", pausa sin castigo), stats (nivel/XP/HP), achievements, party, challenges, guilds, group-plans.

- **Registro:** **diario por pilar + racha**, con "posada" (pausa justificada sin romper racha).
- **Falla:** **solo riesgo visible** (pendiente → peligro → desliz, tono de apoyo, como la sobriedad del Pareto).
  **El Pacto NO afecta el Sello** → el cálculo continuo del Sello (App 3) vigila KPIs y método, no hábitos.
  Responde el pendiente de *Esto es Summum* "¿qué pasa cuando una afiliada rompe el Pacto?" → se ve y se acompaña.
- **Grupos:** **escuadras** (grupos pequeños que ven quién necesita apoyo) + **retos con fecha**.
- **Pareto Dashboard → se porta a Summum** como "Mi transformación" (backend real; J.C. es el primer usuario).
  Cobra la deuda del archivo TDAH: el motor Pareto 80/20, la racha de sobriedad y "El Jefe de las 11".
- ⚠️ LFPDPPP: hábitos de salud = datos sensibles → consentimiento expreso por escrito antes del primer registro.

## App 6 — Smile.io (smile.io) → Improvement: lealtad para los clientes del cliente

Admin embebido en Shopify (no público); se usó la página pública: points, VIP tiers, referrals, cashback,
memberships, badges & challenges, birthdays, perks; omnicanal (online, tienda, teléfono); rollout gradual; grupo de control.

- **"10% de retorno a los clientes" = 10% en experiencias** — el negocio reinvierte 10% en valor agregado y
  experiencias, no en descuentos/cashback. Es requisito del Sello (App 3) → la app debe poder medir ese 10%.
- Elementos que cada negocio puede activar: **niveles VIP**, **referidos de clientes finales**, **cumpleaños**, **retos y badges**.
- **Hiperpersonalización:** las 6 preguntas de hiperpersonalización (`Summum System/ADN/Captura-TDAH.md` §1) se responden al alta y viven en la **ficha del cliente**
  del CRM de Improvement; la IA sugiere cómo atenderlo y avisa si se incumple su expectativa.
- **Operación:** el negocio la opera desde **Improvement** (CRM ligero → CRM + lealtad); el cliente final ve un
  **monedero web con QR**, sin descargar app.

## Sinapsis y orden (sin app de referencia — decidido directo)

- **Cuándo entra un especialista:** **regla + aprobación de los socios + aprobación del dueño del negocio.**
  La regla dispara una propuesta cuando una necesidad de un área del 360 pasa cierta severidad; entra solo con las dos aprobaciones.
- **A qué afiliada:** **mayor puntaje del Sello + match de personalidad y enfoque** (⬜ definir cómo se captura la
  personalidad/enfoque de la afiliada y del dueño — candidato: People Analyzer / perfil de la afiliada).
- **Primero se construye:** **Dirección para Jaime** — los módulos Ninety dentro de Improvement.
- Antes de crear el proyecto: revisar **Odoo** y **Whop**.

## App 7 — Whop (whop.com) → Improvement + Summum: siguiente movimiento, plantillas, agentes

REA: casi todo SSR; endpoints visibles `apps`, `bounties`, `cards`, `financial_accounts`, `partners/fee_options`,
`users/me/preferences`. Página pública: Economic Intelligence, Deploy a business instantly, Payments/Wallet/
Accounts (KYC, sub-cuentas)/Cards/Reports, Whop CLI agentic.

- **Siguiente mejor movimiento en el home** del dueño (y J.C.): la IA lee KPIs, issues y expediente y propone la
  jugada con impacto estimado. Alimenta/reemplaza los "3 pendientes Pareto" (`paretoCut`).
- **Plantillas de empresa digital: sí** — Improvement genera sitio + cotizador + reservas del cliente desde plantillas
  por giro. ⚠️ Revoca el Non-Goal viejo "plantillas automáticas por tipo de empresa" y choca con la estrategia
  "todo a mano hasta el segundo cliente" — confirmar cuándo entra (después de Jaime, con el 2º cliente como comparación).
- **Dinero: seguir con Stripe Connect** (muelle de `apps/summum`); de Whop solo ideas: reporte de cada peso y monedero.
- **MCP/CLI para agentes: sí** — Claude opera Improvement y Summum con los mismos guards (precedente: CLI de ensambles).

## App 8 — Odoo (odoo.com + demo pública `demo6.odoo.com`) → Improvement: la operación (CRM/ERP)

Revisado con autorización explícita de J.C. (2026-10-22) en el Chrome de REA; el navegador de la app lo sigue rechazando.
Menú real de la demo (REA, árbol de accesibilidad): Discuss, Calendar, Appointments, To-do, Knowledge, Contacts, CRM,
Sales, Dashboards, Subscriptions, Rental, Point of Sale, Kitchen Display, Accounting, Documents, Project, Timesheets,
Planning, Helpdesk, Website, Email Marketing, Events, Purchase, Inventory, Manufacturing, Shop Floor, Barcode, Sign,
Employees, Recruitment, Time Off, Payroll, Expenses, AI, Studio. Además: paquetes por giro (Industries), programa de
Partners/Afiliados y certificaciones.

- **Estrategia:** Improvement **tiene la operación CRM/ERP al estilo Odoo, sin depender de Odoo** — no hay
  integración con un ERP externo. Igual que la hiperpersonalización, el proceso interno de cada negocio se personaliza.
- **Operación que entra sí o sí:** **ERP + operación**, **CRM + ventas**, **citas + calendario**,
  **proyectos + helpdesk**, **documentos + firma**.
- **Plantillas por giro = paquete completo:** sitio + módulos activos + áreas + KPIs + requisitos del Sello
  pre-configurados por giro (confirma y amplía la decisión de Whop).
- **Campos configurables por empresa** (estilo Studio), siempre en datos — nunca código por cliente
  (regla del motor genérico, `.claude/rules/motor-generico.md`).
- ⚠️ Alcance: "ERP completo" es el bloque más grande de todo el diseño. Hay que partirlo en piezas
  y ordenarlo detrás de "Dirección para Jaime". Falta definir qué módulo ERP va primero (candidato: el que alimente
  los KPIs que pidió Jaime).

Cruces con lo ya construido: issues ≈ `org_need`/patógenos · rocks ≈ objetivos IPA · accountability chart ≈ áreas ·
people analyzer ≈ nivel de responsabilidad (cuidar: hoy es privado y sin ranking — Non-Goal vigente).
