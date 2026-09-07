// app/lib/server/promptReglement.ts
//
// LE PROMPT D'ANALYSE D'UN RÈGLEMENT — source unique.
//
// Extrait de la route parce que trois portes d'entrée l'utilisent désormais
// (client, back-office, veille) et que le banc d'essai le note tel quel. Deux
// copies divergentes signifieraient qu'on mesure autre chose que ce qui tourne.

import { MULTILINGUAL_PREAMBLE } from "app/lib/core/multilingual";

/**
 * VERSION DU SCHÉMA D'EXTRACTION — à incrémenter à chaque champ ajouté.
 *
 * Un règlement analysé sous une version antérieure est INCOMPLET : les champs
 * récents y sont absents. Or le dédoublonnage refuse de réanalyser un document
 * qui n'est pas plus récent — la bibliothèque resterait donc figée sur l'ancien
 * schéma, et les règles nouvellement extraites ne s'appliqueraient jamais aux
 * caisses déjà connues.
 *
 * Constaté en production : après l'ajout de la surindemnisation et du retrait en
 * capital, le règlement AXA déjà en bibliothèque ne portait ni l'un ni l'autre,
 * et aucun scan ne pouvait le corriger.
 *
 * 1 · règles de base   2 · durée de vie commune, dispense enfants
 * 3 · retrait en capital, blocage après rachat, surindemnisation
 */
export const VERSION_EXTRACTION = 3;

