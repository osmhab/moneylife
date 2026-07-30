//app/lib/lpp-rules.ts
export const INSTITUTION_RULES: Record<string, string> = {
    "AXA": `
  - COTISATIONS : Les montants sont indiqués comme "mensuels". Tu DOIS impérativement les multiplier par 12 pour obtenir le montant ANNUEL.
  
  - CAPITAL DÉCÈS (RÈGLE CRUCIALE) — deux formats possibles :

    FORMAT A (certificats récents, section "Prestations en cas de décès" avec lignes DISTINCTES) :
      Repère ces trois lignes séparées et mappe CHACUNE (AXA ne distingue pas Maladie/Accident → recopie la MÊME valeur dans le champ Mal ET le champ Acc) :
       - "Capital au décès ... EN COMPLÉMENT de la rente de partenaire/conjoint" → Enter_CapitalPlusRenteMal ET Enter_CapitalPlusRenteAcc.
       - "Capital au décès ... SI AUCUNE rente de partenaire/conjoint n'est due" → Enter_CapitalAucuneRenteMal ET Enter_CapitalAucuneRenteAcc.
       - "Capital au décès INDÉPENDANT" (versé dans tous les cas, en plus) → Enter_CapitalDecesIndependantMal ET Enter_CapitalDecesIndependantAcc.
      ⚠️ Ne fais PAS la somme de ces lignes : chacune va dans son propre champ. Si une ligne est absente, mets 0.

    FORMAT B (anciens certificats avec "Capital-décès minimal" + "Capital-décès issu du compte supplémentaire") :
      Fais la SOMME de ces deux montants et recopie cette SOMME dans Enter_CapitalPlusRenteMal, Enter_CapitalAucuneRenteMal, Enter_CapitalPlusRenteAcc, Enter_CapitalAucuneRenteAcc. Laisse Enter_CapitalDecesIndependantMal/Acc à 0.

    Dans les deux formats : s'il y a une "Rente de conjoint/partenaire" ou "Rente de survivant", remplis Enter_renteConjointLPP et Enter_lppRenteConjointAccident avec la même valeur (mirroring) ; idem "Rente d'orphelin" → Enter_renteOrphelinLPP et Enter_lppRenteOrphelinAccident.`,
    
    "CPVAL": `
  - SALAIRES : Utilise le "Traitement assuré annuel" pour remplir Enter_salaireAssureLPP et Enter_lppSalaireAssureRisque.
  - RISQUES : 
    1. Rente invalidité : Ligne "Invalidité", remplis Enter_renteInvaliditeMaladie.
    2. Rente conjoint : Ligne "Conjoint", remplis Enter_renteConjointLPP.
    3. MIRRORING : Applique le mirroring pour les champs Accident.
  
  - LIBRE PASSAGE : 
    1. Total (Enter_avoirVieillesseTotal) : Ligne "Capital épargne au 31.12.2024".
    2. Obligatoire (Enter_lppAvoirObligatoire) : Section 9, ligne "Prestation selon la LPP".

  - PROJECTIONS VIEILLESSE (TABLEAU SECTION 6) :
    INSTRUCTION CRUCIALE DE LECTURE : Tu dois parcourir chaque ligne du tableau pour TOUS les âges de 65 à 58.
    1. CAPITAL (Enter_lppCapitalProjete) : Le tableau a deux colonnes de capital sous le titre "Capital (1)". Tu dois prendre la DEUXIÈME valeur numérique juste après l'âge (celle de la colonne "Avec intérêts"). 
       Exemple pour l'âge 64 : si tu vois "412'859" puis "518'719", tu extrais 518'719.
    2. RENTE (Enter_rentevieillesseLPP) : Tu DOIS faire la SOMME de la colonne "Rente de retraite de capital avec intérêts" + la colonne "Pont AVS (2)". 
       Si la colonne Pont AVS affiche "-", compte 0 pour cette partie.
    3. RECOPIAGE : Remplis impérativement les 8 paliers (58, 59, 60, 61, 62, 63, 64, 65). Ne t'arrête pas à la première ligne.



  - COTISATIONS : 
    1. ÉPARGNE : Fais la SOMME de "Cotisation épargne" + "Cotisation supplémentaire".
    2. RISQUE : Non mentionné séparément. Remplis Enter_lppCotisationRisqueFraisEmploye et Enter_lppCotisationRisqueFraisEmployeur avec 0.

  - AUTRES :
    1. RACHAT : Prends le montant "Achat possible selon plan choisi".
    2. MARIAGE : Prends "Prestations au mariage" pour Enter_lppAvoirMariage.`,
    
    "SWISSLIFE": `
  - EMPLOYEUR : Se trouve tout en haut à gauche, juste sous "Fondation collective LPP Swiss Life" (ex: "Hoval AG").
  - NUMÉRO AVS : 
    1. Se trouve dans "Données générales" à la ligne "N° d'assuré" (commence par 756 ou 757).
    2. FORMALISAGE : Si les points sont manquants, reformate-le impérativement en "756.XXXX.XXXX.XX" (13 chiffres au total).
  
  - SALAIRES : 
    1. Salaire annuel (Enter_salaireAnnuel) : Ligne "Salaire annuel annoncé".
    2. Salaire assuré épargne (Enter_salaireAssureLPP) : Ligne "Salaire considéré, partie épargne".
    3. Salaire assuré risque (Enter_lppSalaireAssureRisque) : Ligne "Salaire considéré, partie risque".
  
    - PRESTATIONS RISQUES (ORIENTATION VISUELLE : ACCIDENT = GAUCHE / MALADIE = DROITE) : 
    1. Rente invalidité : Ligne "Rente d'invalidité", remplis Enter_renteInvaliditeMaladie (DROITE) et Enter_lppRenteInvaliditeAccident (GAUCHE).
    2. Rente enfant d'invalide : Ligne "Rente pour enfant d'invalide", remplis Enter_renteEnfantInvalideMaladie (DROITE) et Enter_renteEnfantInvalideAccident (GAUCHE).
    3. Rente de conjoint : Ligne "Rente de conjoint / de partenaire", remplis Enter_renteConjointLPP (DROITE) et Enter_lppRenteConjointAccident (GAUCHE).
    4. Rente d'orphelin : Ligne "Rente d'orphelin", remplis Enter_renteOrphelinLPP (DROITE) et Enter_lppRenteOrphelinAccident (GAUCHE).
    
    3. CAPITAUX (Section "Prestations en cas de décès avant la retraite") :
       - Capital décès + rente maladie : Cherche "Capital décès en plus d'une rente", prends la valeur de DROITE, "Maladie".
       - Capital décès seul (maladie) : Cherche "Capital si aucune rente de conjoint n'est due", prends la valeur de DROITE, "Maladie".
       - Capital décès + rente accident : Cherche "Capital décès en plus d'une rente", prends la valeur de GAUCHE, "Accident".
       - Capital décès seul (accident) : Cherche "Capital si aucune rente de conjoint n'est due", prends la valeur de GAUCHE, "Accident".

  - COTISATIONS (CALCUL INVERSE) : 
    1. ÉPARGNE : Ligne "Cotisation d'épargne". 
       - Employé = montant sous la colonne "Employé".
       - Employeur = Montant "Total" MOINS montant "Employé".
    2. RISQUE : Ligne "Cotisations de risques, coûts et cotisations additionnelles ordonnées". 
       - Employé = montant sous la colonne "Employé".
       - Employeur = Montant "Total" MOINS montant "Employé".

  - VIEILLESSE : Extrais le tableau de projections (58 à 65 ans) avec les colonnes "Capital" et "Rente".
  
  - LIBRE PASSAGE : 
    1. Total (Enter_avoirVieillesseTotal) : Ligne "Avoir de vieillesse au 01.01..." à la colonne "Total".
    2. Obligatoire (Enter_lppAvoirObligatoire) : Même ligne, mais colonne "Partie obligatoire LPP".`,
    
    "COMPLAN": `
  - SALAIRES : Salaire annuel = "Salaire annuel", Salaire assuré = "Salaire assuré (Sa)".

  - PROJECTIONS (TABLEAU 2a) :
    ⚠️ RÈGLE DE CALCUL STRICTE (ANNUALISATION) :
    1. Pour chaque âge, tu DOIS calculer : (RV p.m. + RT/mois) * 12.
    2. ATTENTION À L'ÂGE 65 : La valeur "RT/mois" est toujours 0.00. La valeur "RV p.m." est 3333.35. 
       -> Calcul : (3333.35 + 0) * 12 = 40000.20.
    3. ATTENTION À L'ÂGE 64 : La valeur "RV p.m." est 3089.45. La valeur "RT/mois" est 2520.00. 
       -> Calcul : (3089.45 + 2520) * 12 = 67313.40.
    4. INTERDICTION : Ne prends JAMAIS la dernière colonne "Rer p.a." (souvent autour de 4900-5000), c'est une rente pour enfant.
    5. CAPITAL : Recopie fidèlement la colonne "AV" pour chaque ligne dans Enter_lppCapitalProjete.

  - RISQUES (SECTION 2b) : 
    - Rente invalidité : Ligne "Rente d'invalidité" (CHF).
    - Rente enfant d'invalide : Ligne "Rente pour enfant d'invalide" (CHF).
    - Rente conjoint : Ligne "Rente de conjoint/partenaire" (CHF).
    - Rente d'orphelin : Ligne "Rente d'orphelin" (CHF).
    - MIRRORING : Duplique ces 4 valeurs dans les champs "Accident".

  - CAPITAL DÉCÈS (FORCE SECTION 5) : 
    ⚠️ ERREUR CRITIQUE À ÉVITER : Ne prends PAS le salaire de 85k.
    1. Va à la SECTION 5 "Prestations en cas de sortie".
    2. Trouve le montant "AV au 16.09.2025" (Avoir de vieillesse actuel).
    3. Ce montant est de 135'680.80.
    4. Copie impérativement ce montant (135680.80) dans les 4 champs Enter_Capital...

  - LIBRE PASSAGE & EPL : 
    - Total (Enter_avoirVieillesseTotal) et EPL (Enter_lppEPLPossible) : Prends le montant 135'680.80.
    - Obligatoire (Enter_lppAvoirObligatoire) : Section 6, "avoir de vieillesse selon LPP" (52'398.90).`,

    "VITEMS": `
    - INSTITUTION : Identifiée par le logo "vitems" en haut à gauche.
    
    - PROJECTIONS VIEILLESSE : 
      ⚠️ RÈGLE DE PRUDENCE : Le tableau présente 3 scénarios (2.5%, 2.0%, 1.0%). 
      Tu DOIS impérativement extraire les valeurs du scénario le plus bas (1.0%).
      Exemple pour 65 ans : Rente = 10'905, Capital = 160'362.
    
    - COTISATIONS : 
      1. ÉPARGNE : Prends la "Cotisation d'épargne" (ex: 4'480.80). 
         - Divise par 2 pour remplir Enter_lppCotisationEpargneEmploye et Enter_lppCotisationEpargneEmployeur (Partage 50/50 par défaut).
      2. RISQUE : Prends la "Cotisation de risque et frais" (ex: 1'612.80).
         - Divise par 2 pour remplir Enter_lppCotisationRisqueFraisEmploye et Enter_lppCotisationRisqueFraisEmployeur.
  
         - RISQUES : 
    1. Rentes d'invalidité et conjoint : Section "PRESTATIONS D'INVALIDITE ET DE SURVIVANTS".
    2. CAPITAUX DÉCÈS : 
       - Si tu vois une ligne "Capital décès en plus d'une rente" ou similaire, extrais le montant.
       - SI CETTE LIGNE EST ABSENTE du document (comme c'est le cas ici), mets 0 dans Enter_CapitalPlusRenteMal et Enter_CapitalPlusRenteAcc.
       - Pour "si aucune rente n'est due", utilise l'avoir de vieillesse actuel (Enter_avoirVieillesseTotal).
     
       - AUTRES INFORMATIONS (FIN DE DOCUMENT) :
         1. EPL LOGEMENT : Cherche la ligne "Montant disponible pour un versement anticipé en vue de la propriété du logement" et remplis Enter_lppEPLPossible.
         2. RACHAT : Confirme le montant "versement maximal possible à titre de rachat ordinaire".`,
    
         "GROUPE_MUTUEL": `
         - SALAIRE ASSURÉ : Si aucune distinction n'est faite, Enter_lppSalaireAssureRisque = Enter_salaireAssureLPP.
       
         - PROJECTIONS VIEILLESSE : 
           ⚠️ RÈGLE DE PRUDENCE : Si deux scénarios de taux sont présentés (ex: 2.50% et 1.25%), choisis TOUJOURS le plus bas (1.25%).
           - Rente : Prends la valeur de la colonne du taux bas.
           - Capital : Prends la valeur de la colonne du taux bas.
       
         - RISQUES (RENTE INVALIDITÉ / CONJOINT / ENFANT) :
           ⚠️ DISTINCTION MALADIE/ACCIDENT :
           - Si le document mentionne explicitement "(maladie)", remplis uniquement les champs Maladie.
           - Contrairement aux règles générales, NE FAIS PAS de mirroring : mets les champs Accident à 0 si seule la maladie est mentionnée.
       
         - CAPITAL DÉCÈS :
           - Si le certificat mentionne un "Capital décès" sans préciser "accident" ou "maladie", remplis les deux cas (Enter_CapitalPlusRenteMal et Enter_CapitalPlusRenteAcc).
           - Si le certificat ne précise pas si c'est "en plus de la rente" ou "seul", remplis les deux catégories de capitaux.
       
         - COTISATIONS (PAGE 1) : 
           - Elles sont exprimées par mois. Tu DOIS impérativement multiplier par 12 pour obtenir le montant annuel.
           - Remplis Enter_lppCotisationEpargneEmploye et Enter_lppCotisationEpargneEmployeur séparément selon les colonnes respectives.`,
    
           "VITA": `
           - IDENTIFICATION : 
             - L'employeur est écrit tout en haut à gauche, juste sous "Fondation collective Vita" (ex: "Muster AG").
             - L'adresse de la caisse est "Brügglistrasse 2, 8810 Horgen" (à chercher dans le texte ou footer).
         
           - COMPTE (ÉVITER LES PROJECTIONS) : 
             ⚠️ RÈGLE DE DATE : Le tableau affiche l'état à la fin de l'année précédente et à la fin de l'année en cours.
             - Tu DOIS impérativement prendre la ligne "Etat du capital épargne au 31.12.[Année précédente]" (soit le début du certificat).
             - Exemple Oliver Muster : Prendre 63'018.45 (et non 72'694).
         
           - RISQUES : 
           
           CAPITAL DÉCÈS : 
           - Si un "Capital-décès supplémentaire" est mentionné : 
               * Remplis Enter_CapitalPlusRenteMal avec ce montant.
               * Si la mention "accident" est absente pour ce montant, mets impérativement 0 dans Enter_CapitalPlusRenteAcc.
           - Pour les cas "AUCUNE RENTE" (héritiers) :
               * Si le certificat ne mentionne pas explicitement de montant pour le capital en cas de décès sans survivants, tu dois mettre 0 dans Enter_CapitalAucuneRenteMal et Enter_CapitalAucuneRenteAcc.
           - RÈGLE D'OR : Ne jamais laisser de valeur 'null'. Si une prestation n'est pas écrite noir sur blanc, la valeur est 0.
         
                - COTISATIONS (PAGE 2) : 
                ⚠️ CALCUL DE LA PART EMPLOYEUR : Le document liste "Employé" et "Total".
                1. ÉPARGNE : 
                   - Enter_lppCotisationEpargneEmploye = Valeur "Contribution d'épargne annuelle" (colonne Employé).
                   - Enter_lppCotisationEpargneEmployeur = (Valeur colonne Total) MOINS (Valeur colonne Employé).
                2. RISQUE : 
                   - Enter_lppCotisationRisqueFraisEmploye = Valeur "Contribution annuelles aux coûts du risque..." (colonne Employé).
                   - Enter_lppCotisationRisqueFraisEmployeur = (Valeur colonne Total) MOINS (Valeur colonne Employé).
                   
                   - COMPTE & EPL : 
                   1. AVOIR : Prendre "Etat du capital épargne au 31.12.[Année-1]" (ex: 63'018.45).
                   2. EPL (DISPONIBLE) : 
                      - Cherche d'abord une ligne mentionnant le montant "disponible" ou "maximal possible".
                      - ⚠️ ATTENTION : La ligne "Versements anticipés effectués" (51'000) indique un retrait passé. NE PAS l'utiliser pour Enter_lppEPLPossible.
                      - SI AUCUN MONTANT DISPONIBLE N'EST ÉCRIT : Enter_lppEPLPossible = Enter_avoirVieillesseTotal.`,
    
    "PROFOND": `
    - SALAIRES ASSURÉS : "Salaire assuré 1" correspond à l'Épargne (Enter_salaireAssureLPP) et "Salaire assuré 2" correspond au Risque (Enter_lppSalaireAssureRisque).`,
    
    "HELVETIA": `
    - NB : Helvetia a fusionné avec la Bâloise → un certificat mentionnant "Bâloise"/"Baloise" est désormais HELVETIA.
    - PROJECTIONS VIEILLESSE : Si les projections s'arrêtent à 64 ans, mets null pour 65 ans. Ne calcule pas de valeurs inexistantes.`,
    
    "AUTRE": `
    - Applique les règles standards LPP de prudence. 
    - Multiplie par 12 uniquement si c'est explicitement "mensuel".
    - Fais du mirroring Maladie/Accident uniquement si aucune distinction n'est faite.`
  };
