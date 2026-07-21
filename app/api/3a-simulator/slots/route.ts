// app/api/3a-simulator/slots/route.ts
import { NextResponse } from "next/server";
import { getCalendarClient, getCalendarId } from "@/lib/googleCalendar"; // Vérifie ton chemin d'import, souvent "app/lib/..." ou "@/lib/..."

const TZ = "Europe/Zurich";

// Règles horaires strictes
// Matin : 09:00, 09:30, 10:00, 10:30, 11:00 (Fin 11:30)
// Aprèm : 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00 (Fin 17:30)

function getSlotsForDate(dateStr: string) {
  const slots: { start: string; end: string }[] = [];
  
  const addSlot = (h: number, m: number) => {
    // Création date locale
    const start = new Date(`${dateStr}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`);
    const end = new Date(start.getTime() + 30 * 60000); // +30 min
    slots.push({ start: start.toISOString(), end: end.toISOString() });
  };

  // Matin
  addSlot(9, 0);
  addSlot(9, 30);
  addSlot(10, 0);
  addSlot(10, 30);
  addSlot(11, 0);

  // Après-midi
  addSlot(13, 30);
  addSlot(14, 0);
  addSlot(14, 30);
  addSlot(15, 0);
  addSlot(15, 30);
  addSlot(16, 0);
  addSlot(16, 30);
  addSlot(17, 0);

  return slots;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // YYYY-MM-DD

    if (!date) return NextResponse.json({ ok: false, error: "Date missing" }, { status: 400 });

    // Vérifier si c'est le week-end
    const dayOfWeek = new Date(date).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ ok: true, available: [] }); // Pas de slots le WE
    }

    const calendar = getCalendarClient();
    const calendarId = getCalendarId();

    // Récupérer le Busy de Google
    const timeMin = new Date(`${date}T00:00:00Z`).toISOString();
    const timeMax = new Date(`${date}T23:59:59Z`).toISOString();

    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: TZ,
        items: [{ id: calendarId }],
      },
    });

    const busyList = fb.data.calendars?.[calendarId]?.busy || [];

    // Générer les slots théoriques
    const theoreticalSlots = getSlotsForDate(date);

    // Filtrer les conflits
    const available = theoreticalSlots.filter(slot => {
      const sStart = new Date(slot.start).getTime();
      const sEnd = new Date(slot.end).getTime();

      // Si ça chevauche un busy
      const isBusy = busyList.some(b => {
        const bStart = new Date(b.start!).getTime();
        const bEnd = new Date(b.end!).getTime();
        return (sStart < bEnd && bStart < sEnd);
      });

      return !isBusy;
    });

    return NextResponse.json({ ok: true, available });
  } catch (e: any) {
    console.error("Slots Error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}