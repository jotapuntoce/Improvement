---
description: El motor genérico nunca lleva lógica específica de un cliente
paths:
  - "packages/db/**"
  - "apps/*/server/**"
---

# Motor genérico — sin lógica por cliente

Con el primer cliente real (Jaime Salinas) todo se construye a la medida en **datos** (áreas,
objetivos, configuración de su org). El motor genérico — auth, orgs, puntos, PowerUps, recordatorios,
gateway de IA — nunca lleva una rama de código específica de un cliente. Solo con un segundo cliente
real, comparando ambos casos concretos, se decide qué se generaliza en el motor y qué se queda 100%
custom por cliente.

- Ningún archivo bajo `packages/db/**` o `apps/*/server/**` (fuera de `packages/db/src/seed.ts`, que
  sí puede nombrar el org piloto porque es data de desarrollo, no lógica de producto) contiene un
  literal que se parezca a un `org_id`, un slug de organización o un nombre de empresa.
- Ninguna función de este árbol recibe una rama `if (orgId === '...')` / `if (orgSlug === '...')` para
  decidir su comportamiento. Si un cliente necesita algo distinto, ese algo vive en una fila de
  `area`, `objective`, `org_build_stage` o cualquier otra tabla — nunca en una condicional de código.
- Un `grep` de un UUID, slug o nombre propio en estos directorios (fuera de tests y `seed.ts`) es un
  hallazgo de code review, no una opinión.

## Do not

- No agregues un flag de feature por org en código. Si algo debe variar por org, es una columna o una
  fila, no una condición.
- No copies un archivo de `server/` para "la versión de tal cliente". Eso es el fork que este proyecto
  existe para evitar.
