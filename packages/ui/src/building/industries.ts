// Lista cerrada de giros — fuente única para el <select> de industria (apps/improvement) y para el
// glyph, la paleta y la forma del edificio. Los 8 primeros son interfaz congelada (ids, etiquetas y
// orden; apps/admin tiene su propia copia JS de esos 8). Los demás crecen solo hacia abajo
// (blueprints/oficinas-digitales §4 *Catálogo de giros*): cada giro nuevo dibuja con su `base`, uno de
// los 8 originales, y trae su plantilla de áreas. "otro" es también el fallback: cualquier valor que no
// esté aquí (incluido null) usa la base "otro" — ver baseIndustry() abajo, nunca lanza.
export const INDUSTRY_CATEGORIES = [
  { id: "industriales", label: "Industriales" },
  { id: "comerciales", label: "Comerciales" },
  { id: "servicios", label: "Servicios" },
  { id: "tecnologicos", label: "Tecnológicos" },
  { id: "otro", label: "Otro" },
] as const;

export type IndustryCategory = (typeof INDUSTRY_CATEGORIES)[number]["id"];

export const BASE_INDUSTRIES = [
  "restaurante",
  "retail",
  "servicios",
  "salud",
  "construccion",
  "tecnologia",
  "manufactura",
  "otro",
] as const;

export type BaseIndustry = (typeof BASE_INDUSTRIES)[number];

interface IndustryEntry {
  readonly id: string;
  readonly label: string;
  readonly category: IndustryCategory;
  readonly base: BaseIndustry;
  /** Plantilla de áreas, en orden. Nunca "Dirección", "Sala de juntas" ni "Recepción" (zonas fijas). */
  readonly areas: readonly string[];
}

