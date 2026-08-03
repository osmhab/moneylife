import { NextResponse } from "next/server";
import { authAdmin, db } from "app/lib/firebase/admin";
import { writeAdminAudit } from "app/lib/audit/adminAudit";

const INTERNAL_UIDS = new Set([
  "FRFN1sTxU4VjlbJXnC3wBGLoVyw2",
  "3gs6ZKCkw5eULYtM65Ko0Pba8wJ2",
]);

function isInternalDecoded(decoded: any) {
  const email = (decoded?.email || "").toLowerCase();
  const uid = decoded?.uid;

  return (
    INTERNAL_UIDS.has(uid) ||
    email.endsWith("@creditx.ch") ||
    email.endsWith("@moneylife.ch")
  );
}

async function requireInternal(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new Error("UNAUTHENTICATED");

  const decoded = await authAdmin.verifyIdToken(token);
  if (!isInternalDecoded(decoded)) throw new Error("FORBIDDEN");
  return decoded;
}

function randomPassword() {
  return "ML!" + Math.random().toString(36).slice(2) + "9A";
}

type Body = {
  // Optionnel : sans email → PROSPECT (compte Auth sans connexion, uid stable ;
  // l'email s'ajoute plus tard via /set-email sans rien migrer).
  email?: string;

  // optionnel: pré-remplir DonneePersonnelles/current
  firstName?: string;
  lastName?: string;
  birthdate?: string; // "dd.MM.yyyy"

  // optionnel: forcer un mdp (sinon auto)
  tempPassword?: string;
};

export async function POST(req: Request) {
  try {
    const decoded = await requireInternal(req);

    const body = (await req.json()) as Body;
    const email = (body?.email || "").trim().toLowerCase();
    const firstName = (body?.firstName || "").trim();
    const lastName = (body?.lastName || "").trim();
    const isProspect = !email;

    // Prospect (sans email) : on exige nom + prénom pour l'identifier dans la liste.
    if (isProspect && (!firstName || !lastName)) {
      return NextResponse.json(
        { error: "Nom et prénom requis pour créer un prospect (sans email)." },
        { status: 400 }
      );
    }

    const tempPassword = (body?.tempPassword || randomPassword()).trim();

    // 1) Create Auth user — AVEC email (compte actif) ou SANS (prospect : uid stable,
    //    sans moyen de connexion ; l'email s'ajoutera plus tard sans rien migrer).
    const createProps: Record<string, unknown> = { disabled: false };
    if (isProspect) {
      createProps.displayName = `${firstName} ${lastName}`.trim();
    } else {
      createProps.email = email;
      createProps.password = tempPassword;
      createProps.emailVerified = false;
    }
    const user = await authAdmin.createUser(createProps);

    // 2) Create root client doc (CRM)
    const now = Date.now();
    await db.collection("clients").doc(user.uid).set(
      {
        uid: user.uid,
        email: email || null,
        status: isProspect ? "prospect" : "active",
        source: isProspect ? "admin_prospect" : "admin_create",
        firstName: firstName || null,
        lastName: lastName || null,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    // 3) Optionnel: init DonneePersonnelles/current
    const hasDpSeed = !!(body.firstName || body.lastName || body.birthdate);
    if (hasDpSeed) {
      await db.doc(`clients/${user.uid}/DonneePersonnelles/current`).set(
        {
          Enter_prenom: body.firstName || "",
          Enter_nom: body.lastName || "",
          Enter_dateNaissance: body.birthdate || "",
          updatedAt: now,
          createdAt: now,
          source: "admin_create",
        },
        { merge: true }
      );
    }

    // 4) (Optionnel, plus tard) send password reset email
    // -> on fera ça côté UI en affichant un lien reset si tu veux.

    await writeAdminAudit({
      action: "client.create",
      actor: {
        uid: decoded.uid,
        email: decoded.email || null,
      },
      target: {
        clientUid: user.uid,
        clientEmail: email || null,
      },
      meta: {
        hasDpSeed,
        isProspect,
        source: isProspect ? "admin_prospect" : "admin_create",
      },
    });

    return NextResponse.json({
      ok: true,
      uid: user.uid,
      isProspect,
      email: email || null,
      // Prospect : pas de mot de passe (pas de connexion tant qu'il n'y a pas d'email).
      tempPassword: isProspect ? null : tempPassword, // ⚠️ à afficher une seule fois côté UI
    });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";

    // erreurs fréquentes
    // auth/email-already-exists
    // auth/invalid-password
    // ...
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}