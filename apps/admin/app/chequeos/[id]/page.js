// Un chequeo: lo que dejó el prospecto (tal como lo escribió), su tiempo, el PDF para leerlo aquí mismo, las acciones
// del embudo y la bitácora completa.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth.js";
import { getChequeo, pesos, urlPdf } from "@/lib/chequeos.js";
import {
  CANAL_LABEL,
  ENLACES,
  ETAPAS,
  ETAPA_LABEL,
  ETAPA_PROSPECTO_LABEL,
  MOTOR_ACCION_LABEL,
  MOTOR_ESTADO_LABEL,
  PRODUCTOS,
  PRODUCTO_LABEL,
  RESULTADOS,
  RESULTADO_LABEL,
  etapaDe,
  nombreDe,
} from "@/lib/chequeoDatos.js";
import { ARMANDO_ATORADO_MS } from "@/lib/motor/armar.js";
import Formulario from "@/components/chequeos/Formulario.js";
import {
  anotarContactoAction,
  aprobarAction,
  armarAction,
  cambiarEtapaAction,
  compraAction,
  datosPropioAction,
  pdfAction,
  proximaAccionAction,
  rehacerAction,
} from "../actions.js";

const dia = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" });
const momento = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const TIPO_EVENTO = {
  registro: "Registro",
  entrevista: "Entrevista",
  etapa: "Etapa",
  correo: "Correo",
  mensaje: "Mensaje",
  llamada: "Llamada",
  nota: "Nota",
  compra: "Compra",
  motor: "Motor",
};
const AUTOR = { prospecto: "el prospecto", jose_carlos: "Jose Carlos", improvement: "Improvement" };

function detalleDe(e) {
  const d = e.detalle ?? {};
  if (e.tipo === "etapa") return `de ${ETAPA_LABEL[d.de]} a ${ETAPA_LABEL[d.a]}`;
  if (e.tipo === "compra") return `${PRODUCTO_LABEL[d.producto]} · ${pesos(d.monto)}`;
  if (e.tipo === "entrevista") return d.segundos ? `en ${Math.max(1, Math.round(d.segundos / 60))} min` : "";
  if (e.tipo === "motor") {
    const costo = d.costoUsd ? ` · US$${Number(d.costoUsd).toFixed(2)}` : "";
    return [MOTOR_ACCION_LABEL[d.accion], d.nota && `"${d.nota}"`, d.mensaje].filter(Boolean).join(" · ") + costo;
  }
  return [d.resultado && RESULTADO_LABEL[d.resultado], d.nota].filter(Boolean).join(" · ");
}

function suTiempo(c) {
  const registro = `Se registró el ${dia.format(c.createdAt)}`;
  if (!c.entrevistaAt) return c.origen === "propio" ? `Chequeo propio, creado el ${dia.format(c.createdAt)}` : `${registro}; todavía no contesta la entrevista.`;
  const dias = Math.floor((c.entrevistaAt - c.createdAt) / 86_400_000);
  const cuando = dias === 0 ? "el mismo día" : `${dias} día(s) después`;
  const min = c.entrevistaSegundos ? `, en ${Math.max(1, Math.round(c.entrevistaSegundos / 60))} min` : "";
  return `${registro}; contestó la entrevista ${cuando}${min}.`;
}

const armandoAtorado = (c) => c.motorEstado === "armando" && Date.now() - new Date(c.updatedAt) > ARMANDO_ATORADO_MS;

