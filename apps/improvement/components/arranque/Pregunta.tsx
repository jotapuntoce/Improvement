// Lo que Improvement dice en cada paso del arranque: su isotipo y la pregunta.
import { Isotipo } from "@/components/brand/Isotipo.tsx";

export function Pregunta({ children, why }: { children: React.ReactNode; why?: React.ReactNode }) {
  return (
    <div className="arr-bubble">
      <Isotipo />
      <div>
        <h1 className="arr-q">{children}</h1>
        {why && <p className="arr-why">{why}</p>}
      </div>
    </div>
  );
}
