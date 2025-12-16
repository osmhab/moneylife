/* =========================================================
 * MoneyLife — Échelle 44 (OFAS 2025)
 * Fichier : /lib/registry/echelle44.ts
 * ---------------------------------------------------------
 * - Table unique 2025, mensuelle (CHF), carrière complète (échelle 44).
 * - Inclut : base adulte (OldAgeInvalidity), veuve/veuf,
 *   orphelin 40% / 60%, complémentaire 30%, et base pour veuve/veuf.
 * - Utilisation : import { Legal_Echelle44_2025 } ...; const { rows } = Legal_Echelle44_2025;
 * =======================================================*/

//app/lib/registry/echelle44.ts
import type { Legal_Echelle44Row } from "@/lib/core/types";

/* ---------- Métadonnées ---------- */
export const Legal_Echelle44_Meta_2025 = {
  Legal_Year: 2025,
  Legal_Scale: "44",
  Legal_Currency: "CHF",

  // Crédits OFAS (utiles pour BTE/BTA si tu veux t’y référer)
  Legal_EduCreditCHF: 45360,
  Legal_CareCreditCHF: 45360,

  // Hypothèses/caps enfants (laisse null si non utilisés côté calculs)
  Legal_AiChildPerChildCapMonthly: null as number | null,
  Legal_AiChildrenTotalPctCapOfAdult: null as number | null,
  Legal_AvsChildSurvivorPerChildCapMonthly: null as number | null,
  Legal_AvsChildrenTotalPctCapOfWidow: null as number | null,

  Legal_Assumption: "revenu_annuel_moyen_determinant = salaire_annonce",
  Legal_Notes: [
    "Montants mensuels, échelle 44 (carrière complète). Valeurs OFAS 2025.",
    "Les colonnes 120% / 80% / 30% / 40% / 60% sont déjà arrondies par l’OFAS ; ne pas les recalculer côté app.",
    "Plafond couple AVS (contexte): 150% du maximum.",
  ],
  Legal_Source: "OFAS – Rentes complètes mensuelles, Échelle 44, valables dès le 1.1.2025 (PDF).",
};

