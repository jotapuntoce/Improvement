// Entrega de recordatorios vencidos — in-app y email. Único llamador productivo:
// app/api/cron/reminders/route.ts, pero exportado para poder probarlo sin pasar por el endpoint.
import { and, eq, isNull, lte } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@jotapuntoce/db";
import { reminder, objective, profile } from "@jotapuntoce/db/schema";
import { env } from "../../lib/env.ts";

/**
 * WHEN deliverDueReminders() corre sobre un recordatorio vencido THE SYSTEM SHALL marcar
 * delivered_at una vez (criterio #2). WHEN corre una segunda vez inmediatamente después THE SYSTEM
 * SHALL no reenviar el email de ese recordatorio (criterio #3) — el UPDATE ... WHERE delivered_at
 * IS NULL es la guarda: dos invocaciones casi simultáneas compiten por la misma fila y solo una
 * gana, nunca duplican el envío (Pitfalls §02-producto-core: marcar delivered_at es parte de la
 * misma operación que decide enviar, no un paso aparte después).
 */
export async function deliverDueReminders(): Promise<{ delivered: number }> {
  const due = await db
    .select()
    .from(reminder)
    .where(and(lte(reminder.scheduledAt, new Date()), isNull(reminder.deliveredAt)));

  let delivered = 0;

  for (const row of due) {
    const [claimed] = await db
      .update(reminder)
      .set({ deliveredAt: new Date() })
      .where(and(eq(reminder.id, row.id), isNull(reminder.deliveredAt)))
      .returning();
    if (!claimed) continue; // otra invocación ya se ganó esta fila

    if (claimed.channel === "email") {
      await sendReminderEmail(claimed);
    }
    // channel === "in_app": nada que enviar — marcar delivered_at ya lo hace visible en el UI.

    delivered++;
  }

  return { delivered };
}

async function sendReminderEmail(row: typeof reminder.$inferSelect): Promise<void> {
  if (!row.objectiveId) return; // sin objetivo asociado no hay a quién avisar

  const [obj] = await db.select().from(objective).where(eq(objective.id, row.objectiveId)).limit(1);
  if (!obj?.assignedEmployeeId) return;

  const [recipient] = await db
    .select()
    .from(profile)
    .where(eq(profile.id, obj.assignedEmployeeId))
    .limit(1);
  if (!recipient) return;

  // Sin RESEND_API_KEY configurada (paso 9, "declarada pero no activa" — §10 del blueprint) no hay
  // proveedor al que llamar. delivered_at ya quedó marcado arriba: el recordatorio no se reintenta.
  if (!env.RESEND_API_KEY) return;

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: "Improvement <recordatorios@jotapuntoce.com>",
    to: recipient.email,
    subject: row.title,
    text: `Recordatorio: ${row.title}`,
  });
}
