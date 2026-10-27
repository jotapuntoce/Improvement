// Solo navegación; cada página llama a su guard.
export default async function MuelleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ muelleId: string }> }) {
  const { muelleId } = await params;
  const link = (path: string, label: string) => (
    <a href={`/muelle/${muelleId}/${path}`} style={{ color: "var(--text-primary)", textDecoration: "none" }}>{label}</a>
  );
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "24px" }}>
      <nav style={{ display: "flex", gap: "20px", marginBottom: "24px", fontWeight: 600 }}>
        {link("barcos", "Barcos")}
        {link("comisiones", "Comisiones")}
        {link("dinero", "Dinero")}
        {link("afiliadas", "Afiliadas")}
        {link("sello", "Sello")}
      </nav>
      {children}
    </div>
  );
}
