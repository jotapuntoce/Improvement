// El cuerpo de una tarjeta del tablero: dibuja los datos ya calculados (server/dashboard/cards.ts).
// Sin datos (sin acceso, o tipo todavía no listo) muestra el porqué en texto.
import Link from "next/link";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const NUM = new Intl.NumberFormat("es-MX");
const money = (cents: number) => MXN.format(cents / 100);

type Bar = { label: string; count: number; amountCents: number };
type Item = { title: string; href: string };
export type CardBodyData =
  | { kind: "numero"; value: number; format: "numero" | "dinero" | "porcentaje" }
  | { kind: "barras" | "embudo"; bars: Bar[] }
  | { kind: "lista"; items: Item[]; more: number }
  | { kind: "hoy"; items: { kind: string; id: string; title: string; overdue: boolean; href: string }[] }
  | { kind: "alertas"; items: { key: string; title: string; href: string; amountCents: number | null }[]; more: number }
  | { kind: "momentos"; items: ({ kind: "objetivo"; title: string; personName: string | null } | { kind: "aniversario"; personName: string | null; years: number; on: string })[] }
  | { kind: "pronostico"; forecast: { sinHistoria: true } | { sinHistoria: false; byStage: { stage: string; openCents: number; rate: number; source: "etapa" | "global" }[]; totalCents: number } }
  | { kind: "ingresos_meta"; rows: { label: string; wonCents: number; goalCents: number }[] }
  | { kind: "que_falta"; items: string[]; more: number }
  | { kind: "calendario"; days: AgendaDay[] };

type AgendaDay = { day: string; items: { kind: string; title: string; href: string }[] };
const DIA = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
/** "2026-11-04" → "miércoles, 4 de noviembre" (la fecha ya viene en el día de CDMX). */
export const dayLabel = (day: string) => DIA.format(new Date(`${day}T12:00:00Z`));

export function Agenda({ days }: { days: AgendaDay[] }) {
  return (
    <ul className="equipo-list">
      {days.map((d) => (
        <li key={d.day}>
          <strong>{dayLabel(d.day)}</strong>
          <ul className="equipo-list">
            {d.items.map((i) => <li key={`${i.href}-${i.title}`}><Link href={i.href}>{i.title}</Link></li>)}
          </ul>
        </li>
      ))}
      {days.length === 0 && <li className="config-hint">Nada con fecha por ahora.</li>}
    </ul>
  );
}

const STAGE: Record<string, string> = { prospecto: "Prospecto", propuesta: "Propuesta", negociacion: "Negociación" };
const PCT = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 0 });

function Bars({ bars }: { bars: Bar[] }) {
  // Con monto, la barra mide dinero; sin monto, cuántos registros. El valor va siempre en texto.
  const byMoney = bars.some((b) => b.amountCents > 0);
  const top = Math.max(1, ...bars.map((b) => (byMoney ? b.amountCents : b.count)));
  return (
    <ul className="dash-bars">
      {bars.map((b) => {
        const v = byMoney ? b.amountCents : b.count;
        return (
          <li key={b.label}>
            <span>{b.label}</span>
            <span className="dash-bar" style={{ width: `${(v / top) * 100}%` }} aria-hidden="true" />
            <span className="dash-figure">{byMoney ? `${money(b.amountCents)} · ${b.count}` : NUM.format(b.count)}</span>
          </li>
        );
      })}
      {bars.length === 0 && <li className="config-hint">Sin etapas todavía.</li>}
    </ul>
  );
}

