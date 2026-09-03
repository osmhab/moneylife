"use client";

// Dossier de prévoyance — document remis au client (@react-pdf/renderer).
//
// PARTI PRIS DE MISE EN PAGE
// --------------------------
// Rapport imprimé façon banque privée : noir et blanc, hiérarchie typographique
// large (du 6.5 pt en capitales au 96 pt du score), respiration généreuse. La
// couleur est réservée aux GRAPHIQUES — nulle part ailleurs. Une gamme sourde
// d'ardoises, une note chaude pour le 3e pilier, et un oxblood pour la LACUNE :
// c'est le seul endroit où l'œil doit être attiré.
//
// Pourquoi UNE PAGE PAR THÈME
// ---------------------------
// La version précédente laissait tout couler : un titre de section pouvait finir
// seul en bas de page, son contenu à la page suivante, et le pied de page ne se
// rendait jamais. Chaque thème a désormais sa propre `<Page>` — ce qui règle
// l'orphelinage ET rend les numéros du sommaire calculables (une section = une
// page, dans l'ordre de `secs`).
//
// Polices : uniquement les familles EMBARQUÉES dans react-pdf (Helvetica,
// Times-Roman). Aucun fichier à charger, aucun appel réseau — le rendu est
// identique en local et dans le conteneur de production.
//
// Images : `images` fournit les visuels ; tant qu'ils manquent, chaque
// emplacement affiche son cahier des charges (sujet, lumière, cadrage) pour
// qu'on puisse choisir les photos sans toucher à la mise en page.

import * as React from "react";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";

// react-pdf césure les mots par défaut. Dans un document financier — et surtout
// dans un nom propre en corps 50 — une coupure du type « Dela-combaz » est
// inacceptable. On désactive : les retours se font sur les espaces.
Font.registerHyphenationCallback((word) => [word]);
import { ENUM_EtatCivil } from "@/lib/core/enums";

type AnyObj = Record<string, any>;

/**
 * Lignes affichées pour une fiche de solution. Fonction à part — et non code
 * interne au composant — parce que la PAGINATION doit compter exactement les
 * mêmes lignes que le rendu, sinon l'estimation de hauteur ment.
 */
