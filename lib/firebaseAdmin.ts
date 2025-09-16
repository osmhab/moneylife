// lib/firebaseAdmin.ts
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Variables attendues côté serveur (.env, sans NEXT_PUBLIC_):
// FIREBASE_PROJECT_ID=moneylife-c3b0b
// FIREBASE_STORAGE_BUCKET=moneylife-c3b0b.firebasestorage.app
// (ADC configuré: gcloud auth application-default login)

const projectId = process.env.FIREBASE_PROJECT_ID || "moneylife-c3b0b";
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET || "moneylife-c3b0b.firebasestorage.app";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket,
  });
}

export const db = getFirestore();
export const bucket = getStorage().bucket();
