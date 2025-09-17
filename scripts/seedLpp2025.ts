// scripts/seedLpp2025.ts
// Usage: pnpm tsx scripts/seedLpp2025.ts
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

function readJSON(relPath: string) {
  const p = path.resolve(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function main() {
  const regsLpp = readJSON('firestore/regs_lpp_2025.json');
  const survLpp = readJSON('firestore/lpp_survivants_2025.json');

  await db.collection('regs_lpp').doc('2025').set(regsLpp, { merge: true });
  console.log(`✅ regs_lpp/2025 (${(regsLpp.rows?.length ?? 'n/a')} rows ou paramètres)`);

  await db.collection('lpp_survivants').doc('2025').set(survLpp, { merge: true });
  console.log('✅ lpp_survivants/2025 (conditions survivants & capital décès)');
}

main().catch((e) => { console.error('❌ Seed error:', e); process.exit(1); });
