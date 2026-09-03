// app/api/admin/rdv/disponibilites/route.ts
//
// Grille de créneaux d'un conseiller sur quelques jours, chaque créneau marqué
// LIBRE ou OCCUPÉ d'après son propre Google Agenda.
//
// L'agenda visé est celui du conseiller CONNECTÉ (son e-mail vient du jeton).
// Deux conseillers voient donc deux grilles différentes, sans paramètre à passer
// et sans qu'aucun puisse consulter l'agenda d'un autre.
//
// ⚠️ Un agenda non partagé avec le compte de service ne doit JAMAIS être
// confondu avec un agenda vide : on renverrait une semaine entièrement libre et
// le conseiller poserait des rendez-vous sur des plages déjà prises. D'où la
// réponse explicite `agendaPartage: false`, que l'interface affiche telle quelle.

import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/server/requireInternal";
import {
  plagesOccupees,
  AGENDA_NON_PARTAGE,
  adresseCompteDeService,
} from "@/lib/server/agendaConseiller";
import { instantSuisse, decoupeDate, jourSuisse } from "@/lib/core/tempsSuisse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Amplitude proposée, en heures pleines et demies. */
const HEURE_DEBUT = 8;
const HEURE_FIN = 19;       // dernier créneau : 18:30 → 19:00
const DUREE_MIN = 30;
const JOURS_MAX = 14;

export async function GET(req: NextRequest) {
  let decoded: any;
  try {
    decoded = await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  const email = decoded?.email || "";
  if (!email) {
    return NextResponse.json({ error: "Compte conseiller sans e-mail" }, { status: 400 });
  }

  const depart = req.nextUrl.searchParams.get("from") || jourSuisse(new Date());
  const nbJours = Math.min(Math.max(Number(req.nextUrl.searchParams.get("jours")) || 7, 1), JOURS_MAX);

  const [a, m, j] = decoupeDate(depart);
  if (!a || !m || !j) return NextResponse.json({ error: "Date de départ invalide" }, { status: 400 });

  // Bornes de l'interrogation : du premier créneau du premier jour au dernier du dernier.
  const debutFenetre = instantSuisse(a, m, j, HEURE_DEBUT, 0);
  const finFenetre = instantSuisse(a, m, j + nbJours - 1, HEURE_FIN, 0);

  let occupees: { start: string; end: string }[] = [];
  try {
    occupees = await plagesOccupees(email, debutFenetre, finFenetre);
  } catch (e: any) {
    if (e?.message === AGENDA_NON_PARTAGE) {
      return NextResponse.json({
        agendaPartage: false,
        compteDeService: adresseCompteDeService(),
        email,
        jours: [],
      });
    }
    console.error("[rdv/disponibilites]", e?.message || e);
    return NextResponse.json({ error: "Agenda indisponible" }, { status: 502 });
  }

  const bornes = occupees.map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const);
  const maintenant = Date.now();

  const jours = [];
  for (let d = 0; d < nbJours; d++) {
    const creneaux = [];
    // `j + d` déborde volontairement du mois : Date.UTC normalise (31 août + 1 = 1er sept.).
    const dateDuJour = jourSuisse(instantSuisse(a, m, j + d, 12, 0));

    for (let h = HEURE_DEBUT; h < HEURE_FIN; h++) {
      for (let min = 0; min < 60; min += DUREE_MIN) {
        const debut = instantSuisse(a, m, j + d, h, min);
        const fin = new Date(debut.getTime() + DUREE_MIN * 60000);
        const t0 = debut.getTime();
        const t1 = fin.getTime();

        const occupe = bornes.some(([b0, b1]) => t0 < b1 && b0 < t1);
        creneaux.push({
          debut: debut.toISOString(),
          fin: fin.toISOString(),
          heure: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
          libre: !occupe && t0 > maintenant,   // le passé n'est pas « libre »
          passe: t0 <= maintenant,
        });
      }
    }

    const jourDeSemaine = new Date(`${dateDuJour}T12:00:00Z`).getUTCDay();
    jours.push({
      date: dateDuJour,
      weekend: jourDeSemaine === 0 || jourDeSemaine === 6,
      creneaux,
    });
  }

  return NextResponse.json({ agendaPartage: true, email, jours });
}