function planRows(p: AnyObj, kind: "lpp" | "3a" | "ep"): [string, string][] {
  const d = p.data || {};
  const rows: [string, string][] = [["Capital projeté à 65 ans", chf(cap65(p))]];
  if (kind === "lpp") {
    if (N(d.Enter_rentevieillesseLPP65)) rows.push(["Rente de vieillesse", `${chf(d.Enter_rentevieillesseLPP65)} / an`]);
    if (N(d.Enter_renteInvaliditeMaladie)) rows.push(["Rente d'invalidité", `${chf(d.Enter_renteInvaliditeMaladie)} / an`]);
    if (N(d.Enter_renteConjointLPP)) rows.push(["Rente de conjoint", `${chf(d.Enter_renteConjointLPP)} / an`]);
    const cd = N(d.Enter_CapitalPlusRenteMal) + N(d.Enter_CapitalDecesIndependantMal);
    if (cd) rows.push(["Capital décès", chf(cd)]);
  } else if (kind === "3a" && !isBank(p.type)) {
    if (N(d.primeTotale)) rows.push(["Prime", `${chf(d.primeTotale)} / ${d.occurrence === "annee" ? "an" : d.occurrence === "trimestre" ? "trimestre" : "mois"}`]);
    if (N(d.renteInvalidite)) rows.push(["Rente d'invalidité", `${chf(d.renteInvalidite)} / an`]);
    if (N(d.capitalDecesFixe)) rows.push(["Capital décès", chf(d.capitalDecesFixe)]);
  } else if (N(d.soldeActuel)) rows.push(["Solde actuel", chf(d.soldeActuel)]);
  return rows;
}
const N = (v: any) => Number(v) || 0;
const fmt = (n: any) => Math.round(N(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
const chf = (n: any) => `${fmt(n)} CHF`;

const STATUT_PRO: Record<string, string> = { "0": "Salarié·e", "1": "Indépendant·e", "2": "Sans emploi" };

const PLAB: Record<string, string> = {
  LPP_BASE: "LPP — base", LPP_COMPL: "LPP — complémentaire", LPP: "LPP",
  LIBRE_PASSAGE_POLICE: "Libre passage (police)", LIBRE_PASSAGE_COMPTE: "Libre passage (compte)",
  PILIER_3A_POLICE: "3a assurance", PILIER_3A_BANK: "3a banque", "3A_BANQUE": "3a banque",
  PILIER_3A: "3a assurance", PILIER_3B: "3b assurance", EPARGNE_LIBRE: "Épargne libre",
};
const is2 = (t: any) => ["LPP_BASE", "LPP_COMPL", "LPP", "LIBRE_PASSAGE_POLICE", "LIBRE_PASSAGE_COMPTE"].includes(String(t));
const is3 = (t: any) => typeof t === "string" && (t.startsWith("PILIER_3") || t.startsWith("3A") || t === "3B" || t === "3A_BANQUE");
const isEpargne = (t: any) => String(t) === "EPARGNE_LIBRE";
const isBank = (t: any) => t === "PILIER_3A_BANK" || t === "3A_BANQUE";
const cap65 = (p: AnyObj) => {
  const d = p.data || {};
  return N(d.projectionAssureur) > 0 ? N(d.projectionAssureur)
    : N(d.capitalRetraiteProjete) || N(d.Enter_lppCapitalProjete65) || N(d.capitalRetraiteGlobal) || N(d.valeurRachatActuelle) || N(d.soldeActuel);
};

// ── ENCRES ──────────────────────────────────────────────────────────────────
// Le document est monochrome : ces valeurs ne sont que des densités de noir.
const INK = "#111111";
const INK_2 = "#454545";
const MUTED = "#8A8A8A";
const FAINT = "#C4C4C4";
const RULE = "#DCDCDC";
const WASH = "#F2F1EE";

// ── COULEURS DES GRAPHIQUES ─────────────────────────────────────────────────
// Seul endroit coloré du document.
const PC: Record<string, string> = { avs: "#2E4A6B", lpp: "#6E8CA8", laa: "#A9B6C2", "3a": "#C2AE86" };
const GAP = "#8C2F1E";
const PL: Record<string, string> = {
  avs: "AVS / AI · 1er pilier", lpp: "LPP · 2e pilier", laa: "LAA · accident", "3a": "3e pilier privé",
};

const SERIF = "Times-Roman";
const SANS = "Helvetica";
const SANS_B = "Helvetica-Bold";

const s = StyleSheet.create({
  // Réserve haute et basse : en-tête et pied sont positionnés en absolu, le
  // contenu ne doit jamais venir dessous.
  page: {
    paddingTop: 64, paddingBottom: 60, paddingHorizontal: 52,
    fontFamily: SANS, fontSize: 9.5, color: INK, lineHeight: 1.55,
  },
  pageBleed: { fontFamily: SANS, fontSize: 9.5, color: INK },

  hdr: {
    position: "absolute", top: 28, left: 52, right: 52,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    borderBottomWidth: 0.75, borderBottomColor: RULE, paddingBottom: 7,
  },
  hdrLogo: { height: 11, width: 28, objectFit: "contain" },
  hdrTxt: { fontSize: 6.5, letterSpacing: 1.6, color: MUTED },

  // ⚠️ `alignItems: "center"` est PROSCRIT ici : sur un conteneur en
  // `position: absolute` ancré par `bottom`, react-pdf effondre la boîte et le
  // pied de page n'est pas émis du tout (ni texte, ni filet). C'est ce qui le
  // rendait invisible dans la version précédente. `flex-end` fonctionne, comme
  // en-tête. Vérifié par bissection sur un document sonde.
  ftr: {
    position: "absolute", bottom: 28, left: 52, right: 52,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    borderTopWidth: 0.75, borderTopColor: RULE, paddingTop: 7,
  },
  ftrTxt: { fontSize: 6.5, letterSpacing: 0.9, color: MUTED },
  // Numéro de page SORTI du conteneur en flex : imbriqué dedans, le `render`
  // dynamique ne produisait rien. Positionné seul, il est fiable.
  // LARGEUR EXPLICITE indispensable : ancré par le seul `right`, react-pdf calcule
  // une largeur nulle et le glyphe n'apparaît jamais.
  ftrNumIn: { fontSize: 9.5, fontFamily: SERIF, color: INK_2 },

  // ── Couverture
  // ⚠️ PAS de `position: absolute` ici. Ancré par le bas, ce bloc grandissait
  // vers le haut quand le nom passait sur deux lignes et recouvrait la photo
  // (le logo se retrouvait imprimé sur l'image). En flux normal, il occupe la
  // bande blanche restante et pousse au lieu de chevaucher.
  coverBody: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 52, paddingBottom: 54 },
  coverLogo: { height: 15, width: 38, objectFit: "contain", alignSelf: "flex-start", marginBottom: 26 },
  coverKicker: { fontSize: 7.5, letterSpacing: 2.6, color: MUTED },
  coverTitle: { fontFamily: SERIF, color: INK, marginTop: 14, lineHeight: 1.05 },
  coverRule: { height: 1.5, backgroundColor: INK, width: 64, marginTop: 22, marginBottom: 20 },
  coverMeta: { flexDirection: "row" },
  coverMetaCol: { marginRight: 34 },
  coverMetaK: { fontSize: 6.5, letterSpacing: 1.4, color: MUTED },
  coverMetaV: { fontSize: 9.5, color: INK, marginTop: 4 },
  coverMetaSub: { fontSize: 8.5, color: INK_2, marginTop: 1.5 },

  // ── Ouverture de section
  secWrap: { marginBottom: 24 },
  secNum: { fontFamily: SERIF, fontSize: 44, color: FAINT, lineHeight: 1 },
  secTitle: { fontFamily: SERIF, fontSize: 25, color: INK, marginTop: 2 },
  secRule: { height: 1.5, backgroundColor: INK, width: 44, marginTop: 14 },
  lead: { fontSize: 10.5, color: INK_2, lineHeight: 1.65, marginTop: 16, maxWidth: 420 },

  // ── Sommaire
  tocRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 13 },
  tocNum: { fontFamily: SERIF, fontSize: 10, color: MUTED, width: 26 },
  tocTxt: { fontSize: 11, color: INK },
  tocDots: { flex: 1, borderBottomWidth: 0.75, borderBottomColor: RULE, marginBottom: 3, marginHorizontal: 8 },
  tocPage: { fontFamily: SERIF, fontSize: 10.5, color: INK },

  // ── Chiffres et tableaux
  kpiRow: { flexDirection: "row" },
  kpiCol: { marginRight: 38 },
  kpiK: { fontSize: 6.5, letterSpacing: 1.4, color: MUTED },
  kpiV: { fontFamily: SERIF, fontSize: 24, color: INK, marginTop: 5 },
  kpiU: { fontSize: 8, color: MUTED },

  tr: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: RULE, paddingVertical: 6.5 },
  trHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 5 },
  th: { fontSize: 6.5, letterSpacing: 1.3, color: MUTED },
  td: { fontSize: 9.5, color: INK },
  num: { textAlign: "right", fontFamily: SERIF },

  colHead: { fontSize: 6.5, letterSpacing: 1.6, color: MUTED, marginBottom: 10, marginTop: 24 },

  // ── Graphique de couverture
  barBlock: { marginTop: 18 },
  barRow: { flexDirection: "row", alignItems: "center" },
  barLabel: { fontSize: 6.5, letterSpacing: 1.3, color: MUTED, width: 66 },
  barTrack: { flex: 1, height: 13, backgroundColor: WASH, flexDirection: "row" },
  barVal: { width: 96, textAlign: "right", fontFamily: SERIF, fontSize: 11, color: INK },
  legend: { flexDirection: "row", flexWrap: "wrap", marginTop: 11, marginLeft: 66 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 16, marginBottom: 4 },
  legendSwatch: { width: 7, height: 7, marginRight: 5 },
  legendTxt: { fontSize: 7.5, color: INK_2 },

  // ── Encadrés
  note: { marginTop: 18, paddingLeft: 13, borderLeftWidth: 2, borderLeftColor: INK },
  noteGap: { borderLeftColor: GAP },
  noteTxt: { fontSize: 9, color: INK_2, lineHeight: 1.6 },

  planCard: { borderTopWidth: 0.75, borderTopColor: RULE, paddingTop: 10, paddingBottom: 4, marginBottom: 6 },
  planHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
  planType: { fontSize: 10.5, fontFamily: SANS_B, color: INK },
  planInst: { fontSize: 7.5, letterSpacing: 1.2, color: MUTED },

  // ── Emplacement d'image
  slot: { backgroundColor: WASH, alignItems: "center", justifyContent: "center", padding: 20 },
  slotK: { fontSize: 6.5, letterSpacing: 1.8, color: MUTED },
  slotB: { fontSize: 8, color: MUTED, marginTop: 8, textAlign: "center", maxWidth: 330, lineHeight: 1.5 },

  ruleLine: { borderBottomWidth: 0.75, borderBottomColor: RULE, height: 27 },
  legalP: { fontSize: 7.5, color: INK_2, lineHeight: 1.65, marginBottom: 10 },
});

