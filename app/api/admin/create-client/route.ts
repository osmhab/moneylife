import { NextResponse } from "next/server";
// Chemins relatifs infaillibles vers tes fichiers lib
import { authAdmin, db } from "../../../lib/firebase/admin"; 
import { sendCreditXNewAccountEmail } from "lib/mail/creditx-mailer";
import { requireInternal } from "@/lib/server/requireInternal";

export async function POST(req: Request) {
// ⚠️ Cette route était ENTIÈREMENT OUVERTE : aucun contrôle de jeton. En
// production, un POST anonyme atteignait la logique métier (vérifié : HTTP 400
// « paramètres manquants » au lieu de 401). N'importe qui connaissant l'URL
// pouvait donc s'en servir. La garde est désormais la première instruction.
  try {
    await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  try {
    const body = await req.json();
    const { firstName, lastName, email, phone } = body;

    // 1. Vérification des champs
    if (!email || !firstName || !lastName) {
      return NextResponse.json({ error: "L'email, le prénom et le nom sont obligatoires." }, { status: 400 });
    }

    // 2. Générer un mot de passe aléatoire très complexe (Le client le changera)
    const randomPassword = Math.random().toString(36).slice(-10) + "A1!x";

    // 3. Créer l'utilisateur dans Firebase Auth (avec authAdmin)
    const userRecord = await authAdmin.createUser({
      email: email.trim(),
      password: randomPassword,
      displayName: `${firstName.trim()} ${lastName.trim()}`,
    });

    const uid = userRecord.uid;

    // 4. Créer le dossier principal dans Firestore (avec db)
    await db.collection("clients").doc(uid).set({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone || "",
      createdAt: new Date(),
      createdByAdmin: true,
      status: "Nouveau"
    });

    // 5. Créer le sous-dossier de données personnelles
    await db.collection("clients").doc(uid).collection("DonneePersonnelles").doc("current").set({
      Enter_prenom: firstName.trim(),
      Enter_nom: lastName.trim(),
      Enter_email: email.trim(),
      Enter_telephone: phone || "",
    });

    // 6. Envoyer l'email de bienvenue / reset mot de passe
    await sendCreditXNewAccountEmail({
      to: email.trim(),
      firstName: firstName.trim(),
    });

    return NextResponse.json({ success: true, uid });

  } catch (error: any) {
    console.error("Erreur API create-client:", error);
    if (error.code === 'auth/email-already-exists') {
        return NextResponse.json({ error: "Cette adresse email est déjà utilisée par un compte existant." }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur interne lors de la création du client." }, { status: 500 });
  }
}