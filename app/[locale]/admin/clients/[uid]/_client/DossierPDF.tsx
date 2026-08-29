"use client";

// Dossier de prévoyance en VRAI PDF (@react-pdf/renderer) — document financier professionnel.
// Généré côté navigateur puis ouvert dans un onglet (pas de page HTML intermédiaire, pas de nav).
// Données = celles de l'Analyse conseiller (au centime). Logo CreditX noir sur fond blanc.

import * as React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { ENUM_EtatCivil } from "@/lib/core/enums";

type AnyObj = Record<string, any>;
const N = (v: any) => Number(v) || 0;
const fmt = (n: any) => Math.round(N(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
const chf = (n: any) => `${fmt(n)} CHF`;

const STATUT_PRO: Record<string, string> = { "0": "Salarié·e", "1": "Indépendant·e", "2": "Sans emploi" };
const PC: Record<string, string> = { avs: "#0E9F6E", lpp: "#0075FF", laa: "#FF7A00", "3a": "#C21DC7" };
const PL: Record<string, string> = { avs: "AVS / AI (1er pilier)", lpp: "LPP (2e pilier)", laa: "LAA (accident)", "3a": "3e pilier privé" };
const PLAB: Record<string, string> = {
  LPP_BASE: "LPP — base", LPP_COMPL: "LPP — complémentaire", LPP: "LPP",
  LIBRE_PASSAGE_POLICE: "Libre passage (police)", LIBRE_PASSAGE_COMPTE: "Libre passage (compte)",
  PILIER_3A_POLICE: "3a assurance", PILIER_3A_BANK: "3a banque", "3A_BANQUE": "3a banque",
  PILIER_3B: "3b assurance", EPARGNE_LIBRE: "Épargne libre",
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

const NAVY = "#0B1B34", BLUE = "#0075FF", INK = "#101828", GREY = "#667085", LIGHT = "#98A2B3", LINE = "#E4E7EC";

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 54, paddingHorizontal: 44, fontFamily: "Helvetica", fontSize: 9.5, color: INK, lineHeight: 1.5 },
  // header / footer fixes
  hdr: { position: "absolute", top: 18, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 6 },
  hdrLogo: { height: 13 },
  hdrSub: { fontSize: 8, color: LIGHT, textTransform: "uppercase", letterSpacing: 1 },
  ftr: { position: "absolute", bottom: 22, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6, fontSize: 7.5, color: LIGHT },
  // cover
  cover: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  coverTop: { paddingHorizontal: 54, paddingTop: 70 },
  coverLogo: { width: 190, marginBottom: 60 },
  kicker: { fontSize: 10, color: BLUE, textTransform: "uppercase", letterSpacing: 2, fontFamily: "Helvetica-Bold" },
  coverTitle: { fontSize: 34, fontFamily: "Helvetica-Bold", color: INK, marginTop: 10, marginBottom: 26 },
  coverMeta: { fontSize: 11, color: GREY, lineHeight: 1.9 },
  conf: { marginTop: 16, fontSize: 8.5, color: LIGHT, textTransform: "uppercase", letterSpacing: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8, alignSelf: "flex-start" },
  coverRule: { height: 3, backgroundColor: BLUE, width: 70, marginTop: 30 },
  coverFoot: { position: "absolute", bottom: 44, left: 54, right: 54, fontSize: 8.5, color: LIGHT, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10 },
  // sections
  secTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, marginTop: 4 },
  secNum: { width: 20, height: 20, backgroundColor: BLUE, color: "#fff", borderRadius: 5, fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 4, marginRight: 8 },
  secTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: INK },
  lead: { fontSize: 9.5, color: GREY, marginBottom: 8 },
  b: { fontFamily: "Helvetica-Bold", color: INK },
  section: { marginBottom: 18 },
  sub: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#344054", marginTop: 10, marginBottom: 4 },
  // grid info
  infoRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#EEF1F4", borderStyle: "dashed", paddingVertical: 4 },
  infoK: { color: GREY, fontSize: 9.5 },
  infoV: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  cols: { flexDirection: "row", gap: 26 },
  col: { flex: 1 },
  // tables
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#F1F3F5", paddingVertical: 5 },
  thRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 4 },
  th: { fontSize: 7.5, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.5 },
  td: { fontSize: 9.5 },
  num: { textAlign: "right" },
  // score
  scoreBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: LINE, borderRadius: 10, padding: 14, marginBottom: 12, gap: 18 },
  scoreNum: { fontSize: 38, fontFamily: "Helvetica-Bold", lineHeight: 1 },
  scoreCol: { alignItems: "center", width: 96 },
  scoreWord: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 5 },
  // coverage bar
  covRow: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 8 },
  covLbl: { width: 58, fontSize: 8, color: LIGHT, textTransform: "uppercase" },
  covTrack: { flex: 1, height: 11, borderRadius: 6, backgroundColor: "#F1F3F5", flexDirection: "row", overflow: "hidden" },
  covVal: { width: 86, textAlign: "right", fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4, marginLeft: 66 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendTxt: { fontSize: 7.5, color: GREY },
  interp: { fontSize: 9, padding: 7, borderRadius: 6, marginTop: 6 },
  // plan card
  planCard: { borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 9, marginBottom: 7 },
  planHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  planType: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  planInst: { color: GREY, fontSize: 9 },
  // toc
  tocRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: LINE, borderStyle: "dashed" },
  tocNum: { width: 20, height: 20, borderWidth: 1.2, borderColor: BLUE, color: BLUE, borderRadius: 10, fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 4 },
  tocTxt: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  cta: { marginTop: 10, padding: 10, backgroundColor: "#EAF3FF", borderWidth: 1, borderColor: "#CFE4FF", borderRadius: 8, fontSize: 9, color: "#0B4A9E" },
  legalP: { fontSize: 7.5, color: GREY, marginTop: 10, lineHeight: 1.5 },
});

