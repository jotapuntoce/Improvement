// Lo que dice quien atiende cuando el dueño entra a su recepción.
//
// No es un texto fijo: es el parte del día. Cambia con la hora y con lo que la empresa tiene
// esperando, y dice UNA sola cosa — la más cara de las que están detenidas. Una recepcionista real
// no te lee el inventario completo en la puerta: te dice lo que no puede avanzar sin ti.
//
// El orden no es arbitrario. Arriba va lo que está parado esperando al dueño (una entrega sin
// revisar bloquea a quien la entregó); abajo lo que avanza sin él. Si no hay nada, lo dice.
//
// Función pura: recibe números, devuelve una frase. La hora entra por parámetro para que la
// pantalla la calcule en el servidor y el cliente no re-renderice otra cosa.

export interface SaludoDelDia {
  /** Nombre de quien entra. Se usa solo el primero. */
  nombre?: string | null;
  /** Con qué hora se decide la franja. Default: ahora. */
  hora?: Date;
  entregasPorRevisar?: number;
  objetivosAbiertos?: number;
  proyectosActivos?: number;
  powerupsPorCanjear?: number;
}

function franja(hora: Date): string {
  const h = hora.getHours();
  if (h < 12) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function parte(d: SaludoDelDia): string {
  const entregas = d.entregasPorRevisar ?? 0;
  if (entregas > 0) {
    return entregas === 1
      ? "Hay una entrega esperando tu visto bueno."
      : `Hay ${entregas} entregas esperando tu visto bueno.`;
  }

  const objetivos = d.objetivosAbiertos ?? 0;
  if (objetivos > 0) {
    return objetivos === 1 ? "Queda un objetivo abierto." : `Quedan ${objetivos} objetivos abiertos.`;
  }

  const proyectos = d.proyectosActivos ?? 0;
  if (proyectos > 0) {
    return proyectos === 1 ? "Un proyecto sigue en curso." : `${proyectos} proyectos siguen en curso.`;
  }

  const powerups = d.powerupsPorCanjear ?? 0;
  if (powerups > 0) {
    return powerups === 1 ? "Tienes un PowerUp sin canjear." : `Tienes ${powerups} PowerUps sin canjear.`;
  }

  return "Hoy no traes pendientes.";
}

/** El saludo completo: franja horaria, nombre de pila si lo hay, y el pendiente que manda. */
export function saludo(d: SaludoDelDia = {}): string {
  const pila = d.nombre?.trim().split(/\s+/)[0];
  const hola = pila ? `${franja(d.hora ?? new Date())}, ${pila}.` : `${franja(d.hora ?? new Date())}.`;
  return `${hola} ${parte(d)}`;
}
