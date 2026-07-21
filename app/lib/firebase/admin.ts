//app/lib/firebase/admin.ts
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.FIREBASE_PROJECT_ID || "moneylife-c3b0b";
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || "moneylife-c3b0b.firebasestorage.app";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket,
  });
}

export const db = getFirestore();
export const storage = getStorage();
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "moneylife-c3b0b.firebasestorage.app";
export const bucket = storage.bucket(bucketName);
export const authAdmin = getAuth();