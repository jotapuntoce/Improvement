// Los campos extra de la ficha, generados de app_field.
export interface FormField { key: string; label: string; type: string; options: string[]; required: boolean }

const INPUT_TYPE: Record<string, string> = { texto: "text", numero: "number", dinero: "number", fecha: "date" };

export function RecordForm({ fields, values, action }: { fields: FormField[]; values: Record<string, unknown>; action: (formData: FormData) => Promise<void> }) {
  if (fields.length === 0) return <p className="config-hint">Esta app todavía no tiene campos extra.</p>;
  return (
    <form action={action} className="config-form config-form-stack" aria-label="Campos">
      {fields.map((f) => {
        const raw = values[f.key];
        const value = f.type === "dinero" && typeof raw === "number" ? String(raw / 100) : raw == null ? "" : String(raw);
        return (
          <label key={f.key} className="permiso-field">
            <span>{f.label}{f.required ? " *" : ""}</span>
            {f.type === "opcion" ? (
              <select name={f.key} defaultValue={value} required={f.required} className="config-input">
                <option value="">—</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "si_no" ? (
              <input type="checkbox" name={f.key} defaultChecked={raw === true} />
            ) : (
              <input
                name={f.key}
                type={INPUT_TYPE[f.type] ?? "text"}
                step={f.type === "dinero" ? "0.01" : undefined}
                defaultValue={value}
                required={f.required}
                className="config-input"
              />
            )}
          </label>
        );
      })}
      <button type="submit" className="panel-cta">Guardar</button>
    </form>
  );
}
