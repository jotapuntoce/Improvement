// GET /api/crm/at-risk?orgId=… — las cuentas que necesitan que alguien haga algo hoy, con el
// motivo de cada una y lo que Improvement propone al respecto.
//
// La sugerencia que acompaña a cada cuenta NO es una llamada al modelo: es la propuesta que salió
// del ciclo vivo, si alguna de sus tareas habla de esa cuenta. Generar una sugerencia por cuenta
// al abrir la pantalla sería una llamada al proveedor por cada cliente en riesgo, pagada cada vez
// que alguien recarga — y el motor ya piensa en esto una vez cada seis horas, gratis.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import { listClientsAtRisk } from "@/server/crm/client-extensions";
import { listDelegations } from "@/server/improvement/delegation";

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

  const [clients, delegadas] = await Promise.all([
    listClientsAtRisk(userId, orgId.data),
    // Vacío para quien no es dueño: las tareas delegadas de toda la empresa son suyas de ver. El
    // equipo igual recibe la lista de cuentas, sin el acompañamiento.
    listDelegations(userId, orgId.data),
  ]);

  const abiertas = delegadas.filter((t) => t.status !== "rechazada" && t.status !== "completada");

  return NextResponse.json({
    ok: true,
    data: {
      clients: clients.map((c) => ({
        ...c,
        // Coincidencia por nombre y no por FK: una tarea delegada no apunta a un cliente (el
        // esquema no lo pide y agregarlo obligaría al modelo a acertarle a un uuid). Es una ayuda
        // de pantalla, no un dato: si no coincide, la cuenta se ve igual, sin acompañamiento.
        sugerencias: abiertas
          .filter((t) => t.title.toLowerCase().includes(c.name.toLowerCase()))
          .map((t) => ({ id: t.id, title: t.title, status: t.status })),
      })),
    },
  });
}
