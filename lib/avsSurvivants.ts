// lib/avsSurvivants.ts
type ClientFacts = {
  etatCivil: "marie" | "celibataire" | "divorce" | "veuf";
  remarried?: boolean;
  hasChild?: boolean;
  hasChildUnder18?: boolean;
  inTraining?: boolean; // pour l’enfant en formation (si besoin d’un check enfant)
  youngestChildAge?: number; // années
  ageAtWidowhood?: number;
  ageAtDivorce?: number;
  marriageYears?: number;
  divorceMarriageYears?: number;
  childAge?: number; // pour orphelin: âge de l’enfant
  childAnnualIncome?: number; // en formation
};

type Rule = { cond: string; value: any; and?: Rule };
type SurvivantsConfig = {
  avs_survivants: {
    eligibility: {
      veuve: { mariee: Rule[]; divorcee: Rule[]; extinction: Rule[] };
      veuf: { marie: Rule[]; divorce: Rule[]; extinction: Rule[]; cedh_2022_note?: boolean };
      orphelin: { base: Rule[]; income_limit_training: number };
    };
    amounts_monthly: {
      widow_widower_min: number; widow_widower_max: number;
      orphan_min: number; orphan_max: number; orphan_combo_cap: number;
    };
    notes: { couple_cap_pct: number };
  };
};

function testRule(rule: Rule, f: ClientFacts): boolean {
  const ok = (() => {
    switch (rule.cond) {
      case "has_child": return !!f.hasChild === !!rule.value;
      case "has_child_under_18": return !!f.hasChildUnder18 === !!rule.value;
      case "age_at_widowhood_gte": return (f.ageAtWidowhood ?? -1) >= rule.value;
      case "marriage_years_gte": return (f.marriageYears ?? 0) >= rule.value;
      case "divorce_marriage_years_gte": return (f.divorceMarriageYears ?? 0) >= rule.value;
      case "age_at_divorce_gte": return (f.ageAtDivorce ?? -1) >= rule.value;
      case "youngest_child_age_lt_at_mother_45":
        // interprétation: au 45e anniv de la mère, le cadet était < 18 (true/false piloté par value)
        // Ici on prend comme approximation: youngestChildAge < 18 && ageAtDivorce >=45
        return (f.ageAtDivorce ?? -1) >= 45 && (f.youngestChildAge ?? 99) < rule.value;
      case "remarried": return !!f.remarried === !!rule.value;
      case "child_age_lt": return (f.childAge ?? 99) < rule.value;
      case "in_training_and_age_lte": return !!f.inTraining && (f.childAge ?? 0) <= rule.value;
      default: return false;
    }
  })();
  return ok && (rule.and ? testRule(rule.and, f) : true);
}

export function avsEligibility(cfg: SurvivantsConfig, facts: ClientFacts) {
  const el = cfg.avs_survivants.eligibility;

  const veuveEligible =
    (facts.etatCivil === "marie" && el.veuve.mariee.some(r => testRule(r, facts))) ||
    (facts.etatCivil === "divorce" && el.veuve.divorcee.some(r => testRule(r, facts)));

  const veufEligible =
    (facts.etatCivil === "marie" && el.veuf.marie.some(r => testRule(r, facts))) ||
    (facts.etatCivil === "divorce" && el.veuf.divorce.some(r => testRule(r, facts)));

  const veuveExtinct = el.veuve.extinction.some(r => testRule(r, facts));
  const veufExtinct = el.veuf.extinction.some(r => testRule(r, facts));

  // Orphelin: on évalue par enfant ; ici, exemple pour un enfant
  const orphelinBase = el.orphelin.base.some(r => testRule(r, facts));
  const orphelinIncomeOK = !(facts.inTraining && (facts.childAnnualIncome ?? 0) > el.orphelin.income_limit_training);
  const orphelinEligible = orphelinBase && orphelinIncomeOK;

  return {
    veuve: veuveEligible && !veuveExtinct,
    veuf: veufEligible && !veufExtinct,
    orphelin: orphelinEligible
  };
}
