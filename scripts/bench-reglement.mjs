// scripts/bench-reglement.mjs
//
// BANC D'ESSAI : quel moteur comprend le mieux un règlement de caisse ?
//
// La question « tel modèle est-il assez bon ? » n'a de réponse qu'en chiffres.
// Ce script note un modèle sur des points de VÉRITÉ TERRAIN — établis par
// lecture humaine du règlement, pas par une autre IA — et répète l'épreuve pour
// mesurer aussi la CONSTANCE, qui est la vraie faiblesse d'un modèle sur un
// texte juridique : une lecture juste deux fois sur trois ne vaut rien quand
// elle décide de la couverture décès d'un client.
//
// Usage :
//   node scripts/bench-reglement.mjs                       (défauts)
//   node scripts/bench-reglement.mjs 3 gemini:gemini-2.5-flash openai:gpt-5.6-sol
//
// Les clés sont cherchées dans .env.local ET env.prod.yaml ; on retient celle
// qui authentifie.

import fs from "fs";

const passages = Number(process.argv[2]) || 3;
const candidats = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["gemini:gemini-2.5-flash", "openai:gpt-5.6-sol"];

/**
 * Clés candidates pour un fournisseur, dans l'ordre d'essai.
 *
 * On rend les DEUX sources plutôt que d'en élire une : `.env.local` et
 * `env.prod.yaml` divergent en pratique (l'une des deux clés OpenAI était
 * périmée, puis c'est l'autre qui l'était). Élire la mauvaise ferait conclure
 * qu'un modèle est « indisponible » pour une raison sans rapport avec lui.
 */
function cles(nom) {
  const lire = (f, re) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").match(re)?.[1] : null);
  const local = lire(".env.local", new RegExp(`^${nom}=(.+)$`, "m"));
  const prod = lire("env.prod.yaml", new RegExp(`^${nom}:\\s*"?([^"\\n]+)"?`, "m"));
  return [...new Set([local, prod].filter(Boolean).map((k) => k.trim()))];
}

/** Le prompt RÉEL de production : on note ce qui tourne, pas une variante. */
const src = fs.readFileSync("app/api/lpp/reglement/route.ts", "utf8");
const PROMPT = src.slice(src.indexOf("Tu analyses le RÈGLEMENT"), src.indexOf("}`;\n\n/** Bloc vide"));

/**
 * JEU D'ÉPREUVE — plusieurs règlements, aux structures volontairement
 * différentes. Un modèle qui réussit sur un seul document ne prouve rien : la
 * difficulté d'un règlement tient à sa forme (annexes qui surchargent, deux
 * colonnes entrelacées, montants renvoyés à un autre document), et chaque
 * caisse a la sienne.
 *
 * Toutes les attentes ci-dessous ont été établies par LECTURE HUMAINE du PDF,
 * jamais par une autre IA. Un document absent du disque est simplement ignoré.
 */
