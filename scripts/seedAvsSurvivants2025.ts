// scripts/seedAvsSurvivants2025.ts
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main() {
  const filePath = path.resolve(process.cwd(), "firestore/regs_avs_survivants_2025.json");
  const content = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(content);
  await db.collection("regs_avs_survivants").doc("2025").set(data, { merge: true });
  console.log("✅ Seed OK → regs_avs_survivants/2025");
}

main().catch((e) => {
  console.error("❌ Seed error:", e);
  process.exit(1);
});
