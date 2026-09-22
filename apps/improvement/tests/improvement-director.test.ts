// La lógica del Director General que se puede revisar sin base de datos ni proveedor de IA.
//
// Lo que se cuida aquí es lo que decide solo, sin que nadie lo mire: qué recorta el alcance, qué
// cuenta como riesgo, qué contrato tiene que cumplir el modelo y qué entra al prompt. Las cuatro
// son reglas puras, y una prueba pura las pilla en milisegundos en vez de a los tres meses.
//
// Lo que NO está aquí: el avance del ciclo contra la base y el reparto de tareas. Eso vive en
// tests/improvement-motor.test.ts, que sí habla con Supabase.
import { describe, expect, it } from "vitest";
import { area, membership, objective } from "@jotapuntoce/db/schema";
import { AREA_ICONS, areaIcon } from "@jotapuntoce/ui/building/areaIcons.ts";
import { FASES } from "@jotapuntoce/ui/building/ImprovementPanel.tsx";
import {
  CAUSE_CATEGORY_LABEL,
  DIRECTOR_CAUSE_CATEGORIES,
  DIRECTOR_SYSTEM_PROMPT,
  buildDirectorPrompt,
  DIRECTOR_SCHEMAS,
  directorSuggestionSchema,
  measurementSchema,
  observationSchema,
  type DirectorContext,
} from "../server/ai/prompts/director.ts";
import { motivosDeRiesgo, DIAS_SIN_CONTACTO_RIESGO } from "../server/crm/client-extensions.ts";
import { alertasDeProyecto } from "../server/erp/projects.ts";
import { PHASE_LABEL, SIGUIENTE } from "../server/improvement/phases.ts";
import { areaScopeFilter, SCOPE_LABEL } from "../server/permissions/areaScope.ts";

const HOY = new Date("2026-09-21T12:00:00.000Z");
const haceDias = (n: number) => new Date(HOY.getTime() - n * 86_400_000);

/**
 * ¿Esta condición es el literal `false` (o `true`)?
 *
 * Se mira el primer trozo del SQL y no `JSON.stringify`: una condición real trae la columna, y una
 * columna de Drizzle referencia a su tabla que referencia a sus columnas — serializarla revienta
 * con "circular structure". Los dos literales sí son un solo trozo de texto.
 */
function literal(condicion: unknown): string | null {
  const chunks = (condicion as { queryChunks?: { value?: unknown }[] }).queryChunks;
  if (!chunks || chunks.length !== 1) return null;
  const value = chunks[0]?.value;
  return Array.isArray(value) ? String(value[0]) : null;
}

describe("el recorte por alcance", () => {
  const cols = { areaId: objective.areaId, ownerId: objective.assignedEmployeeId };

  it("WHEN el alcance es `ninguno` THE SYSTEM SHALL producir una condición que no deja pasar nada", () => {
    expect(literal(areaScopeFilter("ninguno", { areaId: "a1", userId: "u1" }, cols))).toBe("false");
  });

  it(
    "WHEN alguien tiene alcance `area` pero NO tiene área asignada THE SYSTEM SHALL devolver cero " +
      "filas, nunca la empresa entera — un miembro a medio configurar ve de menos, jamás de más",
    () => {
      expect(literal(areaScopeFilter("area", { areaId: null, userId: "u1" }, cols))).toBe("false");

      // Con área sí filtra por ella: deja de ser un literal y pasa a ser una comparación real.
      expect(literal(areaScopeFilter("area", { areaId: "a1", userId: "u1" }, cols))).toBeNull();
    },
  );

  it(
    "WHEN el alcance es `propio` sobre una tabla que no sabe de quién es cada fila THE SYSTEM " +
      "SHALL devolver cero — aparentar que filtra sería la fuga",
    () => {
      const sql = areaScopeFilter("propio", { areaId: "a1", userId: "u1" }, { areaId: area.id });
      expect(literal(sql)).toBe("false");
    },
  );

  it("WHEN el alcance es `empresa` THE SYSTEM SHALL no agregar recorte", () => {
    expect(literal(areaScopeFilter("empresa", { areaId: null, userId: "u1" }, cols))).toBe("true");
  });

  it("la misma regla sirve para una tabla distinta sin reescribirla", () => {
    const sql = areaScopeFilter(
      "area",
      { areaId: "a1", userId: "u1" },
      { areaId: membership.areaId, ownerId: membership.userId },
    );
    expect(sql).toBeDefined();
  });

  it("cada alcance tiene cómo decírsele al usuario", () => {
    for (const s of ["empresa", "area", "propio", "ninguno"] as const) {
      expect(SCOPE_LABEL[s]).toBeTruthy();
    }
  });
});

