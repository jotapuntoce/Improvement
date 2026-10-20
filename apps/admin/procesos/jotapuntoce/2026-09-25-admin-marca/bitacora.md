# Bitácora · Panel admin con la marca JotaPuntoCe

Proyecto: jotapuntoce · Fecha: 2026-09-25 · Rama: `login-jotapuntoce` (base `fbd3cae`)

## Ronda 1 · Aplicar la marca al panel

**Pidió:**
> dale el estilo jotapuntoce al panel administrativo de jotapuntoce que ya existe

**Se hizo:**
- Remapeo de tokens solo en el admin (`<html data-brand="jotapuntoce">`): 70 % marino, 20 % marfil, 7 % ámbar; fuera el degradado violeta→cian.
- Inter Tight 300–600 en todo el panel (fuera Geist); 18 pesos de 700–800 bajados a 600.
- Sidebar: Monograma M2 en lugar del cuadro "JC" + "JotaPuntoCe".
- Hilo de 6 colores como filete bajo la barra superior.
- Titular "Recepción JotaPuntoCe" → "Hoy también *da para más.*" (frase a mano).
- Se quitó el selector de color de acento y los brillos de fondo.

**Versión v1:** no capturada (sin commit, se cambió en la ronda 2).

## Ronda 2 · Dos firmas y la recepción de agencia

**Pidió:**
> quiero ver dos opciones para la firma, primera opción, que unicamente este el punto que es el cerebro del monograma 2 pero que se vea más grande en una escala apreciable. segunda opcion, el isotipo de jotapuntoce en la firma de misma manera en una escala apreciable

> 1. cambia todo que este adoc a las reglas de la marca jotapuntoce, pero que mantenga la esencia de una recepción, quiero ver una recepción de agencia estilo jotapuntoce.

> 2. de momento asi dejalo pero ahi va mi foto definitvamente.

**Se hizo:**
- v2-a: el cerebro del M2 solo, a 64 px. v2-b: el isotipo sin fondo, a 120 px.
- Recepción: pared marino con hilo arriba; pantalla de marco fino con el monograma en la barbilla; directorio de áreas con contorno de su lóbulo; muro de proyectos con notas marfil, tachuela ámbar y avance dibujado con el hilo.
- Token nuevo `--brand-amber-paper` (#c98a00, del manual). Arreglada la animación `pulseRing` que nunca existió y el desborde de columnas.

## Ronda 3 · Se elige el isotipo

**Pidió:**
> se queda la opción del isotipo, abajo del isotipo enves de que diga panel administrativo ponle que diga completo JotaPuntoCe.

> donde dice panle cambialo por Recepción, con la letra de firma.

> Hoy tambien da Para Más cambialo por Soy un Genio Incomprendido y eso me hace único

> Excelente detalle de Monograma en la televisión, exactamente en ese tipo de detalles es donde quiero que se vea el Monograma.

**Decisión:** isotipo + wordmark W3 como firma del admin (manual v1.1). Monograma en los detalles chicos.

**Se hizo:**
- Isotipo + wordmark W3 (archivo real) en la barra lateral.
- "Recepción" en Caveat ámbar en la barra superior; menú "Dashboard" → "Recepción".
- Titular: "Soy un Genio Incomprendido *y eso me hace único.*"
- Subtítulo sin el nombre en texto vivo: "Resumen general de la agencia".

## Ronda 4 · Expedientes en Planos y ajustes finos

**Pidió:**
> los expedientes guardalos en el apartado de planos del panel administrativo, dentro de planos siempre crea una carpeta a las carpetas dales su propio estilo para cada proyecto, en este caso literal es un proyecto de jotapuntoce, aqui debe estar guardado todo el proceso.  y ese proceso añadelo a la skill.

> cambia la frase de Soy un Genio Incomprendido y eso me hace único. por solo Genio Incomprendido.

> Abajo del isotipo utiliza JotaPuntoCe sin las linea de color que está abajo,

> Recepción dejalo en la letra de texto de la marca y quita la breve descripción de resumen general de la agencia.

**Decisión:** wordmark sin hilo bajo el isotipo en el admin (manual v1.1).

**Se hizo:**
- Planos: carpetas por proyecto con el estilo de su marca; dentro, cada expediente con antes/después, PDF y bitácora (solo para Jose Carlos).
- Los expedientes viven en `apps/admin/procesos/<proyecto>/`; la skill documentar-proceso los guarda ahí.
- Titular "Genio *Incomprendido*"; wordmark sin hilo; "Recepción" en Inter Tight, sin subtítulo.

## Ronda 5 · Genio al frente

**Pidió:**
> en genio incomplrendido se ve mejor resaltado genio que incomprendido y donde dice recepción dejalo con la letra de firma

**Decisión:** "Recepción" con letra de firma; los demás títulos en Inter Tight (manual v1.1).

**Se hizo:**
- Titular: "*Genio* Incomprendido" (Genio a mano en ámbar).
- "Recepción" en Caveat 700 ámbar otra vez.

## Ronda 6 · Ícono de Recepción

**Pidió:**
> básaste en la primera imágen para crear el ícono de recepción que va en la segunda imágen envés del rombo claro aplicacle el estilo de la marca jotapuntoce

(Referencia: ícono de línea de un mostrador con monitor y letrero "RECEPTION".)

**Se hizo:**
- Ícono nuevo: mostrador con monitor en trazo fino marfil; el letrero lleva el hilo de seis colores en vez de la palabra (ilegible a 22 px). Reemplaza el rombo.

## Ronda 7 · Íconos de Planos y Solicitudes

**Pidió:**
> sí, haz los demás íconos con el mismo estilo
> imagen 1 referencia para planos, imagen 2 referencia para solicitudes

(Referencias: plano enrollado con lápiz y planta; persona con documento y globo con palomita.)

**Se hizo:**
- Planos: el lápiz traza un muro de la planta con el hilo. Solicitudes: la palomita del globo va con el hilo.
- Los tres íconos en `components/brand/NavIcons.js`, mismas reglas: trazo 1.4 marfil y un detalle de hilo por ícono.

## Ronda 8 · Firma centrada

**Pidió:**
> centra el isotipo con JotaPuntoCe Abajo.

**Se hizo:**
- Isotipo y wordmark centrados en la barra lateral, uno sobre otro.

## Ronda 9 · El laboratorio: Soluciones pasa a Sistemas

**Pidió:**
> el área de soluciones la vamos a cambiar por sistemas. y necesito que estas áreas sean las áreas de jotapuntoce osea aqui es el laboratorio de jotapuntoce practicamente es lo que me destaca, son mis especialidades, es donde trabajo, donde creo cosas para mis clientes pero necesito las áreas esenciales de la empresa para medir como va la empresa osea las tradicionales.  esto de las áreas tradicionales dejalo pendiente lo vamos a hacer en un chat aparte porque te voy a agregar la información de como se debe cosntruir un CRM Y UN ERP etc...

**Decisión:** las seis áreas son el laboratorio de JotaPuntoCe; las tradicionales van en otro chat.

**Se hizo:**
- "Soluciones" → "Sistemas" en panel, token (`--dept-sistemas`) y manual.
- El panel se llama "Laboratorio · especialidades".

## Pendientes

- Foto de Jose Carlos en el círculo "JC".
- Presentación de los expedientes en estilo planos/blueprint (diseño alternativo, aparte).
- Áreas tradicionales para medir la empresa (CRM, ERP…): chat aparte.
- Skill "Conviértete en experto": chat aparte.
