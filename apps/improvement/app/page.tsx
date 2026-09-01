export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        background: "var(--bg)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-geist-sans), sans-serif",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <span
        style={{
          fontSize: "12px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-secondary)",
        }}
      >
        JotaPuntoCe
      </span>
      <h1
        style={{
          fontSize: "40px",
          fontWeight: 700,
          margin: 0,
          background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        Improvement
      </h1>
      <p style={{ color: "var(--text-secondary)", maxWidth: "380px", fontSize: "14px" }}>
        Esqueleto en construcción — el paso 2 del build order. Login, dashboard y el resto de la
        app llegan en los pasos siguientes.
      </p>
    </main>
  );
}