export default async function ChequeoPage({ params }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const c = await getChequeo(id);
  if (!c) notFound();
  const pdf = await urlPdf(c.pdfPath);
  const atorado = armandoAtorado(c);
  const enlaces = Object.entries(c.enlaces ?? {});

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          <Link href="/chequeos" className="page-back-link">
            ← Chequeos
          </Link>
          <h2>{nombreDe(c)}</h2>
          <p className="topbar-subtitle">
            {c.giro} · {c.ciudad} · {c.origen === "landing" ? "llegó por la landing" : "chequeo propio"} ·{" "}
            <strong>{etapaDe(c)}</strong>
            {c.prospectClientId && (
              <>
                {" "}
                · <Link href="/clientes">Ver en Clientes</Link>
              </>
            )}
          </p>
        </div>
      </section>

      <section className="chq-section">
        <h3>Datos</h3>
        <p className="chq-muted">{suTiempo(c)}</p>
        <p style={{ margin: 0 }}>
          {[c.nombre, c.correo, c.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto todavía"}
        </p>
        <p className="chq-muted">
          Canal: {CANAL_LABEL[c.canal]}
          {c.canalDetalle && ` (${c.canalDetalle})`}
          {c.utm && ` · UTM: ${Object.entries(c.utm).map(([k, v]) => `${k}=${v}`).join(", ")}`}
          {c.abrePuerta && ` · Abre la puerta: ${c.abrePuerta}`}
          {c.origen === "landing" && ` · ${c.aceptaCorreos ? "Acepta correos" : "No acepta correos"}`}
        </p>
        {c.sinRedes ? (
          <p className="chq-muted">Marcó que su negocio no tiene redes sociales.</p>
        ) : (
          enlaces.length > 0 && (
            <p style={{ margin: 0 }}>
              {enlaces.map(([red, url]) => (
                <a key={red} href={url} target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>
                  {red}
                </a>
              ))}
            </p>
          )
        )}
      </section>

      {c.respuestas?.length > 0 && (
        <section className="chq-section">
          <h3>Respuestas (tal como las escribió)</h3>
          {c.respuestas.map((r, i) => (
            <div key={i}>
              <strong>{r.pregunta}</strong>
              <p className="chq-respuesta">{r.respuesta}</p>
            </div>
          ))}
        </section>
      )}

      {c.origen === "propio" && (
        <section className="chq-section">
          <h3>Para que Improvement lo arme</h3>
          <Formulario action={datosPropioAction.bind(null, c.id)} boton="Guardar enlaces y nota">
            {ENLACES.map((red) => (
              <input key={red} className="input" name={`enlace_${red}`} type="url" placeholder={red} defaultValue={c.enlaces?.[red] ?? ""} />
            ))}
            <textarea className="input" name="nota" rows={3} placeholder="Lo que sabes del negocio y de la persona" defaultValue={c.notas ?? ""} />
          </Formulario>
        </section>
      )}

      <section className="chq-section">
        <h3>El chequeo · {MOTOR_ESTADO_LABEL[c.motorEstado]}</h3>
        {c.motorEstado === "armando" && <p className="chq-muted">Improvement lo está armando. Te llega un WhatsApp cuando esté; recarga en unos minutos.</p>}
        {c.motorEstado === "error" && <p className="form-error">{c.motorError}</p>}
        {c.etapaProspecto && <p className="chq-muted">Portada: {ETAPA_PROSPECTO_LABEL[c.etapaProspecto]}</p>}
        {pdf ? <iframe src={pdf} title={`Chequeo de ${nombreDe(c)}`} className="chq-pdf" /> : <p className="chq-muted">Todavía sin PDF.</p>}
        {(["sin_empezar", "en_fila", "error"].includes(c.motorEstado) || atorado) && (
          <Formulario action={armarAction.bind(null, c.id)} boton={c.motorEstado === "error" || atorado ? "Reintentar" : "Armar con Improvement"} />
        )}
        {c.motorEstado === "borrador" && (
          <>
            <Formulario action={aprobarAction.bind(null, c.id)} boton="Aprobar" />
            <Formulario action={rehacerAction.bind(null, c.id)} boton="Rehacer con esta nota">
              <input className="input" name="nota" placeholder="Qué cambiar (ej. no menciones precios)" required />
            </Formulario>
          </>
        )}
        <Formulario action={pdfAction.bind(null, c.id)} boton={pdf ? "Reemplazar PDF" : "Subir PDF"}>
          <input className="input" type="file" name="pdf" accept="application/pdf" required />
        </Formulario>
      </section>

      {c.notasInternas && (
        <section className="chq-section">
          <h3>Notas internas (solo tú)</h3>
          <p><strong>Cómo escribe:</strong> {c.notasInternas.comoEscribe}</p>
          <p><strong>Su tiempo:</strong> {c.notasInternas.tiempo}</p>
          {c.notasInternas.sinConfirmar?.length > 0 && <p><strong>Sin confirmar:</strong> {c.notasInternas.sinConfirmar.join(" · ")}</p>}
          <p><strong>Siguiente paso:</strong> {c.notasInternas.siguientePaso}</p>
          {c.fuentes?.length > 0 && (
            <p className="chq-muted">
              Fuentes:{" "}
              {c.fuentes.map((f) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>
                  {f.que}
                </a>
              ))}
            </p>
          )}
        </section>
      )}

      <section className="chq-section">
        <h3>Avanzar</h3>
        <Formulario action={cambiarEtapaAction.bind(null, c.id)} boton="Cambiar etapa">
          <select className="input" name="etapa" defaultValue={c.etapa === "cliente" ? "" : c.etapa}>
            {ETAPAS.filter((e) => e !== "cliente").map((e) => (
              <option key={e} value={e}>
                {ETAPA_LABEL[e]}
              </option>
            ))}
          </select>
        </Formulario>
        <Formulario action={proximaAccionAction.bind(null, c.id)} boton="Fijar próxima acción">
          <input className="input" name="accion" placeholder="Próxima acción" defaultValue={c.proximaAccion ?? ""} />
          <input className="input" name="fecha" type="date" defaultValue={c.proximaFecha ?? ""} />
        </Formulario>
        <Formulario action={anotarContactoAction.bind(null, c.id)} boton="Anotar">
          <select className="input" name="tipo" defaultValue="mensaje">
            <option value="correo">Correo</option>
            <option value="mensaje">Mensaje</option>
            <option value="llamada">Llamada</option>
            <option value="nota">Nota</option>
          </select>
          <select className="input" name="resultado" defaultValue="">
            <option value="">Resultado…</option>
            {RESULTADOS.map((r) => (
              <option key={r} value={r}>
                {RESULTADO_LABEL[r]}
              </option>
            ))}
          </select>
          <input className="input" name="nota" placeholder="Nota" />
        </Formulario>
        <Formulario action={compraAction.bind(null, c.id)} boton="Registrar compra">
          <select className="input" name="producto" defaultValue="diagnostico_360">
            {PRODUCTOS.map((p) => (
              <option key={p} value={p}>
                {PRODUCTO_LABEL[p]}
              </option>
            ))}
          </select>
          <input className="input" name="monto" type="number" min="0" step="1" placeholder="Monto (MXN)" required />
        </Formulario>
      </section>

      <section className="chq-section">
        <h3>Bitácora</h3>
        <ul className="chq-timeline">
          {c.eventos.map((e) => (
            <li key={e.id}>
              <span className="chq-muted">{momento.format(e.createdAt)}</span> · <strong>{TIPO_EVENTO[e.tipo]}</strong>{" "}
              {detalleDe(e)} <span className="chq-muted">· {AUTOR[e.autor]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
