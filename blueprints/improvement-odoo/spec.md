# Improvement estilo Odoo — spec de diseño

Fecha: 2026-10-27 · Estado: aprobado por Jose Carlos, pendiente de plan por fase
Base: rama `summum-improvement` (PR jotapuntoce/Improvement#5) ya fusionada a `main`.

## 1. Resultado buscado

Cada dueño de negocio (empezando por Jaime Salinas) **arma su propio ERP/CRM de principio a fin** —
apps, etapas, campos, vistas, reglas y tableros— **conversando con Improvement**, e Improvement lo
construye, lo ejecuta y lo sigue ajustando. Toda tarea interna del dueño o de un empleado se hace
**dentro de Improvement y junto con Improvement**.

Referencia de producto: Odoo (apps, vistas lista/kanban/ficha, bitácora, Studio) para lo que ve el
dueño; la barra izquierda de Whop (ver captura del 2026-10-27) para la navegación. No es una copia: le
suma lo que hace a Improvement distinto (dirige, conoce a la persona, ejecuta).

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Inicio | El tablero que cada usuario elige ("lo que le importa"); apps en la barra izquierda. |
| Alcance de personalización | Como Odoo Studio: etapas, campos, vistas y apps nuevas creadas por el dueño. |
| Qué ejecuta Improvement | Configura, automatiza y, dentro de cada tarea, actúa como copiloto que también ejecuta las partes que no necesitan a la persona. |
| Importación | Archivos (CSV, Excel, PDF, fotos) + conector de Google Drive/Sheets. Otros conectores, uno por uno, cuando un cliente real lo pida. |
| Modelo de datos | Híbrido (Enfoque 1): las apps base conservan sus tablas y ganan campos extra en `custom jsonb`; las apps del dueño viven en `app_model` + `app_record`. |
| Marca | Improvement en negro + degradado verde (#1fbe79 → #98e33b) solo en login, registro y la burbuja. Dentro del negocio, la marca del negocio (`org_brand`). |
| Registro | Abierto y gratis; el cobro llega después. "Solicitar empresa" queda solo para empresas que Jotapuntoce construye a la medida. |
| Edificio 3D | Se elimina. `/empresas` queda solo como cartera del platform admin. |

Excluido de esta versión: "Nada se cierra sin evidencia" como regla obligatoria de etapas.

## 3. Motor de configuración (datos)

Todo lo personalizable es fila; ningún código por cliente (`.claude/rules/motor-generico.md`). Cada
tabla org-scoped nace con su política RLS en la migración `--custom` del mismo paso.

| Tabla | Contenido |
|---|---|
| `org_profile` | Giro (catálogo + "otro" libre), tamaño de equipo, ciudad, plantilla de origen. |
| `org_brand` | Logo, portada, color primario y secundario, fondo claro/oscuro, tipografía. |
| `app_template` | Plantillas por giro (semilla): apps, etapas, campos, vistas, grupos y reglas sugeridas. |
| `app_group` | Grupos de la barra izquierda (nombre, orden, colapsado). |
| `app_model` | Apps del org: `kind` `base` (apunta a `client`, `deal`, `project`, `ticket`, `objective`…) o `custom`; nombre, ícono, color, grupo, prendida. |
| `app_field` | Campos: nombre, llave, tipo (texto, número, dinero, fecha, opción, relación, archivo, sí/no), obligatorio, orden. En apps base solo los extra. |
| `app_stage` | Etapas por app: nombre, orden, si cierra (ganado/perdido). |
| `app_view` | Vistas guardadas: lista, kanban, ficha, reporte; columnas, filtros, agrupación. |
| `app_record` | Registros de apps custom; valores en `data jsonb`. |
| `dashboard_layout` | Tarjetas y su acomodo, por usuario y org. |

Columnas nuevas: `custom jsonb not null default '{}'` en `client`, `deal`, `project`, `ticket`.

`server/apps/fields.ts` es el único lugar que convierte `app_field` en un esquema zod; toda escritura
(base o custom) valida con él.

## 4. Frente

- **Barra izquierda:**
  - Selector de empresa (logo, nombre, quién está en línea).
  - "Vista previa como" un tipo de permiso.
  - Fijos: Inicio, Soporte (conversar con Improvement) y Agregar aplicación.
  - Grupos de apps colapsables, cada uno con "+".
  - Se colapsa a íconos; en teléfono es un cajón.
- **Centro:**
  - Arriba, la portada y el logo del negocio.
  - Debajo, el tablero de tarjetas que el usuario agrega, quita y acomoda. Improvement sugiere uno inicial según su rol.
- **Dentro de cada app:**
  - Panel de control: migas, Nuevo, buscador con filtros y agrupar por, cambio de vista.
  - Vistas genéricas: lista (totales en dinero), kanban (arrastrar entre etapas; componente cliente) y ficha (barra de etapas, campos, bitácora).
  - La ficha de cliente suma hiperpersonalización, nivel VIP + monedero y salud del cliente.
- **Burbuja de Improvement** en todas las pantallas, siempre verde, con captura por voz o texto.
- **Rutas:** `/[org]` (inicio), `/[org]/a/[app]` (`?vista=lista|kanban|reporte`), `/[org]/a/[app]/[id]` (ficha). Dirección, Equipo y Objetivos se integran como apps; sus pantallas actuales se conservan.
- **Tokens:**
  - Los tokens base se separan por app.
  - El layout del org convierte `org_brand` en variables CSS que pisan los tokens; ningún hex nuevo en componentes.

## 5. Registro, giro e importación

1. `/registro`: correo y contraseña, o Google, vía Supabase Auth.
2. Arranque guiado, conversacional pero con pasos visibles:
   1. **Negocio:** nombre, giro, tamaño, ciudad.
   2. **Marca:** sube logo o manual; la IA extrae colores y tipografía y el dueño los confirma.
   3. **Cómo trabaja hoy:** conecta Drive, sube archivos o elige "no tengo nada", y explica con sus palabras cómo lo quiere ver.
   4. **Propuesta:** plantilla del giro + lo leído en sus archivos + lo pedido. Muestra apps, etapas, campos y grupos antes de crear nada; se ajusta conversando.
   5. **Importación:** mapeo columna → campo, vista previa, errores fila por fila, confirmación explícita, deshacer completo.
   6. **Tablero inicial** según su rol.
3. Datos de importación:
   - `import_job`: origen, mapeo, estado, filas con error.
   - `record_origin`: liga cada registro con su importación, para poder deshacerla.
4. Google Drive:
   - OAuth con alcance de solo lectura.
   - Variables nuevas `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, documentadas en `.env.example`.
5. Archivos `.xlsx`:
   - Requieren una dependencia nueva (p. ej. SheetJS); su razón va en el commit.
   - CSV y Sheets exportados se leen sin dependencia.
6. La lectura de PDF y fotos y el mapeo pasan por `apps/improvement/server/ai/gateway.ts`.

## 6. Automatizaciones

- **`automation_rule`:**
  - **Disparadores:** creado, cambio de etapa o de campo, fecha cercana o vencida, tiempo sin actividad.
  - **Condiciones:** mismos filtros que las vistas.
  - **Acciones:** crear registro en otra app, cambiar campo o etapa, asignar, crear objetivo vía `createObjective()`, avisar (app, correo, WhatsApp), dar puntos, registrar experiencia de lealtad, `agent_task`.
- **Ejecución:**
  - Los eventos corren en la misma Server Action, después de guardar.
  - Los de tiempo corren en `/api/cron/automatizaciones` cada 15 min, con bearer `CRON_SECRET`.
- **`automation_run`:** registra cada ejecución (regla, registro, resultado o error) y se muestra en la bitácora.
- **Seguridad:**
  - Tope de 3 niveles de reglas en cadena.
  - Modo prueba antes de activar.
  - Plantillas de mensaje a clientes finales aprobadas una vez por el dueño.

## 7. Tareas con Improvement

- **Bandeja única por persona** (la tarjeta "Lo que toca hoy"). Llega todo: lo que asigna el dueño, lo que crean las automatizaciones, lo que sugiere Improvement y lo que la persona se apunta sola por voz o texto.
- **Espacio de trabajo por tarea:**
  - A la izquierda, los pasos y el registro relacionado.
  - A la derecha, Improvement trabajando: divide en pasos, prepara borradores, llena el CRM, pregunta solo lo que falta.
- **Ejecución:**
  - Improvement ejecuta solo acciones de un catálogo: mensaje, agenda, crear o actualizar registros, documento.
  - Cada tipo de acción tiene permiso: "pregúntame siempre", "la primera vez" o "hazlo solo".
  - Lo que sale hacia afuera queda en "pregúntame" por defecto.
  - Nunca mueve dinero.
- **Cierre:** cada paso queda en la bitácora con su evidencia; cerrar la tarea actualiza el registro y da puntos (sin ranking).

## 8. Dashboards e inteligencia

- **Catálogo de tarjetas:**
  - Número con tendencia (`org_kpi` o cualquier campo).
  - Barras o línea por etapa, mes o responsable.
  - Embudo, kanban o lista en miniatura.
  - Lo que toca hoy, alertas, momentos importantes.
  - Ingresos por producto contra meta.
  - Pronóstico.
  - Calendario de trabajo interno.
- **Permisos:** cada tarjeta respeta los permisos de quien la ve.
- **Inteligencia** (los números salen de consultas; la IA solo redacta):
  - **Qué falta en tu proceso:** compara contra la plantilla del giro; se aplica con un clic.
  - **Alertas que explican:** reglas detectan el caso; la IA redacta el porqué, el dinero en juego y qué hacer.
  - **Salud del cliente:** calculada de su actividad y guardada en `client.health_status`.
  - **Pronóstico:** pipeline abierto × tasa real de cierre por etapa de los últimos 6 meses.
  - **¿Qué pasa si?:** cálculo en el navegador, sin IA.
  - **Puente a Summum:** vía `referNeedToSummum()`.

## 9. Fases

| Fase | Entrega |
|---|---|
| 1. Base | Tokens por app, `org_brand`, barra izquierda, sin edificio, motor de configuración para apps base, vistas genéricas con bitácora. |
| 2. Registro y arranque | `/registro`, giro, plantillas, marca desde logo, propuesta, apps custom, Agregar aplicación. |
| 3. Importación | Archivos, Google Drive, `import_job`, mapeo con IA, deshacer. |
| 4. Tareas con Improvement | Bandeja, espacio de trabajo, copiloto + ejecución con permisos, automatizaciones. |
| 5. Dashboards e inteligencia | Tablero personalizable, alertas, qué falta, salud, pronóstico, ¿Qué pasa si?, puente a Summum. |
| 6. Canales | Captura por voz y WhatsApp, calendario de trabajo interno, agente por rol. |

Cada fase tiene su propio plan y su propio PR.

## 10. Pruebas y reglas que no cambian

- Pruebas:
  - Vitest de integración por módulo de `server/**`.
  - RLS probada como `authenticated` en cada tabla nueva.
  - Playwright + axe en cada pantalla nueva.
  - Gate `pnpm lint && pnpm typecheck && pnpm test`.
- Dos puertas: guard en cada función de `server/**` y política RLS en cada tabla.
- Toda migración se muestra a Jose Carlos y espera su "sí" antes de `pnpm db:migrate`.
- Sin ranking dentro de Improvement. `SUPABASE_SERVICE_ROLE_KEY` nunca en `apps/improvement`.
- `@anthropic-ai/sdk` solo en `server/ai/gateway.ts`.