describe("por qué preocupa una cuenta", () => {
  const sana = {
    healthStatus: "healthy",
    lastContactAt: haceDias(2),
    nextFollowUpAt: null,
    riskFactors: [],
  };

  it("WHEN se habló hace dos días y nada más pasa THE SYSTEM SHALL no reportar motivo", () => {
    expect(motivosDeRiesgo(sana, HOY)).toEqual([]);
  });

  it(
    "WHEN una cuenta está marcada como sana pero lleva más de " +
      `${DIAS_SIN_CONTACTO_RIESGO} días sin contacto THE SYSTEM SHALL reportarla igual — es el ` +
      "caso que el semáforo solo no detecta, porque nadie se acuerda de moverlo",
    () => {
      const motivos = motivosDeRiesgo(
        { ...sana, lastContactAt: haceDias(DIAS_SIN_CONTACTO_RIESGO + 19) },
        HOY,
      );
      expect(motivos).toContain(`${DIAS_SIN_CONTACTO_RIESGO + 19} días sin contacto`);
    },
  );

  it("WHEN nunca se registró un contacto THE SYSTEM SHALL decirlo, no calcular cero días", () => {
    expect(motivosDeRiesgo({ ...sana, lastContactAt: null }, HOY)).toContain(
      "Nunca se registró un contacto",
    );
  });

  it("WHEN el seguimiento ya venció THE SYSTEM SHALL reportarlo", () => {
    expect(motivosDeRiesgo({ ...sana, nextFollowUpAt: haceDias(3) }, HOY)).toContain(
      "El seguimiento ya se venció",
    );
  });

  it("traduce los factores del catálogo y deja pasar tal cual uno viejo que ya no exista", () => {
    const motivos = motivosDeRiesgo(
      { ...sana, riskFactors: ["pago_tardio", "un_motivo_que_ya_no_existe"] },
      HOY,
    );
    expect(motivos).toContain("Pago atrasado");
    expect(motivos).toContain("un_motivo_que_ya_no_existe");
  });

  it("aguanta un risk_factors que no sea arreglo — es jsonb, y jsonb acepta cualquier cosa", () => {
    expect(() => motivosDeRiesgo({ ...sana, riskFactors: { mal: true } }, HOY)).not.toThrow();
  });
});

