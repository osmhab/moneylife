// scripts/seedLaa2025.ts
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs'; import path from 'node:path';
initializeApp({ credential: applicationDefault() });
const db = getFirestore();
async function main() {
  const p = path.resolve(process.cwd(), 'firestore/regs_laa_2025.json');
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!data?.laa) throw new Error('JSON invalide: bloc "laa" manquant.');
  await db.collection('regs_laa').doc('2025').set(data, { merge: true });
  console.log('✅ Seed OK → regs_laa/2025');
}
main().catch(e => { console.error('❌ Seed error:', e); process.exit(1); });
