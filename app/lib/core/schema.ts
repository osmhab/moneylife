/* =========================================================
 * MoneyLife — Schémas de validation (Zod)
 * Fichier : /lib/core/schema.ts
 * ---------------------------------------------------------
 * - Vérifie la cohérence et les types des données avant
 *   écriture Firestore ou usage dans les calculs.
 * - Regroupe : ClientDataSchema + LegalSettingsSchema.
 * =======================================================*/

import { z } from "zod";

/* =========================================================
 * Sous-schémas réutilisables
 * =======================================================*/

// Format de date "dd.MM.yyyy" (tolère absence de zéros initiaux)
export const dateMaskRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

// Vérifie une date plausible (pas de validation complète calendrier)
const dateMaskSchema = z.string().regex(dateMaskRegex, "Format attendu : jj.mm.aaaa")
  .superRefine((val, ctx) => {
    const m = val.match(dateMaskRegex);
    if (!m) return;
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    const maxByMonth = [31, (isLeap ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (mo < 1 || mo > 12 || d < 1 || d > maxByMonth[mo - 1]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date invalide" });
    }
  });

// Enfant minimal
export const Enter_EnfantSchema = z.object({
  Enter_dateNaissance: dateMaskSchema,
});

/* =========================================================
 * Schéma principal : ClientData (saisies user / OCR)
 * =======================================================*/
export const ClientDataSchema = z.object({
  /* -------- Identité -------- */
  Enter_prenom: z.string().min(1),
  Enter_nom: z.string().min(1),
  Enter_dateNaissance: dateMaskSchema,
  Enter_sexe: z.coerce.number().int().min(0).max(1),

  /* -------- État civil / conjoint -------- */
  Enter_etatCivil: z.coerce.number().int().min(0).max(5),
  Enter_spouseSexe: z.coerce.number().int().min(0).max(1).optional(),
  Enter_spouseDateNaissance: dateMaskSchema.optional(),
  Enter_mariageDuree: z.union([z.literal(0), z.literal(1)]).optional(),
  Enter_menageCommun5Ans: z.boolean().optional(),
  Enter_partenaireDesigneLPP: z.boolean().optional(),

  /* -------- Enfants -------- */
  Enter_hasEnfants: z.boolean().optional(),
  Enter_enfants: z.array(Enter_EnfantSchema).optional(),

  /* -------- Activité / affiliation -------- */
  Enter_statutProfessionnel: z.coerce.number().int().min(0).max(2),
  Enter_travaillePlusde8HSemaine: z.boolean(),
  Enter_Affilie_LPP: z.boolean(),

  /* -------- Indemnités journalières (IJ) -------- */
  Enter_ijMaladie: z.boolean().optional(),
  Enter_ijMaladieTaux: z.coerce.number().min(10).max(100).optional(), // %
  Enter_ijAccident: z.boolean().optional(),
  Enter_ijAccidentTaux: z.coerce.number().min(0).max(100).optional(), // % (dérivé)

  /* -------- Carrière AVS -------- */
  Enter_ageDebutCotisationsAVS: z.coerce.number().int().positive(),
  Enter_anneeDebutCotisationAVS: z.coerce.number().int().optional(), // auto (transform)
  Enter_hasAnnesManquantesAVS: z.boolean().optional(),
  Enter_anneesManquantesAVS: z.array(z.coerce.number().int()).optional(),

  /* -------- Certificat LPP (rentes et salaires) -------- */
  Enter_salaireAnnuel: z.coerce.number().nonnegative(),
  Enter_salaireAssureLPP: z.coerce.number().nonnegative().optional(),
  Enter_renteInvaliditeLPP: z.coerce.number().nonnegative().optional(),
  Enter_renteEnfantInvaliditeLPP: z.coerce.number().nonnegative().optional(),
  Enter_renteOrphelinLPP: z.coerce.number().nonnegative().optional(),
  Enter_RenteConjointOuPartenaireLPP: z.union([z.literal(0), z.literal(1)]).optional(),
  Enter_renteConjointLPP: z.coerce.number().nonnegative().optional(),
  Enter_rentePartenaireLPP: z.coerce.number().nonnegative().optional(),

  /* -------- Capitaux décès -------- */
  Enter_CapitalAucuneRente: z.coerce.number().nonnegative().optional(),
  Enter_CapitalPlusRente: z.coerce.number().nonnegative().optional(),
  Enter_CapitalAucuneRenteMal: z.coerce.number().nonnegative().optional(),
  Enter_CapitalAucuneRenteAcc: z.coerce.number().nonnegative().optional(),
  Enter_CapitalPlusRenteMal: z.coerce.number().nonnegative().optional(),
  Enter_CapitalPlusRenteAcc: z.coerce.number().nonnegative().optional(),

  /* -------- Vieillesse -------- */
  Enter_rentevieillesseLPP65: z.coerce.number().nonnegative().optional(),

  /* -------- Métadonnées certificat LPP -------- */
  Enter_dateCertificatLPP: dateMaskSchema.optional(),
  Enter_avoirVieillesseObligatoire: z.coerce.number().nonnegative().optional(),
  Enter_avoirVieillesseTotal: z.coerce.number().nonnegative().optional(),
  Enter_librePassageObligatoire: z.coerce.number().nonnegative().optional(),
  Enter_librePassageTotal: z.coerce.number().nonnegative().optional(),
  Enter_prestationCapital65: z.coerce.number().nonnegative().optional(),
  Enter_rachatPossible: z.coerce.number().nonnegative().optional(),
  Enter_versementsAnticipesLogement: z.coerce.number().nonnegative().optional(),
  Enter_eplPossibleMax: z.coerce.number().nonnegative().optional(),
  Enter_miseEnGage: z.boolean().optional(),
})
.superRefine((data, ctx) => {
  const ETAT_MARIE = 1, ETAT_PARTENARIAT = 3, ETAT_CONCUBINAGE = 4;
  const STATUT_SALARIE = 0, STATUT_INDEP = 1;

  // --- Conjoint requis si Marié / Partenariat ---
  const isMarriedOrPartner = data.Enter_etatCivil === ETAT_MARIE || data.Enter_etatCivil === ETAT_PARTENARIAT;
  if (isMarriedOrPartner) {
    if (data.Enter_spouseSexe == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_spouseSexe"], message: "Champ requis" });
    }
    if (!data.Enter_spouseDateNaissance) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_spouseDateNaissance"], message: "Champ requis" });
    }
    if (data.Enter_mariageDuree == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_mariageDuree"], message: "Champ requis" });
    }
  }

  // --- Concubinage : ménage 5 ans + partenaire désigné (si LPP) ---
  if (data.Enter_etatCivil === ETAT_CONCUBINAGE) {
    if (data.Enter_menageCommun5Ans !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_menageCommun5Ans"], message: "Confirmer le ménage commun ≥ 5 ans" });
    }
    if (data.Enter_Affilie_LPP === true && data.Enter_partenaireDesigneLPP !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_partenaireDesigneLPP"], message: "Désignation partenaire LPP recommandée pour les droits survivants" });
    }
  }

  // --- Enfants : cohérence toggle / liste ---
  const hasKids = !!data.Enter_hasEnfants;
  const kids = (data.Enter_enfants ?? []).filter(e => e?.Enter_dateNaissance?.trim());
  if (hasKids && kids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_enfants"], message: "Ajouter au moins un enfant" });
  }
  if (!hasKids && kids.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_hasEnfants"], message: "Mettre 'Avez-vous des enfants ?' sur Oui" });
  }

  // --- LPP : Salarié ≥ seuil => Affiliation forcée ---
  if (data.Enter_statutProfessionnel === STATUT_SALARIE) {
    const seuil = (globalThis as any).__LEGAL__?.Legal_SeuilEntreeLPP ?? 22680;
    if ((data.Enter_salaireAnnuel ?? 0) >= seuil && data.Enter_Affilie_LPP !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_Affilie_LPP"], message: "Affiliation LPP obligatoire (≥ seuil d'entrée)" });
    }
  }

  // --- IJ : règles d'affichage/requis ---
  const isSalarie = data.Enter_statutProfessionnel === STATUT_SALARIE;
  const isIndep = data.Enter_statutProfessionnel === STATUT_INDEP;

  // IJ maladie visible salariés/indépendants
  if ((isSalarie || isIndep) && data.Enter_ijMaladie == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_ijMaladie"], message: "Indiquer si vous avez des IJ maladie" });
  }
  if ((isSalarie || isIndep) && data.Enter_ijMaladie === true && (data.Enter_ijMaladieTaux == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_ijMaladieTaux"], message: "Préciser le taux d'IJ maladie" });
  }

  // IJ accident visible pour indépendants si IJ maladie = true
  if (isIndep && data.Enter_ijMaladie === true && data.Enter_ijAccident == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_ijAccident"], message: "Préciser si l'accident est aussi couvert" });
  }

  // --- AVS : si hasAnnesManquantesAVS = true, exiger au moins une année ---
  if (data.Enter_hasAnnesManquantesAVS) {
    if (!data.Enter_anneesManquantesAVS || data.Enter_anneesManquantesAVS.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Enter_anneesManquantesAVS"], message: "Ajouter au moins une année manquante" });
    }
  }
})
.transform((data) => {
  // --- Dérivation Enter_ijAccidentTaux ---
  const STATUT_SALARIE = 0, STATUT_INDEP = 1;
  const isSalarie = data.Enter_statutProfessionnel === STATUT_SALARIE;
  const isIndep = data.Enter_statutProfessionnel === STATUT_INDEP;
  const legalAcc = Number((globalThis as any).__LEGAL__?.Legal_ijAccidentTaux ?? 80);
  let accTaux = Number(data.Enter_ijAccidentTaux ?? 0);
  if (isSalarie) {
    accTaux = Math.max(Number(data.Enter_ijMaladieTaux ?? 0), legalAcc);
  } else if (isIndep && data.Enter_ijMaladie === true) {
    accTaux = data.Enter_ijAccident ? Number(data.Enter_ijMaladieTaux ?? 0) : 0;
  }
  // --- Autofill année début AVS si absente ---
  try {
    if (!data.Enter_anneeDebutCotisationAVS && data.Enter_dateNaissance && data.Enter_ageDebutCotisationsAVS) {
      const m = data.Enter_dateNaissance.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (m) {
        const y = Number(m[3]);
        const startYear = y + Number(data.Enter_ageDebutCotisationsAVS);
        (data as any).Enter_anneeDebutCotisationAVS = startYear;
      }
    }
  } catch {}
  return { ...data, Enter_ijAccidentTaux: accTaux };
});

/* =========================================================
 * Schéma secondaire : Legal_Settings (Firestore admin)
 * =======================================================*/
export const Legal_SettingsSchema = z.object({
  /* ----- LAA ----- */
  Legal_SalaireAssureMaxLAA: z.coerce.number().positive(),
  Legal_MultiplicateurCapitalSiPasRenteLAA: z.coerce.number().positive(),
  Legal_ijAccidentTaux: z.coerce.number().positive(),

  /* ----- LPP ----- */
  Legal_DeductionCoordinationMinLPP: z.coerce.number().positive(),
  Legal_SeuilEntreeLPP: z.coerce.number().positive(),
  Legal_SalaireMaxLPP: z.coerce.number().positive(),
  Legal_SalaireAssureMaxLPP: z.coerce.number().positive(),
  Legal_SalaireAssureMinLPP: z.coerce.number().positive(),
  Legal_MultiplicateurCapitalSiPasRenteLPP: z.coerce.number().positive(),
  Legal_CotisationsMinLPP: z.record(z.string(), z.coerce.number().nonnegative()),

  /* ----- AVS/AI ----- */
  Legal_AgeRetraiteAVS: z.coerce.number().int().positive(),
  Legal_AgeLegalCotisationsAVS: z.coerce.number().int().positive(),

  /* ----- Échelle 44 ----- */
  Legal_Echelle44Version: z.string().optional(),
});

/* =========================================================
 * Types dérivés automatiques pour TS
 * =======================================================*/
export type ClientDataInput = z.infer<typeof ClientDataSchema>;
export type LegalSettingsInput = z.infer<typeof Legal_SettingsSchema>;
