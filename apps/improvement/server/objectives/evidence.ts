// Qué se tiene que entregar para poder dar por terminado un objetivo, según la clase de trabajo que
// sea. Módulo PURO: valida texto, no toca base de datos ni Storage.
//
// La clase de evidencia la elige el dueño al emitir el objetivo, no el sistema: "levanté el
// teléfono" y "publiqué el catálogo" no se prueban igual. Y 'ninguna' existe y es el default a
// propósito — pedir comprobante de todo convierte el producto en un checador y el objetivo del
// producto es lo contrario.
import { z } from "zod";

export const EVIDENCE_TYPES = ["ninguna", "enlace", "nota", "numero", "archivo"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);

export interface EvidenceKind {
  type: EvidenceType;
  label: string;
  /** Lo que se le dice al empleado en el formulario, en su idioma, no en el del sistema. */
  hint: string;
}

export const EVIDENCE_KINDS: EvidenceKind[] = [
  {
    type: "ninguna",
    label: "Sin evidencia",
    hint: "Se marca terminado con un clic. Para trabajo que se ve solo.",
  },
  {
    type: "enlace",
    label: "Un enlace",
    hint: "La publicación, el documento compartido, la carpeta. Cualquier URL.",
  },
  {
    type: "nota",
    label: "Una nota",
    hint: "Qué pasó y con quién. Para juntas, llamadas y visitas.",
  },
  {
    type: "numero",
    label: "Un número",
    hint: "Cuántos. Prospectos contactados, piezas entregadas, cobros hechos.",
  },
  {
    type: "archivo",
    label: "Un archivo",
    hint: "El PDF, la foto, el comprobante. Se sube y queda guardado.",
  },
];

export function evidenceKind(type: string): EvidenceKind | undefined {
  return EVIDENCE_KINDS.find((k) => k.type === type);
}

const MIN_NOTA = 10;

/**
 * WHEN el objetivo pide evidencia y lo que llega no sirve THE SYSTEM SHALL rechazar la entrega con
 * un mensaje que diga qué falta — nunca completarlo en silencio ni guardar una evidencia vacía.
 *
 * Devuelve el valor ya normalizado, listo para escribir en objective.evidence_value. Para 'ninguna'
 * devuelve null: no hay nada que guardar y un string vacío mentiría en la columna.
 */
export function validateEvidence(
  type: EvidenceType,
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (type === "ninguna") return { ok: true, value: null };

  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, message: "Este objetivo pide una evidencia para darse por terminado." };

  switch (type) {
    case "enlace": {
      // z.url() acepta cualquier esquema (incluido javascript:), así que el filtro real es este.
      if (!/^https?:\/\/\S+$/i.test(text)) {
        return { ok: false, message: "Pega un enlace completo, empezando con http:// o https://." };
      }
      return { ok: true, value: text };
    }
    case "nota": {
      if (text.length < MIN_NOTA) {
        return { ok: false, message: "Cuenta un poco más: qué pasó y con quién." };
      }
      return { ok: true, value: text };
    }
    case "numero": {
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, message: "Escribe un número." };
      }
      return { ok: true, value: String(n) };
    }
    case "archivo": {
      // Llega ya subido: lo que se guarda es la ruta dentro del bucket, nunca la URL completa
      // (mismo criterio que profile.avatar_path — ver server/storage/evidence.ts).
      return { ok: true, value: text };
    }
  }
}
