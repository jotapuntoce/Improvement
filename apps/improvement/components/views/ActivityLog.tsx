// La bitácora de la ficha (el "chatter" de Odoo): notas y cambios, el más reciente arriba.
const WHEN = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

export function ActivityLog({
  items,
  action,
}: {
  items: { kind: "nota" | "cambio"; body: string; actorName: string | null; createdAt: Date }[];
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="config-card" aria-labelledby="bitacora">
      <h2 id="bitacora" className="config-card-title">Bitácora</h2>
      <form action={action} className="config-form config-form-stack" aria-label="Nueva nota">
        <label className="permiso-field">
          <span>Nota</span>
          <textarea name="body" required maxLength={2000} className="config-input" />
        </label>
        <button type="submit" className="panel-btn-ghost">Agregar nota</button>
      </form>
      <ul className="equipo-list">
        {items.map((a, i) => (
          <li key={i}>
            <strong>{a.actorName ?? "Alguien"}</strong> · {WHEN.format(a.createdAt)}
            <p className={a.kind === "cambio" ? "config-hint" : undefined}>{a.body}</p>
          </li>
        ))}
        {items.length === 0 && <li className="config-hint">Sin movimientos todavía.</li>}
      </ul>
    </section>
  );
}
