//app/lib/core/enums.ts
/* =========================================================
 * MoneyLife — Enums & libellés i18n
 * Fichier : /lib/core/enums.ts
 * ---------------------------------------------------------
 * Ces valeurs sont indexées (0,1,2...) dans Firestore.
 * Elles sont converties en texte via i18n côté front.
 * =======================================================*/

/**
 * État civil — correspondances d’index ↔ texte
 * Les valeurs stockées sont des nombres (Enter_EtatCivil)
 */
export const ENUM_EtatCivil = {
  0: "Célibataire",
  1: "Marié·e",
  2: "Divorcé·e",
  3: "Partenariat enregistré",
  4: "Concubinage",
  5: "Veuf·ve",
} as const;

export type EtatCivilKey = keyof typeof ENUM_EtatCivil;

/**
 * Sexe — correspondances d’index ↔ texte
 */
export const ENUM_Sexe = {
  0: "Masculin",
  1: "Féminin",
} as const;

export type SexeKey = keyof typeof ENUM_Sexe;

/**
 * Statut professionnel — correspondances d’index ↔ texte
 */
export const ENUM_StatutProfessionnel = {
  0: "Salarié",
  1: "Indépendant",
  2: "Sans activité lucrative",
} as const;

export type StatutProfessionnelKey = keyof typeof ENUM_StatutProfessionnel;

/* =========================================================
 * Helpers — fonctions utilitaires pour conversion
 * =======================================================*/

/**
 * Retourne le libellé i18n à partir de l’index.
 * Exemple : getEnumLabel(ENUM_EtatCivil, 1) → "Marié·e"
 */
export function getEnumLabel(
  enumObj: Record<number, string>,
  value?: number | null
): string {
  if (value == null) return "";
  const res = enumObj[value];
  return typeof res === "string" ? res : "";
}

/**
 * Inverse un enum {0:'A',1:'B'} → {'A':0,'B':1}
 * (utile pour pré-remplir des Select / Radio)
 */
export function invertEnum<T extends Record<number, string>>(enumObj: T) {
  const inverted: Record<string, number> = {};
  for (const [key, val] of Object.entries(enumObj)) {
    inverted[val] = Number(key);
  }
  return inverted;
}
