import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { eventId } = await req.json();

    console.log("------------------------------------------------");
    console.log("🗑️ TENTATIVE DE SUPPRESSION AGENDA");
    console.log("👉 Event ID :", eventId);

    // 1. VERIFICATION DE LA VARIABLE JSON
    if (!process.env.GOOGLE_SA_JSON) {
      console.error("❌ ERREUR : GOOGLE_SA_JSON est manquant dans le .env");
      return NextResponse.json({ error: "Config serveur manquante" }, { status: 500 });
    }

    if (!eventId) {
      return NextResponse.json({ error: "Event ID manquant" }, { status: 400 });
    }

    // 2. EXTRACTION DES CLES DU JSON
    // On parse le gros bloc JSON pour récupérer l'email et la clé privée
    const credentials = JSON.parse(process.env.GOOGLE_SA_JSON);

    // 3. AUTHENTIFICATION
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key, // JSON.parse gère les retours à la ligne tout seul
      scopes: ["https://www.googleapis.com/auth/calendar"],
      // Si tu utilises l'impersonation (optionnel selon ta config google workspace)
      // subject: process.env.GOOGLE_WORKSPACE_IMPERSONATE 
    });

    const calendar = google.calendar({ version: "v3", auth });

    // 4. SUPPRESSION
    await calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID, // 'primary' selon ton env
      eventId: eventId,
    });

    console.log("✅ SUCCÈS : Événement supprimé");
    console.log("------------------------------------------------");

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error("❌ ERREUR GOOGLE CALENDAR :", error.message);
    
    // Si l'événement n'existe plus (404) ou déjà supprimé (410), c'est un succès
    if (error.code === 404 || error.code === 410) {
      return NextResponse.json({ ok: true, message: "Déjà supprimé" });
    }
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}