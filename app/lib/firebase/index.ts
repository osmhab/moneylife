// app/lib/firebase/index.ts

import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore, setLogLevel } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCBuLqRCKj1NrO-vSfleo4HzsAeUXG9P_A",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "auth.creditx.ch", // <-- MODIFIÉ ICI
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "moneylife-c3b0b",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "moneylife-c3b0b.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "425523736072",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:425523736072:web:328b0646b9993829f3abbd",
};

// Initialisation de l'App
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialisation sécurisée de Firestore
export const db = getApps().length 
  ? getFirestore(app) 
  : initializeFirestore(app, { ignoreUndefinedProperties: true });

setLogLevel("error");

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch(() => {});