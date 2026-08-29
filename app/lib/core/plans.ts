import { z } from "zod";
import { ClientDataSchema } from "./schema";

// Types de plans supportés
export const PlanTypeEnum = z.enum([
  "LPP_BASE",
  "LPP_COMPL",
  // Libre passage (avoir de 2e pilier « parqué » hors emploi). Capital seul dans l'analyse :
  // compte pour le capital retraite (projeté) et le capital décès (solde versé), PAS de rentes.
  "LIBRE_PASSAGE_POLICE",  // émis par un ASSUREUR (police)
  "LIBRE_PASSAGE_COMPTE",  // émis par une BANQUE / fondation (compte)
  "PILIER_3A_POLICE",
  "PILIER_3A_BANK",
  "PILIER_3B",
  // Épargne LIBRE (hors prévoyance) : compte épargne, fonds, ETF, actions. Comptée comme cash.
  "EPARGNE_LIBRE",
]);

export type PlanType = z.infer<typeof PlanTypeEnum>;

/** 2e pilier ACTIF (caisse de pension) : base + complémentaire → rentes + capital.
 *  ("LPP" = alias legacy de la base, encore présent dans d'anciens plans/tests.) */
export const isDeuxiemePilierActif = (t?: string) => t === "LPP_BASE" || t === "LPP_COMPL" || t === "LPP";
/** Libre passage : avoir parqué → capital seul (retraite + capital décès), pas de rentes. */
export const isLibrePassage = (t?: string) => t === "LIBRE_PASSAGE_POLICE" || t === "LIBRE_PASSAGE_COMPTE";
/** Tout le 2e pilier (actif + libre passage). */
export const isDeuxiemePilier = (t?: string) => isDeuxiemePilierActif(t) || isLibrePassage(t);

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
    /**
     * Date limite de signature de l'OFFRE ("aaaa-mm-jj" ou "jj.mm.aaaa"),
     * posée à la main par l'admin. Au-delà, le statut passe à EXPIRED et
     * l'offre n'est plus signable — état TERMINAL (cf. offerExpiry.ts).
     * Absente sur les contrats et sur les offres antérieures à ce champ.
     */
    offerExpiresAt: z.string().optional(),
    /** Horodatage du passage effectif à EXPIRED. */
    expiredAt: z.any().optional(),
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
    case "LIBRE_PASSAGE_POLICE":
    case "LIBRE_PASSAGE_COMPTE":
      return { icon: "/icons/lpp.svg", color: "#3B82F6", category: "2ème pilier" };
    case "PILIER_3A_POLICE":
    case "PILIER_3A_BANK":
      return { icon: "/icons/3a.svg", color: "#10B981", category: "3ème pilier A" };
    case "EPARGNE_LIBRE":
      return { icon: "/icons/epargne.svg", color: "#0FB5BD", category: "Épargne libre" };
    default:
      return { icon: "/icons/generic.svg", color: "#6B7280", category: "Prévoyance" };
  }
};