/** Signature du conseiller imprimée sur la couverture. */
export type AdvisorCard = { nom?: string; fonction?: string; agence?: string };

/** Un visuel affecté à un emplacement, avec son recadrage. */
export type SlotImage = { src: string; x?: number; y?: number };

/**
 * Emplacement d'image. Tant qu'aucun visuel n'est fourni, affiche le cahier des
 * charges : la mise en page est déjà définitive, il ne reste qu'à déposer les fichiers.
 */
function ImageSlot({ img, brief, height }: { img?: SlotImage; brief: string; height: number }) {
  if (img?.src) {
    // `objectPosition` : recadrage choisi par le conseiller (0–100 % sur chaque
    // axe), strictement identique à l'aperçu de l'écran de préparation.
    const pos = `${img.x ?? 50}% ${img.y ?? 50}%`;
    // eslint-disable-next-line jsx-a11y/alt-text
    return <Image src={img.src} style={{ height, width: "100%", objectFit: "cover", objectPosition: pos }} />;
  }
  return (
    <View style={[s.slot, { height }]}>
      <Text style={s.slotK}>EMPLACEMENT IMAGE</Text>
      <Text style={s.slotB}>{brief}</Text>
    </View>
  );
}

/** Barre de couverture : besoin en repère, couverture décomposée par pilier. */
function Bar({ card, unit }: { card: AnyObj; unit: string }) {
  const besoin = N(card.besoin), couv = N(card.couverture), lac = N(card.lacune);
  const scale = Math.max(besoin, couv, 1);
  const layers = (card?.layers || []).filter((l: AnyObj) => N(l.amount) > 0);

  return (
    <View style={s.barBlock}>
      <View style={[s.barRow, { marginBottom: 7 }]}>
        <Text style={s.barLabel}>BESOIN</Text>
        <View style={s.barTrack}>
          <View style={{ width: `${(besoin / scale) * 100}%`, height: "100%", borderWidth: 0.75, borderColor: FAINT, borderStyle: "dashed" }} />
        </View>
        <Text style={s.barVal}>{fmt(besoin)}{unit}</Text>
      </View>

      <View style={s.barRow}>
        <Text style={s.barLabel}>COUVERTURE</Text>
        <View style={s.barTrack}>
          {layers.map((l: AnyObj, i: number) => (
            <View key={i} style={{ width: `${(N(l.amount) / scale) * 100}%`, height: "100%", backgroundColor: PC[l.key] || PC.lpp }} />
          ))}
          {lac > 0 && <View style={{ width: `${(lac / scale) * 100}%`, height: "100%", backgroundColor: GAP, opacity: 0.25 }} />}
        </View>
        <Text style={s.barVal}>{fmt(couv)}{unit}</Text>
      </View>

      {layers.length > 0 && (
        <View style={s.legend}>
          {layers.map((l: AnyObj, i: number) => (
            <View key={i} style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: PC[l.key] || PC.lpp }]} />
              <Text style={s.legendTxt}>{PL[l.key] || l.label} · {fmt(l.amount)}{unit}</Text>
            </View>
          ))}
          {lac > 0 && (
            <View style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: GAP, opacity: 0.25 }]} />
              <Text style={s.legendTxt}>Lacune · {fmt(lac)}{unit}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Lecture de la carte : lacune chiffrée ou besoin couvert. Filet, pas d'aplat. */
function Interp({ card, unit }: { card: AnyObj; unit: string }) {
  const lac = N(card.lacune), besoin = N(card.besoin);
  if (lac > besoin * 0.02) {
    return (
      <View style={[s.note, s.noteGap]}>
        <Text style={s.noteTxt}>
          <Text style={{ fontFamily: SANS_B, color: GAP }}>Lacune de {chf(lac)}{unit}. </Text>
          Vos prestations ne couvrent pas entièrement le besoin estimé : un complément de prévoyance est recommandé.
        </Text>
      </View>
    );
  }
  return (
    <View style={s.note}>
      <Text style={s.noteTxt}>
        <Text style={{ fontFamily: SANS_B }}>Besoin couvert. </Text>
        Vos prestations atteignent ou dépassent le besoin estimé.
      </Text>
    </View>
  );
}

/**
 * Signale un besoin FIXÉ par le conseiller et sa justification. Sans cette
 * mention, le document présenterait un montant d'origine humaine exactement
 * comme un montant issu du barème.
 */
