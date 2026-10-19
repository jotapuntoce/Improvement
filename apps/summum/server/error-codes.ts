// Los errores de Result son cadenas fijas. Viajan en la URL como código (?error=otra-firma) y las
// páginas solo pintan lo que está en este mapa: un código desconocido se ignora (sin suplantación).
export const ERROR_MESSAGES: Record<string, string> = {
  invalido: "Revisa los datos del formulario.",
  "tasa-invalida": "Tasa inválida: porcentaje entre 0 y 100 %, cuota fija en centavos.",
  "barco-ajeno": "Ese barco no es de este muelle.",
  "otra-firma": "Necesita la firma del otro dueño.",
  "ya-decidido": "Este cambio ya se decidió.",
  "monto-invalido": "Monto en centavos enteros positivos y una descripción.",
  "cuenta-sin-verificar": "Tu cuenta de cobro aún no está verificada.",
  "sin-comision": "Summum aún no tiene comisión para este tipo de cobro.",
  "comision-mayor": "La comisión no puede ser igual o mayor que la venta.",
  "sin-liga": "Stripe no devolvió la liga de cobro.",
  "ya-membresia": "Este barco ya tiene membresía.",
  "nivel-inexistente": "Ese nivel no existe en este muelle.",
  stripe: "Stripe rechazó la operación.",
  "no-se-pudo": "No se pudo completar. Inténtalo de nuevo.",
};

/** Código de un mensaje de Result; "no-se-pudo" si no se reconoce. */
export function errorCode(message: string): string {
  return Object.entries(ERROR_MESSAGES).find(([, m]) => m === message)?.[0] ?? "no-se-pudo";
}

/** Mensaje de un código de la URL; undefined si no es uno conocido. */
export function errorMessage(code: string | undefined): string | undefined {
  return code && Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : undefined;
}
