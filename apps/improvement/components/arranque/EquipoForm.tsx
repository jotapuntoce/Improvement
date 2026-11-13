"use client";
// Arranque: quién se encarga de qué. Una tarjeta por persona que Improvement propone con lo que el
// dueño delegó en su plan; él pone nombre y correo y marca qué le toca. Al mandar, la Server Action
// (prop) crea cada invitación y su agente y devuelve los enlaces: el token solo se ve esta vez.
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Pregunta } from "./Pregunta.tsx";

export interface EquipoFila { puesto: string; sucursal: string | null; encargos: string[] }
export interface EquipoEstado { error?: string; invitados?: { nombre: string; email: string; link: string; enviado: boolean }[] }

function Mandar() {
  const { pending } = useFormStatus();
  return <button type="submit" className="arr-primary" disabled={pending} aria-disabled={pending}>{pending ? "Armando sus agentes…" : "Invitar y armar sus agentes"}</button>;
}

export function EquipoForm({ action, sugeridas, apps, next }: {
  action: (prev: EquipoEstado, formData: FormData) => Promise<EquipoEstado>;
  sugeridas: EquipoFila[];
  apps: { key: string; name: string }[];
  next: string;
}) {
  const [state, run] = useActionState(action, {});
  const [filas, setFilas] = useState<EquipoFila[]>(sugeridas.length ? sugeridas : [{ puesto: "", sucursal: null, encargos: [] }]);

  if (state.invitados) {
    return (
      <div className="arr-ask">
        <Pregunta why="Cada quien entra con su enlace, me cuenta su trabajo y su agente queda listo. Las tareas de lo suyo ya les llegan a ellos.">
          Listo, tu equipo ya tiene sus agentes.
        </Pregunta>
        <ul className="arr-equipo-links">
          {state.invitados.map((i) => (
            <li key={i.email}>
              <strong>{i.nombre}</strong>
              <span>{i.enviado ? `Le mandé la invitación a ${i.email}.` : "Mándale este enlace (vale 7 días):"}</span>
              {!i.enviado && (
                <span className="arr-row">
                  <button type="button" className="arr-ghost" onClick={() => navigator.clipboard.writeText(i.link)}>Copiar enlace</button>
                  <a className="arr-ghost" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Hola ${i.nombre.split(" ")[0]}, te invito a Improvement: ${i.link}`)}`}>Mandar por WhatsApp</a>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="arr-row"><Link href={next} className="arr-primary">Seguir</Link></div>
      </div>
    );
  }

  return (
    <form action={run} className="arr-ask" aria-label="Quién se encarga de qué">
      <Pregunta why="Lo armé con lo que delegas en tu plan. Pon el nombre y el correo de cada quien y marca lo que le toca; lo que no asignes se queda contigo.">
        ¿Quién de tu equipo se encarga de qué?
      </Pregunta>
      {state.error && <p className="arr-error" role="alert">{state.error}</p>}
      <input type="hidden" name="filas" value={filas.length} />
      {filas.map((f, i) => (
        <fieldset key={i} className="arr-app arr-equipo">
          <legend className="sr-only">Persona {i + 1}</legend>
          <div className="arr-app-body">
            <input name={`p-${i}`} defaultValue={f.puesto} maxLength={80} className="arr-app-name" aria-label={`Puesto de la persona ${i + 1}`} placeholder="Puesto" />
            <input type="hidden" name={`s-${i}`} value={f.sucursal ?? ""} />
            <div className="arr-equipo-datos">
              <input name={`n-${i}`} className="arr-big" aria-label={`Nombre de la persona ${i + 1}`} placeholder="Nombre" />
              <input name={`e-${i}`} type="email" className="arr-big" aria-label={`Correo de la persona ${i + 1}`} placeholder="correo@…" />
            </div>
            <div className="arr-checks" role="group" aria-label={`Lo que le toca a la persona ${i + 1}`}>
              {apps.map((a) => (
                <label key={a.key} className="arr-check">
                  <input type="checkbox" name={`a-${i}`} value={a.key} defaultChecked={f.encargos.includes(a.key)} />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
        </fieldset>
      ))}
      <div className="arr-row">
        <button type="button" className="arr-ghost" onClick={() => setFilas([...filas, { puesto: "", sucursal: null, encargos: [] }])}>+ Alguien más</button>
      </div>
      <div className="arr-row">
        <Link href={next} className="arr-ghost">Lo hago después</Link>
        <Mandar />
      </div>
    </form>
  );
}
