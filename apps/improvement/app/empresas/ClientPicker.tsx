"use client";

// Panel de Clientes — solo se renderiza para platform admins (ver page.tsx). A diferencia de
// CompanyPicker, sin efecto Rappi: aquí no hay "estado de construcción" que resumir, es una lista
// de personas, no de empresas.
import { useRouter } from "next/navigation";
import { AvatarIcon } from "@jotapuntoce/ui/building/AvatarIcon.tsx";
import type { ClientSummary } from "@/server/companies/clientList.ts";

export function ClientPicker({ clients }: { clients: ClientSummary[] }) {
  const router = useRouter();

  return (
    <div className="empresas-grid">
      {clients.map((c) => (
        <button
          key={c.clientUserId}
          type="button"
          className="empresas-tile"
          onClick={() => router.push(`/empresas/clientes/${c.clientUserId}`)}
        >
          <AvatarIcon name={c.name} avatarColor={c.avatarColor} />
        </button>
      ))}
    </div>
  );
}