describe("por qué preocupa un proyecto", () => {
  const sano = {
    status: "activo",
    progress: 50,
    risk: "bajo",
    dueAt: new Date(HOY.getTime() + 30 * 86_400_000),
    budget: "1000.00",
    spent: "400.00",
  };

  it("un proyecto al corriente no genera alertas", () => {
    expect(alertasDeProyecto(sano, [], HOY)).toEqual([]);
  });

  it("WHEN un proyecto ya no está activo THE SYSTEM SHALL no alertar, aunque venga vencido", () => {
    const entregado = { ...sano, status: "terminado", dueAt: haceDias(90), progress: 100 };
    expect(alertasDeProyecto(entregado, [], HOY)).toEqual([]);
  });

  it("WHEN pasó la fecha y no está al 100 THE SYSTEM SHALL alertar", () => {
    expect(alertasDeProyecto({ ...sano, dueAt: haceDias(1) }, [], HOY)).toContain(
      "Ya pasó su fecha de entrega",
    );
  });

  it(
    "WHEN gasta más proporción de la que avanza THE SYSTEM SHALL avisar ANTES de que se acabe el " +
      "dinero — que es cuando el aviso todavía sirve de algo",
    () => {
      const quemando = { ...sano, progress: 20, spent: "600.00" };
      expect(alertasDeProyecto(quemando, [], HOY)).toContain(
        "Va gastando más rápido de lo que avanza",
      );
      // Y si ya se pasó del presupuesto, esa es la alerta, no la anterior.
      expect(alertasDeProyecto({ ...sano, spent: "1200.00" }, [], HOY)).toContain(
        "Se pasó del presupuesto",
      );
    },
  );

  it("sin presupuesto capturado no inventa una alerta de dinero", () => {
    const sinPresupuesto = { ...sano, budget: null, spent: null, progress: 5 };
    expect(alertasDeProyecto(sinPresupuesto, [], HOY)).toEqual([]);
  });

  it("nombra a quién está esperando", () => {
    expect(alertasDeProyecto(sano, [{ name: "Migración de datos" }], HOY)).toContain(
      "Espera a Migración de datos",
    );
  });
});

