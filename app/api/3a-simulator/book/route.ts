// app/api/3a-simulator/book/route.ts
import { NextResponse } from "next/server";
import { getCalendarClient, getCalendarId } from "@/lib/googleCalendar";
import { db } from "@/lib/firebase"; // Utilise ton instance firebase admin si possible, sinon client
// Note: Si tu utilises le SDK Client dans les routes API, ça peut poser souci d'auth. 
// Idéalement il faut utiliser "firebase-admin" ici. 
// Si tu n'as pas "firebase-admin" configuré, on peut écrire dans Firestore depuis le front (step 3 plus bas).
// POUR CET EXEMPLE : Je vais assumer que tu veux écrire dans GCal ici, et que Firestore sera géré CÔTÉ CLIENT pour simplifier si tu n'as pas le setup Admin prêt.
// SINON, voici la version GCal uniquement, et on garde le lead dans le front.

const TZ = "Europe/Zurich";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, phone, email, start, end, offerDetails } = body;

    if (!name || !phone || !start || !end) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const calendar = getCalendarClient();
    const calendarId = getCalendarId();

    // Double check disponibilité
    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin: start,
        timeMax: end,
        timeZone: TZ,
        items: [{ id: calendarId }],
      },
    });

    if ((fb.data.calendars?.[calendarId]?.busy?.length || 0) > 0) {
      return NextResponse.json({ ok: false, error: "Slot taken" }, { status: 409 });
    }

    // Créer Event
    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `📞 Rappel 3a - ${name}`,
        description: `Tel: ${phone}\nEmail: ${email}\nOffre vue: ${offerDetails || 'N/A'}\nSource: Simulator 3a`,
        start: { dateTime: start, timeZone: TZ },
        end: { dateTime: end, timeZone: TZ },
      },
    });

    return NextResponse.json({ ok: true, eventId: event.data.id });

  } catch (e: any) {
    console.error("Book Error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}