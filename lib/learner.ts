// lib/learner.ts
import { db } from '@/lib/firebaseAdmin';
import crypto from 'crypto';

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/\s+/g, ' ')            // espaces multiples
    .trim();
}

export async function sha256Hex(s: string): Promise<string> {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function slugifyCaisse(name?: string | null): string | null {
  if (!name) return null;
  return name
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Cherche un lpp_parsed avec le même textHash (dernier d’abord) */
export async function findExistingByTextHash(textHash: string) {
  const q = await db.collection('lpp_parsed')
    .where('textHash', '==', textHash)
    .orderBy('extractedAt', 'desc')
    .limit(1)
    .get();
  return q.empty ? null : { id: q.docs[0].id, ...(q.docs[0].data() as any) };
}

/** Fusionne les champs “données” depuis un doc précédent (priorité aux champs manuels vérifiés) */
export function mergeFromPrevious(current: any, previous: any) {
  if (!previous) return current;
  const out = { ...current };
  const dataKeys: string[] = [
    'employeur','caisse','dateCertificat','prenom','nom','dateNaissance',
    'salaireDeterminant','deductionCoordination','salaireAssureEpargne','salaireAssureRisque',
    'avoirVieillesse','avoirVieillesseSelonLpp','interetProjetePct',
    'renteInvaliditeAnnuelle','renteEnfantInvaliditeAnnuelle',
    'renteConjointAnnuelle','renteOrphelinAnnuelle',
    'capitalDeces','capitalRetraite65','renteRetraite65Annuelle',
    'rachatPossible','eplDisponible','miseEnGage'
  ];
  const prevSources = previous?.sources || {};
  const prevVerified = previous?.review?.status === 'verified';

  out.sources = { ...(current?.sources || {}) };

  for (const k of dataKeys) {
    const curVal = current?.[k];
    const prevVal = previous?.[k];
    const prevIsManual = prevSources?.[k] === 'manual';

    // Règle simple : si le champ est manquant côté courant, et que le précédent
    // a une valeur manuelle OU est vérifié, on réutilise.
    if ((curVal === undefined || curVal === null || curVal === '') && (prevIsManual || prevVerified) && prevVal != null) {
      out[k] = prevVal;
      // on marque la provenance dans sources (on évite 'inferred' pour rester typé)
      out.sources[k] = out.sources[k] || 'ocr';
    }
  }

  // Hériter du statut review si le previous est vérifié (bonus)
  if (prevVerified && !out.review) {
    out.review = { status: 'verified', reviewedAt: new Date().toISOString(), reviewedBy: previous?.review?.reviewedBy };
    out.needs_review = false;
  }

  return out;
}

/** Charge un “modèle” par caisse et applique des valeurs par défaut (champs manquants uniquement) */
export async function applyTemplateByCaisse(caisseName: string | null, current: any) {
  if (!caisseName) return current;
  const caisseSlug = slugifyCaisse(caisseName);
  if (!caisseSlug) return current;

  const doc = await db.collection('learner_templates').doc(caisseSlug).get();
  if (!doc.exists) return current;

  const tpl = doc.data() as any;
  const hints = tpl?.fieldHints || {}; // { fieldName: value }

  const out = { ...current };
  out.sources = { ...(current?.sources || {}) };

  for (const [k, v] of Object.entries(hints)) {
    const curVal = (current as any)[k];
    if (curVal === undefined || curVal === null || curVal === '') {
      (out as any)[k] = v;
      out.sources[k] = out.sources[k] || 'ocr';
    }
  }
  return out;
}

/** Quand un document passe en “verified”, on enregistre un template minimal pour la caisse */
export async function upsertTemplateFromDoc(docData: any) {
  const caisseSlug = slugifyCaisse(docData?.caisse);
  if (!caisseSlug) return;

  // On retient uniquement les champs corrigés manuellement ou présents de façon fiable
  const fieldsOfInterest: string[] = [
    'salaireDeterminant','deductionCoordination','salaireAssureEpargne','salaireAssureRisque',
    'avoirVieillesse','avoirVieillesseSelonLpp','interetProjetePct',
    'renteInvaliditeAnnuelle','renteEnfantInvaliditeAnnuelle',
    'renteConjointAnnuelle','renteOrphelinAnnuelle',
    'capitalDeces','capitalRetraite65','renteRetraite65Annuelle'
  ];

  const hints: Record<string, any> = {};
  const sources = docData?.sources || {};
  for (const k of fieldsOfInterest) {
    const val = docData?.[k];
    if (val != null && (sources?.[k] === 'manual' || docData?.review?.status === 'verified')) {
      hints[k] = val;
    }
  }

  if (Object.keys(hints).length === 0) return;

  await db.collection('learner_templates').doc(caisseSlug).set(
    {
      fieldHints: hints,       // sera merge à chaque “verified”
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}
