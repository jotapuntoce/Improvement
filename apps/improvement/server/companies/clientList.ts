// Lógica pura de agrupación de organizaciones por cliente real — sin acceso a datos. Un platform
// admin tiene membership en TODA organización (provisionOrganization, apps/admin), así que agrupar
// "sus" orgs directo produciría un mosaico plano sin sentido; esto identifica, para cada org, quién
// es su OTRO owner (el cliente real) y agrupa por esa persona. server/companies/loadClients.ts
// alimenta esto con datos reales.
export interface ClientOrgMembership {
  orgId: string;
  userId: string;
  role: "owner" | "employee";
  acceptedAt: Date | null;
}

export interface ClientProfile {
  id: string;
  fullName: string | null;
  email: string;
  avatarColor: string | null;
}

export interface ClientOrgRow {
  id: string;
  name: string;
}

export interface ClientSummary {
  clientUserId: string;
  name: string;
  avatarColor: string | null;
  companies: { orgId: string; name: string }[];
}

/**
 * WHEN una organización no tiene ningún membership role='owner' cuyo userId sea distinto de
 * adminUserId THE SYSTEM SHALL excluirla del resultado (criterio #1) — no pertenece a ningún
 * cliente. WHEN dos organizaciones comparten el mismo owner real THE SYSTEM SHALL agruparlas bajo
 * un solo ClientSummary (criterio #2). WHEN una organización tiene más de un owner no-admin THE
 * SYSTEM SHALL usar el más antiguo por acceptedAt, determinista (criterio #3).
 */
export function buildClientList(
  adminUserId: string,
  orgs: ClientOrgRow[],
  membershipsByOrgId: Map<string, ClientOrgMembership[]>,
  profilesById: Map<string, ClientProfile>,
): ClientSummary[] {
  const clientsByUserId = new Map<string, ClientSummary>();

  for (const org of orgs) {
    const orgMemberships = membershipsByOrgId.get(org.id) ?? [];
    const ownerMemberships = orgMemberships
      .filter((m) => m.role === "owner" && m.userId !== adminUserId)
      .sort((a, b) => (a.acceptedAt?.getTime() ?? 0) - (b.acceptedAt?.getTime() ?? 0));

    const clientMembership = ownerMemberships[0];
    if (!clientMembership) continue;

    const clientProfile = profilesById.get(clientMembership.userId);
    if (!clientProfile) continue;

    let client = clientsByUserId.get(clientMembership.userId);
    if (!client) {
      client = {
        clientUserId: clientMembership.userId,
        name: clientProfile.fullName ?? clientProfile.email,
        avatarColor: clientProfile.avatarColor,
        companies: [],
      };
      clientsByUserId.set(clientMembership.userId, client);
    }
    client.companies.push({ orgId: org.id, name: org.name });
  }

  return Array.from(clientsByUserId.values());
}
