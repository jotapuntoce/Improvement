const fmt = (currency: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() });

export function Money({ cents, currency = "mxn" }: { cents: number; currency?: string }) {
  return <span style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{fmt(currency).format(cents / 100)}</span>;
}
