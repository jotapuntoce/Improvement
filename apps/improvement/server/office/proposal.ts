// Lo que la IA devuelve al ver las fotos del local y lo único que se guarda en office_plan.proposal
// (blueprint oficinas-digitales §4 "Propuesta de oficina"). Nunca hay un campo para personas ni rostros.
import { z } from "zod";
import { orgThemeSchema } from "../companies/theme.ts";

export const officeProposalSchema = z.object({
  areas: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        seats: z.array(z.object({ title: z.string().trim().min(1).max(40) })).max(6),
      }),
    )
    .min(1)
    .max(12),
  theme: orgThemeSchema.nullable(),
  logo: z.object({ present: z.boolean(), description: z.string().max(200) }),
  notes: z.string().max(300),
});
export type OfficeProposal = z.infer<typeof officeProposalSchema>;
