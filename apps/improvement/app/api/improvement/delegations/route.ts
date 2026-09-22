// GET /api/improvement/delegations?orgId=… — todo lo que Improvement ha delegado, con su tasa de
// acierto. Solo el dueño (listDelegations devuelve vacío a quien no lo es).
//
// La tasa se calcula aquí y no en delegation.ts porque es una lectura de reporte, no una regla de
// negocio: quién puede ver qué ya lo decidió el loader, y sumar tres contadores no amerita una
// función en el módulo de dominio.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import { listDelegations } from "@/server/improvement/delegation";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Inicia sesión." } },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const orgId = z.uuid().safeParse(url.searchParams.get("orgId"));
  if (!orgId.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Falta orgId." } },
      { status: 400 },
    );
  }

  const cycleId = url.searchParams.get("cycleId") ?? undefined;
  const tasks = await listDelegations(userId, orgId.data, cycleId);

  const completadas = tasks.filter((t) => t.status === "completada");
  const rechazadas = tasks.filter((t) => t.status === "rechazada").length;
  // De las que ya se cerraron de un modo u otro, cuántas acabaron hechas. Las que siguen abiertas
  // no entran al denominador: todavía no dicen nada.
  const resueltas = completadas.length + rechazadas;

  const tiempos = completadas
    .filter((t) => t.completedAt !== null)
    .map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 86_400_000);

  return NextResponse.json({
    ok: true,
    data: {
      tasks,
      total: tasks.length,
      completed: completadas.length,
      rejected: rechazadas,
      successRate: resueltas === 0 ? null : Math.round((completadas.length / resueltas) * 100),
      avgDaysToComplete:
        tiempos.length === 0
          ? null
          : Math.round((tiempos.reduce((a, b) => a + b, 0) / tiempos.length) * 10) / 10,
    },
  });
}
