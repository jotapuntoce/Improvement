// Formatos (es-MX, hora de Ciudad de México) y lectura de formularios que comparten las páginas.
export const TZ = "America/Mexico_City";
const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
export const money = (cents: number) => MXN.format(cents / 100);
export const dayLabel = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
export const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const timeLabel = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
export const field = (formData: FormData, name: string) => formData.get(name)?.toString().trim() ?? "";
