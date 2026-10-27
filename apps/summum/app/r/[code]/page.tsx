// Página pública de un enlace de referido: solo el primer nombre de quien recomienda y el código.
import Link from "next/link";
import { notFound } from "next/navigation";
import { referrerByCode } from "@/server/community/leaderboard.ts";

export const metadata = { title: "Te recomendaron Summum System", robots: { index: false } };

export default async function ReferidoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const referrer = await referrerByCode(code);
  if (!referrer) notFound();
  return (
    <main style={{ padding: "24px" }}>
      <h1>Te recomendó {referrer.firstName}</h1>
      <p>
        Tu código: <strong>{code}</strong> · Menciónalo al agendar
      </p>
      <p>
        <Link href="/diagnostico">Agenda tu diagnóstico</Link>
      </p>
    </main>
  );
}
