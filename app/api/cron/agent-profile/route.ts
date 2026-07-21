//app/api/cron/agent-profile/route.ts
import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { sendCreditXAgentEmail } from 'lib/mail/creditx-mailer';
import { GoogleGenerativeAI } from '@google/generative-ai';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SA_JSON as string)),
  });
}
const db = admin.firestore();
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const clientsSnap = await db.collection("clients").get();
    let count = 0;
    
    // Mouchard 1
    console.log(`[DEBUG] Lancement de l'Agent. Nombre de clients total dans la base : ${clientsSnap.docs.length}`);

    for (const clientDoc of clientsSnap.docs) {
      const clientData = clientDoc.data();
      const uid = clientDoc.id;
      
      // Mouchard 2
      console.log(`\n[DEBUG] ---> TESTEUR TROUVÉ ! UID: ${uid}`);

      if (clientData.aiEmails?.missingProfileSent) {
        console.log(`[DEBUG] ---> ÉCHEC : Le flag 'missingProfileSent' est présent et vaut true.`);
        continue;
      }

      const persoDoc = await db.doc(`clients/${uid}/DonneePersonnelles/current`).get();
      let manquants: string[] = [];
      const isMissing = (val: any) => val === undefined || val === null || val === "" || Number.isNaN(val);

      if (!persoDoc.exists) { 
        console.log(`[DEBUG] ---> Le document 'DonneePersonnelles/current' N'EXISTE PAS.`);
        manquants = ["Prénom", "Nom", "Nationalité", "Date de naissance", "Téléphone", "Sexe", "État civil", "Adresse", "Statut professionnel", "Profession", "Salaire annuel"];
      } else {
        const d = persoDoc.data();
        if (isMissing(d?.Enter_prenom)) manquants.push("Prénom");
        if (isMissing(d?.Enter_nom)) manquants.push("Nom");
        if (isMissing(d?.Enter_nationalite)) manquants.push("Nationalité");
        if (isMissing(d?.Enter_dateNaissance)) manquants.push("Date de naissance");
        if (isMissing(d?.Enter_telephone)) manquants.push("Téléphone");
        if (isMissing(d?.Enter_sexe)) manquants.push("Sexe");
        if (isMissing(d?.Enter_etatCivil)) manquants.push("État civil");
        if (isMissing(d?.Enter_adresse)) manquants.push("Adresse exacte");
        if (isMissing(d?.Enter_statutProfessionnel)) manquants.push("Statut professionnel");
        if (isMissing(d?.Enter_profession)) manquants.push("Profession");
        if (isMissing(d?.Enter_salaireAnnuel)) manquants.push("Salaire annuel");

        if (d?.Enter_nationalite && d.Enter_nationalite !== "Suisse") {
          if (isMissing(d?.Enter_permisSejour)) manquants.push("Permis de séjour");
        }
        const isMarried = d?.Enter_etatCivil === 1 || d?.Enter_etatCivil === 3;
        if (isMarried) {
          if (isMissing(d?.Enter_spousePrenom)) manquants.push("Prénom du conjoint");
          if (isMissing(d?.Enter_spouseSexe)) manquants.push("Sexe du conjoint");
          if (isMissing(d?.Enter_spouseDateNaissance)) manquants.push("Date de naissance du conjoint");
        }
      }

      // Mouchard 3
      console.log(`[DEBUG] ---> Liste des champs considérés comme manquants :`, manquants);

      if (manquants.length === 0) {
        console.log(`[DEBUG] ---> ÉCHEC : Le profil est parfait (0 champ manquant), donc l'IA n'envoie rien.`);
        continue;
      }

      console.log(`[DEBUG] ---> SUCCÈS : Envoi de la requête à Gemini...`);

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0.3, responseMimeType: "application/json" }});
      
      const prompt = `
        Tu es le système de notification de CreditX (Suisse).
        Utilisateur concerné : ${clientData.displayName?.split(" ")[0] || "l'utilisateur"}.
        Infos manquantes : ${manquants.join(", ")}.
        
        Mission : Rédige un email très court et pro pour demander de compléter le profil afin de générer le bilan de prévoyance.
        Règles : 
        - Pas de marketing, pas de fiscalité, reste factuel.
        - N'inclus AUCUNE formule d'appel (pas de "Bonjour", "Cher", etc.) car elle est déjà dans le design.
        - N'inclus AUCUNE signature (pas de "Cordialement", "L'équipe", etc.) car le template a déjà un pied de page.
        - Rédige UNIQUEMENT le paragraphe central.
        
        Réponds en JSON : {"subject": "...", "htmlContent": "..."}
      `;
      
      const result = await model.generateContent(prompt);
      const aiResponse = JSON.parse(result.response.text());

      await sendCreditXAgentEmail({
        to: clientData.email,
        // On remplace le mot "Client" par une chaîne vide ""
        firstName: clientData.displayName?.split(" ")[0] || "",
        locale: clientData.locale || "fr",
        subject: aiResponse.subject,
        bodyHtml: aiResponse.htmlContent
      });

      await db.doc(`clients/${uid}`).update({
        "aiEmails.missingProfileSent": true,
        "aiEmails.lastSentAt": admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[DEBUG] ---> EMAIL ENVOYÉ ET BASE DE DONNÉES MISE À JOUR !`);
      count++;
    }

    return NextResponse.json({ success: true, sent: count });
  } catch (error) {
    console.error("Erreur Agent IA:", error);
    return NextResponse.json({ error: "Fail" }, { status: 500 });
  }
}