export const PROMPT_REGLEMENT = `${MULTILINGUAL_PREAMBLE}

Tu analyses le RÈGLEMENT DE PRÉVOYANCE d'une caisse de pension suisse (2e pilier).

Ce document est LA RÈGLE DU JEU : il dit COMMENT les prestations sont dues.
Un certificat de prévoyance donne des MONTANTS ; le règlement dit OÙ et QUAND ils
s'appliquent. Le certificat lui-même le rappelle : « en cas de divergences, c'est
le règlement qui fait foi ».

STRUCTURE À RESPECTER
Un règlement a une PARTIE GÉNÉRALE (articles numérotés) et souvent des ANNEXES par
plan. Une annexe SURCHARGE la partie générale pour les assurés qu'elle vise et
renvoie au règlement général pour le reste. Rends les DEUX niveaux SÉPARÉMENT,
jamais fusionnés : un bloc d'annexe ne contient QUE ce que l'annexe surcharge, le
reste à null.

RÈGLE ABSOLUE : n'invente RIEN. Pour chaque règle, cite la phrase EXACTE du
document ("citation") et son article ("article"). Si une règle n'est pas dans le
document, mets null partout. Une règle inventée fausse la prévoyance d'une
personne réelle : l'absence est toujours préférable à l'approximation.

POINT LE PLUS IMPORTANT — LE CAPITAL DÉCÈS
Le même montant peut être dû dans des cas très différents. Distingue :
- "TOUJOURS" : versé qu'il y ait ou non une rente de partenaire/conjoint
- "SI_AUCUNE_RENTE_PARTENAIRE" : versé UNIQUEMENT si aucune rente n'est échue
- "REDUIT_DU_FINANCEMENT_RENTE" : versé sous déduction du financement de la rente
- "NON_PREVU" : le règlement ne prévoit pas de capital décès
Attention : l'article qui fixe le MONTANT et celui qui pose la CONDITION sont
souvent distincts. Lis les deux avant de conclure.

LE RETRAIT EN CAPITAL À LA RETRAITE
N'extrais AUCUN montant ni taux de conversion : les chiffres viennent du
certificat de l'assuré, qui fait foi. Ce que le règlement seul indique, c'est la
PART de l'avoir qui peut être perçue en CAPITAL plutôt qu'en rente.

"partMaxPct" : ce plafond, en pourcents (25, 50, 100). Beaucoup de caisses
limitent à 25 % ou 50 % ; certaines autorisent la totalité. Si le règlement
n'énonce aucune limite mais permet explicitement le capital intégral, mets 100.
S'il ne dit rien du tout, mets null — ne suppose pas.
"delaiAnnonceMois" : le préavis exigé avant la retraite (souvent 36 mois).
"consentementConjoint" : true si l'accord écrit du conjoint est requis.
"anticipationDesAge" : l'âge minimal d'une retraite anticipée.
"blocageApresRachatAns" : le nombre d'années pendant lesquelles un RACHAT
interdit de percevoir les prestations correspondantes en capital (art. 79b LPP,
généralement 3). Cette règle change un conseil : elle doit être connue AVANT le
rachat, pas découverte au moment de la retraite.

Ce plafond décide de ce qu'un client peut réellement planifier : le déclarer à
100 % dans une caisse qui limite à 25 % l'amènerait à bâtir un projet sur un
capital qu'il n'obtiendra jamais.

LA SURINDEMNISATION
Presque tout règlement prévoit de RÉDUIRE ses rentes d'invalidité et de
survivants lorsque, cumulées avec l'AI, la LAA et les autres revenus de
remplacement, elles dépassent un pourcentage du gain que l'assuré aurait perçu
sans le sinistre. Cherche l'article intitulé « concours de prestations »,
« surindemnisation » ou « avantage injustifié ».
"plafondPct" : ce pourcentage (90 le plus souvent, parfois 100).
"concerneInvalidite" / "concerneSurvivants" : le texte vise-t-il les deux ?
Souvent oui — ne suppose pas que seule l'invalidité est concernée.
Si le règlement est muet, mets null : appliquer un plafond supposé retrancherait
à un client une rente qu'il touchera peut-être en entier.

NE CONFONDS JAMAIS deux capitaux voisins :
- "capitalDeces" = le capital décès PRINCIPAL, en règle générale égal au capital
  de prévoyance ou à l'avoir de vieillesse ;
- "capitalDecesSupplementaire" = un capital EN SUS, typiquement exprimé en % du
  salaire assuré, souvent réservé aux enfants ou barémé par âge.
Un article intitulé « capital décès supplémentaire » ne va JAMAIS dans
"capitalDeces", même si c'est le seul capital que l'annexe mentionne. Cherche
d'abord l'article du capital principal ; s'il n'existe pas dans l'annexe, laisse
"capitalDeces" à null — la partie générale s'appliquera. Se tromper de case fait
refuser à un assuré un capital qui lui est dû.

LE PARTENAIRE NON MARIÉ
"dureeViecommuneAns" = le nombre d'années de MÉNAGE COMMUN exigées d'un
partenaire non marié pour avoir droit à la rente (souvent 2 ou 5). N'y mets
RIEN d'autre : un règlement est plein de durées qui n'ont aucun rapport — une
différence d'âge (« plus de 20 ans plus jeune que l'assuré »), un délai de
carence, une durée de mariage. Si aucune durée de ménage commun n'est exigée
ou si elle n'est pas indiquée, mets null. Une valeur erronée ici supprime la
rente de survivant d'un couple qui y a droit.
"enfantsCommunsRemplacentDuree" = true si le règlement dispense de cette durée
lorsque le partenaire subvient à l'entretien d'enfants communs (formulation
typique : « … d'au moins cinq ans OU le partenaire doit subvenir à l'entretien
d'un ou plusieurs enfants communs »). Ce « ou » est décisif : l'ignorer refuse
la rente à un couple récent avec enfants.

N'INVENTE PAS D'ANNEXE
Beaucoup de règlements n'en comportent aucune : les montants sont alors renvoyés
à un « plan de prévoyance » distinct, et les variantes de couverture (« de
base », « élargie ») ne sont PAS des annexes. Dans ce cas, "annexes" doit être
un tableau VIDE. Une annexe inventée fait appliquer à un assuré des règles qui
ne le concernent pas.

NOMMER LES ANNEXES
"nom" doit être le NOM DU PLAN tel qu'il est imprimé dans l'annexe — par exemple
"Plan ex-PAT BVG", "Plans cadres" — et JAMAIS le numéro seul ("Annexe n° 8").
C'est par ce nom qu'un assuré est rattaché à son annexe : un numéro ne
correspond à rien sur son certificat, et le rattachement échouerait en silence.
Mets le numéro dans "numero", et dans "sappliqueA" la population visée, reprise
du texte.

Réponds en JSON strict :
{
 "caisse": {"nom":string,"enVigueurAu":string|null,"langue":string|null},
 "plansDetectes": [string],
 "general": BLOC,
 "annexes": [{"nom":string,"numero":string|null,"sappliqueA":string,"surcharges":BLOC}]
}
BLOC = {
 "retraitCapital": {"partMaxPct":number|null,"delaiAnnonceMois":number|null,
   "consentementConjoint":boolean|null,"anticipationDesAge":number|null,
   "blocageApresRachatAns":number|null,
   "article":string|null,"citation":string|null},
 "surindemnisation": {"plafondPct":number|null,"concerneInvalidite":boolean|null,
   "concerneSurvivants":boolean|null,"article":string|null,"citation":string|null},
 "capitalDeces": {"verse":"TOUJOURS"|"SI_AUCUNE_RENTE_PARTENAIRE"|"REDUIT_DU_FINANCEMENT_RENTE"|"NON_PREVU"|null,
   "base":string|null,"limiteHeritiersLegaux":number|null,
   "avantRetraiteUniquement":boolean|null,"article":string|null,"citation":string|null},
 "capitalDecesSupplementaire": {"pourcentageSalaire":number|null,"conditions":string|null,"article":string|null,"citation":string|null},
 "rentePartenaire": {"pourcentage":number|null,"base":string|null,"dureeViecommuneAns":number|null,"enfantsCommunsRemplacentDuree":boolean|null,"conditions":string|null,"article":string|null,"citation":string|null},
 "renteInvalidite": {"pourcentage":number|null,"base":string|null,"conditions":string|null,"article":string|null,"citation":string|null},
 "renteOrphelin": {"pourcentage":number|null,"base":string|null,"conditions":string|null,"article":string|null,"citation":string|null}
}`;

/** Bloc vide : une clé absente de la réponse ne doit pas faire tomber la route. */
export const BLOC_VIDE = {
  retraitCapital: null,
  surindemnisation: null,
  capitalDeces: null, capitalDecesSupplementaire: null,
  rentePartenaire: null, renteInvalidite: null, renteOrphelin: null,
};
