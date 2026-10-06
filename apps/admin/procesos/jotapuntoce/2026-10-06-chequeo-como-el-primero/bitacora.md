# Bitácora · Chequeo como el primero (2026-10-05 → 2026-10-06)

## Ronda 1 · Portadas
- **Dueño:** "sí, así va; los dibujos me gustan, la frase que va con la letra de firma a mano, sacala del rectángulo en ambar y que se vea a centrado abajo del boceto señalando el boceto"
- **Hecho:** la frase a mano sale del bloque amarillo (ámbar sobre amarillo no se leía), centrada bajo el boceto con una flecha que lo señala. Arrancando: "ya está dando sus primeros pasos."
- **Decisión:** "sí, así quedan; guárdalas" → commit e42bd81.

## Ronda 2 · Primer borrador del motor (sin API)
- **Dueño:** "no tengo dinero para recargar, no podemos hacer las pruebas internamente??"
- **Hecho:** Claude investigó con lectura de texto (web_fetch) y pasó el contenido por el motor real → borrador-1.
- **Dueño:** "Primero lo bueno le falta el método PULL, se ve genérico, sin chiste, hecho sin amor … definitivamente no esta hehco igual que el primer chequeo … quiero que este transmitido tal cual como el primer chuequeo."
- **Dueño (página 2):** "me gustaría que diriga en primera persona (solo deja el mensaje para las socias en la portada): ¿Por qué hice esto? … Revisé [Nombre de Negocio] por que mi objetivo es ayudar a los dueños y emprendedores a que la visión que tuvieron se cumpla, esta en mi gen ayudar…"
- **Dueño (panel):** "en los comentarios no lo presenta ricardo (socio de summum) , lo presento yo, llegó por mi boreal." → corregido en la base.

## Ronda 3 · Por qué salió pobre y cómo obtener el resultado
- **Dueño:** "por favor revisa el resultado del primer chequeo de boreal que se hizo en este chat, ve como hacerle para obtener ese resultado hecho con el motor, comparalos…"
- **Hallazgo:** el primero se hizo con navegador real, Google Maps y las 32 publicaciones de Instagram con la sesión del dueño; el motor solo leía texto y tenía un molde más pobre, sin ejemplo de voz.
- **Dueño:** "A, si tengo mi cuenta de jotapuntoce" (Instagram por la API oficial de Meta).
- **Dueño:** "porque aqui si lo hiciste bien y con el motor no??" → la diferencia fue la evidencia, el molde y no compararlo antes de enseñarlo.
- **Dueño:** "te doy permiso de que hagas todo tu sin problema"

## Ronda 4 · Construcción (spec 1bbeafb, plan 81e1c7e)
- Recolector del sitio en Chromium (enlaces que regresan al inicio, rotos, precios, "muy pronto", celular), Instagram por Business Discovery, molde de 6 páginas del original, página 2 fija del dueño conjugada tú/ustedes, método v2 con el primer Chequeo como ejemplo, expediente guardado por pieza.
- Cada tarea con su ayudante y revisión; revisión final y una ola de correcciones (commits 8bbda51..7de9c9a).

## Ronda 5 · Validación con Boreal
- El recolector real encontró solo: Instagram, Blog y "Únete a la Comunidad" regresan al inicio; Torneos "Muy pronto"; menú de Serenna "PROXIMAMENTE"; clínicas "acércate directamente a recepción"; en celular la página se sale de lado (980 px en 390).
- Con ese expediente, sin mirar el original, se escribió el contenido v2 y el motor armó borrador-2.
- Falta: Instagram con cifras (token de Meta) y la calificación de Google, que no apareció en la búsqueda.

## Ronda 6 · Etiqueta y Google
- **Dueño:** "del diseño lo que dice dato y estimación ponlo en la esquina superior derecha de cada sintoma."
- **Dueño:** "cuando la busco yo si se puede ver y necesito que tu hagas ese chequeo."
- **Hecho:** la etiqueta Dato/Estimación va en la esquina superior derecha de cada tarjeta. Claude buscó a Boreal en Google: 4.8 con 10 opiniones (ambiente, canchas "increíbles", iluminación de noche, "el studio 10/10"; dos dicen que es el mejor club de pádel de San Luis) y 4 canchas. Entró a "Primero, lo bueno" → borrador-3.
