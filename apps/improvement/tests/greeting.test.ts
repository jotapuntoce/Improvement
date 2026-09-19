// El parte del día que da quien atiende en la recepción. Función pura, sin base de datos.
import { describe, expect, it } from "vitest";
import { saludo } from "@jotapuntoce/ui/building/greeting.ts";

const a = (h: number) => new Date(2026, 0, 15, h, 30);

describe("saludo", () => {
  it("cambia con la franja del día", () => {
    expect(saludo({ hora: a(8) })).toMatch(/^Buenos días/);
    expect(saludo({ hora: a(15) })).toMatch(/^Buenas tardes/);
    expect(saludo({ hora: a(22) })).toMatch(/^Buenas noches/);
  });

  it("saluda por el nombre de pila, no por el completo", () => {
    expect(saludo({ hora: a(9), nombre: "Jaime Salinas Cota" })).toContain("Buenos días, Jaime.");
  });

  it("sin nombre no deja la coma colgando", () => {
    expect(saludo({ hora: a(9) })).toContain("Buenos días.");
  });

  it("primero lo que está detenido esperando al dueño", () => {
    const todo = saludo({
      hora: a(10),
      entregasPorRevisar: 2,
      objetivosAbiertos: 9,
      proyectosActivos: 3,
      powerupsPorCanjear: 5,
    });
    expect(todo).toContain("2 entregas esperando tu visto bueno");
    expect(todo).not.toContain("objetivos");
  });

  it("baja al siguiente pendiente cuando el de arriba está en cero", () => {
    const sinEntregas = { hora: a(10), entregasPorRevisar: 0, objetivosAbiertos: 9 };
    expect(saludo(sinEntregas)).toContain("Quedan 9 objetivos abiertos");

    const soloProyectos = { hora: a(10), proyectosActivos: 3, powerupsPorCanjear: 5 };
    expect(saludo(soloProyectos)).toContain("3 proyectos siguen en curso");

    expect(saludo({ hora: a(10), powerupsPorCanjear: 5 })).toContain("5 PowerUps sin canjear");
  });

  it("concuerda el singular", () => {
    expect(saludo({ hora: a(10), entregasPorRevisar: 1 })).toContain("una entrega");
    expect(saludo({ hora: a(10), objetivosAbiertos: 1 })).toContain("un objetivo abierto");
    expect(saludo({ hora: a(10), proyectosActivos: 1 })).toContain("Un proyecto sigue");
    expect(saludo({ hora: a(10), powerupsPorCanjear: 1 })).toContain("un PowerUp");
  });

  it("cuando no hay nada, lo dice — no se inventa un pendiente", () => {
    expect(saludo({ hora: a(10), nombre: "Jaime" })).toBe("Buenos días, Jaime. Hoy no traes pendientes.");
  });

  it("cabe en el globo: nunca pasa de 90 caracteres", () => {
    const largo = saludo({
      hora: a(15),
      nombre: "Jaime Salinas",
      entregasPorRevisar: 12,
    });
    expect(largo.length).toBeLessThanOrEqual(90);
  });
});
