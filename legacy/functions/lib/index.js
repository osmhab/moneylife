"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateClientData = void 0;
// functions/src/index.ts
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
// Optionnel : fixe une région si tu veux
// import { setGlobalOptions } from "firebase-functions/v2";
// setGlobalOptions({ region: "europe-west6" });
admin.initializeApp();
/**
 * Copie les données de clients/{fromUid} (+ sous-collection prestations)
 * vers clients/{toUid}. Seul l'utilisateur authentifié {toUid} peut demander la migration.
 *
 * Appel côté client (web):
 *   const fn = httpsCallable(getFunctions(), "migrateClientData");
 *   await fn({ fromUid, toUid });
 */
exports.migrateClientData = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    // ✅ V2: auth & data sont sur "request"
    const auth = request.auth;
    if (!auth) {
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    }
    const data = request.data;
    const fromUid = String((_a = data === null || data === void 0 ? void 0 : data.fromUid) !== null && _a !== void 0 ? _a : "");
    const toUid = String((_b = data === null || data === void 0 ? void 0 : data.toUid) !== null && _b !== void 0 ? _b : "");
    if (!fromUid || !toUid) {
        throw new https_1.HttpsError("invalid-argument", "fromUid and toUid are required.");
    }
    // sécurité: seul le user connecté peut migrer vers SON propre UID
    if (auth.uid !== toUid) {
        throw new https_1.HttpsError("permission-denied", "Only the target user can migrate.");
    }
    const db = admin.firestore();
    const fromRef = db.doc(`clients/${fromUid}`);
    const toRef = db.doc(`clients/${toUid}`);
    const batch = db.batch();
    // 1) Doc racine
    const fromSnap = await fromRef.get();
    if (fromSnap.exists) {
        batch.set(toRef, fromSnap.data(), { merge: true });
    }
    // 2) Sous-collection prestations (si existe)
    const subSnap = await fromRef.collection("prestations").get();
    subSnap.docs.forEach((d) => {
        batch.set(toRef.collection("prestations").doc(d.id), d.data(), { merge: true });
    });
    await batch.commit();
    // Optionnel : supprimer l'ancien doc (souvent on garde en archive)
    // await fromRef.delete();
    return { ok: true };
});
//# sourceMappingURL=index.js.map