function BesoinNote({ card, unit }: { card: AnyObj; unit: string }) {
  if (!card?.besoinForce && !card?.besoinLibelle) return null;
  const auto = N(card.besoinAuto);
  return (
    <View style={s.note}>
      <Text style={s.noteTxt}>
        <Text style={{ fontFamily: SANS_B }}>
          {card.besoinForce ? `Besoin fixé à ${chf(N(card.besoin))}${unit}. ` : "Remarque. "}
        </Text>
        {card.besoinLibelle ? `${card.besoinLibelle}. ` : ""}
        {card.besoinForce && auto > 0 ? `Le calcul standard donnait ${chf(auto)}${unit}.` : ""}
      </Text>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.tr}>
      <Text style={[s.td, { flex: 1 }]}>{k}</Text>
      <Text style={[s.td, s.num, { width: 140 }]}>{v}</Text>
    </View>
  );
}

function Kpi({ k, v, u }: { k: string; v: string; u?: string }) {
  return (
    <View style={s.kpiCol}>
      <Text style={s.kpiK}>{k}</Text>
      <Text style={s.kpiV}>{v}{u ? <Text style={s.kpiU}> {u}</Text> : null}</Text>
    </View>
  );
}

export default function DossierPDF({
  client, plans, analysis, advisor, today,
  logoSrc = "/creditx-logo-black.png",
  images = {},
  notes,
}: {
  client: AnyObj; plans: AnyObj[]; analysis: AnyObj | null; advisor: string | AdvisorCard; today: string;
  logoSrc?: string;
  /** Visuels du dossier ; chaque clé absente affiche son cahier des charges. */
  images?: { cover?: SlotImage; retraite?: SlotImage; invalidite?: SlotImage; deces?: SlotImage; closing?: SlotImage };
  /** Notes d'entretien saisies par le conseiller (sinon page réglée vierge). */
  notes?: string;
}) {
  const name = `${client.Enter_prenom || ""} ${client.Enter_nom || ""}`.trim() || "Client";
  // Trois lignes au plus ; une ligne vide est omise plutôt qu'imprimée à blanc.
  const card: AdvisorCard = typeof advisor === "string" ? { nom: advisor } : (advisor || {});
  const advisorLines = [card.nom, card.fonction, card.agence].map((l) => (l || "").trim()).filter(Boolean);
  const enfants: AnyObj[] = Array.isArray(client.Enter_enfants) ? client.Enter_enfants : [];
  const score = Math.round(N(analysis?.totalScore));
  const verdict = score >= 70 ? "Bonne couverture" : score >= 40 ? "Couverture à renforcer" : "Lacunes importantes";
  const plans2 = plans.filter((p) => is2(p?.type)), plans3 = plans.filter((p) => is3(p?.type)), plansEp = plans.filter((p) => isEpargne(p?.type));
  const pp = analysis?.premierPilier, fiscal = analysis?.fiscal;

  const recos: string[] = [];
  for (const r of [
    { label: "Retraite", unit: "/mois", card: analysis?.retraite },
    { label: "Invalidité — maladie", unit: "/mois", card: analysis?.invaliditeMaladie },
    { label: "Invalidité — accident", unit: "/mois", card: analysis?.invaliditeAccident },
    { label: "Décès", unit: "", card: analysis?.deces },
  ]) {
    const lac = N(r.card?.lacune);
    if (r.card && lac > N(r.card?.besoin) * 0.02) {
      recos.push(`Combler la lacune « ${r.label} » de ${chf(lac)}${r.unit === "/mois" ? " par mois" : ""} via une solution adaptée.`);
    }
  }
  if (fiscal && N(fiscal.pourcentUtilise) < 95) {
    recos.push(`Maximiser le 3e pilier a (${Math.round(N(fiscal.pourcentUtilise))} % du plafond utilisé) — économie d'impôt estimée à ${chf(fiscal.gainFiscalAnnuel)} par an.`);
  }
  if (!recos.length) recos.push("Situation globalement couverte. À réviser lors de tout changement de vie : mariage, naissance, évolution de salaire, achat immobilier.");

  // Sections réellement rendues, dans l'ordre. Le sommaire en dérive ses numéros
  // de page : couverture = 1, sommaire = 2, puis une page par section.
  // « Solutions en place » est la seule section dont la longueur dépend des
  // données. On la découpe NOUS-MÊMES en pages de 5 fiches : laisser react-pdf
  // déborder tout seul produisait deux pages portant le même numéro (le pied
  // est `fixed`, il répète son contenu), d'où la numérotation « 1 2 2 3 ».
  // Hauteur estimée d'une fiche : intitulé + une ligne par donnée. Empaqueter
  // par NOMBRE de fiches ne marche pas — une fiche LPP à cinq lignes est deux
  // fois plus haute qu'un compte d'épargne. Une fiche qui dépasse est marquée
  // insécable, donc poussée à la page suivante : on obtenait des pages
  // entièrement blanches portant un numéro déjà utilisé.
  // Métriques réelles : une fiche = cadre (padding 10+4, marge 6, intitulé ~16)
  // ≈ 40 pt, plus 29 pt par ligne (padding 6.5×2 + interligne 9.5×1.55 + filet).
  // Les valeurs précédentes sous-estimaient d'une vingtaine de points par fiche,
  // ce qui suffisait à faire déborder une page sur quatre fiches.
  const cardHeight = (p: AnyObj, kind: "lpp" | "3a" | "ep") => 40 + planRows(p, kind).length * 29;
  const GROUP_HEAD = 44; // intitulé de groupe : marge 24 + hauteur + marge 10
  // Hauteur utile d'une page : 842 − 64 (haut) − 60 (bas) = 718, moins le titre
  // de section. Les budgets restent en deçà : une fiche est insécable, et une
  // fiche qui ne tient pas engendre une PAGE BLANCHE portant un numéro déjà pris.
  const BUDGET_FIRST = 600;
  const BUDGET_NEXT = 600;
  const planGroups: { title: string; ps: AnyObj[]; kind: "lpp" | "3a" | "ep" }[] = [
    { title: "2e PILIER — CAISSES DE PENSION ET LIBRE PASSAGE", ps: plans2, kind: "lpp" as const },
    { title: "3e PILIER", ps: plans3, kind: "3a" as const },
    { title: "ÉPARGNE LIBRE", ps: plansEp, kind: "ep" as const },
  ].filter((g) => g.ps.length);

  // Chaque fiche devient une entrée ; on découpe ensuite en tranches de page,
  // en réaffichant l'intitulé du groupe quand il change d'une page à l'autre.
  const planEntries = planGroups.flatMap((g) => g.ps.map((pl) => ({ group: g.title, kind: g.kind, plan: pl })));
  const planPages: (typeof planEntries)[] = [];
  {
    let page: typeof planEntries = [];
    let used = 0;
    for (const e of planEntries) {
      // Un changement de groupe ajoute son intitulé, qui occupe de la place.
      const withHead = page.length === 0 || page[page.length - 1].group !== e.group;
      const h = cardHeight(e.plan, e.kind) + (withHead ? GROUP_HEAD : 0);
      const budget = planPages.length === 0 ? BUDGET_FIRST : BUDGET_NEXT;
      if (page.length && used + h > budget) {
        planPages.push(page);
        page = [];
        used = 0;
      }
      page.push(e);
      used += h;
    }
    if (page.length) planPages.push(page);
  }

  const secs = [
    { t: "Profil du client", show: true },
    { t: "Synthèse", show: !!analysis },
    { t: "Retraite", show: !!analysis?.retraite },
    { t: "Invalidité", show: !!(analysis?.invaliditeMaladie || analysis?.invaliditeAccident) },
    { t: "Décès", show: !!analysis?.deces },
    { t: "Prestations de l'État", show: !!pp },
    { t: "Solutions en place", show: plans.length > 0 },
    { t: "Optimisation fiscale", show: !!fiscal },
    { t: "Recommandations", show: true },
    { t: "Notes d'entretien", show: true },
  ]
    .filter((x) => x.show)
    // Nombre de pages OCCUPÉES par la section : 1 partout, sauf les solutions.
    .map((x) => ({ ...x, span: x.t === "Solutions en place" ? Math.max(1, planPages.length) : 1 }));

  /** Première page d'une section : couverture (1) + sommaire (2) + pages précédentes. */
  const pageOf = (title: string) => {
    const i = secs.findIndex((x) => x.t === title);
    return 3 + secs.slice(0, Math.max(0, i)).reduce((n, x) => n + x.span, 0);
  };
  const numOf = (title: string) => secs.findIndex((x) => x.t === title) + 1;

  /**
   * En-tête et pied répétés. Le numéro de page est passé EXPLICITEMENT plutôt
   * que via le `render={({ pageNumber }) => …}` de react-pdf : en 4.5.1, ce
   * `render` ne produit rien ici, même avec une constante (vérifié). Le numéro
   * vient donc de `pageOf()`, la même source que le sommaire — les deux ne
   * peuvent pas diverger.
   */
  const Chrome = ({ page }: { page: number }) => (
    <>
      <View style={s.hdr} fixed>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={logoSrc} style={s.hdrLogo} />
        <Text style={s.hdrTxt}>ANALYSE DE PRÉVOYANCE · {name.toUpperCase()}</Text>
      </View>
      <View style={s.ftr} fixed>
        <Text style={s.ftrTxt}>CREDITX SÀRL · FINMA F01536084 · CONFIDENTIEL</Text>
        <Text style={s.ftrNumIn}>{String(page)}</Text>
      </View>
    </>
  );

  /** Ouverture de section : numéro fantôme, titre sérif, filet, chapô. */
  const Head = ({ n, t, lead }: { n: number; t: string; lead?: string }) => (
    <View style={s.secWrap}>
      {n > 0 ? <Text style={s.secNum}>{String(n).padStart(2, "0")}</Text> : null}
      <Text style={s.secTitle}>{t}</Text>
      <View style={s.secRule} />
      {lead ? <Text style={s.lead}>{lead}</Text> : null}
    </View>
  );

  const PlanBlock = ({ title, ps, kind }: { title: string; ps: AnyObj[]; kind: "lpp" | "3a" | "ep" }) => {
    if (!ps.length) return null;
    return (
      <View>
        {title ? <Text style={s.colHead}>{title}</Text> : null}
        {ps.map((p, i) => {
          const rows = planRows(p, kind);
          return (
            <View key={p.id || i} style={s.planCard} wrap={false}>
              <View style={s.planHead}>
                <Text style={s.planType}>{PLAB[String(p.type)] || p.type}</Text>
                <Text style={s.planInst}>{String(p.label || p.institutionName || "").toUpperCase()}</Text>
              </View>
              {rows.map(([k, v], j) => <Row key={j} k={k} v={v} />)}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Document title={`Analyse de prévoyance — ${name}`} author="CreditX Sàrl">

      {/* ══ COUVERTURE ══ */}
      <Page size="A4" style={[s.pageBleed, { flexDirection: "column" }]}>
        <ImageSlot
          img={images.cover}
          height={560}
          brief="Éditorial mode, plein cadre. Noir dominant, clair-obscur, reflets spéculaires. Angle inhabituel — plongée verticale, à travers une vitre ou contre-plongée serrée. Aucun visage identifiable. Registre mondain et distant."
        />
        <View style={s.coverBody}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoSrc} style={s.coverLogo} />
          <Text style={s.coverKicker}>ANALYSE DE PRÉVOYANCE</Text>
          {/* Le corps s'adapte à la longueur : « Jean-Christophe Delacombaz-Vonlanthen »
              en 50 pt occuperait trois lignes et repousserait tout le bloc. */}
          <Text style={[s.coverTitle, { fontSize: name.length > 26 ? 32 : name.length > 18 ? 40 : 50 }]}>
            {name}
          </Text>
          <View style={s.coverRule} />
          <View style={s.coverMeta}>
            <View style={s.coverMetaCol}>
              <Text style={s.coverMetaK}>ÉTABLI LE</Text>
              <Text style={s.coverMetaV}>{today}</Text>
            </View>
            {advisorLines.length > 0 ? (
              <View style={s.coverMetaCol}>
                <Text style={s.coverMetaK}>VOTRE CONSEILLER</Text>
                {advisorLines.map((l, i) => (
                  <Text key={i} style={i === 0 ? s.coverMetaV : s.coverMetaSub}>{l}</Text>
                ))}
              </View>
            ) : null}
            <View style={s.coverMetaCol}>
              <Text style={s.coverMetaK}>DOCUMENT</Text>
              <Text style={s.coverMetaV}>Confidentiel</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ══ SOMMAIRE ══ */}
      <Page size="A4" style={s.page}>
        <Chrome page={2} />
        <Head n={0} t="Sommaire" />
        <View style={{ marginTop: 8 }}>
          {secs.map((x, i) => (
            <View key={x.t} style={s.tocRow}>
              <Text style={s.tocNum}>{String(i + 1).padStart(2, "0")}</Text>
              <Text style={s.tocTxt}>{x.t}</Text>
              <View style={s.tocDots} />
              <Text style={s.tocPage}>{pageOf(x.t)}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 36, paddingTop: 18, borderTopWidth: 0.75, borderTopColor: RULE }}>
          <Text style={s.noteTxt}>
            Ce dossier présente votre situation de prévoyance à ce jour : ce que vous percevriez à la retraite,
            en cas d&apos;invalidité et en cas de décès, ce que vos couvertures actuelles financent réellement,
            et les écarts qui subsistent. Chaque montant provient de vos données et de la législation en vigueur.
          </Text>
        </View>
      </Page>

      {/* ══ PROFIL ══ */}
      <Page size="A4" style={s.page}>
        <Chrome page={pageOf("Profil du client")} />
        <Head n={numOf("Profil du client")} t="Profil du client" lead="L'ensemble des calculs de ce dossier repose sur les éléments ci-dessous. Toute modification — salaire, état civil, enfants — en change les résultats." />
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, marginRight: 40 }}>
            <Row k="Nom et prénom" v={name} />
            <Row k="Date de naissance" v={client.Enter_dateNaissance || "—"} />
            <Row k="État civil" v={(ENUM_EtatCivil as AnyObj)[Number(client.Enter_etatCivil) || 0] || "—"} />
          </View>
          <View style={{ flex: 1 }}>
            <Row k="Statut professionnel" v={STATUT_PRO[String(client.Enter_statutProfessionnel ?? 0)] || "—"} />
            <Row k="Salaire annuel brut" v={client.Enter_salaireAnnuel ? chf(client.Enter_salaireAnnuel) : "—"} />
            <Row k="Affilié LPP" v={client.Enter_Affilie_LPP ? "Oui" : "Non"} />
          </View>
        </View>

        {enfants.length > 0 && (
          <View>
            <Text style={s.colHead}>ENFANTS ({enfants.length})</Text>
            <View style={s.trHead}>
              <Text style={[s.th, { flex: 1 }]}>PRÉNOM</Text>
              <Text style={[s.th, { width: 120 }]}>NAISSANCE</Text>
              <Text style={[s.th, { width: 90 }]}>EN FORMATION</Text>
            </View>
            {enfants.map((e, i) => (
              <View key={i} style={s.tr}>
                <Text style={[s.td, { flex: 1 }]}>{e.Enter_prenom || "—"}</Text>
                <Text style={[s.td, { width: 120 }]}>{e.Enter_dateNaissance || "—"}</Text>
                <Text style={[s.td, { width: 90 }]}>{e.Enter_enFormation ? "Oui" : "Non"}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>

      {/* ══ SYNTHÈSE ══ */}
      {analysis && (
        <Page size="A4" style={s.page}>
          <Chrome page={pageOf("Synthèse")} />
          <Head n={numOf("Synthèse")} t="Synthèse" lead="Le score résume votre niveau de couverture sur les quatre grands risques, en comparant vos prestations projetées à vos besoins." />

          <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 6, marginBottom: 34 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 92, color: INK, lineHeight: 1 }}>{score}</Text>
            <View style={{ paddingBottom: 12, marginLeft: 16 }}>
              <Text style={{ fontFamily: SERIF, fontSize: 18, color: MUTED }}>/ 100</Text>
              <Text style={{ fontSize: 9.5, color: INK_2, marginTop: 5 }}>{verdict}</Text>
            </View>
          </View>

          <View style={s.trHead}>
            <Text style={[s.th, { flex: 1 }]}>RISQUE</Text>
            <Text style={[s.th, s.num, { width: 96 }]}>BESOIN</Text>
            <Text style={[s.th, s.num, { width: 96 }]}>COUVERTURE</Text>
            <Text style={[s.th, s.num, { width: 96 }]}>LACUNE</Text>
          </View>
          {[
            { l: "Retraite", u: "/mois", c: analysis.retraite },
            { l: "Invalidité — maladie", u: "/mois", c: analysis.invaliditeMaladie },
            { l: "Invalidité — accident", u: "/mois", c: analysis.invaliditeAccident },
            { l: "Décès", u: "", c: analysis.deces },
          ].filter((r) => r.c).map((r) => {
            const lac = N(r.c.lacune);
            const manque = lac > N(r.c.besoin) * 0.02;
            return (
              <View key={r.l} style={s.tr}>
                <Text style={[s.td, { flex: 1 }]}>{r.l}</Text>
                <Text style={[s.td, s.num, { width: 96 }]}>{fmt(r.c.besoin)}{r.u}</Text>
                <Text style={[s.td, s.num, { width: 96 }]}>{fmt(r.c.couverture)}{r.u}</Text>
                <Text style={[s.td, s.num, { width: 96, color: manque ? GAP : MUTED }]}>
                  {manque ? `${fmt(lac)}${r.u}` : "aucune"}
                </Text>
              </View>
            );
          })}
        </Page>
      )}

      {/* ══ RETRAITE ══ */}
      {analysis?.retraite && (
        <Page size="A4" style={s.page}>
          <Chrome page={pageOf("Retraite")} />
          <ImageSlot
            img={images.retraite}
            height={132}
            brief="Paysage large et apaisé — lac, montagne au petit matin, horizon dégagé. Tons clairs et froids, très peu de contraste, aucun sujet au centre."
          />
          <View style={{ marginTop: 26 }}>
            <Head n={numOf("Retraite")} t="Retraite" lead="À 65 ans, l'objectif est de maintenir environ 80 % du dernier salaire, en combinant l'AVS, la LPP et la prévoyance privée." />
          </View>
          <Bar card={analysis.retraite} unit="/mois" />
          <Interp card={analysis.retraite} unit="/mois" />
          <BesoinNote card={analysis.retraite} unit="/mois" />
          {N(analysis.capManquantRetraite) > 0 && (
            <View style={{ marginTop: 28, paddingTop: 20, borderTopWidth: 0.75, borderTopColor: RULE }}>
              <View style={s.kpiRow}>
                <Kpi k="CAPITAL RETRAITE MANQUANT" v={fmt(analysis.capManquantRetraite)} u="CHF" />
                <Kpi k="RENTE DE BASE PROJETÉE" v={fmt(analysis.retraiteBaseMensuelle)} u="CHF / mois" />
              </View>
            </View>
          )}
        </Page>
      )}

      {/* ══ INVALIDITÉ ══ */}
      {(analysis?.invaliditeMaladie || analysis?.invaliditeAccident) && (
        <Page size="A4" style={s.page}>
          <Chrome page={pageOf("Invalidité")} />
          <ImageSlot
            img={images.invalidite}
            height={132}
            brief="Scène d'intérieur calme et rassurante — mains, table de travail, lumière rasante. Tons chauds et sourds, cadrage serré, pas de visage identifiable."
          />
          <View style={{ marginTop: 26 }}>
            <Head n={numOf("Invalidité")} t="Invalidité" lead="L'objectif de couverture est d'environ 90 % du salaire. En cas d'accident, la LAA intervient ; en cas de maladie, seules l'AI et la LPP couvrent — d'où une lacune souvent plus marquée." />
          </View>
          {analysis?.invaliditeMaladie && (
            <View>
              <Text style={s.colHead}>EN CAS DE MALADIE</Text>
              <Bar card={analysis.invaliditeMaladie} unit="/mois" />
              <Interp card={analysis.invaliditeMaladie} unit="/mois" />
              <BesoinNote card={analysis.invaliditeMaladie} unit="/mois" />
            </View>
          )}
          {analysis?.invaliditeAccident && (
            <View>
              <Text style={s.colHead}>EN CAS D&apos;ACCIDENT</Text>
              <Bar card={analysis.invaliditeAccident} unit="/mois" />
              <Interp card={analysis.invaliditeAccident} unit="/mois" />
              <BesoinNote card={analysis.invaliditeAccident} unit="/mois" />
            </View>
          )}
        </Page>
      )}

      {/* ══ DÉCÈS ══ */}
      {analysis?.deces && (
        <Page size="A4" style={s.page}>
          <Chrome page={pageOf("Décès")} />
          <ImageSlot
            img={images.deces}
            height={132}
            brief="Image de transmission — deux générations, silhouettes à contre-jour, ou une maison au crépuscule. Tons sombres et sobres, jamais mortifère."
          />
          <View style={{ marginTop: 26 }}>
            <Head n={numOf("Décès")} t="Décès" lead="Le besoin correspond au capital nécessaire pour maintenir le niveau de vie de vos proches et honorer vos engagements. Il se compare aux capitaux versés par la LPP, la LAA et votre 3e pilier." />
          </View>
          <Bar card={analysis.deces} unit="" />
          <Interp card={analysis.deces} unit="" />
          <BesoinNote card={analysis.deces} unit="" />
          {N(analysis.deces.renteMensuelle) > 0 && (
            <View style={{ marginTop: 28, paddingTop: 20, borderTopWidth: 0.75, borderTopColor: RULE }}>
              <Text style={s.colHead}>RENTES DE SURVIVANTS</Text>
              <Text style={s.noteTxt}>
                En complément des capitaux ci-dessus, vos proches percevraient une rente mensuelle de{" "}
                <Text style={{ fontFamily: SANS_B }}>{chf(analysis.deces.renteMensuelle)}</Text>, versée par l&apos;AVS et la LPP.
                Elle diminue à mesure que les enfants cessent d&apos;ouvrir droit.
              </Text>
            </View>
          )}
        </Page>
      )}

      {/* ══ 1er PILIER ══ */}
      {pp && (
        <Page size="A4" style={s.page}>
          <Chrome page={pageOf("Prestations de l'État")} />
          <Head n={numOf("Prestations de l'État")} t="Prestations de l'État" lead="Le 1er pilier (AVS / AI) et l'assurance-accidents obligatoire (LAA) constituent le socle de votre protection. Ces montants sont déjà compris dans les couvertures présentées." />
          <Row k="Rente de vieillesse AVS (à 65 ans)" v={`${chf(pp.retraite?.avs)} / mois`} />
          <Row k="Rente d'invalidité AI — maladie" v={`${chf(pp.invaliditeMaladie?.avs)} / mois`} />
          <Row k="Rente d'invalidité AI — accident" v={`${chf(pp.invaliditeAccident?.avs)} / mois`} />
          <Row k="Rente LAA — accident" v={`${chf(pp.invaliditeAccident?.laa)} / mois`} />
          <Row k="Rentes de survivants AVS — maladie" v={`${chf(pp.decesMaladie?.avs)} / mois`} />
          <Row k="Rentes de survivants AVS + LAA — accident" v={`${chf(N(pp.decesAccident?.avs) + N(pp.decesAccident?.laa))} / mois`} />
        </Page>
      )}

      {/* ══ SOLUTIONS EN PLACE — une page par tranche de fiches ══ */}
      {planPages.map((entries, pi) => (
        <Page key={`sol-${pi}`} size="A4" style={s.page}>
          <Chrome page={pageOf("Solutions en place") + pi} />
          {pi === 0 ? (
            <Head n={numOf("Solutions en place")} t="Solutions en place" lead="Le détail de vos couvertures actuelles, telles qu'elles entrent dans les calculs de ce dossier." />
          ) : (
            <Head n={numOf("Solutions en place")} t="Solutions en place (suite)" />
          )}
          {entries.map((e, i) => (
            <View key={e.plan.id || i}>
              {/* L'intitulé du groupe est rappelé au premier élément de la page. */}
              {(i === 0 || entries[i - 1].group !== e.group) && (
                <Text style={s.colHead}>{e.group}</Text>
              )}
              <PlanBlock title="" ps={[e.plan]} kind={e.kind} />
            </View>
          ))}
        </Page>
      ))}

      {/* ══ FISCALITÉ ══ */}
      {fiscal && (
        <Page size="A4" style={s.page}>
          <Chrome page={pageOf("Optimisation fiscale")} />
          <Head n={numOf("Optimisation fiscale")} t="Optimisation fiscale" lead="Les versements au 3e pilier a sont déductibles du revenu imposable, dans la limite d'un plafond annuel. Maximiser ce plafond réduit directement votre impôt." />
          <View style={s.kpiRow}>
            <Kpi k="VERSÉ CETTE ANNÉE" v={fmt(fiscal.investi3aAnnuel)} u="CHF" />
            <Kpi k="PLAFOND DÉDUCTIBLE" v={fmt(fiscal.plafond3a)} u="CHF" />
            <Kpi k="ÉCONOMIE ESTIMÉE" v={fmt(fiscal.gainFiscalAnnuel)} u="CHF / an" />
          </View>
          <View style={{ marginTop: 32 }}>
            <Row k="Taux d'utilisation du plafond" v={`${Math.round(N(fiscal.pourcentUtilise))} %`} />
            <Row k="Taux marginal d'imposition" v={`~${Math.round(N(fiscal.tauxMarginal) * 100) || 25} %`} />
          </View>
        </Page>
      )}

      {/* ══ RECOMMANDATIONS ══ */}
      <Page size="A4" style={s.page}>
        <Chrome page={pageOf("Recommandations")} />
        <Head n={numOf("Recommandations")} t="Recommandations" lead="Les priorités qui découlent de l'analyse." />
        {recos.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", marginBottom: 18 }} wrap={false}>
            <Text style={{ fontFamily: SERIF, fontSize: 17, color: FAINT, width: 30 }}>{String(i + 1).padStart(2, "0")}</Text>
            <Text style={{ flex: 1, fontSize: 10.5, color: INK, lineHeight: 1.6 }}>{r}</Text>
          </View>
        ))}
        <View style={{ marginTop: 30, paddingTop: 18, borderTopWidth: 0.75, borderTopColor: RULE }}>
          <Text style={s.noteTxt}>
            Votre conseiller CreditX reste à disposition pour mettre en œuvre ces recommandations, sans engagement de votre part.
          </Text>
        </View>
      </Page>

      {/* ══ NOTES D'ENTRETIEN (page pleine) ══ */}
      <Page size="A4" style={s.page}>
        <Chrome page={pageOf("Notes d'entretien")} />
        <Head
          n={numOf("Notes d'entretien")}
          t="Notes d'entretien"
          lead={notes ? undefined : "Espace réservé aux remarques échangées lors de l'entretien."}
        />
        {notes ? <Text style={{ fontSize: 10.5, color: INK, lineHeight: 1.8 }}>{notes}</Text> : null}
        {/* Lignes réglées : toute la page si aucune note, le reste de la page
            sinon — une note brève laisserait autrement une demi-page vide, et
            le client doit pouvoir compléter à la main pendant l'entretien.
            Au-delà d'une note longue, on n'en ajoute pas : elles déborderaient. */}
        {(notes || "").trim().length < 700 && (
          <View style={{ marginTop: notes ? 24 : 8 }}>
            {Array.from({ length: notes ? 12 : 18 }).map((_, i) => <View key={i} style={s.ruleLine} />)}
          </View>
        )}
      </Page>

      {/* ══ MENTIONS LÉGALES ══ */}
      <Page size="A4" style={s.pageBleed}>
        <ImageSlot
          img={images.closing}
          height={300}
          brief="Image de clôture, plein cadre — architecture sobre, matière (pierre, bois), ou horizon au couchant. Sombre, très peu de détail, sert de respiration finale."
        />
        {/* Bloc légal ancré EN BAS : posé dans le flux, il laissait la moitié
            inférieure de la page vide. */}
        <View style={{ position: "absolute", bottom: 52, left: 52, right: 52 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoSrc} style={{ height: 13, width: 33, objectFit: "contain", alignSelf: "flex-start", marginBottom: 26 }} />
          <Text style={s.legalP}>
            <Text style={{ fontFamily: SANS_B }}>CreditX Sàrl</Text> — UID CHE-203.347.547 · Place de l&apos;Aubade 3, 1950 Sion. Intermédiaire d&apos;assurance <Text style={{ fontFamily: SANS_B }}>non lié</Text> (indépendant),
            enregistré auprès de la FINMA sous le n° <Text style={{ fontFamily: SANS_B }}>F01536084</Text>.
            
          </Text>
          <Text style={[s.legalP, { color: MUTED, fontSize: 7 }]}>
            Document indicatif établi le {today} à partir des données communiquées, à titre informatif et sans engagement.
            Les montants sont des estimations fondées sur la législation en vigueur et peuvent évoluer.
            Ce document ne constitue ni un conseil définitif, ni une offre contractuelle.
          </Text>
          <Text style={[s.legalP, { color: MUTED, fontSize: 7 }]}>
            www.creditx.ch | info@creditx.ch | CreditX 2026
          </Text>
        </View>
      </Page>
    </Document>
  );
}
