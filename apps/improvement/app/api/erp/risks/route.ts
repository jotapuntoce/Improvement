// GET /api/erp/risks?orgId=… — los proyectos que preocupan y qué los tiene atorados.
//
// Es la vista de coordinación entre áreas: además de la lista, devuelve los cruces —qué proyecto
// de un área está esperando a otro de otra área—, que es lo único que un dueño no puede ver
// mirando una sola área a la vez.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import { listProjectsAtRisk } from "@/server/erp/projects";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Inicia sesión." } },
      { status: 401 },
    );
  }

  const orgId = z.uuid().safeParse(new URL(request.url).searchParams.get("orgId"));
  if (!orgId.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Falta orgId." } },
      { status: 400 },
    );
  }

  const projects = await listProjectsAtRisk(userId, orgId.data);

  // Un cruce es un bloqueo donde el que espera y el que bloquea son de áreas distintas. Esos son
  // los que nadie resuelve solo: dentro de un área, el responsable lo ve y lo destraba; entre dos
  // áreas hace falta que alguien de arriba lo note, y ese alguien es el Director General.
  const cruces = projects.flatMap((p) =>
    p.bloqueadoPor
      .filter((b) => b.areaName !== p.areaName)
      .map((b) => ({
        espera: { id: p.id, name: p.name, areaName: p.areaName },
        bloquea: b,
      })),
  );

  return NextResponse.json({ ok: true, data: { projects, cruces } });
}
