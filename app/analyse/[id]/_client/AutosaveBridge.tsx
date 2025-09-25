'use client';

import * as React from 'react';
import GapsAndCardsClient from '../../_components/GapsAndCardsClient';
import { useAutosaveAnalysis } from './useAutosaveAnalysis';

// Types minimaux — adapte aux tiens
type AvsInputs = { invalidityMonthly:number; widowMonthly:number; childMonthly:number; oldAgeMonthly?:number };
type LppInputs = { invalidityMonthly:number; invalidityChildMonthly?:number; widowMonthly?:number; orphanMonthly?:number; retirementAnnualFromCert?:number; capitalAt65FromCert?:number; minConversionRatePct?:number };
type LaaParams = { insured_earnings_max:number; disabilityPctFull:number; overallCapPct:number; spousePct:number; orphanPct:number; familyCapPct:number };

type SurvivorDefault = { maritalStatus:string; hasChild?:boolean; ageAtWidowhood?:number };

type Props = {
  id: string;

  // Prestations calculées (venues de ta page server)
  annualIncome: number;
  avs: AvsInputs;
  lpp: LppInputs;
  survivorDefault: SurvivorDefault;
  laaParams?: LaaParams;

  // Détails “cartes” que tu affiches déjà
  lppCard?: any;
  laaCard?: any;

  // Données scannées / identité (pour persister aussi)
  scanned?: {
    lppDocId?: string;
    prenom?: string | null;
    nom?: string | null;
    dateNaissance?: string | null;
    caisse?: string | null;
    fichier?: string | null;
  };
};

export default function AutosaveBridge(p: Props) {
  const save = useAutosaveAnalysis(p.id, { debounceMs: 600 });

  // On stocke localement la dernière vue "gaps" (envoyée par le composant enfant)
  const lastGapsRef = React.useRef<any>(null);

  return (
    <GapsAndCardsClient
      annualIncome={p.annualIncome}
      avs={p.avs as any}
      lpp={p.lpp as any}
      survivorDefault={p.survivorDefault as any}
      laaParams={p.laaParams as any}
      lppCard={p.lppCard}
      laaCard={p.laaCard}
      // IMPORTANT : on étend le callback pour inclure aussi un snapshot "gaps"
      onParamsChange={(next: any) => {
        // `next` vient de GapsAndCardsClient (targets + ctx). On y ajoute ce qu’on veut persister.
        // Option: si tu as modifié GapsAndCardsClient pour renvoyer aussi `gapsSnapshot`, récupère-le ici.
        const snapshot = {
          quickParams: {
            sex: next?.ctx?.sex ?? undefined,                        // si tu l’ajoutes
            survivor: next?.ctx?.survivor,
            childrenCount: next?.ctx?.childrenCount,
            weeklyHours: next?.ctx?.weeklyHours,
            scenario: { invalidity: next?.ctx?.eventInvalidity, death: next?.ctx?.eventDeath },
            invalidityDegreePct: next?.ctx?.invalidityDegreePct,
          },
          needs: {
            invalidityPctTarget: next?.targets?.invalidityPctTarget,
            deathPctTarget: next?.targets?.deathPctTarget,
            retirementPctTarget: next?.targets?.retirementPctTarget,
          },
          // Prestations affichées (source de vérité = calculs de la page)
          benefits: {
            avs: p.avs,
            lpp: p.lpp,
            laa: p.laaParams,
            lppCard: p.lppCard, // utile si tu veux consigner les détails
            laaCard: p.laaCard,
          },
          // Identité & scan
          scanned: p.scanned,
          // Gaps courants — si tu as exposé un snapshot depuis l’enfant, remplace par lastGapsRef.current
          gaps: lastGapsRef.current ?? undefined,
          // Meta
          meta: { uiVersion: 'MoneyLife v4.2', savedFrom: 'GapsAndCardsClient' },
        };
        save(snapshot);
      }}
      // ⬇️ Optionnel : expose un setter côté enfant pour lui permettre de nous envoyer
      // un "gaps snapshot" (tu ajoutes un prop à GapsAndCardsClient si tu veux)
      // onGapsSnapshot={(g) => { lastGapsRef.current = g; save({ gaps: g }); }}
    />
  );
}