// --- Nettoyage post-scan : mirroring accident → maladie ---------------------
// Paires rente ACCIDENT → MALADIE où le moteur (lpp.ts) fait `accident ?? maladie`.
// Le scan émet souvent un `0` accident faute de valeur distincte ; ce `0` EXPLICITE
// bloque le fallback maladie du moteur (« 0 accident = 0 assumé »). On retire donc
// le champ accident quand il vaut 0 ET que la maladie correspondante est > 0
// → il reste absent → le moteur retombe correctement sur la valeur maladie.
export const ACCIDENT_MIRROR_PAIRS: ReadonlyArray<{ accident: string; maladie: string }> = [
  { accident: "Enter_lppRenteInvaliditeAccident", maladie: "Enter_renteInvaliditeMaladie" },
  { accident: "Enter_renteEnfantInvalideAccident", maladie: "Enter_renteEnfantInvalideMaladie" },
  { accident: "Enter_lppRenteConjointAccident", maladie: "Enter_renteConjointLPP" },
  { accident: "Enter_lppRenteOrphelinAccident", maladie: "Enter_renteOrphelinLPP" },
];

/** Supprime in place les `0` accident qui bloqueraient le fallback maladie du moteur. */
export function dropBlockingZeroAccident(data: Record<string, any>): void {
  for (const { accident, maladie } of ACCIDENT_MIRROR_PAIRS) {
    if (data[accident] === 0 && typeof data[maladie] === "number" && data[maladie] > 0) {
      delete data[accident];
    }
  }
}