/* ---------- Lignes (mensuel) ---------- */
export const Legal_Echelle44_2025_Rows: Legal_Echelle44Row[] = [
  { Legal_Income: 15120, Legal_OldAgeInvalidity: 1260, Legal_OldAgeInvalidityForWidowWidower: 1512, Legal_WidowWidowerSurvivor: 1008, Legal_Supplementary30: 378, Legal_Child40: 504, Legal_Orphan60: 756 },
  { Legal_Income: 16632, Legal_OldAgeInvalidity: 1293, Legal_OldAgeInvalidityForWidowWidower: 1551, Legal_WidowWidowerSurvivor: 1034, Legal_Supplementary30: 388, Legal_Child40: 517, Legal_Orphan60: 776 },
  { Legal_Income: 18144, Legal_OldAgeInvalidity: 1326, Legal_OldAgeInvalidityForWidowWidower: 1591, Legal_WidowWidowerSurvivor: 1060, Legal_Supplementary30: 398, Legal_Child40: 530, Legal_Orphan60: 795 },
  { Legal_Income: 19656, Legal_OldAgeInvalidity: 1358, Legal_OldAgeInvalidityForWidowWidower: 1630, Legal_WidowWidowerSurvivor: 1087, Legal_Supplementary30: 407, Legal_Child40: 543, Legal_Orphan60: 815 },
  { Legal_Income: 21168, Legal_OldAgeInvalidity: 1391, Legal_OldAgeInvalidityForWidowWidower: 1669, Legal_WidowWidowerSurvivor: 1113, Legal_Supplementary30: 417, Legal_Child40: 556, Legal_Orphan60: 835 },
  { Legal_Income: 22680, Legal_OldAgeInvalidity: 1424, Legal_OldAgeInvalidityForWidowWidower: 1709, Legal_WidowWidowerSurvivor: 1139, Legal_Supplementary30: 427, Legal_Child40: 570, Legal_Orphan60: 854 },
  { Legal_Income: 24192, Legal_OldAgeInvalidity: 1457, Legal_OldAgeInvalidityForWidowWidower: 1748, Legal_WidowWidowerSurvivor: 1165, Legal_Supplementary30: 437, Legal_Child40: 583, Legal_Orphan60: 874 },
  { Legal_Income: 25704, Legal_OldAgeInvalidity: 1489, Legal_OldAgeInvalidityForWidowWidower: 1787, Legal_WidowWidowerSurvivor: 1191, Legal_Supplementary30: 447, Legal_Child40: 596, Legal_Orphan60: 894 },
  { Legal_Income: 27216, Legal_OldAgeInvalidity: 1522, Legal_OldAgeInvalidityForWidowWidower: 1826, Legal_WidowWidowerSurvivor: 1218, Legal_Supplementary30: 457, Legal_Child40: 609, Legal_Orphan60: 913 },
  { Legal_Income: 28728, Legal_OldAgeInvalidity: 1555, Legal_OldAgeInvalidityForWidowWidower: 1866, Legal_WidowWidowerSurvivor: 1244, Legal_Supplementary30: 466, Legal_Child40: 622, Legal_Orphan60: 933 },
  { Legal_Income: 30240, Legal_OldAgeInvalidity: 1588, Legal_OldAgeInvalidityForWidowWidower: 1905, Legal_WidowWidowerSurvivor: 1270, Legal_Supplementary30: 476, Legal_Child40: 635, Legal_Orphan60: 953 },
  { Legal_Income: 31752, Legal_OldAgeInvalidity: 1620, Legal_OldAgeInvalidityForWidowWidower: 1944, Legal_WidowWidowerSurvivor: 1296, Legal_Supplementary30: 486, Legal_Child40: 648, Legal_Orphan60: 972 },
  { Legal_Income: 33264, Legal_OldAgeInvalidity: 1653, Legal_OldAgeInvalidityForWidowWidower: 1984, Legal_WidowWidowerSurvivor: 1322, Legal_Supplementary30: 496, Legal_Child40: 661, Legal_Orphan60: 992 },
  { Legal_Income: 34776, Legal_OldAgeInvalidity: 1686, Legal_OldAgeInvalidityForWidowWidower: 2023, Legal_WidowWidowerSurvivor: 1349, Legal_Supplementary30: 506, Legal_Child40: 674, Legal_Orphan60: 1011 },
  { Legal_Income: 36288, Legal_OldAgeInvalidity: 1719, Legal_OldAgeInvalidityForWidowWidower: 2062, Legal_WidowWidowerSurvivor: 1375, Legal_Supplementary30: 516, Legal_Child40: 687, Legal_Orphan60: 1031 },
  { Legal_Income: 37800, Legal_OldAgeInvalidity: 1751, Legal_OldAgeInvalidityForWidowWidower: 2102, Legal_WidowWidowerSurvivor: 1401, Legal_Supplementary30: 525, Legal_Child40: 701, Legal_Orphan60: 1051 },
  { Legal_Income: 39312, Legal_OldAgeInvalidity: 1784, Legal_OldAgeInvalidityForWidowWidower: 2141, Legal_WidowWidowerSurvivor: 1427, Legal_Supplementary30: 535, Legal_Child40: 714, Legal_Orphan60: 1070 },
  { Legal_Income: 40824, Legal_OldAgeInvalidity: 1817, Legal_OldAgeInvalidityForWidowWidower: 2180, Legal_WidowWidowerSurvivor: 1454, Legal_Supplementary30: 545, Legal_Child40: 727, Legal_Orphan60: 1090 },
  { Legal_Income: 42336, Legal_OldAgeInvalidity: 1850, Legal_OldAgeInvalidityForWidowWidower: 2220, Legal_WidowWidowerSurvivor: 1480, Legal_Supplementary30: 555, Legal_Child40: 740, Legal_Orphan60: 1110 },
  { Legal_Income: 43848, Legal_OldAgeInvalidity: 1882, Legal_OldAgeInvalidityForWidowWidower: 2259, Legal_WidowWidowerSurvivor: 1506, Legal_Supplementary30: 565, Legal_Child40: 753, Legal_Orphan60: 1129 },
  { Legal_Income: 45360, Legal_OldAgeInvalidity: 1915, Legal_OldAgeInvalidityForWidowWidower: 2298, Legal_WidowWidowerSurvivor: 1532, Legal_Supplementary30: 575, Legal_Child40: 766, Legal_Orphan60: 1149 },
  { Legal_Income: 46872, Legal_OldAgeInvalidity: 1935, Legal_OldAgeInvalidityForWidowWidower: 2322, Legal_WidowWidowerSurvivor: 1548, Legal_Supplementary30: 581, Legal_Child40: 774, Legal_Orphan60: 1161 },
  { Legal_Income: 48384, Legal_OldAgeInvalidity: 1956, Legal_OldAgeInvalidityForWidowWidower: 2347, Legal_WidowWidowerSurvivor: 1564, Legal_Supplementary30: 587, Legal_Child40: 782, Legal_Orphan60: 1173 },
  { Legal_Income: 49896, Legal_OldAgeInvalidity: 1976, Legal_OldAgeInvalidityForWidowWidower: 2371, Legal_WidowWidowerSurvivor: 1580, Legal_Supplementary30: 593, Legal_Child40: 790, Legal_Orphan60: 1185 },
  { Legal_Income: 51408, Legal_OldAgeInvalidity: 1996, Legal_OldAgeInvalidityForWidowWidower: 2395, Legal_WidowWidowerSurvivor: 1597, Legal_Supplementary30: 599, Legal_Child40: 798, Legal_Orphan60: 1197 },
  { Legal_Income: 52920, Legal_OldAgeInvalidity: 2016, Legal_OldAgeInvalidityForWidowWidower: 2419, Legal_WidowWidowerSurvivor: 1613, Legal_Supplementary30: 605, Legal_Child40: 806, Legal_Orphan60: 1210 },
  { Legal_Income: 54432, Legal_OldAgeInvalidity: 2036, Legal_OldAgeInvalidityForWidowWidower: 2443, Legal_WidowWidowerSurvivor: 1629, Legal_Supplementary30: 611, Legal_Child40: 814, Legal_Orphan60: 1222 },
  { Legal_Income: 55944, Legal_OldAgeInvalidity: 2056, Legal_OldAgeInvalidityForWidowWidower: 2468, Legal_WidowWidowerSurvivor: 1645, Legal_Supplementary30: 617, Legal_Child40: 823, Legal_Orphan60: 1234 },
  { Legal_Income: 57456, Legal_OldAgeInvalidity: 2076, Legal_OldAgeInvalidityForWidowWidower: 2492, Legal_WidowWidowerSurvivor: 1661, Legal_Supplementary30: 623, Legal_Child40: 831, Legal_Orphan60: 1246 },
  { Legal_Income: 58968, Legal_OldAgeInvalidity: 2097, Legal_OldAgeInvalidityForWidowWidower: 2516, Legal_WidowWidowerSurvivor: 1677, Legal_Supplementary30: 629, Legal_Child40: 839, Legal_Orphan60: 1258 },
  { Legal_Income: 60480, Legal_OldAgeInvalidity: 2117, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1693, Legal_Supplementary30: 635, Legal_Child40: 847, Legal_Orphan60: 1270 },
  { Legal_Income: 61992, Legal_OldAgeInvalidity: 2137, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1710, Legal_Supplementary30: 641, Legal_Child40: 855, Legal_Orphan60: 1282 },
  { Legal_Income: 63504, Legal_OldAgeInvalidity: 2157, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1726, Legal_Supplementary30: 647, Legal_Child40: 863, Legal_Orphan60: 1294 },
  { Legal_Income: 65016, Legal_OldAgeInvalidity: 2177, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1742, Legal_Supplementary30: 653, Legal_Child40: 871, Legal_Orphan60: 1306 },
  { Legal_Income: 66528, Legal_OldAgeInvalidity: 2197, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1758, Legal_Supplementary30: 659, Legal_Child40: 879, Legal_Orphan60: 1318 },
  { Legal_Income: 68040, Legal_OldAgeInvalidity: 2218, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1774, Legal_Supplementary30: 665, Legal_Child40: 887, Legal_Orphan60: 1331 },
  { Legal_Income: 69552, Legal_OldAgeInvalidity: 2238, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1790, Legal_Supplementary30: 671, Legal_Child40: 895, Legal_Orphan60: 1343 },
  { Legal_Income: 71064, Legal_OldAgeInvalidity: 2258, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1806, Legal_Supplementary30: 677, Legal_Child40: 903, Legal_Orphan60: 1355 },
  { Legal_Income: 72576, Legal_OldAgeInvalidity: 2278, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1822, Legal_Supplementary30: 683, Legal_Child40: 911, Legal_Orphan60: 1367 },
  { Legal_Income: 74088, Legal_OldAgeInvalidity: 2298, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1839, Legal_Supplementary30: 689, Legal_Child40: 919, Legal_Orphan60: 1379 },
  { Legal_Income: 75600, Legal_OldAgeInvalidity: 2318, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1855, Legal_Supplementary30: 696, Legal_Child40: 927, Legal_Orphan60: 1391 },
  { Legal_Income: 77112, Legal_OldAgeInvalidity: 2339, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1871, Legal_Supplementary30: 702, Legal_Child40: 935, Legal_Orphan60: 1403 },
  { Legal_Income: 78624, Legal_OldAgeInvalidity: 2359, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1887, Legal_Supplementary30: 708, Legal_Child40: 943, Legal_Orphan60: 1415 },
  { Legal_Income: 80136, Legal_OldAgeInvalidity: 2379, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1903, Legal_Supplementary30: 714, Legal_Child40: 952, Legal_Orphan60: 1427 },
  { Legal_Income: 81648, Legal_OldAgeInvalidity: 2399, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1919, Legal_Supplementary30: 720, Legal_Child40: 960, Legal_Orphan60: 1439 },
  { Legal_Income: 83160, Legal_OldAgeInvalidity: 2419, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1935, Legal_Supplementary30: 726, Legal_Child40: 968, Legal_Orphan60: 1452 },
  { Legal_Income: 84672, Legal_OldAgeInvalidity: 2439, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1951, Legal_Supplementary30: 732, Legal_Child40: 976, Legal_Orphan60: 1464 },
  { Legal_Income: 86184, Legal_OldAgeInvalidity: 2460, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1968, Legal_Supplementary30: 738, Legal_Child40: 984, Legal_Orphan60: 1476 },
  { Legal_Income: 87696, Legal_OldAgeInvalidity: 2480, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 1984, Legal_Supplementary30: 744, Legal_Child40: 992, Legal_Orphan60: 1488 },
  { Legal_Income: 89208, Legal_OldAgeInvalidity: 2500, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 2000, Legal_Supplementary30: 750, Legal_Child40: 1000, Legal_Orphan60: 1500 },
  { Legal_Income: 90720, Legal_OldAgeInvalidity: 2520, Legal_OldAgeInvalidityForWidowWidower: 2520, Legal_WidowWidowerSurvivor: 2016, Legal_Supplementary30: 756, Legal_Child40: 1008, Legal_Orphan60: 1512 },
];

/* ---------- Export packagé ---------- */
export const Legal_Echelle44_2025 = {
  meta: Legal_Echelle44_Meta_2025,
  rows: Legal_Echelle44_2025_Rows,
} as const;
