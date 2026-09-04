// app/lib/server/promptReglement.ts
//
// LE PROMPT D'ANALYSE D'UN RÈGLEMENT — source unique.
//
// Extrait de la route parce que trois portes d'entrée l'utilisent désormais
// (client, back-office, veille) et que le banc d'essai le note tel quel. Deux
// copies divergentes signifieraient qu'on mesure autre chose que ce qui tourne.

import { MULTILINGUAL_PREAMBLE } from "app/lib/core/multilingual";

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

LA RETRAITE
"tauxConversion" : le barème qui transforme l'avoir de vieillesse en rente
annuelle. Rends chaque taux en FRACTION, pas en pourcentage : 6,4 % s'écrit
0.064. C'est le chiffre le plus structurant du règlement — il décide de la rente
de tous les assurés de la caisse.

⚠️ Ce barème est SOUVENT À PLUSIEURS ENTRÉES, et il faut toutes les rendre :
- par ÂGE de départ (58 à 70 ans) ;
- par ANNÉE de départ à la retraite ("anneeDepart") — beaucoup de caisses
  baissent leur taux d'année en année. Une mention « à partir de 2029 » se rend
  avec anneeDepart = 2029 ;
- par RÉGIME ("regime") — obligatoire, surobligatoire, ou enveloppant quand un
  seul barème couvre les deux.
Produis UNE LIGNE PAR COMBINAISON. N'en choisis surtout pas une seule : le taux
applicable dépend de l'assuré, et retenir le mauvais promettrait une rente qu'il
ne touchera jamais. Laisse anneeDepart ou regime à null uniquement lorsque le
règlement ne fait pas la distinction.
"ageReference" : l'âge de la retraite ordinaire (65, parfois 64).
"tauxInteretProjection" : le taux servant à projeter l'avoir jusqu'à la retraite,
souvent le taux minimal LPP. En fraction également (1,25 % → 0.0125).
"anticipationDesAge" : l'âge à partir duquel une retraite anticipée est possible.
Si un de ces éléments ne figure pas dans le document, mets null : une valeur
inventée fausserait la rente projetée de chaque assuré de la caisse.

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
 "retraite": {"ageReference":number|null,
   "tauxConversion":[{"age":number,"taux":number,"anneeDepart":number|null,
                      "regime":"obligatoire"|"surobligatoire"|"enveloppant"|null}],
   "tauxInteretProjection":number|null,"anticipationDesAge":number|null,
   "article":string|null,"citation":string|null},
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
  retraite: null,
  capitalDeces: null, capitalDecesSupplementaire: null,
  rentePartenaire: null, renteInvalidite: null, renteOrphelin: null,
};
