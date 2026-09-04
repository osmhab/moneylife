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

const PDF = "/Users/Habib/CreditX/screenshots/2026_Aevum_Reglement_FR21.pdf";

const passages = Number(process.argv[2]) || 3;
const candidats = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["gemini:gemini-2.5-flash", "gemini:gemini-3.8-flash", "openai:gpt-5.6-sol"];

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

const pdf = fs.readFileSync(PDF).toString("base64");

/**
 * VÉRITÉ TERRAIN — règlement Aevum du 1er janvier 2026, vérifiée à la main :
 *   art. 57  cinq ans de vie commune OU entretien d'enfants communs, désignation écrite
 *   art. 63  capital décès versé « si aucune rente de partenaire n'est échue »
 *   art. 66  capital supplémentaire de 300 % du salaire assuré risque
 *   annexe 6 ex-HJB → conditionnel · annexe 7 ex-PSZ → réduit · annexe 8 ex-PAT BVG → toujours
 */
function noter(d) {
  const annexe = (c) => (d.annexes ?? []).find((x) => `${x.nom ?? ""} ${x.sappliqueA ?? ""}`.includes(c));
  const rp = d.general?.rentePartenaire ?? {};
  const cond = (rp.conditions ?? "").toLowerCase();
  const sup = d.general?.capitalDecesSupplementaire ?? {};
  return [
    ["caisse", /AEVUM/i.test(d.caisse?.nom ?? "")],
    ["général art.63", d.general?.capitalDeces?.verse === "SI_AUCUNE_RENTE_PARTENAIRE"],
    ["durée 5 ans", rp.dureeViecommuneAns === 5],
    ["dispense enfants", rp.enfantsCommunsRemplacentDuree === true],
    ["annexe ex-PAT BVG", annexe("PAT BVG")?.surcharges?.capitalDeces?.verse === "TOUJOURS"],
    ["annexe ex-PSZ", annexe("Zofingen")?.surcharges?.capitalDeces?.verse === "REDUIT_DU_FINANCEMENT_RENTE"],
    ["annexe ex-HJB", annexe("Jura bernois")?.surcharges?.capitalDeces?.verse === "SI_AUCUNE_RENTE_PARTENAIRE"],
    // Une annexe nommée « Annexe n° 8 » ne se rattache à aucun certificat :
    // le rattachement échouerait en silence.
    ["annexes nommées par le plan",
      (d.annexes ?? []).length > 0 && (d.annexes ?? []).every((a) => !/^annexe/i.test((a.nom ?? "").trim()))],
    ["art.57 désignation écrite", /écrit|déclaration|signature/.test(cond)],
    ["art.66 les 300 %", sup.pourcentageSalaire === 300 || sup.pourcentageSalaire === 3],
  ];
}

async function interroger(candidat) {
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
  try {
    const points = noter(JSON.parse(texte));
    return { points, score: points.filter((p) => p[1]).length, total: points.length, secondes };
  } catch {
    return { erreur: "JSON illisible", secondes };
  }
}

console.log(`Règlement Aevum 2026 · ${passages} passage(s) par candidat · vérité établie à la main\n`);
for (const candidat of candidats) {
  const scores = [], temps = [], echecs = {};
  let total = 0, erreur = null;
  for (let i = 0; i < passages; i++) {
    const r = await interroger(candidat);
    if (r.erreur) { erreur = r.erreur; break; }
    scores.push(r.score); temps.push(r.secondes); total = r.total;
    for (const [nom, ok] of r.points) if (!ok) echecs[nom] = (echecs[nom] ?? 0) + 1;
  }
  if (erreur) { console.log(`${candidat.padEnd(28)} indisponible — ${erreur}`); continue; }
  const moyenne = Math.round(temps.reduce((a, b) => a + b, 0) / temps.length);
  const rates = Object.entries(echecs).map(([n, k]) => `${n} ×${k}`).join(", ");
  console.log(`${candidat.padEnd(28)} ${scores.join("/")} sur ${total}   ${moyenne}s   ${rates || "aucun raté"}`);
}
