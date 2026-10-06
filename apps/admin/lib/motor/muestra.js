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
  trato: "tu",
  portada: { dedicatoria: "Para Ana, que convirtió el café de su abuela en un lugar al que la gente quiere volver." },
  cierre: "Veinte minutos, en tu café o en línea, cuando te acomode. Sin compromiso: si solo te quedas con este documento, ya valió la pena.",
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
      bueno: {
        guia: { texto: "Lo que te mueve", mano: "se nota en cómo lo cuentas." },
        felicitacion: [],
        patron: "Quieres hornear y enseñar a comer rico sin culpa: el proceso te llena, no solo el resultado.",
      },
      idea: {
        guia: { texto: "Tu idea", mano: "sí tiene con qué." },
        viable: true,
        porque: "Hay demanda local de postres sin azúcar.",
        leFalta: ["Saber cuánto cobrar", "Un primer canal de pedidos"],
      },
      pasos: {
        guia: { texto: "Pasos chiquitos,", mano: "a tu medida." },
        items: [{ titulo: "Hornea 3 recetas de prueba", como: "Regálalas a 10 personas y anota qué dicen." }],
      },
      siguienteNivel: {
        guia: { texto: "Cuando des esos pasos,", mano: "esto es lo que sigue." },
        texto: "El Kit Arranque te da las plantillas para ordenar pedidos y números desde el día uno.",
      },
    };
  }
  return {
    tipo: "negocio",
    etapaProspecto: etapa,
    ...structuredClone(comun),
    bueno: {
      guia: { texto: "Tienes algo que no se compra:", mano: "gente que quiere volver." },
      felicitacion: [
        { valor: "4.7", texto: "de calificación en Google.", icono: "estrella" },
        { valor: "≈ 3 %", texto: "de tus seguidores reacciona en cada publicación.", icono: "comunidad" },
      ],
      conecta: {
        titulo: "Lo que más conecta con tu gente",
        items: [
          { que: "Tu abuela tostando café", valor: 120 },
          { que: "El latte del mes", valor: 64 },
        ],
      },
      patron: "Lo que más mueve es la historia de tu familia. Eso ya es tu mejor activo.",
      opiniones: {
        titulo: "Lo que dicen quienes ya te visitan",
        items: [
          { texto: "El mejor café de la colonia, y te atienden como en casa.", autor: "marta ruiz", estrellas: 5 },
          { texto: "Volvería solo por el pan de la abuela.", autor: "luis de la torre", estrellas: 4 },
        ],
      },
    },
    sintomas: {
      guia: { texto: "Dos síntomas. Ninguno es grave, pero", mano: "juntos cuestan." },
      items: [
        { titulo: "El menú no tiene precios en línea", vimos: "La página /menu solo dice 'Pregunta en barra'.", importa: "Quien no ve precio se va.", marca: "dato" },
        { titulo: "Tardes vacías", vimos: "Google marca poca afluencia de 16 a 18 h.", importa: "Son horas pagadas sin venta.", marca: "estimacion", supuesto: "10 cafés de $60 por día hábil" },
      ],
    },
    recetas: {
      guia: { texto: "Una receta por síntoma.", mano: "Sin costo,", despues: "y la mayoría en una tarde." },
      items: [
        { titulo: "Pon los precios en tu sitio", como: "Una foto del menú en la página de inicio." },
        { titulo: "Una promoción de tarde", como: "Café y pan a precio fijo de 16 a 18 h." },
      ],
      dimensionar: { texto: "cada tarde con 10 cafés más son unos $3,000 a la semana.", supuesto: "10 cafés de $60 por día hábil" },
    },
    noSeVe: {
      guia: { texto: "La receta baja los síntomas.", mano: "La causa se ve por dentro." },
      intro: "Desde afuera no podemos contestar las preguntas que más pesan en tu día a día:",
      preguntas: ["¿Cuánto deja cada producto?", "¿Qué horas se llenan y cuáles casi nunca?", "¿Qué pasa el día que tú no estás?"],
    },
  };
}
