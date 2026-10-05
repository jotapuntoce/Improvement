// Datos de muestra del motor: los usan las pruebas y la vista previa de portadas (app/chequeos/muestra). No es un
// cliente real: es un negocio inventado para ver la plantilla llena.
export const CHEQUEO_MUESTRA = {
  id: "00000000-0000-4000-8000-000000000000",
  origen: "landing",
  tipo: "negocio",
  nombre: "Ana López",
  negocio: "Café Ejemplo",
  giro: "cafetería de especialidad",
  ciudad: "San Luis Potosí",
  canal: "reel",
  canalDetalle: null,
  enlaces: { sitio: "https://ejemplo.com" },
  sinRedes: false,
  respuestas: [
    { pregunta: "¿Por qué empezaste tu negocio? Cuéntanos un poco de tu historia.", respuesta: "Por mi abuela, que tostaba café en casa." },
    { pregunta: "¿Qué parte de tu negocio te gustaría que caminara sin ti?", respuesta: "Los pedidos y el inventario." },
    { pregunta: "¿Qué quieres que tu negocio haga por tu vida?", respuesta: "Darme tiempo con mis hijos." },
  ],
  entrevistaSegundos: 420,
  createdAt: new Date("2026-10-05T15:00:00Z"),
  entrevistaAt: new Date("2026-10-05T15:20:00Z"),
  notas: null,
  abrePuerta: null,
};

export const EMPRENDEDOR_MUESTRA = {
  ...CHEQUEO_MUESTRA,
  id: "00000000-0000-4000-8000-000000000001",
  tipo: "emprendedor",
  negocio: null,
  giro: "repostería saludable",
  respuestas: [
    { pregunta: "¿A qué te gustaría dedicarte el resto de tu vida?", respuesta: "A hornear y enseñar a comer rico sin culpa." },
    { pregunta: "Cuéntanos tu idea", respuesta: "Pasteles sin azúcar para gente con diabetes, por pedido." },
    { pregunta: "¿Con qué cuentas hoy para arrancar?", respuesta: "Mis fines de semana y un horno." },
  ],
};

const comun = {
  portada: { dedicatoria: "Para Ana, que convirtió el café de su abuela en un lugar al que la gente quiere volver." },
  porQue: "Revisamos tu negocio como lo vería un cliente nuevo: tu sitio, tu ficha de Google y lo que contaste.",
  bueno: ["La historia de tu abuela le da alma a la marca.", "4.7 en Google [dato]."],
  cierre: "Si te late, platicamos de 20 a 60 minutos sobre ti: qué buscas y a dónde quieres llegar.",
  fuentes: [{ url: "https://ejemplo.com", que: "Sitio web" }],
  notasInternas: {
    comoEscribe: "Respuestas cortas pero cálidas.",
    tiempo: "Contestó el mismo día, en 7 minutos.",
    sinConfirmar: ["Ventas por día"],
    siguientePaso: "Mensaje mencionando a su abuela.",
  },
};

export function contenidoMuestra(etapa = "creciendo") {
  if (etapa === "idea") {
    return {
      tipo: "emprendedor",
      etapaProspecto: "idea",
      ...structuredClone(comun),
      idea: { viable: true, porque: "Hay demanda local de postres sin azúcar.", leFalta: ["Saber cuánto cobrar", "Un primer canal de pedidos"] },
      pasos: [{ titulo: "Hornea 3 recetas de prueba", como: "Regálalas a 10 personas y anota qué dicen." }],
      siguienteNivel: "El Kit Arranque te da las plantillas para ordenar pedidos y números desde el día uno.",
    };
  }
  return {
    tipo: "negocio",
    etapaProspecto: etapa,
    ...structuredClone(comun),
    patogenos: [
      { titulo: "El menú no tiene precios en línea", evidencia: "La página /menu solo dice 'Pregunta en barra' [dato].", costo: "Quien no ve precio se va.", marca: "dato" },
      { titulo: "Tardes vacías", evidencia: "Google marca poca afluencia de 16 a 18 h.", costo: "≈ $3,000 por semana.", marca: "estimacion", supuesto: "10 cafés de $60 por día hábil" },
    ],
    pastillas: [{ titulo: "Pon los precios en tu sitio", como: "Una foto del menú en la página de inicio." }],
    noSeVe: "Cuánto deja cada producto y cómo se reparten el trabajo: eso solo se ve por dentro.",
  };
}
