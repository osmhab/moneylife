import { z } from "zod";
import { ClientDataSchema } from "./schema";

// Types de plans supportés
export const PlanTypeEnum = z.enum([
  "LPP_BASE",
  "LPP_COMPL",
  "PILIER_3A_POLICE",
  "PILIER_3A_BANK",
  "PILIER_3B",
]);

export type PlanType = z.infer<typeof PlanTypeEnum>;

/**
 * Structure d'un Plan Individuel
 */
export const PlanSchema = z.object({
  id: z.string().optional(),
  type: PlanTypeEnum,
  label: z.string(),
  institutionName: z.string().optional(),
  
  /**
   * CORRECTION : 
   * Au lieu de manipuler l'instance, on utilise z.lazy ou on reconstruit l'objet
   * pour éviter les erreurs de 'ZodEffects' ou 'ZodPipe'.
   */
  data: z.custom<Partial<z.infer<typeof ClientDataSchema>>>().optional(),

  metadata: z.object({
    createdAt: z.date(),
    updatedAt: z.date(),
    sourceFileUrl: z.string().optional(),
    isManualEntry: z.boolean().default(false),
  })
});

export type Plan = z.infer<typeof PlanSchema>;

/**
 * Helper pour obtenir l'icône ou la couleur selon le type de plan
 * (Utile pour coller au design Revolut)
 */
export const getPlanDisplayInfo = (type: PlanType) => {
  switch (type) {
    case "LPP_BASE":
    case "LPP_COMPL":
      return { icon: "/icons/lpp.svg", color: "#3B82F6", category: "2ème pilier" };
    case "PILIER_3A_POLICE":
    case "PILIER_3A_BANK":
      return { icon: "/icons/3a.svg", color: "#10B981", category: "3ème pilier A" };
    default:
      return { icon: "/icons/generic.svg", color: "#6B7280", category: "Prévoyance" };
  }
};