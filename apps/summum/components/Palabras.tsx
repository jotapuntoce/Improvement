// Parte un título en palabras para que entren una por una (ver [data-anima="titulo"] en app/globals.css).
export function Palabras({ texto }: { texto: string }) {
  return texto.split(" ").map((p, i) => (
    <span key={i}>
      {i > 0 && " "}
      <span className="palabra" style={{ "--i": i } as React.CSSProperties}>
        {p}
      </span>
    </span>
  ));
}