function Bar({ card, unit }: { card: AnyObj; unit: string }) {
  const besoin = N(card?.besoin), lacune = N(card?.lacune);
  const layers = (card?.layers || []).filter((l: AnyObj) => N(l.amount) > 0);
  const total = Math.max(besoin, layers.reduce((a: number, l: AnyObj) => a + N(l.amount), 0) + lacune, 1);
  return (
    <View wrap={false} style={{ marginBottom: 4 }}>
      <View style={s.covRow}>
        <Text style={s.covLbl}>Besoin</Text>
        <View style={s.covTrack}><View style={{ width: `${(besoin / total) * 100}%`, backgroundColor: "#DDE1E6", height: "100%" }} /></View>
        <Text style={s.covVal}>{fmt(besoin)}{unit}</Text>
      </View>
      <View style={s.covRow}>
        <Text style={s.covLbl}>Couverture</Text>
        <View style={s.covTrack}>
          {layers.map((l: AnyObj, i: number) => <View key={i} style={{ width: `${(N(l.amount) / total) * 100}%`, backgroundColor: PC[l.key] || "#94a3b8", height: "100%" }} />)}
          {lacune > 0 && <View style={{ width: `${(lacune / total) * 100}%`, backgroundColor: "#F4B4B4", height: "100%" }} />}
        </View>
        <Text style={s.covVal}>{fmt(card?.couverture)}{unit}</Text>
      </View>
      <View style={s.legend}>
        {layers.map((l: AnyObj, i: number) => (
          <View key={i} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: PC[l.key] || "#94a3b8" }]} /><Text style={s.legendTxt}>{PL[l.key] || l.key} · {chf(l.amount)}{unit}</Text></View>
        ))}
        {lacune > 0 && <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: "#E88" }]} /><Text style={s.legendTxt}>Lacune · {chf(lacune)}{unit}</Text></View>}
      </View>
    </View>
  );
}

