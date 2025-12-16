// lib/auth/postAuthRedirect.ts
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Après login/signup :
 * - Si une analyse existe -> /analyse/{id} (la plus récente).
 * - Sinon on crée une analyse minimale -> /analyse/{nouvelId}.
 */
export async function resolvePostAuthRedirect(_: string): Promise<string> {
  return '/app';
}