describe("el contrato con el modelo", () => {
  it("cada fase del modelo tiene su esquema", () => {
    for (const fase of ["observacion", "inferencia", "analisis", "sugerencia", "medicion"] as const) {
      expect(DIRECTOR_SCHEMAS[fase]).toBeDefined();
    }
  });

  it("WHEN el modelo devuelve algo que no cumple el esquema THE SYSTEM SHALL rechazarlo", () => {
    expect(observationSchema.safeParse({ observacion: "mal nombre" }).success).toBe(false);
    expect(measurementSchema.safeParse({ result: "excelente", note: "x" }).success).toBe(false);
  });

  it("WHEN la observación viene sin tags THE SYSTEM SHALL aceptarla con la lista vacía", () => {
    const r = observationSchema.safeParse({
      observation: "Tres áreas van tarde.",
      impacto: "Tres entregas comprometidas este mes.",
      aQuienLeDuele: "Los tres clientes que esperan esas entregas.",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tags).toEqual([]);
  });

  it(
    "WHEN el modelo propone más de tres tareas THE SYSTEM SHALL rechazar la respuesta — una " +
      "vuelta propone un cambio, no una reestructura",
    () => {
      const cuatro = {
        suggestion: "Hagamos todo",
        conviccion: "media" as const,
        siMeDicesQueNo: "Esto vuelve el mes que entra.",
        comoSeSostiene: "Queda con el líder del área y se revisa en la junta del lunes.",
        tasks: Array.from({ length: 4 }, (_, i) => ({
          title: `T${i}`,
          atacaLaRaiz: "Crea el procedimiento que faltaba.",
        })),
      };
      expect(directorSuggestionSchema.safeParse(cuatro).success).toBe(false);
      expect(
        directorSuggestionSchema.safeParse({ ...cuatro, tasks: cuatro.tasks.slice(0, 3) }).success,
      ).toBe(true);
    },
  );

  it("una tarea sin área resuelve a null en vez de fallar", () => {
    const r = directorSuggestionSchema.safeParse({
      suggestion: "x",
      conviccion: "baja",
      siMeDicesQueNo: "La cuenta se enfría otro mes.",
      comoSeSostiene: "Queda un recordatorio mensual a nombre de quien lleva la cuenta.",
      tasks: [{ title: "Llamar a la cuenta", atacaLaRaiz: "Reabre el canal que se cerró." }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tasks[0]?.areaName).toBeNull();
  });
});

describe("el prompt del Director General", () => {
  const base: DirectorContext = {
    phase: "observacion",
    orgName: "Empresa de prueba",
    industry: "servicios",
    ownerBrief: "Decido rápido y delego poco.",
    relacion: "",
    areas: [
      {
        name: "Ventas",
        description: "Trae clientes nuevos",
        members: 3,
        objectivesOpen: 4,
        projects: 1,
        clients: 9,
      },
    ],
    objetivos: { abiertos: 12, completados30d: 5, retrasados: 3 },
    clientesEnRiesgo: [{ name: "Cuenta uno", motivos: ["40 días sin contacto"] }],
    proyectosEnRiesgo: [{ name: "Proyecto A", areaName: "Ventas", alertas: ["Ya pasó su fecha"] }],
    conversacion: [{ role: "dueno", content: "Este mes hay que apretar." }],
    aprendizajes: [
      {
        title: "Repartir la carga",
        result: "fallido",
        decision: "rechazo",
        ownerFeedback: "No quiero mover a nadie de área.",
        tags: ["equipo"],
        rootCause: "No hay criterio escrito de reparto de cuentas",
        causeCategory: "metodos",
      },
    ],
    cycle: {
      title: "Las entregas van tarde",
      description: null,
      areaName: "Ventas",
      observation: null,
      inference: null,
      analysis: null,
      suggestion: null,
      rootCause: null,
      causeCategory: null,
      whys: [],
      contributingFactors: [],
      verification: null,
      controlPlan: null,
      ownerDecision: null,
      ownerFeedback: null,
      metrics: {},
    },
    tareas: [],
  };

  it("lleva el contexto acumulado: cómo piensa el dueño y qué pasó las veces anteriores", () => {
    const p = buildDirectorPrompt(base);
    expect(p).toContain("Decido rápido y delego poco.");
    expect(p).toContain("No quiero mover a nadie de área.");
    expect(p).toContain("Este mes hay que apretar.");
    expect(p).toContain("Ventas — Trae clientes nuevos");
    expect(p).toContain("Cuenta uno");
  });

  it("la causa raíz de las vueltas cerradas viaja al prompt de la siguiente", () => {
    // Es lo que hace que diez vueltas sean un diagnóstico y no diez incidentes.
    const p = buildDirectorPrompt(base);
    expect(p).toContain("No hay criterio escrito de reparto de cuentas");
    expect(p).toContain("metodos");
  });

  it("cada fase pide una cosa distinta", () => {
    const observar = buildDirectorPrompt(base);
    const proponer = buildDirectorPrompt({ ...base, phase: "sugerencia" });
    expect(observar).not.toBe(proponer);
    expect(observar).toContain("OBSERVAR");
    expect(proponer).toContain("PROPONER");
  });

  it(
    "WHEN una sección del contexto está vacía THE SYSTEM SHALL omitirla en vez de mandar un " +
      "encabezado con 'ninguno' — un prompt lleno de encabezados vacíos enseña a ignorarlos",
    () => {
      const vacio = buildDirectorPrompt({
        ...base,
        clientesEnRiesgo: [],
        proyectosEnRiesgo: [],
        aprendizajes: [],
        conversacion: [],
      });
      expect(vacio).not.toContain("CUENTAS QUE PREOCUPAN");
      expect(vacio).not.toContain("VUELTAS ANTERIORES");
      // Lo que sí queda: las áreas y los objetivos, que siempre hay.
      expect(vacio).toContain("ÁREAS:");
    },
  );
});

describe("la máquina de estados", () => {
  it("las siete fases están encadenadas y terminan en cerrado", () => {
    let fase: keyof typeof SIGUIENTE = "observacion";
    const recorrido: string[] = [fase];
    for (let i = 0; i < 10 && SIGUIENTE[fase]; i++) {
      fase = SIGUIENTE[fase]!;
      recorrido.push(fase);
    }
    expect(recorrido).toEqual([
      "observacion",
      "inferencia",
      "analisis",
      "sugerencia",
      "decision",
      "experimentacion",
      "medicion",
      "cerrado",
    ]);
    expect(SIGUIENTE.cerrado).toBeNull();
  });

  it("cada fase tiene cómo llamarse en la pantalla del dueño", () => {
    for (const fase of Object.keys(SIGUIENTE) as (keyof typeof SIGUIENTE)[]) {
      expect(PHASE_LABEL[fase], `la fase ${fase} no tiene nombre`).toBeTruthy();
    }
  });

  it(
    "la barra de la pantalla enseña las siete fases del motor en el mismo orden — si alguien " +
      "agrega una fase al servidor sin agregarla a la barra, esto lo pilla",
    () => {
      const delMotor = (Object.keys(SIGUIENTE) as (keyof typeof SIGUIENTE)[]).filter(
        (f) => f !== "cerrado",
      );
      expect(FASES.map((f) => f.id)).toEqual(delMotor);
    },
  );
});

describe("los glifos de área", () => {
  it("cada id del catálogo tiene su trazo", () => {
    for (const id of AREA_ICONS) {
      expect(areaIcon(id).path, `el icono ${id} no tiene trazo`).toBeTruthy();
    }
  });

  it(
    "WHEN una fila trae un icon que este build ya no conoce, o ninguno, THE SYSTEM SHALL dibujar " +
      "el neutro y nunca lanzar",
    () => {
      expect(areaIcon(null).id).toBe("otro");
      expect(areaIcon("un_icono_de_otra_version").id).toBe("otro");
    },
  );

// ─── El Análisis de Causa Raíz ───────────────────────────────────────────────────────────────
//
// El método es la habilidad central del Director General, y lo que lo separa de un generador de
// tips: un tip trata el síntoma, un ACR baja hasta la condición que lo permitió. Estas pruebas no
// comprueban que el modelo razone bien —eso no se puede probar sin llamarlo— sino que el CONTRATO
// no le deje entregar un diagnóstico a medias: sin cadena, sin categoría o sin evidencia.
describe("el método de causa raíz", () => {
  it("las 6M del catálogo y las del check de la base son la misma lista", () => {
    // El check `improvement_cycle_cause_category_check` es la última palabra; si alguien agrega
    // una categoría aquí sin migrar, la fase de inferencia falla al escribir y el ciclo se atora.
    expect([...DIRECTOR_CAUSE_CATEGORIES].sort()).toEqual(
      ["maquinas", "materiales", "medicion", "medio_ambiente", "metodos", "personas"],
    );
    for (const c of DIRECTOR_CAUSE_CATEGORIES) {
      expect(CAUSE_CATEGORY_LABEL[c]).toBeTruthy();
    }
  });

  it(
    "WHEN la inferencia trae menos de tres porqués THE SYSTEM SHALL rechazarla — con dos " +
      "todavía se está en la causa inmediata, que es justo lo que el método evita",
    () => {
      const corta = {
        inference: "Se entrega tarde.",
        porques: [
          { pregunta: "¿Por qué llegó tarde?", respuesta: "Salió tarde del almacén." },
          { pregunta: "¿Por qué salió tarde?", respuesta: "No estaba surtido." },
        ],
        causaRaiz: "No hay procedimiento de reposición",
        categoria: "metodos",
        factoresContribuyentes: [],
        evidencia: "3 proyectos con fecha vencida",
      };
      expect(DIRECTOR_SCHEMAS.inferencia.safeParse(corta).success).toBe(false);

      const completa = {
        ...corta,
        porques: [
          ...corta.porques,
          { pregunta: "¿Por qué no estaba surtido?", respuesta: "Nadie repone al cerrar turno." },
          { pregunta: "¿Por qué nadie repone?", respuesta: "No existe el procedimiento." },
        ],
      };
      expect(DIRECTOR_SCHEMAS.inferencia.safeParse(completa).success).toBe(true);
    },
  );

  it("WHEN la causa no cae en una de las 6M THE SYSTEM SHALL rechazar la inferencia", () => {
    const base = {
      inference: "x",
      porques: [
        { pregunta: "a", respuesta: "b" },
        { pregunta: "c", respuesta: "d" },
        { pregunta: "e", respuesta: "f" },
      ],
      causaRaiz: "y",
      factoresContribuyentes: [],
      evidencia: "z",
    };
    expect(DIRECTOR_SCHEMAS.inferencia.safeParse({ ...base, categoria: "suerte" }).success).toBe(false);
    expect(DIRECTOR_SCHEMAS.inferencia.safeParse({ ...base, categoria: "metodos" }).success).toBe(true);
  });

  it(
    "WHEN una tarea no justifica cómo ataca la raíz THE SYSTEM SHALL rechazar la propuesta — " +
      "una tarea que no puede escribir esa frase es un parche",
    () => {
      const tarea = {
        title: "Escribir el procedimiento de reposición",
        description: "",
        expectedOutcome: "",
        areaName: "Operaciones",
      };
      expect(
        DIRECTOR_SCHEMAS.sugerencia.safeParse({
          suggestion: "s",
          conviccion: "alta",
          siMeDicesQueNo: "Se repite en dos semanas.",
          comoSeSostiene: "El procedimiento queda escrito y lo revisa Operaciones cada mes.",
          tasks: [tarea],
        }).success,
      ).toBe(false);
      expect(
        DIRECTOR_SCHEMAS.sugerencia.safeParse({
          suggestion: "s",
          conviccion: "alta",
          siMeDicesQueNo: "Se repite en dos semanas.",
          comoSeSostiene: "El procedimiento queda escrito y lo revisa Operaciones cada mes.",
          tasks: [{ ...tarea, atacaLaRaiz: "Crea el procedimiento que no existía." }],
        }).success,
      ).toBe(true);
    },
  );

  it(
    "WHEN se mide THE SYSTEM SHALL exigir decir si la raíz sigue viva, aparte del resultado — " +
      "las tareas pueden completarse con la condición intacta",
    () => {
      const base = {
        result: "exitoso",
        note: "Se hizo todo.",
        learning: "",
        controlInstalado: true,
      };
      expect(DIRECTOR_SCHEMAS.medicion.safeParse(base).success).toBe(false);
      expect(
        DIRECTOR_SCHEMAS.medicion.safeParse({ ...base, laRaizSigueViva: true }).success,
      ).toBe(true);
    },
  );

  it(
    "WHEN se mide THE SYSTEM SHALL exigir también si quedó instalado el control — una vuelta " +
      "puede salir exitosa, matar la raíz y no dejar a nadie a cargo, y eso rebota en dos meses",
    () => {
      const base = {
        result: "exitoso",
        note: "Se hizo todo.",
        learning: "",
        laRaizSigueViva: false,
      };
      expect(DIRECTOR_SCHEMAS.medicion.safeParse(base).success).toBe(false);
      expect(
        DIRECTOR_SCHEMAS.medicion.safeParse({ ...base, controlInstalado: false }).success,
      ).toBe(true);
    },
  );

  it("WHEN se observa THE SYSTEM SHALL exigir el impacto, aunque sea para decir que no se puede medir", () => {
    expect(DIRECTOR_SCHEMAS.observacion.safeParse({ observation: "Algo pasa" }).success).toBe(false);
    expect(
      DIRECTOR_SCHEMAS.observacion.safeParse({
        observation: "Algo pasa",
        impacto: "No se puede medir con estos datos.",
        aQuienLeDuele: "Es interno, el cliente todavía no lo nota.",
      }).success,
    ).toBe(true);
  });

  it(
    "WHEN se observa THE SYSTEM SHALL exigir a quién le duele — un problema que el cliente no " +
      "siente produce mejoras que nadie afuera nota, y esas son las que el dueño deja de pagar",
    () => {
      const sinCliente = { observation: "Algo pasa", impacto: "Cuatro horas al mes." };
      expect(DIRECTOR_SCHEMAS.observacion.safeParse(sinCliente).success).toBe(false);
      expect(
        DIRECTOR_SCHEMAS.observacion.safeParse({
          ...sinCliente,
          // "Es interno" también es una respuesta válida: lo que no se acepta es no contestarla.
          aQuienLeDuele: "Al cliente que tiene que repetir su pedido.",
        }).success,
      ).toBe(true);
    },
  );

  it(
    "WHEN se analiza THE SYSTEM SHALL exigir la línea base — sin un número contra el que " +
      "comparar, cualquier resultado se puede contar como éxito",
    () => {
      const sinBase = {
        analysis: "Mejoraría el tiempo de entrega.",
        siNoSeCorrige: "Se repite el mes que entra.",
        comoSeVerifica: "Entregas a tiempo en 30 días.",
      };
      expect(DIRECTOR_SCHEMAS.analisis.safeParse(sinBase).success).toBe(false);
      expect(
        DIRECTOR_SCHEMAS.analisis.safeParse({
          ...sinBase,
          lineaBase: "Hoy 8 de cada 100 pedidos se reprocesan; el dato sale del log de entregas.",
        }).success,
      ).toBe(true);
    },
  );

  it(
    "WHEN se propone THE SYSTEM SHALL exigir cómo se sostiene — la fase de control es la que " +
      "todo el mundo se salta, y por eso las mejoras duran seis semanas",
    () => {
      const sinControl = {
        suggestion: "Estandaricemos el paso de revisión.",
        conviccion: "alta",
        siMeDicesQueNo: "Vuelve en un mes.",
        tasks: [],
      };
      expect(DIRECTOR_SCHEMAS.sugerencia.safeParse(sinControl).success).toBe(false);
      expect(
        DIRECTOR_SCHEMAS.sugerencia.safeParse({
          ...sinControl,
          comoSeSostiene: "Queda con el líder de Operaciones y se mira en la junta del lunes.",
        }).success,
      ).toBe(true);
    },
  );

  it("el prompt le prohíbe terminar la cadena en una persona", () => {
    // La regla de oro del método y el no negociable #4 del producto son la misma frase aquí: si
    // el porqué termina en alguien, el análisis se volvió un señalamiento.
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("JAMÁS es una persona");
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("nunca juicios sobre");
  });
});
});

// Pruebas de texto, que normalmente no valen la pena — aquí sí. La personalidad y el método son
// prosa dentro de una constante: nada falla si un refactor se lleva media sección por delante, y
// el síntoma aparece meses después como "ya no piensa igual", que es imposible de rastrear. Estas
// no cuidan la redacción, cuidan que las decisiones que se tomaron sigan estando.
describe("el método de Six Sigma", () => {
  it("las cinco fases de DMAIC están en el prompt, mapeadas a las fases de la vuelta", () => {
    for (const paso of ["DEFINIR", "MEDIR", "ANALIZAR", "MEJORAR", "CONTROLAR"]) {
      expect(DIRECTOR_SYSTEM_PROMPT).toContain(paso);
    }
  });

  it("persigue la variación, no el promedio", () => {
    // Es la diferencia entre Six Sigma y "mejorar un poco": el cliente no vive el promedio.
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("VARIACIÓN");
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("no vive el promedio");
  });

  it("exige línea base antes de proponer", () => {
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("SIN LÍNEA BASE NO HAY MEJORA");
  });

  it("carga la fase que todo el mundo se salta", () => {
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("CASI NADIE HACE");
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("sobrevive a que se vaya la persona");
  });

  it("pilotea antes de escalar", () => {
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("EN CHICO ANTES QUE EN GRANDE");
  });

  it("el ACR sigue dentro del método, no aparte", () => {
    // Si alguien vuelve a escribir el ACR como bloque suelto, el prompt diría dos cosas del mismo
    // paso. La prueba amarra que viva bajo ANALIZAR.
    const analizar = DIRECTOR_SYSTEM_PROMPT.indexOf("ANALIZAR: LOS POCOS VITALES");
    const raiz = DIRECTOR_SYSTEM_PROMPT.indexOf("JAMÁS es una persona");
    expect(analizar).toBeGreaterThan(-1);
    expect(raiz).toBeGreaterThan(analizar);
  });

  it("no le enseña a decir el vocabulario en voz alta", () => {
    // El método se nota en las preguntas. Un Director que anuncia DMAIC es un consultor.
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("NUNCA anuncias");
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("para tu cabeza");
  });
});
