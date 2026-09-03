// app/lib/server/agendaConseiller.ts
//
// Accès à l'agenda Google D'UN CONSEILLER DONNÉ.
//
// POURQUOI PAS `app/lib/googleCalendar.ts`
// ----------------------------------------
// Ce helper-là vise `GOOGLE_CALENDAR_ID`, qui vaut aujourd'hui `"primary"` :
// pour un compte de service, « primary » est SON PROPRE agenda — celui que
// personne ne consulte. C'est suffisant pour le simulateur 3a public, ça ne
// l'est pas ici : chaque conseiller doit voir SON agenda, et un rendez-vous
// posé par l'un ne doit pas occuper le créneau d'un autre.
//
// LE MONTAGE RETENU : DÉLÉGATION À L'ÉCHELLE DU DOMAINE
// -----------------------------------------------------
// Le compte de service agit AU NOM DU conseiller (`subject: son e-mail`). C'est
// un mécanisme interne au domaine : il échappe donc aux règles de partage
// externe de Workspace, et personne n'a rien à partager.
//
// On était d'abord passé par le partage d'agenda au compte de service. Google
// l'a systématiquement rétrogradé en `freeBusyReader` : les plages occupées
// étaient lisibles, mais toute création renvoyait
// `403 You need to have writer access to this calendar`. C'est la signature
// d'une règle de domaine qui plafonne le partage externe à la disponibilité —
// aucun réglage côté conseiller n'y change quoi que ce soit.
//
// ⚠️ Ce montage EXIGE une autorisation dans la console d'administration :
// Sécurité → Accès aux données → Délégation au niveau du domaine, avec l'ID
// client du compte de service et le champ d'application
// `https://www.googleapis.com/auth/calendar`. Sans elle, Google répond
// `unauthorized_client` — c'est exactement la 401 qui avait fait retirer
// l'impersonation de `googleCalendar.ts` à l'époque, faute de cette étape.
//
// Les deux échecs possibles (délégation absente, agenda inaccessible) sont
// traduits en `AGENDA_NON_PARTAGE`, pour que l'interface dise quoi corriger au
// lieu d'afficher un code opaque.

import { google, type calendar_v3 } from "googleapis";
import { TZ } from "@/lib/core/tempsSuisse";

export { TZ, instantSuisse, decoupeDate, heureSuisse, jourSuisse } from "@/lib/core/tempsSuisse";


/** Le partage n'a pas été fait : l'appelant doit expliquer la marche à suivre. */
export const AGENDA_NON_PARTAGE = "AGENDA_NON_PARTAGE";

/**
 * Client Calendar agissant AU NOM DE `conseiller`.
 * Un client par conseiller : `subject` fait partie de l'identité du jeton, il ne
 * peut pas être réutilisé d'un utilisateur à l'autre.
 */
function client(conseiller: string): calendar_v3.Calendar {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) throw new Error("GOOGLE_SA_JSON manquant");
  const creds = JSON.parse(raw);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    // La clé arrive parfois avec des `\n` littéraux selon la façon dont
    // l'environnement a été rempli : on normalise dans les deux cas.
    key: String(creds.private_key).replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
    subject: conseiller,
  });
  return google.calendar({ version: "v3", auth });
}

/** La délégation n'est pas autorisée dans la console d'administration. */
function estDelegationAbsente(e: any): boolean {
  const m = `${e?.message || ""} ${e?.response?.data?.error || ""}`.toLowerCase();
  return m.includes("unauthorized_client") || m.includes("invalid_grant") || e?.code === 401;
}

/** L'adresse du compte de service, à afficher dans le message d'aide au partage. */
export function adresseCompteDeService(): string {
  try {
    return JSON.parse(process.env.GOOGLE_SA_JSON || "{}").client_email || "";
  } catch {
    return "";
  }
}

/**
 * L'agenda d'un conseiller EST son adresse e-mail.
 * On normalise (minuscules, espaces) : Google est sensible à la casse sur
 * certains domaines, et une adresse recopiée à la main traîne souvent un espace.
 */
