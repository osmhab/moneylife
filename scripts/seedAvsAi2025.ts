// scripts/seedAvsAi2025.ts
// Usage: pnpm tsx scripts/seedAvsAi2025.ts
// Prérequis: ADC configuré (gcloud auth application-default login)


import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';


initializeApp({ credential: applicationDefault() });
const db = getFirestore();


async function main() {
const filePath = path.resolve(process.cwd(), 'firestore/regs_avs_ai_2025.json');
const content = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(content);


if (!data || !Array.isArray(data.rows)) {
throw new Error('JSON invalide: champ "rows" manquant.');
}


await db.collection('regs_avs_ai').doc('2025').set(data, { merge: true });
console.log('✅ Seed OK → regs_avs_ai/2025 (' + data.rows.length + ' lignes)');
}


main().catch((err) => {
console.error('❌ Seed error:', err);
process.exit(1);
});