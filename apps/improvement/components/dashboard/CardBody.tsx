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
  | { kind: "momentos"; items: ({ kind: "objetivo"; title: string; personName: string | null } | { kind: "aniversario"; personName: string | null; years: number; on: string })[] };

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
  }
}