const DOCUMENTS = [
  {
    nom: "Aevum 2026",
    chemin: "/Users/Habib/CreditX/screenshots/2026_Aevum_Reglement_FR21.pdf",
    // art. 57 (5 ans OU enfants communs) · art. 63 (capital si aucune rente)
    // art. 66 (300 %) · annexes 6/7/8 qui se contredisent entre elles
    verite: (d) => {
      const annexe = (c) => (d.annexes ?? []).find((x) => `${x.nom ?? ""} ${x.sappliqueA ?? ""}`.includes(c));
      const rp = d.general?.rentePartenaire ?? {};
      const sup = d.general?.capitalDecesSupplementaire ?? {};
      return [
        ["caisse", /AEVUM/i.test(d.caisse?.nom ?? "")],
        ["capital art.63 conditionnel", d.general?.capitalDeces?.verse === "SI_AUCUNE_RENTE_PARTENAIRE"],
        ["durée 5 ans", rp.dureeViecommuneAns === 5],
        ["dispense enfants", rp.enfantsCommunsRemplacentDuree === true],
        ["annexe ex-PAT BVG", annexe("PAT BVG")?.surcharges?.capitalDeces?.verse === "TOUJOURS"],
        ["annexe ex-PSZ", annexe("Zofingen")?.surcharges?.capitalDeces?.verse === "REDUIT_DU_FINANCEMENT_RENTE"],
        ["annexe ex-HJB", annexe("Jura bernois")?.surcharges?.capitalDeces?.verse === "SI_AUCUNE_RENTE_PARTENAIRE"],
        ["annexes nommées par le plan",
          (d.annexes ?? []).length > 0 && (d.annexes ?? []).every((a) => !/^annexe/i.test((a.nom ?? "").trim()))],
        ["art.66 les 300 %", sup.pourcentageSalaire === 300 || sup.pourcentageSalaire === 3],
      ];
    },
  },
  {
    nom: "AXA Suisse romande 2026",
    chemin: "/Users/Habib/CreditX/screenshots/L1152_002.pdf",
    // Structure OPPOSÉE à Aevum, et c'est l'intérêt : le capital (ch. 62) n'est
    // PAS conditionné à l'absence de rente de partenaire — seulement au fait de
    // décéder avant la retraite. Un modèle qui plaquerait la règle d'Aevum
    // échouerait ici. Mise en page sur deux colonnes, entrelacée à l'extraction.
    verite: (d) => {
      const cd = d.general?.capitalDeces ?? {};
      const rp = d.general?.rentePartenaire ?? {};
      return [
        ["caisse", /AXA/i.test(d.caisse?.nom ?? "")],
        ["capital NON conditionné à la rente", cd.verse === "TOUJOURS"],
        ["capital avant la retraite seulement", cd.avantRetraiteUniquement === true],
        ["capital cité au ch. 62", /62/.test(cd.article ?? "")],
        ["durée 5 ans (ch. 57)", rp.dureeViecommuneAns === 5],
        ["dispense enfants communs", rp.enfantsCommunsRemplacentDuree === true],
        ["partenariat cité au ch. 57", /57/.test(rp.article ?? "")],
        // AXA n'a pas d'annexes de plan : en inventer serait une hallucination.
        ["aucune annexe inventée", (d.annexes ?? []).length === 0],
      ];
    },
  },
].filter((doc) => fs.existsSync(doc.chemin));

async function interroger(candidat, pdf) {
  const [fournisseur, modele] = candidat.split(":");
  const debut = Date.now();

  let texte;
  if (fournisseur === "openai") {
    const corps = JSON.stringify({
      model: modele,
      input: [{ role: "user", content: [
        { type: "input_text", text: PROMPT },
        { type: "input_file", filename: "reglement.pdf", file_data: `data:application/pdf;base64,${pdf}` },
      ]}],
      text: { format: { type: "json_object" } },
    });
    let derniere = "aucune clé OpenAI";
    let j = null;
    for (const k of cles("OPENAI_API_KEY")) {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${k}` },
        body: corps,
      });
      if (r.ok) { j = await r.json(); break; }
      derniere = `HTTP ${r.status} ${(await r.text()).slice(0, 90)}`;
      if (r.status !== 401) break;   // 401 = mauvaise clé, on tente la suivante
    }
    if (!j) return { erreur: derniere };
    texte = (j.output ?? []).flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
  } else {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cles("GEMINI_API_KEY")[0]}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: "application/pdf", data: pdf } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }) });
    if (!r.ok) return { erreur: `HTTP ${r.status}` };
    texte = (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
  }

  const secondes = Math.round((Date.now() - debut) / 1000);
  try { return { extrait: JSON.parse(texte), secondes }; }
  catch { return { erreur: "JSON illisible", secondes }; }
}

if (DOCUMENTS.length === 0) {
  console.log("Aucun règlement de référence sur le disque — rien à noter.");
  process.exit(0);
}

for (const doc of DOCUMENTS) {
  const pdf = fs.readFileSync(doc.chemin).toString("base64");
  console.log(`\n${doc.nom} · ${passages} passage(s) · vérité établie à la main`);
  for (const candidat of candidats) {
    const scores = [], temps = [], echecs = {};
    let total = 0, erreur = null;
    for (let i = 0; i < passages; i++) {
      const r = await interroger(candidat, pdf);
      if (r.erreur) { erreur = r.erreur; break; }
      const points = doc.verite(r.extrait);
      scores.push(points.filter((p) => p[1]).length); temps.push(r.secondes); total = points.length;
      for (const [nom, ok] of points) if (!ok) echecs[nom] = (echecs[nom] ?? 0) + 1;
    }
    if (erreur) { console.log(`  ${candidat.padEnd(26)} indisponible — ${erreur}`); continue; }
    const moyenne = Math.round(temps.reduce((a, b) => a + b, 0) / temps.length);
    const rates = Object.entries(echecs).map(([n, k]) => `${n} ×${k}`).join(", ");
    console.log(`  ${candidat.padEnd(26)} ${scores.join("/")} sur ${total}   ${moyenne}s   ${rates || "aucun raté"}`);
  }
}