export const INDUSTRIES = [
  { id: "restaurante", label: "Restaurante", category: "servicios", base: "restaurante", areas: ["Cocina", "Piso", "Caja", "Compras"] },
  { id: "retail", label: "Tienda / Retail", category: "comerciales", base: "retail", areas: ["Ventas", "Almacén", "Caja", "Compras"] },
  { id: "servicios", label: "Servicios profesionales", category: "servicios", base: "servicios", areas: ["Atención a clientes", "Operación", "Ventas", "Administración"] },
  { id: "salud", label: "Salud", category: "servicios", base: "salud", areas: ["Consultorios", "Enfermería", "Farmacia", "Administración"] },
  { id: "construccion", label: "Construcción", category: "industriales", base: "construccion", areas: ["Obra", "Proyectos", "Compras", "Administración"] },
  { id: "tecnologia", label: "Tecnología", category: "tecnologicos", base: "tecnologia", areas: ["Producto", "Desarrollo", "Soporte", "Ventas"] },
  { id: "manufactura", label: "Manufactura", category: "industriales", base: "manufactura", areas: ["Producción", "Calidad", "Almacén", "Compras", "Mantenimiento"] },
  // Sin plantilla: la IA propone las áreas desde las fotos y organization.industry_custom.
  { id: "otro", label: "Otro", category: "otro", base: "otro", areas: [] },
  { id: "extractivos", label: "Extractivos (minería, pesca, agro)", category: "industriales", base: "manufactura", areas: ["Extracción", "Seguridad", "Mantenimiento", "Logística", "Administración"] },
  { id: "manufactura_consumo", label: "Manufactura de bienes de consumo", category: "industriales", base: "manufactura", areas: ["Producción", "Calidad", "Almacén", "Ventas", "Compras"] },
  { id: "manufactura_produccion", label: "Manufactura de bienes de producción", category: "industriales", base: "manufactura", areas: ["Producción", "Ingeniería", "Calidad", "Almacén", "Compras"] },
  { id: "desarrolladora", label: "Desarrolladora inmobiliaria", category: "industriales", base: "construccion", areas: ["Proyectos", "Obra", "Ventas", "Trámites", "Administración"] },
  { id: "mayoristas", label: "Mayoristas y distribuidores", category: "comerciales", base: "retail", areas: ["Ventas", "Almacén", "Logística", "Compras", "Cobranza"] },
  { id: "comisionistas", label: "Comisionistas y representantes", category: "comerciales", base: "retail", areas: ["Ventas", "Atención a clientes", "Administración"] },
  { id: "inmobiliaria", label: "Inmobiliaria (corretaje)", category: "comerciales", base: "retail", areas: ["Captación", "Ventas", "Rentas", "Administración"] },
  { id: "horeca", label: "Hoteles, restaurantes y cafeterías (HORECA)", category: "servicios", base: "restaurante", areas: ["Cocina", "Piso", "Barra", "Caja", "Compras"] },
  { id: "financieros", label: "Servicios financieros", category: "servicios", base: "servicios", areas: ["Asesoría", "Crédito", "Cobranza", "Cumplimiento", "Administración"] },
  { id: "educacion", label: "Educación", category: "servicios", base: "servicios", areas: ["Académico", "Control escolar", "Admisiones", "Administración"] },
  { id: "logistica", label: "Logística y transporte", category: "servicios", base: "servicios", areas: ["Operaciones", "Flota", "Almacén", "Atención a clientes", "Administración"] },
  { id: "mantenimiento", label: "Mantenimiento e instalaciones", category: "servicios", base: "servicios", areas: ["Servicio en campo", "Programación", "Almacén", "Ventas"] },
  { id: "wedding_planner", label: "Wedding planner y eventos", category: "servicios", base: "servicios", areas: ["Ventas", "Planeación", "Proveedores", "Producción del evento"] },
  { id: "clinica", label: "Clínica", category: "servicios", base: "salud", areas: ["Consultorios", "Enfermería", "Laboratorio", "Farmacia", "Administración"] },
  { id: "hotel", label: "Hotel", category: "servicios", base: "servicios", areas: ["Reservaciones", "Ama de llaves", "Alimentos y bebidas", "Mantenimiento", "Administración"] },
  { id: "despacho", label: "Despacho profesional (legal, contable)", category: "servicios", base: "servicios", areas: ["Atención a clientes", "Expedientes", "Cumplimiento", "Administración"] },
  { id: "taller", label: "Taller (automotriz, mecánico)", category: "servicios", base: "manufactura", areas: ["Servicio", "Refacciones", "Atención a clientes", "Caja"] },
  { id: "software_saas", label: "Software y SaaS", category: "tecnologicos", base: "tecnologia", areas: ["Producto", "Desarrollo", "Soporte", "Ventas", "Marketing"] },
  { id: "infraestructura_ti", label: "Infraestructura y servicios de TI", category: "tecnologicos", base: "tecnologia", areas: ["Proyectos", "Soporte", "Redes", "Ventas"] },
  { id: "economia_colaborativa", label: "Economía colaborativa (plataformas)", category: "tecnologicos", base: "tecnologia", areas: ["Operaciones", "Comunidad", "Soporte", "Producto"] },
  { id: "entretenimiento_digital", label: "Entretenimiento digital", category: "tecnologicos", base: "tecnologia", areas: ["Contenido", "Producción", "Comunidad", "Comercial"] },
  { id: "fintech", label: "Fintech", category: "tecnologicos", base: "tecnologia", areas: ["Producto", "Riesgo", "Cumplimiento", "Soporte", "Desarrollo"] },
] as const satisfies readonly IndustryEntry[];

export type Industry = (typeof INDUSTRIES)[number]["id"];

const BY_ID = new Map<string, IndustryEntry>(INDUSTRIES.map((i) => [i.id, i]));

export function isIndustry(value: string | null | undefined): value is Industry {
  return value != null && BY_ID.has(value);
}

/** La base de dibujo del giro (paleta, forma, glyph); "otro" si no existe. */
export function baseIndustry(value: string | null | undefined): BaseIndustry {
  return (value != null && BY_ID.get(value)?.base) || "otro";
}

/** La plantilla de áreas del giro, en orden; `[]` si no existe (o es "otro"). */
export function industryAreas(value: string | null | undefined): readonly string[] {
  return (value != null && BY_ID.get(value)?.areas) || [];
}
