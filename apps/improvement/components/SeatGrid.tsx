// Cuadrícula de lugares de una función: la usan la taquilla (SeatMapLive) y la página pública (SeatPicker).
// Cada quien decide el borde y el contenido de la celda; el estado va en texto, no solo en color.
import type { ReactNode } from "react";

type GridSeat = { id: string; label: string; x: number; y: number; status: string };

export function SeatGrid<S extends GridSeat>({ seats, border, cell }: { seats: S[]; border: (s: S) => string; cell: (s: S) => ReactNode }) {
  const cols = Math.max(...seats.map((s) => s.x)) + 1;
  return (
    <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(4.5rem, 1fr))` }}>
      {seats.map((s) => (
        <li
          key={s.id}
          data-seat={s.label}
          data-status={s.status}
          style={{ gridColumnStart: s.x + 1, gridRowStart: s.y + 1, border: `2px solid ${border(s)}`, borderRadius: "var(--radius-sm)", padding: "0.25rem 0.5rem" }}
        >
          {cell(s)}
        </li>
      ))}
    </ul>
  );
}