function Interp({ card, unit }: { card: AnyObj; unit: string }) {
  const lac = N(card.lacune), besoin = N(card.besoin);
  if (lac > besoin * 0.02)
    return (
      <Text style={[s.interp, { backgroundColor: "#FDECEC", color: "#B42318" }]}>
        <Text style={{ fontFamily: "Helvetica-Bold" }}>Lacune de {chf(lac)}{unit}. </Text>
        Vos prestations ne couvrent pas entièrement le besoin estimé : un complément de prévoyance est recommandé.
      </Text>
    );
  return (
    <Text style={[s.interp, { backgroundColor: "#E7F6EF", color: "#067647" }]}>
      <Text style={{ fontFamily: "Helvetica-Bold" }}>Besoin couvert. </Text>Vos prestations atteignent ou dépassent le besoin estimé.
    </Text>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return <View style={s.infoRow}><Text style={s.infoK}>{k}</Text><Text style={s.infoV}>{v}</Text></View>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <View style={s.tr}><Text style={[s.td, { flex: 1 }]}>{k}</Text><Text style={[s.td, s.num, { width: 130 }]}>{v}</Text></View>;
}
function SecTitle({ n, t }: { n: number; t: string }) {
  return <View style={s.secTitleRow}><Text style={s.secNum}>{n}</Text><Text style={s.secTitle}>{t}</Text></View>;
}

export default function DossierPDF({ client, plans, analysis, advisor, today, logoSrc = "/creditx-logo-black.png" }: { client: AnyObj; plans: AnyObj[]; analysis: AnyObj | null; advisor: string; today: string; logoSrc?: string }) {
  const name = `${client.Enter_prenom || ""} ${client.Enter_nom || ""}`.trim() || "Client";
  const enfants: AnyObj[] = Array.isArray(client.Enter_enfants) ? client.Enter_enfants : [];
  const score = Math.round(N(analysis?.totalScore));
  const sc = score >= 70 ? "#0E9F6E" : score >= 40 ? "#D9822B" : "#DC2626";
  const sw = score >= 70 ? "Bonne couverture" : score >= 40 ? "À renforcer" : "Lacunes importantes";
  const plans2 = plans.filter((p) => is2(p?.type)), plans3 = plans.filter((p) => is3(p?.type)), plansEp = plans.filter((p) => isEpargne(p?.type));
  const pp = analysis?.premierPilier, fiscal = analysis?.fiscal;
  const risks = [
    { key: "retraite", label: "Retraite", unit: "/mois", card: analysis?.retraite },
    { key: "invMal", label: "Invalidité — maladie", unit: "/mois", card: analysis?.invaliditeMaladie },
    { key: "invAcc", label: "Invalidité — accident", unit: "/mois", card: analysis?.invaliditeAccident },
    { key: "deces", label: "Décès", unit: "", card: analysis?.deces },
  ].filter((r) => r.card);

  const recos: string[] = [];
  for (const r of risks) {
    const lac = N(r.card?.lacune);
    if (lac > N(r.card?.besoin) * 0.02) recos.push(`Combler la lacune « ${r.label} » de ${chf(lac)}${r.unit === "/mois" ? " par mois" : ""} via une solution adaptée.`);
  }
  if (fiscal && N(fiscal.pourcentUtilise) < 95) recos.push(`Maximiser le 3e pilier a (${Math.round(N(fiscal.pourcentUtilise))} % du plafond) — économie estimée ~${chf(fiscal.gainFiscalAnnuel)}/an.`);
  if (!recos.length) recos.push("Situation globalement couverte. À réviser lors de tout changement de vie (mariage, naissance, salaire, achat immobilier).");

  const TOC = [
    "Profil du client", "Synthèse & score de prévoyance", "Retraite (vieillesse)", "Invalidité (incapacité de gain)",
    "Décès (protection des proches)", "1er pilier — prestations de l'État", "Solutions de prévoyance en place",
    "Optimisation fiscale — 3e pilier a", "Recommandations",
  ];

  const Header = () => (
    <View style={s.hdr} fixed>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={logoSrc} style={s.hdrLogo} />
      <Text style={s.hdrSub}>Analyse de prévoyance</Text>
    </View>
  );
  const Footer = () => (
    <View style={s.ftr} fixed>
      <Text>CreditX Sàrl · FINMA F01536084 · Document confidentiel</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );

  const PlanBlock = ({ title, ps, kind }: { title: string; ps: AnyObj[]; kind: "lpp" | "3a" | "ep" }) => {
    if (!ps.length) return null;
    return (
      <View>
        <Text style={s.sub}>{title}</Text>
        {ps.map((p, i) => {
          const d = p.data || {};
          const rows: [string, string][] = [["Capital projeté à 65 ans", chf(cap65(p))]];
          if (kind === "lpp") {
            if (N(d.Enter_rentevieillesseLPP65)) rows.push(["Rente de vieillesse", `${chf(d.Enter_rentevieillesseLPP65)} /an`]);
            if (N(d.Enter_renteInvaliditeMaladie)) rows.push(["Rente d'invalidité", `${chf(d.Enter_renteInvaliditeMaladie)} /an`]);
            if (N(d.Enter_renteConjointLPP)) rows.push(["Rente de conjoint", `${chf(d.Enter_renteConjointLPP)} /an`]);
            const cd = N(d.Enter_CapitalPlusRenteMal) + N(d.Enter_CapitalDecesIndependantMal);
            if (cd) rows.push(["Capital décès", chf(cd)]);
          } else if (kind === "3a" && !isBank(p.type)) {
            if (N(d.primeTotale)) rows.push(["Prime", `${chf(d.primeTotale)} / ${d.occurrence === "annee" ? "an" : "mois"}`]);
            if (N(d.renteInvalidite)) rows.push(["Rente d'invalidité", `${chf(d.renteInvalidite)} /an`]);
            if (N(d.capitalDecesFixe)) rows.push(["Capital décès", chf(d.capitalDecesFixe)]);
          } else if (N(d.soldeActuel)) rows.push(["Solde actuel", chf(d.soldeActuel)]);
          return (
            <View key={p.id || i} style={s.planCard} wrap={false}>
              <View style={s.planHead}><Text style={s.planType}>{PLAB[String(p.type)] || p.type}</Text><Text style={s.planInst}>{p.label || p.institutionName || ""}</Text></View>
              {rows.map(([k, v], j) => <Row key={j} k={k} v={v} />)}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Document title={`Analyse de prévoyance — ${name}`} author="CreditX Sàrl">
      {/* ── PAGE DE GARDE ── */}
      <Page size="A4" style={[s.page, s.cover]}>
        <View style={s.coverTop}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoSrc} style={s.coverLogo} />
          <Text style={s.kicker}>Analyse de prévoyance personnalisée</Text>
          <Text style={s.coverTitle}>{name}</Text>
          <View style={s.coverMeta}>
            <Text>Établi le {today}</Text>
            {advisor ? <Text>Conseiller : {advisor}</Text> : null}
          </View>
          <Text style={s.conf}>Document confidentiel</Text>
          <View style={s.coverRule} />
        </View>
        <Text style={s.coverFoot}>CreditX Sàrl · Intermédiaire d'assurance non lié · FINMA F01536084 · MoneyLife</Text>
      </Page>

      {/* ── CONTENU ── */}
      <Page size="A4" style={s.page}>
        <Header />
        <Footer />

        {/* Sommaire */}
        <View style={s.section}>
          <Text style={s.secTitle}>Sommaire</Text>
          <View style={{ marginTop: 8 }}>
            {TOC.map((t, i) => (
              <View key={i} style={s.tocRow}><Text style={s.tocNum}>{i + 1}</Text><Text style={s.tocTxt}>{t}</Text></View>
            ))}
          </View>
        </View>

        {/* 1. Profil */}
        <View style={s.section}>
          <SecTitle n={1} t="Profil du client" />
          <View style={s.cols}>
            <View style={s.col}>
              <Info k="Nom et prénom" v={name} />
              <Info k="Date de naissance" v={client.Enter_dateNaissance || "—"} />
              <Info k="État civil" v={(ENUM_EtatCivil as AnyObj)[Number(client.Enter_etatCivil) || 0] || "—"} />
            </View>
            <View style={s.col}>
              <Info k="Statut professionnel" v={STATUT_PRO[String(client.Enter_statutProfessionnel ?? 0)] || "—"} />
              <Info k="Salaire annuel brut" v={client.Enter_salaireAnnuel ? chf(client.Enter_salaireAnnuel) : "—"} />
              <Info k="Affilié LPP" v={client.Enter_Affilie_LPP ? "Oui" : "Non"} />
            </View>
          </View>
          {enfants.length > 0 && (
            <View>
              <Text style={s.sub}>Enfants ({enfants.length})</Text>
              <View style={s.thRow}><Text style={[s.th, { flex: 1 }]}>Prénom</Text><Text style={[s.th, { width: 120 }]}>Naissance</Text><Text style={[s.th, { width: 80 }]}>En formation</Text></View>
              {enfants.map((e, i) => (
                <View key={i} style={s.tr}><Text style={[s.td, { flex: 1 }]}>{e.Enter_prenom || "—"}</Text><Text style={[s.td, { width: 120 }]}>{e.Enter_dateNaissance || "—"}</Text><Text style={[s.td, { width: 80 }]}>{e.Enter_enFormation ? "Oui" : "Non"}</Text></View>
              ))}
            </View>
          )}
          <Text style={[s.lead, { marginTop: 8 }]}>Le profil ci-dessus sert de base à l'ensemble des calculs (rentes de l'État, invalidité, décès, capacité d'épargne 3e pilier).</Text>
        </View>

        {/* 2. Score */}
        {analysis && (
          <View style={s.section}>
            <SecTitle n={2} t="Synthèse & score de prévoyance" />
            <View style={s.scoreBox}>
              <View style={s.scoreCol}>
                <Text style={[s.scoreNum, { color: sc }]}>{score}<Text style={{ fontSize: 14, color: LIGHT }}>/100</Text></Text>
                <Text style={[s.scoreWord, { color: sc }]}>{sw}</Text>
              </View>
              <Text style={[s.lead, { flex: 1, marginBottom: 0 }]}>Ce score synthétise votre niveau de couverture sur les quatre grands risques, en comparant vos prestations projetées à vos besoins.</Text>
            </View>
            <View style={s.thRow}><Text style={[s.th, { flex: 1 }]}>Risque</Text><Text style={[s.th, s.num, { width: 90 }]}>Besoin</Text><Text style={[s.th, s.num, { width: 90 }]}>Couverture</Text><Text style={[s.th, s.num, { width: 90 }]}>Lacune</Text></View>
            {risks.map((r) => {
              const lac = N(r.card.lacune), gap = lac > N(r.card.besoin) * 0.02;
              return (
                <View key={r.key} style={s.tr}>
                  <Text style={[s.td, { flex: 1 }]}>{r.label}</Text>
                  <Text style={[s.td, s.num, { width: 90 }]}>{fmt(r.card.besoin)}{r.unit}</Text>
                  <Text style={[s.td, s.num, { width: 90 }]}>{fmt(r.card.couverture)}{r.unit}</Text>
                  <Text style={[s.td, s.num, { width: 90, color: gap ? "#DC2626" : "#0E9F6E", fontFamily: "Helvetica-Bold" }]}>{lac > 0 ? `${fmt(lac)}${r.unit}` : "Aucune"}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* 3. Retraite */}
        {analysis?.retraite && (
          <View style={s.section}>
            <SecTitle n={3} t="Retraite (vieillesse)" />
            <Text style={s.lead}>À la retraite (65 ans), l'objectif est de maintenir environ <Text style={s.b}>80 % du dernier salaire</Text> via l'AVS (1er pilier), la LPP (2e pilier) et la prévoyance privée (3e pilier).</Text>
            <Bar card={analysis.retraite} unit="/mois" />
            <Interp card={analysis.retraite} unit="/mois" />
          </View>
        )}

        {/* 4. Invalidité */}
        {(analysis?.invaliditeMaladie || analysis?.invaliditeAccident) && (
          <View style={s.section}>
            <SecTitle n={4} t="Invalidité (incapacité de gain)" />
            <Text style={s.lead}>Objectif de couverture ~<Text style={s.b}>90 % du salaire</Text>. La protection diffère selon la cause : en <Text style={s.b}>accident</Text> la LAA intervient ; en <Text style={s.b}>maladie</Text>, seules l'AI et la LPP couvrent — d'où une lacune souvent plus marquée.</Text>
            {analysis?.invaliditeMaladie && (<><Text style={s.sub}>En cas de maladie</Text><Bar card={analysis.invaliditeMaladie} unit="/mois" /><Interp card={analysis.invaliditeMaladie} unit="/mois" /></>)}
            {analysis?.invaliditeAccident && (<><Text style={s.sub}>En cas d'accident</Text><Bar card={analysis.invaliditeAccident} unit="/mois" /><Interp card={analysis.invaliditeAccident} unit="/mois" /></>)}
          </View>
        )}

        {/* 5. Décès */}
        {analysis?.deces && (
          <View style={s.section}>
            <SecTitle n={5} t="Décès (protection des proches)" />
            <Text style={s.lead}>En cas de décès, vos proches perçoivent des <Text style={s.b}>rentes de survivants</Text> (AVS + LPP) et des <Text style={s.b}>capitaux</Text> (capital décès LPP, 3e pilier).</Text>
            <Bar card={analysis.deces} unit="" />
            <Interp card={analysis.deces} unit="" />
          </View>
        )}

        {/* 6. 1er pilier */}
        {pp && (
          <View style={s.section}>
            <SecTitle n={6} t="1er pilier — prestations de l'État (AVS / AI / LAA)" />
            <Text style={s.lead}>Prestations mensuelles estimées, dérivées de votre profil (salaire, âge, situation familiale).</Text>
            <Row k="Rente de vieillesse (AVS)" v={`${chf(pp.retraite?.avs)} /mois`} />
            <Row k="Rente d'invalidité — maladie (AI)" v={`${chf(pp.invaliditeMaladie?.avs)} /mois`} />
            <Row k="Rente d'invalidité — accident (AI + LAA)" v={`${chf(N(pp.invaliditeAccident?.avs) + N(pp.invaliditeAccident?.laa))} /mois`} />
            <Row k="Rentes de survivants — maladie (AVS)" v={`${chf(pp.decesMaladie?.avs)} /mois`} />
            <Row k="Rentes de survivants — accident (AVS + LAA)" v={`${chf(N(pp.decesAccident?.avs) + N(pp.decesAccident?.laa))} /mois`} />
          </View>
        )}

        {/* 7. Solutions */}
        <View style={s.section}>
          <SecTitle n={7} t="Solutions de prévoyance en place" />
          <Text style={s.lead}>Récapitulatif de vos contrats et avoirs de prévoyance existants, par pilier.</Text>
          <PlanBlock title="2e pilier — LPP" ps={plans2} kind="lpp" />
          <PlanBlock title="3e pilier — privé (3a / 3b)" ps={plans3} kind="3a" />
          {plansEp.length > 0 && <PlanBlock title="Épargne libre" ps={plansEp} kind="ep" />}
          {!plans2.length && !plans3.length && !plansEp.length && <Text style={{ color: LIGHT }}>Aucune solution enregistrée à ce jour.</Text>}
        </View>

        {/* 8. Fiscal */}
        {fiscal && (
          <View style={s.section}>
            <SecTitle n={8} t="Optimisation fiscale — 3e pilier a" />
            <Text style={s.lead}>Les versements au 3e pilier a sont <Text style={s.b}>déductibles du revenu imposable</Text>, dans la limite d'un plafond annuel. Maximiser ce plafond réduit directement votre impôt.</Text>
            <Row k="Versé cette année" v={chf(fiscal.investi3aAnnuel)} />
            <Row k="Plafond annuel déductible" v={chf(fiscal.plafond3a)} />
            <Row k="Taux d'utilisation du plafond" v={`${Math.round(N(fiscal.pourcentUtilise))} %`} />
            <Row k="Économie d'impôt estimée / an" v={chf(fiscal.gainFiscalAnnuel)} />
            <Row k="Taux marginal d'imposition" v={`~${Math.round(N(fiscal.tauxMarginal) <= 1 ? N(fiscal.tauxMarginal) * 100 : N(fiscal.tauxMarginal))} %`} />
          </View>
        )}

        {/* 9. Recommandations */}
        <View style={s.section}>
          <SecTitle n={9} t="Recommandations" />
          {recos.map((r, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 6 }}><Text style={{ color: BLUE, marginRight: 6 }}>•</Text><Text style={{ fontSize: 9.5, flex: 1 }}>{r}</Text></View>
          ))}
          <Text style={s.cta}>Votre conseiller CreditX reste à votre disposition pour mettre en œuvre ces recommandations, sans engagement de votre part.</Text>
          <Text style={s.legalP}>
            <Text style={s.b}>CreditX Sàrl</Text> — UID CHE-203.347.547 · Av. de la Gare 54, 1964 Conthey · Place de l'Aubade 3, 1950 Sion.
            Intermédiaire d'assurance <Text style={s.b}>non lié</Text> (indépendant), enregistré à la FINMA sous le n° <Text style={s.b}>F01536084</Text>.
            Partenaires : AXA, Swiss Life, Pax, Baloise, Helvetia. Service gratuit pour le client.
          </Text>
          <Text style={[s.legalP, { color: LIGHT }]}>
            Document indicatif établi le {today} à partir des données communiquées, à titre informatif et sans engagement. Les montants sont des estimations
            basées sur la législation en vigueur et peuvent évoluer. Ne constitue ni un conseil définitif, ni une offre contractuelle.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
