// app/lib/core/multilingual.ts
//
// Source UNIQUE de robustesse linguistique pour l'extraction IA (Gemini).
//
// Les documents suisses de prévoyance arrivent en FR / DE / IT (parfois EN pour
// des expatriés) : un certificat LPP en Suisse alémanique est quasi toujours en
// allemand, au Tessin en italien. Gemini LIT ces langues sans problème, mais nos
// prompts d'extraction ancrent la logique fine (choix de colonne, conversion ×12,
// distinction capital/projection…) sur des LIBELLÉS FRANÇAIS. Sans équivalents,
// l'extraction dégrade en silence sur un document non francophone (champs nuls ou
// mal mappés).
//
// Ce module donne, en un seul endroit, l'instruction « lis toutes les langues »
// + les équivalences de libellés FR/DE/IT/EN. On l'injecte dans TOUS les prompts
// actifs (LPP cert, police assurance 3a/3b, relevé bancaire 3a). Le JSON de
// sortie reste toujours en français.

/** Préambule commun : le document peut être dans n'importe quelle langue nationale. */
export const MULTILINGUAL_PREAMBLE = `
🌍 LANGUE DU DOCUMENT — RÈGLE ABSOLUE :
Le document peut être rédigé en FRANÇAIS, ALLEMAND, ITALIEN ou ANGLAIS (les
certificats et polices suisses varient selon le canton et l'assureur : alémanique
= allemand, Tessin = italien, expatriés = anglais). Lis-le intégralement et extrais
TOUJOURS les mêmes champs, quelle que soit la langue source. Ne renvoie JAMAIS un
champ vide au seul motif que le libellé n'est pas en français : reconnais les
synonymes ci-dessous dans les 4 langues. Le JSON de sortie et ses valeurs
textuelles (types de document, tags, mots-clés) restent en FRANÇAIS.
`.trim();

/** Glossaire des libellés d'un CERTIFICAT LPP (2e pilier), FR / DE / IT / EN. */
export const MULTILINGUAL_LPP_GLOSSARY = `
ÉQUIVALENCES DE LIBELLÉS LPP (FR / DE / IT / EN) — traite-les comme identiques :
- Caisse de pension : Pensionskasse, Vorsorgeeinrichtung / Cassa pensioni / Pension fund
- Salaire déterminant / annoncé : gemeldeter Lohn, AHV-Lohn, Jahreslohn / salario annuo notificato / reported (annual) salary
- Salaire assuré : versicherter Lohn / salario assicurato / insured salary
- Déduction de coordination : Koordinationsabzug / deduzione di coordinamento / coordination deduction
- Taux d'occupation : Beschäftigungsgrad / grado di occupazione / employment rate
- Avoir de vieillesse : Altersguthaben, Sparguthaben / avere di vecchiaia / retirement (savings) capital
- Avoir de vieillesse selon LPP : Altersguthaben nach BVG, "davon nach BVG" / avere di vecchiaia secondo LPP / BVG retirement capital
- Rente de vieillesse : Altersrente / rendita di vecchiaia / retirement pension
- Rente d'invalidité : Invalidenrente, Erwerbsunfähigkeitsrente / rendita d'invalidità / disability pension
- Rente d'enfant d'invalide : Invaliden-Kinderrente / rendita per figli d'invalido / disabled person's child pension
- Rente de conjoint / veuve / partenaire : Ehegattenrente, Witwen-/Witwerrente, Partnerrente / rendita per coniuge/vedova/partner / spouse's/widow's/partner's pension
- Rente d'orphelin : Waisenrente / rendita per orfano / orphan's pension
- Capital décès : Todesfallkapital, Todesfallleistung / capitale in caso di decesso / death benefit capital
- Prestation de libre passage : Freizügigkeitsleistung, Austrittsleistung / prestazione di libero passaggio / vested benefits
- Rachat possible : möglicher Einkauf, Einkaufspotenzial, mögliche Einkaufssumme / riscatto possibile / possible buy-in
- Versement anticipé EPL : Vorbezug WEF, WEF-Vorbezug / prelievo anticipato PPA (abitazione) / advance withdrawal for home ownership
- Mise en gage : Verpfändung / costituzione in pegno / pledging
Périodicité : si un montant de rente est indiqué MENSUEL (monatlich, pro Monat /
al mese, mensile / per month, monthly), CONVERTIS-le en annuel (×12).
Les règles par institution ci-dessus sont écrites avec des libellés FRANÇAIS :
applique la même logique quand le certificat les présente en allemand/italien/anglais
en t'appuyant sur ces équivalences.
`.trim();

/** Glossaire des libellés d'une POLICE d'assurance vie 3a/3b, FR / DE / IT / EN. */
export const MULTILINGUAL_INSURANCE_GLOSSARY = `
ÉQUIVALENCES DE LIBELLÉS ASSURANCE (FR / DE / IT / EN) — traite-les comme identiques :
- Début de l'assurance : Versicherungsbeginn, "gültig ab", Beginn / inizio dell'assicurazione, "valido dal" / policy start, "valid from"
- Échéance / fin du contrat : Ablauf, Vertragsende, Ablaufdatum, "läuft bis" / scadenza, fine del contratto, "fino al" / maturity, expiry, "until"
- Prime (totale) : Prämie, Gesamtprämie / premio (totale) / premium
- Prime d'épargne : Sparprämie, Sparanteil / premio di risparmio / savings premium
- Valeur de rachat : Rückkaufswert / valore di riscatto / surrender value
- Capital décès : Todesfallkapital, Todesfallleistung, garantiertes Kapital / capitale in caso di decesso / death benefit
- Rente d'invalidité : Erwerbsunfähigkeitsrente, Invalidenrente / rendita d'invalidità / disability pension
- Capital projeté à l'échéance : Ablaufleistung, prognostiziertes/voraussichtliches Kapital, Kapital bei Ablauf / capitale proiettato a scadenza / projected maturity capital
- Par mois / par an : monatlich / jährlich · al mese / all'anno · monthly / yearly
`.trim();

/** Glossaire des libellés d'un relevé/attestation de compte 3a BANCAIRE, FR / DE / IT / EN. */
export const MULTILINGUAL_BANK_GLOSSARY = `
ÉQUIVALENCES DE LIBELLÉS COMPTE 3a (FR / DE / IT / EN) — traite-les comme identiques :
- Avoir / solde du compte 3a : Guthaben, Kontostand, 3a-Guthaben, Vorsorgeguthaben / saldo, averi 3a / balance, 3a assets
- Versements annuels : jährliche Einzahlungen, Beiträge, Einzahlungen / versamenti annui, contributi / annual contributions/deposits
- Investi en titres : in Wertschriften angelegt, Wertschriftenlösung, Anlagelösung / investito in titoli / invested in securities
`.trim();
