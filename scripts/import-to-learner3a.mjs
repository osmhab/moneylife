// scripts/import-to-learner3a.mjs
import admin from "firebase-admin";
import fs from "fs";

const serviceAccountPath = "./secrets/moneylife-sa.json";
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ Service account introuvable:", serviceAccountPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/**
 * 1) Choisis ta SOURCE collection ici (celle où tes offres existent déjà)
 * Exemples possibles chez toi :
 * - "offers_parsed"
 * - "offers_requests_3e"
 * - "leads-3a"
 * - autre
 */
const SOURCE_COLLECTION = "offers_parsed"; // <-- CHANGE ICI

/**
 * 2) Fonction de mapping : adapte les noms de champs à TA source réelle
 * Objectif: produire un doc compatible learner-3a (benchmarks bruts)
 */
function mapToLearner(doc) {
  const d = doc.data();

  // --- Récupération robuste avec fallback ---
  const provider = d.provider || d.compagnie || d.insurer || d.company;
  const productName = d.productName || d.produit || d.product || provider;

  const age = Number(d.age ?? d.clientAge ?? d.profile?.age ?? 30);
  const gender = (d.gender ?? d.sexe ?? d.profile?.gender ?? "M") === "F" ? "F" : "M";
  const isSmoker = !!(d.isSmoker ?? d.fumeur ?? d.profile?.isSmoker ?? false);

  // primes / risques
  const annualPremiumTotal = Number(d.annualPremiumTotal ?? d.primeAnnuelle ?? d.premiumAnnual ?? 0);

  const deathCapital = Number(d.deathCapital ?? d.capitalDeces ?? 0);
  const deathPremium = Number(d.deathPremium ?? d.primeDeces ?? 0);

  const disabilityRente = Number(d.disabilityRente ?? d.renteInvalidite ?? 0);
  const disabilityPremium = Number(d.disabilityPremium ?? d.primeInvalidite ?? 0);

  const premiumWaiverValue = Number(d.premiumWaiverValue ?? d.montantLiberation ?? 0);
  const premiumWaiverPremium = Number(d.premiumWaiverPremium ?? d.primeLiberation ?? 0);

  // épargne / rendement / projection
  const savingPremiumAnnual = Number(d.savingPremiumAnnual ?? d.epargneAnnuelle ?? 0);
  const userYieldRate = Number(d.userYieldRate ?? d.rendement ?? d.yield ?? 0);
  const projectedCapitalAtRetirement = Number(d.projectedCapitalAtRetirement ?? d.capital65 ?? d.projectedCapital ?? 0);

  // rachats
  const surrenderValues = Array.isArray(d.surrenderValues ?? d.rachats) ? (d.surrenderValues ?? d.rachats) : [];

  // cas “décès inclus”
  const isDeathIncludedInSavings = !!(d.isDeathIncludedInSavings ?? d.decesInclusEpargne ?? false);

  // sécurité minimale
  if (!provider) return null;

  return {
    provider,
    productName,
    age,
    gender,
    isSmoker,

    annualPremiumTotal,
    savingPremiumAnnual,

    isDeathIncludedInSavings,
    deathCapital,
    deathPremium,

    disabilityRente,
    disabilityPremium,

    premiumWaiverValue,
    premiumWaiverPremium,

    userYieldRate,
    projectedCapitalAtRetirement,

    surrenderValues,

    // metadata
    importedFrom: `${SOURCE_COLLECTION}/${doc.id}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function main() {
  console.log("📥 Import depuis:", SOURCE_COLLECTION);

  const snap = await db.collection(SOURCE_COLLECTION).get();
  console.log("Docs source:", snap.size);

  let imported = 0;
  let skipped = 0;

  // Batch write (500 max)
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const learnerDoc = mapToLearner(doc);
    if (!learnerDoc) {
      skipped++;
      continue;
    }

    // clé stable: provider + age + gender + smoker + sourceId (évite doublons)
    const key = `${learnerDoc.provider}__${learnerDoc.age}__${learnerDoc.gender}__${learnerDoc.isSmoker ? "S" : "NS"}__${doc.id}`;
    const ref = db.collection("learner-3a").doc(key);

    batch.set(ref, learnerDoc, { merge: true });
    batchCount++;
    imported++;

    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
      console.log("✅ batch committed, imported so far:", imported);
    }
  }

  if (batchCount > 0) await batch.commit();

  console.log("✅ Done. imported:", imported, "| skipped:", skipped);
  console.log("➡️ Next: lance /api/admin/learner-3a/retrain pour créer learner_models_3a");
}

main().catch((e) => {
  console.error("❌ Import failed:", e);
  process.exit(1);
});