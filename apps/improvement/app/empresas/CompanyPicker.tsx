"use client";

// Efecto "Rappi": una intro breve que recorre el estado real de cada empresa del cliente antes de
// asentarse en la grilla de íconos grandes — no texto genérico, siempre companies[] real (Task 5).
// Cada ícono conserva su badge de etapa después de la intro (ver AppIconLarge, packages/ui).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIconLarge } from "@jotapuntoce/ui/building/AppIconLarge.tsx";
import type { CompanySummary } from "@/server/companies/companyList.ts";

const INTRO_MS_PER_COMPANY = 700;

export function CompanyPicker({ companies }: { companies: CompanySummary[] }) {
  const router = useRouter();
  const [introIndex, setIntroIndex] = useState(0);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if (introDone) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Hidrata estado que solo existe en el navegador (prefers-reduced-motion) — no hay forma de
      // leerlo durante el render del servidor, así que este setState síncrono es intencional
      // (mismo patrón ya usado en apps/improvement/app/[org]/dashboard/Scene3D.tsx).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIntroDone(true);
      return;
    }
    if (introIndex >= companies.length) {
      setIntroDone(true);
      return;
    }
    const timer = window.setTimeout(() => setIntroIndex((i) => i + 1), INTRO_MS_PER_COMPANY);
    return () => window.clearTimeout(timer);
  }, [introIndex, introDone, companies.length]);

  if (!introDone) {
    const current = companies[introIndex];
    // Guard real, no solo type-narrowing: cuando el timer dispara el último setIntroIndex(i => i+1)
    // (introIndex llega a companies.length), React renderiza con ese introIndex nuevo pero con
    // introDone todavía en false — el effect que lo pone en true corre después del commit, no
    // durante este render. En ese frame transitorio companies[introIndex] es undefined de verdad
    // (no una imposibilidad que TS no puede probar): sin este guard, current.name explotaría con
    // un TypeError síncrono en cada carga normal de la página (sin prefers-reduced-motion), no en
    // un caso límite. guard-then-narrow, mismo patrón que server/reminders/deliver.ts.
    if (!current) return null;
    return (
      <div className="empresas-intro" role="status">
        <p className="empresas-intro-label">Revisando tus empresas…</p>
        <p className="empresas-intro-company">{current.name}</p>
        <p className="empresas-intro-stage">{current.stageLabel}</p>
      </div>
    );
  }

  return (
    <div className="empresas-grid">
      {companies.map((c) => (
        <button key={c.orgId} type="button" className="empresas-tile" onClick={() => router.push(`/empresas/${c.orgId}`)}>
          <AppIconLarge label={c.name} stageLabel={c.stageLabel} />
        </button>
      ))}
    </div>
  );
}
