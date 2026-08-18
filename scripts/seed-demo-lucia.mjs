// scripts/seed-demo-lucia.mjs
//
// Crée un COMPTE DE DÉMO client « lambda » : Lucia Lopez, 30 ans, femme, salariée,
// célibataire, sans enfant, 65'000 CHF/an. LPP (2e pilier) + un 3a bancaire + un 3a
// assurance. À usage vidéo/démonstration.
//
//   node scripts/seed-demo-lucia.mjs
//
// Idempotent : réutilise le compte Auth si l'email existe déjà, et réécrit les docs.

import admin from "firebase-admin";
import fs from "fs";

const sa = JSON.parse(fs.readFileSync("./secrets/moneylife-sa.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: "moneylife-c3b0b" });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = admin.auth();
const NOW = admin.firestore.FieldValue.serverTimestamp();

// ── Persona ────────────────────────────────────────────────────────────────
const EMAIL = "lucia.lopez@creditx.ch";
const PASSWORD = "Lucia2026!";
const PRENOM = "Lucia";
const NOM = "Lopez";
const DISPLAY = `${PRENOM} ${NOM}`;
const DOB = "15.03.1996"; // 30 ans en 2026 (dd.MM.yyyy)
const SALAIRE = 65000;

// ── 1) Compte Auth (créé ou réutilisé) ───────────────────────────────────────
async function ensureUser() {
  try {
    const u = await auth.getUserByEmail(EMAIL);
    await auth.updateUser(u.uid, { password: PASSWORD, displayName: DISPLAY, emailVerified: true });
    console.log(`↻ Auth réutilisé : ${u.uid}`);
    return u.uid;
  } catch {
    const u = await auth.createUser({ email: EMAIL, password: PASSWORD, displayName: DISPLAY, emailVerified: true });
    console.log(`＋ Auth créé : ${u.uid}`);
    return u.uid;
  }
}

const uid = await ensureUser();
const photoURL = `https://api.dicebear.com/7.x/rings/svg?seed=${uid}&radius=25`;

// ── 2) Doc racine client + miroir users/{uid} ────────────────────────────────
await db.doc(`clients/${uid}`).set({
  displayName: DISPLAY,
  firstName: PRENOM,
  lastName: NOM,
  email: EMAIL,
  photoURL,
  status: "ACTIVE",
  createdAt: NOW,
  updatedAt: NOW,
  legal: { acceptedAt: NOW, version: "2026-03-31", cguUrl: "/legal/cgu", privacyUrl: "/legal/confidentialite" },
}, { merge: true });

await db.doc(`users/${uid}`).set({
  uid, email: EMAIL, displayName: DISPLAY, provider: "password", createdAt: NOW, updatedAt: NOW,
}, { merge: true });

// ── 3) Données personnelles ─────────────────────────────────────────────────
await db.doc(`clients/${uid}/DonneePersonnelles/current`).set({
  Enter_prenom: PRENOM,
  Enter_nom: NOM,
  Enter_dateNaissance: DOB,
  Enter_sexe: 1,               // 1 = féminin
  Enter_civilite: "Mme",
  Enter_noAVS: "756.9217.0844.51",
  Enter_email: EMAIL,
  Enter_telephone: "+41 79 486 22 10",
  Enter_langue: "fr",

  Enter_etatCivil: 0,          // célibataire
  Enter_hasEnfants: false,
  Enter_enfants: [],

  Enter_statutProfessionnel: 0, // salariée
  Enter_travaillePlusde8HSemaine: true,
  Enter_Affilie_LPP: true,
  Enter_employeur: "Nestlé SA",
  Enter_lppTauxActivite: 100,
  Enter_tauxOccupation: 100,

  Enter_salaireAnnuel: SALAIRE,

  Enter_adresse: "Avenue de la Gare 12",
  Enter_localite: "Lausanne",
  Enter_npa: "1003",
  Enter_canton: "VD",
  Enter_nationalite: "CH",
  Enter_permisSejour: null,

  Enter_ageDebutCotisationsAVS: 21,
  Enter_anneeDebutCotisationAVS: 2017,
  Enter_hasAnnesManquantesAVS: false,
  Enter_anneesManquantesAVS: [],

  Enter_ijMaladie: true,
  Enter_ijMaladieTaux: 80,
  Enter_ijAccidentTaux: 80,

  createdAt: NOW,
  updatedAt: NOW,
}, { merge: true });

// ── 4) Plans : LPP (2e pilier) + 3a bancaire + 3a assurance ───────────────────
async function upsertPlan(tag, payload) {
  // Cherche un plan déjà semé avec ce tag (démo idempotente).
  const existing = await db.collection(`clients/${uid}/plans`).where("demoTag", "==", tag).limit(1).get();
  const ref = existing.empty ? db.collection(`clients/${uid}/plans`).doc() : existing.docs[0].ref;
  await ref.set({ ...payload, demoTag: tag, metadata: { createdAt: new Date(), updatedAt: new Date(), isManualEntry: true, sourceFile: "MANUAL" } }, { merge: true });
  return ref.id;
}

// 2e pilier — certificat LPP réaliste pour 65'000 CHF, 30 ans, célibataire sans enfant.
const lppId = await upsertPlan("LPP_BASE", {
  type: "LPP_BASE",
  institutionName: "Caisse de pension Nestlé",
  origin: "external",
  status: "ACTIVE",
  data: {
    Enter_typeSalaireAssure: "general",
    Enter_salaireAssureLPP: 38540,          // 65'000 - 26'460 (déduction de coordination)
    Enter_avoirVieillesseObligatoire: 18200,
    Enter_avoirVieillesseTotal: 22400,
    // Retraite (projection à 65)
    Enter_lppCapitalProjete65: 210000,
    capitalRetraiteGlobal: 210000,          // clé prioritaire lue par le moteur
    Enter_prestationCapital65: 210000,
    Enter_rentevieillesseLPP65: 12600,      // rente annuelle à 65
    // Invalidité (maladie)
    Enter_renteInvaliditeMaladie: 15400,
    Enter_renteEnfantInvalideMaladie: 3080,
    // Décès — célibataire sans enfant : pas de rente conjoint/orphelin,
    // mais restitution de l'avoir (capital indépendant toujours versé).
    Enter_renteConjointLPP: 0,
    Enter_renteOrphelinLPP: 0,
    Enter_CapitalPlusRenteMal: 0,
    Enter_CapitalDecesIndependantMal: 22400,
    // Cotisations d'épargne (repli projection composée)
    Enter_lppCotisationEpargneEmploye: 2698,
    Enter_lppCotisationEpargneEmployeur: 2698,
    Enter_dateCertificatLPP: "01.01.2026",
    Enter_anneeCertificat: "2026",
    Enter_prenom: PRENOM,
    Enter_nom: NOM,
  },
});

// 3a bancaire — épargne régulière modeste.
const bankId = await upsertPlan("PILIER_3A_BANK", {
  type: "PILIER_3A_BANK",
  institutionName: "PostFinance",
  origin: "external",
  status: "ACTIVE",
  data: {
    bankName: "PostFinance",
    accountNumber: "CH93 0900 0000 1234 5678 9",
    startDate: "01.03.2022",
    isRegulier: true,
    montantRegulier: 200,
    occurrence: "mois",
    soldeActuel: 8200,
    isInvesti: true,
    profil: "equilibre",
    isEnGage: false,
    capitalRetraiteProjete: 187000,
    projectionAgeRef: 30,
  },
});

// 3a assurance — prévoyance liée avec couverture décès/invalidité.
const insId = await upsertPlan("PILIER_3A_POLICE", {
  type: "PILIER_3A_POLICE",
  institutionName: "Swiss Life",
  origin: "external",
  status: "ACTIVE",
  data: {
    typeContrat: "3a",
    compagnie: "Swiss Life",
    dateDebut: "01.06.2020",
    dateEcheance: "15.03.2061",   // 65 ans
    primeTotale: 250,
    primeEpargne: 200,
    occurrence: "mois",
    valeurRachatActuelle: 6100,
    projectionAssureur: 145000,   // > 0 → prioritaire sur le calcul auto
    isInvesti: true,
    profil: "equilibre",
    isLibere: false,
    isEnGage: false,
    hasLDP: true,
    renteInvalidite: 12000,
    typeCapitalDeces: "fixe",
    capitalDecesFixe: 100000,
    capitalRetraiteProjete: 145000,
    capitalDecesCalcule: 100000,
  },
});

console.log(`＋ Plans : LPP=${lppId}  3a-banque=${bankId}  3a-assurance=${insId}`);

// ── 5) Déclenche le moteur (Cloud Function onClientDataUpdate = onUpdate) ──────
// Une simple mise à jour de DonneePersonnelles/current force le recalcul de Analyse/current.
await new Promise((r) => setTimeout(r, 1500));
await db.doc(`clients/${uid}/DonneePersonnelles/current`).set(
  { _lastEngineTrigger: NOW, updatedAt: NOW },
  { merge: true }
);
console.log("↻ Moteur déclenché (recalcul Analyse/current)…");

// ── 6) Attend que Analyse/current soit peuplé ─────────────────────────────────
let ok = false;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const snap = await db.doc(`clients/${uid}/Analyse/current`).get();
  if (snap.exists && snap.data()?.projections) { ok = true; break; }
}

console.log("\n─────────────────────────────────────────────");
console.log(`Compte démo : ${DISPLAY}`);
console.log(`  Login      : ${EMAIL}`);
console.log(`  Mot de passe : ${PASSWORD}`);
console.log(`  UID        : ${uid}`);
console.log(`  Analyse/current peuplé : ${ok ? "OUI ✅" : "PAS ENCORE (le moteur peut prendre quelques secondes de plus)"}`);
console.log("─────────────────────────────────────────────");

process.exit(0);
