import { describe, expect, it } from "vitest";
import { buildClientList } from "../server/companies/clientList.ts";

const ADMIN_ID = "admin-1";

describe("buildClientList", () => {
  it(
    "WHEN una organización no tiene ningún otro owner además del admin THE SYSTEM SHALL " +
      "excluirla del resultado (ej. la org demo de la plataforma)",
    () => {
      const orgs = [{ id: "org-1", name: "JotaPuntoCe (demo)" }];
      const membershipsByOrgId = new Map([
        ["org-1", [{ orgId: "org-1", userId: ADMIN_ID, role: "owner" as const, acceptedAt: new Date() }]],
      ]);
      const profilesById = new Map();

      expect(buildClientList(ADMIN_ID, orgs, membershipsByOrgId, profilesById)).toEqual([]);
    },
  );

  it("WHEN dos organizaciones tienen el mismo owner real THE SYSTEM SHALL agruparlas bajo un solo cliente", () => {
    const orgs = [
      { id: "org-camibel", name: "Camibel" },
      { id: "org-afianza", name: "Afianza" },
    ];
    const membershipsByOrgId = new Map([
      [
        "org-camibel",
        [
          { orgId: "org-camibel", userId: ADMIN_ID, role: "owner" as const, acceptedAt: new Date("2026-01-01") },
          { orgId: "org-camibel", userId: "jaime-1", role: "owner" as const, acceptedAt: new Date("2026-01-01") },
        ],
      ],
      [
        "org-afianza",
        [
          { orgId: "org-afianza", userId: ADMIN_ID, role: "owner" as const, acceptedAt: new Date("2026-01-02") },
          { orgId: "org-afianza", userId: "jaime-1", role: "owner" as const, acceptedAt: new Date("2026-01-02") },
        ],
      ],
    ]);
    const profilesById = new Map([
      ["jaime-1", { id: "jaime-1", fullName: "Jaime Salinas", email: "jaime@example.com", avatarColor: "indigo" }],
    ]);

    expect(buildClientList(ADMIN_ID, orgs, membershipsByOrgId, profilesById)).toEqual([
      {
        clientUserId: "jaime-1",
        name: "Jaime Salinas",
        avatarColor: "indigo",
        companies: [
          { orgId: "org-camibel", name: "Camibel" },
          { orgId: "org-afianza", name: "Afianza" },
        ],
      },
    ]);
  });

  it("WHEN una organización tiene dos owners que no son el admin THE SYSTEM SHALL usar el primero por acceptedAt", () => {
    const orgs = [{ id: "org-1", name: "Co-owned Co" }];
    const membershipsByOrgId = new Map([
      [
        "org-1",
        [
          { orgId: "org-1", userId: "later-1", role: "owner" as const, acceptedAt: new Date("2026-02-01") },
          { orgId: "org-1", userId: "earlier-1", role: "owner" as const, acceptedAt: new Date("2026-01-01") },
        ],
      ],
    ]);
    const profilesById = new Map([
      ["earlier-1", { id: "earlier-1", fullName: "Earlier Owner", email: "earlier@example.com", avatarColor: null }],
      ["later-1", { id: "later-1", fullName: "Later Owner", email: "later@example.com", avatarColor: null }],
    ]);

    const result = buildClientList(ADMIN_ID, orgs, membershipsByOrgId, profilesById);
    expect(result).toHaveLength(1);
    expect(result[0]!.clientUserId).toBe("earlier-1");
  });

  it("WHEN el nombre completo del cliente no existe THE SYSTEM SHALL usar su email como nombre", () => {
    const orgs = [{ id: "org-1", name: "Sin Nombre Co" }];
    const membershipsByOrgId = new Map([
      ["org-1", [{ orgId: "org-1", userId: "no-name-1", role: "owner" as const, acceptedAt: new Date() }]],
    ]);
    const profilesById = new Map([
      ["no-name-1", { id: "no-name-1", fullName: null, email: "sinnombre@example.com", avatarColor: null }],
    ]);

    const result = buildClientList(ADMIN_ID, orgs, membershipsByOrgId, profilesById);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("sinnombre@example.com");
  });
});
