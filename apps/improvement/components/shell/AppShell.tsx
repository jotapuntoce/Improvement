// El marco de todo el negocio: barra izquierda + centro, con la marca del negocio como variables CSS.
import type { CSSProperties, ReactNode } from "react";

export function AppShell({ sidebar, style, children }: { sidebar: ReactNode; style: Record<string, string>; children: ReactNode }) {
  return (
    <div className="shell" style={style as CSSProperties}>
      {sidebar}
      <div className="shell-main">{children}</div>
    </div>
  );
}
