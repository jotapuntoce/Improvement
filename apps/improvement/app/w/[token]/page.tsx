// Monedero del cliente final, sin sesión: el token del enlace es la única llave. Muestra nivel,
// beneficios y experiencias recibidas; nunca montos ni ids (server/crm/wallet.ts).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadWallet } from "@/server/crm/wallet.ts";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

const DAY = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "UTC" });

export default async function WalletPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const wallet = await loadWallet(token);
  if (!wallet) notFound();

  return (
    <main className="config-page">
      <h1 className="config-title">Tu monedero en {wallet.orgName}</h1>
      <p className="config-hint">Hola, {wallet.clientName}.</p>

      <section className="config-card" aria-labelledby="nivel">
        <h2 id="nivel" className="config-card-title">
          Tu nivel
        </h2>
        <p>{wallet.tierName ?? "Todavía sin nivel"}</p>
        {wallet.perks && <p className="config-hint">{wallet.perks}</p>}
      </section>

      <section className="config-card" aria-labelledby="experiencias">
        <h2 id="experiencias" className="config-card-title">
          Experiencias recibidas
        </h2>
        <ul className="equipo-list">
          {wallet.experiences.map((e, i) => (
            <li key={i}>
              {e.title} · {DAY.format(new Date(`${e.grantedOn}T00:00:00Z`))}
            </li>
          ))}
          {wallet.experiences.length === 0 && <li className="config-hint">Pronto habrá algo para ti.</li>}
        </ul>
      </section>
    </main>
  );
}