export function agendaDe(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/** Plages OCCUPÉES du conseiller entre deux instants. */
export async function plagesOccupees(
  email: string,
  debut: Date,
  fin: Date,
): Promise<{ start: string; end: string }[]> {
  const calendarId = agendaDe(email);
  if (!calendarId) throw new Error("Conseiller sans e-mail");

  const cal = client(calendarId);
  let res;
  try {
    res = await cal.freebusy.query({
      requestBody: {
        timeMin: debut.toISOString(),
        timeMax: fin.toISOString(),
        timeZone: TZ,
        items: [{ id: calendarId }],
      },
    });
  } catch (e: any) {
    // Sans délégation autorisée, l'échec survient à l'obtention du jeton — donc
    // AVANT la requête. Sans ce cas, on afficherait « erreur serveur » là où il
    // suffit d'autoriser l'ID client dans la console d'administration.
    if (estDelegationAbsente(e)) throw new Error(AGENDA_NON_PARTAGE);
    throw e;
  }

  const agenda = res.data.calendars?.[calendarId];
  // freebusy ne LÈVE PAS d'exception quand l'agenda est inaccessible : il
  // renvoie une entrée `errors` et une liste vide. Sans ce test, un agenda non
  // partagé passerait pour un agenda entièrement libre — et on proposerait des
  // créneaux déjà pris.
  if (agenda?.errors?.length) throw new Error(AGENDA_NON_PARTAGE);

  return (agenda?.busy || [])
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: b.start!, end: b.end! }));
}

export interface NouvelEvenement {
  titre: string;
  description?: string;
  debut: Date;
  fin: Date;
  /** Invité(s) — le client, pour qu'il reçoive aussi l'invitation Google. */
  invites?: string[];
  lieu?: string;
}

/** Crée l'événement dans l'agenda du conseiller. Renvoie l'id Google. */
export async function creerEvenement(email: string, ev: NouvelEvenement): Promise<string> {
  const calendarId = agendaDe(email);
  const cal = client(calendarId);

  try {
    const res = await cal.events.insert({
      calendarId,
      // Le client reçoit NOTRE e-mail (soigné, avec ajout au calendrier) ; on
      // évite donc de doubler avec l'invitation brute de Google.
      sendUpdates: "none",
      requestBody: {
        summary: ev.titre,
        description: ev.description,
        location: ev.lieu,
        start: { dateTime: ev.debut.toISOString(), timeZone: TZ },
        end: { dateTime: ev.fin.toISOString(), timeZone: TZ },
        attendees: ev.invites?.filter(Boolean).map((e) => ({ email: e })),
      },
    });
    if (!res.data.id) throw new Error("Google n'a pas renvoyé d'identifiant d'événement");
    return res.data.id;
  } catch (e: any) {
    // 404 : agenda pas partagé du tout.
    // 403 : partagé, mais en LECTURE (« voir les disponibilités » ou « voir tous
    //       les détails »). Cas très courant, car c'est le niveau que Google
    //       propose par défaut — et le plus trompeur : la grille de créneaux
    //       s'affiche normalement, seul l'enregistrement échoue. Les deux mènent
    //       donc au même message, qui dit quoi corriger.
    if (e?.code === 404 || e?.code === 403 || e?.message === AGENDA_NON_PARTAGE || estDelegationAbsente(e)) {
      throw new Error(AGENDA_NON_PARTAGE);
    }
    throw e;
  }
}

/** Retire l'événement. Un événement déjà absent n'est pas une erreur. */
export async function supprimerEvenement(email: string, eventId: string): Promise<void> {
  if (!eventId) return;
  const cal = client(agendaDe(email));
  try {
    await cal.events.delete({ calendarId: agendaDe(email), eventId, sendUpdates: "none" });
  } catch (e: any) {
    // 404/410 : l'événement a été supprimé à la main dans Google Agenda. Le but
    // (« il n'est plus là ») est atteint : on ne fait pas échouer l'annulation.
    if (e?.code === 404 || e?.code === 410) return;
    throw e;
  }
}
