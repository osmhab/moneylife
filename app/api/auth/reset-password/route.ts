// app/api/auth/reset-password/route.ts
import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import sgMail from "@sendgrid/mail";

// Fonction pour initialiser Firebase proprement en lisant GOOGLE_SA_JSON
function getFirebaseAdmin() {
  if (!admin.apps.length) {
    const saJsonString = process.env.GOOGLE_SA_JSON;
    
    if (!saJsonString) {
      throw new Error("Variable d'environnement GOOGLE_SA_JSON manquante.");
    }

    let serviceAccount;
    try {
      // On transforme la chaîne de texte en objet Javascript
      serviceAccount = JSON.parse(saJsonString);
    } catch (e) {
      throw new Error("GOOGLE_SA_JSON n'est pas un JSON valide.");
    }

    if (!serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error("Clé privée ou email client manquant dans GOOGLE_SA_JSON.");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
        clientEmail: serviceAccount.client_email,
        // On s'assure que les sauts de ligne de la clé RSA sont corrects
        privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    // 1. Vérification de la clé SendGrid
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    if (!SENDGRID_API_KEY) {
      return NextResponse.json({ error: "Clé SendGrid manquante sur le serveur." }, { status: 500 });
    }
    sgMail.setApiKey(SENDGRID_API_KEY);

    // Initialisation sécurisée de Firebase avec ton JSON
    const adminApp = getFirebaseAdmin();

    // 2. Générer le lien de réinitialisation avec Firebase
    let resetLink = "";
    try {
      // Firebase génère son lien par défaut (ex: https://auth.creditx.ch/__/auth/action?oobCode=XYZ...)
      const defaultLink = await adminApp.auth().generatePasswordResetLink(email);
      
      // On extrait le code secret généré par Firebase
      const parsedUrl = new URL(defaultLink);
      const oobCode = parsedUrl.searchParams.get("oobCode");
      
      // On construit NOTRE propre lien vers notre nouvelle page Next.js
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3020";
      resetLink = `${baseUrl}/reset-password?oobCode=${oobCode}`;
      
    } catch (firebaseErr: any) {
      // Sécurité : ne pas dire si l'email existe ou non aux hackers
      if (firebaseErr.code === 'auth/user-not-found') {
        return NextResponse.json({ ok: true });
      }
      throw firebaseErr;
    }

    // 3. Le template HTML (design CreditX épuré)
    const htmlEmail = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
          .container { max-width: 500px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04); }
          .header { text-align: center; padding: 40px 20px 20px; }
          
          /* Modification ICI pour régler le problème de ratio sur mobile */
          .header img { max-width: 150px; width: 100%; height: auto; }
          
          .content { padding: 20px 40px 40px; text-align: center; }
          h1 { color: #0f172a; font-size: 20px; font-weight: 800; margin-bottom: 16px; }
          p { color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 32px; }
          .btn { display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; }
          .footer { text-align: center; padding: 20px; color: #94a3b8; font-size: 12px; background-color: #f8fafc; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd" alt="CreditX" />
          </div>
          <div class="content">
            <h1>Réinitialisation de votre mot de passe</h1>
            <p>Vous avez demandé à réinitialiser le mot de passe de votre compte CreditX. Cliquez sur le bouton ci-dessous pour en créer un nouveau.</p>
            <a href="${resetLink}" class="btn" style="color: #ffffff;">Créer un nouveau mot de passe</a>
            <p style="margin-top: 32px; font-size: 13px;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.</p>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} CreditX Sàrl. Tous droits réservés.
          </div>
        </div>
      </body>
      </html>
    `;

    // 4. Envoi via SendGrid
    await sgMail.send({
      to: email,
      from: { 
        email: process.env.SENDGRID_FROM || "info@creditx.ch", 
        name: "CreditX" 
      },
      subject: "Réinitialisation de votre mot de passe",
      html: htmlEmail,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Erreur API:", error.message);
    return NextResponse.json(
      { error: error.message || "Une erreur est survenue lors de l'envoi." },
      { status: 500 }
    );
  }
}