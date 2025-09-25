// scripts/seedAvsSurvivants2025.ts
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

function readJSON(relPath: string) {
  const p = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(p)) {
    throw new Error(`Fichier introuvable: ${relPath}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  // Chemin “officiel” que tu utilises déjà :
  const PRIMARY = "firestore/regs_avs_survivants_2025.json";
  // Fallback si jamais tu avais l’ancien nom :
  const FALLBACK = "firestore/avs_survivants_2025.json";

  let data: any;
  try {
    data = readJSON(PRIMARY);
  } catch {
    data = readJSON(FALLBACK);
    console.warn(`⚠️ Fallback utilisé → ${FALLBACK}`);
  }

  if (!data?.avs_survivants) {
    throw new Error('JSON invalide: bloc "avs_survivants" manquant à la racine.');
  }

  await db.collection("regs_avs_survivants").doc("2025").set(data, { merge: true });
  console.log("✅ Seed OK → regs_avs_survivants/2025");
}

main().catch((e) => {
  console.error("❌ Seed error:", e);
  process.exit(1);
});