export function CardBody({ data, error, orgId }: { data: CardBodyData | null; error: string | null; orgId: string }) {
  if (!data) return <p className="config-hint">{error}</p>;
  switch (data.kind) {
    case "numero":
      return <p className="dash-number">{data.format === "dinero" ? money(data.value) : data.format === "porcentaje" ? `${NUM.format(data.value)} %` : NUM.format(data.value)}</p>;
    case "barras":
    case "embudo":
      return <Bars bars={data.bars} />;
    case "lista":
      return (
        <ul className="equipo-list">
          {data.items.map((i) => <li key={i.href}><Link href={i.href}>{i.title}</Link></li>)}
          {data.items.length === 0 && <li className="config-hint">Nada aquí por ahora.</li>}
          {data.more > 0 && <li className="config-hint">y {data.more} más</li>}
        </ul>
      );
    case "hoy":
      return (
        <>
          <ul className="equipo-list">
            {data.items.map((t) => (
              <li key={`${t.kind}-${t.id}`}><Link href={t.href}>{t.title}</Link>{t.overdue && <span className="task-overdue"> · Vencida</span>}</li>
            ))}
            {data.items.length === 0 && <li className="config-hint">Nada pendiente por ahora.</li>}
          </ul>
          <Link href={`/${orgId}/tareas`}>Ver toda mi bandeja</Link>
        </>
      );
    case "alertas":
      return (
        <>
          <ul className="equipo-list">
            {data.items.map((a) => (
              <li key={a.key}><Link href={a.href}>{a.title}</Link>{a.amountCents ? <span className="dash-figure"> · {money(a.amountCents)}</span> : null}</li>
            ))}
            {data.items.length === 0 && <li className="config-hint">Nada se está cayendo.</li>}
            {data.more > 0 && <li className="config-hint">y {data.more} más</li>}
          </ul>
          <Link href={`/${orgId}/alertas`}>Ver todas y que Improvement las explique</Link>
        </>
      );
    case "momentos":
      return (
        <ul className="equipo-list">
          {data.items.map((m, i) => (
            <li key={i}>
              {m.kind === "objetivo"
                ? `${m.personName ?? "Alguien"} cumplió «${m.title}»`
                : `${m.personName ?? "Alguien"} cumple ${m.years} ${m.years === 1 ? "año" : "años"} en el equipo (${m.on})`}
            </li>
          ))}
          {data.items.length === 0 && <li className="config-hint">Nada que celebrar esta semana.</li>}
        </ul>
      );
    case "pronostico": {
      const f = data.forecast;
      if (f.sinHistoria) return <p className="config-hint">Sin tratos cerrados en 6 meses: todavía no hay con qué pronosticar.</p>;
      return (
        <>
          <p className="dash-number">{money(f.totalCents)}</p>
          <ul className="equipo-list">
            {f.byStage.map((s) => (
              <li key={s.stage}>
                {STAGE[s.stage] ?? s.stage}: <span className="dash-figure">{money(s.openCents)} × {PCT.format(s.rate)}</span>
                {s.source === "global" && <span className="config-hint"> (tasa general: pocos casos)</span>}
              </li>
            ))}
          </ul>
          <Link href={`/${orgId}/que-pasa-si`}>¿Qué pasa si…?</Link>
        </>
      );
    }
    case "calendario":
      return (
        <>
          <Agenda days={data.days} />
          <Link href={`/${orgId}/calendario`}>Ver el calendario</Link>
        </>
      );
    case "que_falta":
      return (
        <>
          <ul className="equipo-list">
            {data.items.map((t) => <li key={t}>{t}</li>)}
            {data.items.length === 0 && <li className="config-hint">Tu proceso ya tiene todo lo que trae tu giro.</li>}
            {data.more > 0 && <li className="config-hint">y {data.more} más</li>}
          </ul>
          <Link href={`/${orgId}/proceso`}>Ver y agregar lo que falta</Link>
        </>
      );
    case "ingresos_meta":
      return (
        <>
          <ul className="dash-bars">
            {data.rows.map((r) => (
              <li key={r.label}>
                <span>{r.label}</span>
                <span className="dash-bar" style={{ width: `${r.goalCents ? Math.min(100, (r.wonCents / r.goalCents) * 100) : 0}%` }} aria-hidden="true" />
                <span className="dash-figure">{money(r.wonCents)}{r.goalCents ? ` de ${money(r.goalCents)}` : " · sin meta"}</span>
              </li>
            ))}
          </ul>
          <Link href={`/${orgId}/que-pasa-si`}>¿Qué pasa si…?</Link>
        </>
      );
  }
}
