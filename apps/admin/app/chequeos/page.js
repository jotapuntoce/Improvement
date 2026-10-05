// Inventario de chequeos: el embudo de JotaPuntoCe, del chequeo gratis a Improvement Completo. Los que llegan de la
// landing (app/api/chequeos) y los propios viven en la misma tabla. Spec 2026-10-02-inventario-chequeos-design.md.
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth.js";
import { listarChequeos, tablero } from "@/lib/chequeos.js";
import { gastoDelMes } from "@/lib/motor/armar.js";
import { CANALES_PANEL, CANAL_LABEL, ETAPAS, ETAPA_LABEL, etapaDe, nombreDe } from "@/lib/chequeoDatos.js";
import Formulario from "@/components/chequeos/Formulario.js";
import { crearPropioAction } from "./actions.js";

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const AVISO = { registro: "🧠 Chequeo nuevo", entrevista: "✅ Contestó la entrevista", compra: "💰 Compra" };

export default async function ChequeosPage({ searchParams }) {
  await requirePlatformAdmin();
  const { etapa } = await searchParams;
  const filtro = ETAPAS.includes(etapa) ? etapa : undefined;
  const [t, lista, gasto] = await Promise.all([tablero(), listarChequeos({ etapa: filtro }), gastoDelMes()]);
  const pct = (n) => (t.total ? `${Math.round((n / t.total) * 100)}%` : "—");

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          <Link href="/" className="page-back-link">
            ← Recepción
          </Link>
          <h2>Chequeos</h2>
          <p className="topbar-subtitle">El embudo de JotaPuntoCe: del chequeo gratis a Improvement Completo.</p>
        </div>
      </section>

      {t.avisos.length > 0 && (
        <section className="chq-section">
          <h3>Avisos</h3>
          <ul className="chq-timeline">
            {t.avisos.map((a) => (
              <li key={a.id}>
                {AVISO[a.tipo]} ·{" "}
                <Link href={`/chequeos/${a.chequeoId}`}>
                  {[a.chequeo?.nombre, a.chequeo && nombreDe(a.chequeo)].filter(Boolean).join(" · ")}
                </Link>{" "}
                <span className="chq-muted">· {fecha.format(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="chq-stats">
        <Stat valor={t.total} label="Chequeos" />
        <Stat valor={t.sinEntrevista} label="Sin entrevista" />
        <Stat valor={pct(t.escalera.algo)} label={`Compraron algo (${t.escalera.algo})`} />
        <Stat valor={pct(t.escalera.diagnostico)} label={`Diagnóstico 360 (${t.escalera.diagnostico})`} />
        <Stat valor={pct(t.escalera.completo)} label={`Improvement Completo (${t.escalera.completo})`} meta />
        <Stat valor={`US$${gasto.toFixed(2)}`} label="Gastado en IA (mes)" />
      </section>

      <section className="chq-section">
        <h3>Por canal</h3>
        {t.porCanal.length === 0 ? (
          <p className="empty-hint">Todavía no hay chequeos.</p>
        ) : (
          <table className="chq-table">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Llegaron</th>
                <th>Compraron</th>
                <th>Completo</th>
              </tr>
            </thead>
            <tbody>
              {t.porCanal.map((c) => (
                <tr key={c.canal}>
                  <td>{CANAL_LABEL[c.canal]}</td>
                  <td>{c.total}</td>
                  <td>{c.compraron}</td>
                  <td>{c.completo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <details className="chq-section">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Chequeo propio</summary>
        <Formulario action={crearPropioAction} boton="Crear chequeo">
          <select className="input" name="tipo" defaultValue="negocio">
            <option value="negocio">Negocio</option>
            <option value="emprendedor">Emprendedor (sin negocio)</option>
          </select>
          <input className="input" name="negocio" placeholder="Negocio (o nombre de la idea)" />
          <input className="input" name="giro" placeholder="Giro (o qué quiere emprender) *" required />
          <input className="input" name="ciudad" placeholder="Ciudad *" required />
          <select className="input" name="canal" defaultValue="directo">
            {CANALES_PANEL.map((c) => (
              <option key={c} value={c}>
                {CANAL_LABEL[c]}
              </option>
            ))}
          </select>
          <input className="input" name="canalDetalle" placeholder="Si es referido: quién lo recomendó (su comisión)" />
          <input className="input" name="abrePuerta" placeholder="Quién abre la puerta" />
          <input className="input" name="nombre" placeholder="Persona" />
          <input className="input" name="correo" type="email" placeholder="Correo" />
          <input className="input" name="telefono" type="tel" placeholder="Teléfono" />
        </Formulario>
      </details>

      <nav className="chq-chips" aria-label="Filtrar por etapa">
        <Link href="/chequeos" className={`chq-chip ${filtro ? "" : "chq-chip-active"}`}>
          Todas ({t.total})
        </Link>
        {ETAPAS.map((e) => (
          <Link key={e} href={`/chequeos?etapa=${e}`} className={`chq-chip ${filtro === e ? "chq-chip-active" : ""}`}>
            {ETAPA_LABEL[e]} ({t.porEtapa[e] ?? 0})
          </Link>
        ))}
      </nav>

      {lista.length === 0 ? (
        <p className="empty-hint">Sin chequeos en esta etapa.</p>
      ) : (
        <ul className="chq-list">
          {lista.map((c) => {
            const dias = c.diasSinMovimiento;
            return (
              <li key={c.id}>
                <Link href={`/chequeos/${c.id}`} className="chq-card">
                  <div>
                    <p style={{ fontWeight: 600, margin: 0 }}>{nombreDe(c)}</p>
                    <p className="chq-muted">
                      {c.giro} · {c.ciudad}
                      {c.nombre && ` · ${c.nombre}`} · {CANAL_LABEL[c.canal]}
                    </p>
                    {c.proximaAccion && (
                      <p className="chq-muted">
                        Próxima: {c.proximaAccion}
                        {c.proximaFecha && ` (${c.proximaFecha})`}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="category-chip" style={{ "--chip-color": "var(--accent-1)" }}>
                      {etapaDe(c)}
                    </span>
                    <p className="chq-muted">{dias === 0 ? "Movimiento hoy" : `${dias} día(s) sin movimiento`}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ valor, label, meta = false }) {
  return (
    <div className={`chq-stat ${meta ? "chq-stat-meta" : ""}`}>
      <div className="chq-stat-value">{valor}</div>
      <div className="chq-stat-label">{label}</div>
    </div>
  );
}
