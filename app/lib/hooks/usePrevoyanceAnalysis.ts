// app/lib/hooks/usePrevoyanceAnalysis.ts
"use client";

import { useState, useEffect, useMemo } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, collection, getDocs } from "firebase/firestore";
import { predictLog, ProviderModelDoc } from "lib/engines/threeA-engine";
import { computeSituationAnalysis } from "@/lib/analysis/situation";
import { plafond3aAnnuel } from "@/lib/analysis/plafond3a";

// Helper partagé
const parseAmount = (val: any) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  return Number(cleaned) || 0;
};

const getVal = (proj: any, label: string, col: number = 0) => {
  const row = proj?.rows?.find((r: any) => r.label.trim() === label.trim());
  return Number(row?.cells?.[col]) || 0;
};

export function usePrevoyanceAnalysis(adminUid?: string, externalPlans?: any[], clientAge: number = 35) {
  const [cloudData, setCloudData] = useState<any>(null);
  const [benchmarks, setBenchmarks] = useState<ProviderModelDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // ÉTATS DE CONFIGURATION
  const [includeTaxSavings, setIncludeTaxSavings] = useState(false);
  const [allocation3a, setAllocation3a] = useState(100); 
  const [isSmoothingIG, setIsSmoothingIG] = useState(false); 
  const [selRet, setSelRet] = useState(true);
  const [selInc, setSelInc] = useState(true);
  const [selDec, setSelDec] = useState(true);
  const [selPay, setSelPay] = useState(true);

  const targetUid = adminUid || auth.currentUser?.uid;

  useEffect(() => {
    if (!targetUid) {
        setLoading(false);
        return;
    }

    // 🔴 SÉCURITÉ : On vide la mémoire pour tuer les "données fantômes" au changement de profil
    setCloudData(null);
    setLoading(true);

    const unsubAnalyse = onSnapshot(doc(db, `clients/${targetUid}/Analyse/current`), (snap) => {
      if (snap.exists()) setCloudData((prev: any) => ({ ...prev, ...snap.data() }));
    });

    const unsubPerso = onSnapshot(doc(db, `clients/${targetUid}/DonneePersonnelles/current`), (snap) => {
      if (snap.exists()) {
        const newData = snap.data();
        setCloudData((prev: any) => {
          const merged = { ...prev, ...newData };
          // Forcer la suppression des champs sensibles s'ils ne sont pas dans les nouvelles données
          if (!('Enter_enfants' in newData)) delete merged.Enter_enfants;
          if (!('Enter_etatCivil' in newData)) delete merged.Enter_etatCivil;
          return merged;
        });
      }
      setLoading(false);
    });

    const fetchBenchmarks = async () => {
      try {
        const snap = await getDocs(collection(db, "learner_models_3a"));
        if (!snap.empty) {
          setBenchmarks(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any);
        }
      } catch (err) {
        console.error("Erreur benchmarks:", err);
      }
    };
    fetchBenchmarks();

    return () => { unsubAnalyse(); unsubPerso(); };
  }, [targetUid]);

  const analysis = useMemo(() => {
    if (!cloudData?.projections || !cloudData?.Enter_salaireAnnuel) return null;

    const retProj = cloudData.projections.retraite;
    const invM = cloudData.projections.invalidite_maladie;
    const invA = cloudData.projections.invalidite_accident;
    const decM = cloudData.projections.deces_maladie;

    const salaireAnnuel = getVal(retProj, "Besoin (Salaire)");

    // 1. Retraite
    const cibleRetAnnuelle = salaireAnnuel * 0.8;
    const prestationsRetAnnuelle = getVal(retProj, "AVS/AI") + getVal(retProj, "LPP");
    
    // 2. Extraction sécurisée des plans (FILTRÉE PAR STATUT ACTIF)
    // 👈 CORRECTION : Priorité absolue aux plans en temps réel (externalPlans) s'ils sont fournis (même vides !)
    const sourcePlans = externalPlans !== undefined ? externalPlans : (cloudData?.plans || []);

    // 🔗 SOURCE UNIQUE : scores / lacunes / fiscal calculés par la fonction partagée
    // (la même que l'API /api/analysis/situation et l'app iOS). Évite la duplication des formules.
    const _S = computeSituationAnalysis({ cloudData, plans: sourcePlans, allocation3a, isSmoothingIG });
    
    const listePlans3a = sourcePlans.filter((p: any) => {
      const type = (p.type || "").toLowerCase();
      const status = p.status;
      
      const isActive = status === "ACTIVE" || !status;
      const isPrivatePlan = type.includes("3a") || type.includes("3b") || type.includes("pilier");
      
      return isPrivatePlan && isActive;
    });

    // 3. Calcul du total des capitaux PROJETÉS
    const capital3aProjeteTotal = listePlans3a.reduce((acc: number, p: any) => {
      const d = p.data || {};
      // 👈 MAJ : On unifie sur capitalRetraiteProjete, en gardant les autres pour la rétrocompatibilité des anciens tests
      const montantProjete = parseAmount(d.capitalRetraiteProjete || d.capitalRetraiteGlobal || d.soldeActuel || d.montant || 0);
      return acc + montantProjete;
    }, 0);
    
    const capitalUtilise = capital3aProjeteTotal * (allocation3a / 100);
    const lacuneAnnuelleRet = Math.max(0, cibleRetAnnuelle - prestationsRetAnnuelle);
    const capManquantBrut = (lacuneAnnuelleRet * 25) - capitalUtilise;
    
    const renteIssueDu3a = (capitalUtilise / 25) / 12;
    const renteTotaleAffichee = (prestationsRetAnnuelle / 12) + renteIssueDu3a;

    const garantiesSaisies3a = listePlans3a.reduce((acc: { renteIG: number; capitalDeces: number }, p: any) => {
      const d = p.data || {};
      return {
        renteIG: acc.renteIG + (parseAmount(d.renteInvalidite) || parseAmount(d.renteIG) || 0),
        capitalDeces: acc.capitalDeces + (parseAmount(d.capitalDecesFixe) || parseAmount(d.capitalDeces) || 0)
      };
    }, { renteIG: 0, capitalDeces: 0 });

    const scoreRetraiteLocal = _S?.retraite.score ?? 0;

    const avsMensuel = getVal(retProj, "AVS/AI") / 12;
    const lppMensuel = getVal(retProj, "LPP") / 12;
    
    const chartDataRetraite = Array.from({ length: 26 }, (_, i) => {
      const anneeRetraite = 65 + i;
      const lacuneAnnuelle = Math.max(0, cibleRetAnnuelle - prestationsRetAnnuelle);
      const capitalRestant = Math.max(0, capitalUtilise - (lacuneAnnuelle * i));
      const partCapital = capitalRestant > 0 ? renteIssueDu3a : 0;
      
      return {
        name: `${anneeRetraite} ans`,
        avs: Math.round(avsMensuel),
        lpp: Math.round(lppMensuel),
        capital: Math.round(partCapital),
      };
    });

    const cibleIGMensuelle = (salaireAnnuel * 0.9) / 12;
    const anneesIG = invM?.headerYears || [];
    
    let reserveSurplusAnnuelle = 0;
    let nbAnneesLacune = 0;

    anneesIG.forEach((_: number, idx: number) => {
      if (idx < 2) return;
      // 👈 CORRECTION MALADIE
      const rente3aMaladie = garantiesSaisies3a.renteIG;
      const rentesAnnuelle = getVal(invM, "AVS/AI", idx) + getVal(invM, "LPP", idx) + getVal(invM, "LAA", idx) + rente3aMaladie;
      const diff = rentesAnnuelle - (cibleIGMensuelle * 12);
      if (diff > 0) reserveSurplusAnnuelle += diff;
      else if (diff < -120) nbAnneesLacune++; 
    });

    const bonusLissageMensuel = (isSmoothingIG && nbAnneesLacune > 0) 
      ? (reserveSurplusAnnuelle / nbAnneesLacune) / 12 
      : 0;

    const chartDataIG = anneesIG.map((year: number, idx: number) => {
      // 👈 CORRECTION MALADIE
      const rente3aMaladie = garantiesSaisies3a.renteIG;
      const rentesM = (getVal(invM, "AVS/AI", idx) + getVal(invM, "LPP", idx) + getVal(invM, "LAA", idx) + rente3aMaladie) / 12;
      let revenuFinal = rentesM;
      if (isSmoothingIG) {
        revenuFinal = rentesM > cibleIGMensuelle ? cibleIGMensuelle : rentesM + bonusLissageMensuel;
      }
      return { name: `${year} ans`, revenu: Math.round(revenuFinal), besoin: Math.round(cibleIGMensuelle) };
    });

    const periodesIG: { debut: number; fin: number; lacune: number }[] = [];
    anneesIG.forEach((year: number, idx: number) => {
      if (idx < 2) return;
      // 👈 CORRECTION MALADIE
      const rente3aMaladie = garantiesSaisies3a.renteIG;
      const rentesM = (getVal(invM, "AVS/AI", idx) + getVal(invM, "LPP", idx) + getVal(invM, "LAA", idx) + rente3aMaladie) / 12;
      const revenuApresLissage = isSmoothingIG ? (rentesM > cibleIGMensuelle ? cibleIGMensuelle : rentesM + bonusLissageMensuel) : rentesM;
      const lacuneM = Math.max(0, cibleIGMensuelle - revenuApresLissage);
      if (lacuneM > 10) {
        if (periodesIG.length > 0 && Math.abs(periodesIG[periodesIG.length - 1].lacune - lacuneM) < 10) {
          periodesIG[periodesIG.length - 1].fin = year;
        } else {
          periodesIG.push({ debut: year, fin: year, lacune: lacuneM });
        }
      }
    });

    const maxLacuneResiduelle = periodesIG.length > 0 ? Math.max(...periodesIG.map(p => p.lacune)) : 0;
    const salaireMensuelBrut = salaireAnnuel / 12;
    const revenuTotalIG = cibleIGMensuelle - maxLacuneResiduelle;
    const scoreIGFinal = _S?.invaliditeMaladie.score ?? 0;

    const dP = cloudData; 
    const estMarie = dP.Enter_etatCivil === 1;
    const enfantsTableau = dP.Enter_enfants || [];
    let besoinEnfantsTotal = 0;

    enfantsTableau.forEach((enfant: any) => {
      const dateNaissStr = enfant.Enter_dateNaissance; 
      if (dateNaissStr) {
        const [day, month, year] = dateNaissStr.split('.').map(Number);
        const dateNaissance = new Date(year, month - 1, day);
        const ageEnfant = new Date().getFullYear() - dateNaissance.getFullYear();
        besoinEnfantsTotal += ageEnfant < 16 ? 100000 : 50000;
      }
    });

    const salairePourCalcul = Number(dP.Enter_salaireAnnuel) || salaireAnnuel;
    const besoinConjoint = estMarie ? (salairePourCalcul * 3) : 0;
    const besoinDecesTotal = (besoinConjoint + besoinEnfantsTotal) || 20000; 

    // 👈 CORRECTION DÉCÈS
    const cap3aDeces = garantiesSaisies3a.capitalDeces;
    const capExistants = getVal(decM, "Prestations en capital / indemnité unique") + cap3aDeces;
    const lacuneDeces = Math.max(0, besoinDecesTotal - capExistants);
    
    const scoreDecLocal = besoinDecesTotal > 0 ? Math.round((capExistants / besoinDecesTotal) * 100) : 100;
    const scoreDecFinal = _S?.deces.score ?? 0;

    const genderF = cloudData?.Enter_civilite === "Mme" ? 1 : 0; 
    const clientAgeReal = Number(cloudData?.Enter_age) || clientAge;
    const xFeatures = [1, clientAgeReal, 0, genderF]; 

    let minPriceDec = 0;
    let minPriceInc = 0;
    let minPriceRet = 0;

    const duration = 65 - clientAgeReal;
    let bestDec = { price: Infinity, provider: "" };
    let bestInc = { price: Infinity, provider: "" };
    let bestRet = { price: Infinity, provider: "" };

    if (benchmarks.length > 0) {
      benchmarks.forEach(m => {
        const providerName = m.provider || "Inconnu";

        if (lacuneDeces > 0) {
          const deathFactor = Math.exp(predictLog(m.deathUnit, xFeatures));
          const pDec = (lacuneDeces * deathFactor) / 12;
          if (pDec > 0 && pDec < bestDec.price) bestDec = { price: pDec, provider: providerName };
        }

        const lacuneRenteAnnuelle = Math.max(0, maxLacuneResiduelle * 12);
        if (lacuneRenteAnnuelle > 0) {
          const disFactor = Math.exp(predictLog(m.disabilityUnit, xFeatures));
          const waiverFactor = Math.exp(predictLog(m.waiverRate, xFeatures));
          const pTotalInc = (lacuneRenteAnnuelle * disFactor + 150 * waiverFactor) / 12;
          if (pTotalInc > 0 && pTotalInc < bestInc.price) bestInc = { price: pTotalInc, provider: providerName };
        }

        if (capManquantBrut > 5000 && duration > 0) {
          const r = (m.yieldMedian || 1.75) / 100;
          const pRet = (capManquantBrut * r) / ((Math.pow(1 + r, duration) - 1) * (1 + r) * 12);
          if (pRet > 0 && pRet < bestRet.price) bestRet = { price: pRet, provider: providerName };
        }
      });
    }

    const priceRet = bestRet.price === Infinity ? 0 : bestRet.price;
    const priceInc = bestInc.price === Infinity ? 0 : bestInc.price;
    const priceDec = bestDec.price === Infinity ? 0 : bestDec.price;

    let minWaiverRate = 0;
    if (benchmarks.length > 0) {
      const waiverRates = benchmarks.map(m => Math.exp(predictLog(m.waiverRate, xFeatures)));
      minWaiverRate = Math.min(...waiverRates);
    }

    const basePourExoneration = (selRet ? priceRet : 0) + (selInc ? priceInc : 0) + (selDec ? priceDec : 0);
    const pricePay = basePourExoneration > 0 ? (basePourExoneration * minWaiverRate) : 0.00;

    const finalScoreRet = selRet ? 100 : scoreRetraiteLocal;
    const finalScoreInc = selInc ? 100 : scoreIGFinal;
    const finalScoreDec = selDec ? 100 : scoreDecFinal;
    
    const coverageScore = Math.round((finalScoreRet + finalScoreInc + finalScoreDec) / 3);

    const salairePourFisc = Number(cloudData?.Enter_salaireAnnuel) || salaireAnnuel;
    const tauxFisc = salairePourFisc > 150000 ? 0.30 : salairePourFisc > 80000 ? 0.25 : 0.20;
    
    const cotisationsActuelles3a = listePlans3a.reduce((acc: number, p: any) => {
      // 👈 CORRECTION : On exclut strictement les plans 3B du calcul fiscal !
      const typeStr = (p.type || "").toLowerCase();
      if (!typeStr.includes("3a")) return acc;

      const d = p.data || {};
      
      // Sécurité : Si le contrat est libéré ou inactif au niveau des versements, on ne déduit rien
      if (d.isLibere || d.isRegulier === false) return acc;
      
      // On regroupe tous les champs possibles où le montant a pu être saisi
      const montantBase = parseAmount(d.primeTotale) 
        || parseAmount(d.montantRegulier) 
        || parseAmount(d.primeMensuelle) 
        || parseAmount(d.primeAnnuelle) 
        || parseAmount(d.prime) 
        || 0;

      // On applique STRICTEMENT la fréquence choisie
      const isAnnuel = d.occurrence === "annee";
      const primeCalculee = isAnnuel ? montantBase : montantBase * 12;
      
      return acc + primeCalculee;
    }, 0);

    // Plafond 3a : petit (affilié LPP) ou grand (20% du salaire) si non affilié.
    const plafond3a = plafond3aAnnuel(cloudData);
    const potentielRestantAnnuel = Math.max(0, plafond3a - cotisationsActuelles3a);

    const totalPrimes = (selRet ? priceRet : 0) + (selInc ? priceInc : 0) + (selDec ? priceDec : 0) + (selPay ? pricePay : 0);
    const nouvellePrimeAnnuelleProposee = totalPrimes * 12;
    
    const SEUIL_MINIMUM_3A_ANNUEL = 600; 
    
    let part3aAnnuelle = 0;
    let part3bAnnuelle = 0;

    if (potentielRestantAnnuel >= SEUIL_MINIMUM_3A_ANNUEL) {
      part3aAnnuelle = Math.min(nouvellePrimeAnnuelleProposee, potentielRestantAnnuel);
      part3bAnnuelle = Math.max(0, nouvellePrimeAnnuelleProposee - part3aAnnuelle);
    } else {
      part3bAnnuelle = nouvellePrimeAnnuelleProposee;
    }

    const split3aMensuel = part3aAnnuelle / 12;
    const split3bMensuel = part3bAnnuelle / 12;

    const gainFiscalMensuel = (part3aAnnuelle * tauxFisc) / 12;
    const monthlyTaxSaving = gainFiscalMensuel;

    let retDesc = "";
    const aDesPlans3a = listePlans3a.length > 0;
    const scoreSans3a = Math.round(((prestationsRetAnnuelle / 12) / (salaireAnnuel / 12)) * 100);

    if (scoreRetraiteLocal >= 80) {
      if (scoreSans3a < 80 && aDesPlans3a) {
        retDesc = "Votre situation à la retraite semble bonne. Vos 3e piliers vous aident à maintenir votre niveau de vie dès votre retraite.";
      } else {
        retDesc = "Votre situation à la retraite semble bonne.";
      }
    } else {
      if (aDesPlans3a) {
        retDesc = "A votre retraite, votre niveau de vie n'est pas suffisant, même avec vos 3e piliers existants. Constituez une épargne supplémentaire dès maintenant.";
      } else {
        retDesc = "A votre retraite, votre niveau de vie n'est pas suffisant. Constituez une épargne supplémentaire dès maintenant.";
      }
    }

    const incMDesc = scoreIGFinal >= 90 
      ? "En cas de maladie, votre revenu est bien maintenu. Vos prestations actuelles couvrent l'essentiel de votre salaire."
      : `En cas de maladie, votre revenu chute à ${scoreIGFinal}% de votre salaire. Une couverture complémentaire est recommandée.`;

    const decDesc = lacuneDeces > 0 
      ? "En cas de décès, la situation financière de vos héritiers chute dangereusement. Un capital décès supplémentaire est vivement recommandé."
      : "En cas de décès, vos héritiers sont suffisamment protégés financièrement.";

    const finalTotal = totalPrimes - (includeTaxSavings ? monthlyTaxSaving : 0);

    // --- PONDÉRATION DYNAMIQUE ET PLAFONNEMENT ---
    const aDesDependants = estMarie || enfantsTableau.length > 0;

    // Répartition logique selon la situation familiale
    const poidsRetraite = aDesDependants ? 0.50 : 0.60;
    const poidsInvalidite = aDesDependants ? 0.30 : 0.40;
    const poidsDeces = aDesDependants ? 0.20 : 0.00;

    const scorePondere = _S?.totalScore ?? 0;

    return {
      totalScore: Math.round(scorePondere),
      ret: { 
        score: scoreRetraiteLocal, desc: retDesc,
        currentMensuel: prestationsRetAnnuelle / 12, renteTotale: renteTotaleAffichee,
        cap: capManquantBrut > 0 ? capManquantBrut : 0, aBesoin: capManquantBrut > 0,
        capital3aTotal: capital3aProjeteTotal, plans: listePlans3a, chartData: chartDataRetraite
      },
      inc: { 
        maladie: {
          score: scoreIGFinal, desc: incMDesc, current: getVal(invM, "Prestation totale", 2), 
          periodes: periodesIG, chartData: chartDataIG, cible: cibleIGMensuelle
        },
        accident: (() => {
          const anneesAcc = invA?.headerYears || [];
          let reserveSurplusAcc = 0;
          let nbAnneesLacuneAcc = 0;
          
          anneesAcc.forEach((_: number, idx: number) => {
            if (idx < 2) return;
            // 👈 CORRECTION ACCIDENT
            const rente3aAccident = garantiesSaisies3a.renteIG;
            const rentes = getVal(invA, "AVS/AI", idx) + getVal(invA, "LPP", idx) + getVal(invA, "LAA", idx) + rente3aAccident;
            const diff = rentes - (cibleIGMensuelle * 12);
            if (diff > 0) reserveSurplusAcc += diff;
            else if (diff < -120) nbAnneesLacuneAcc++;
          });

          const bonusAcc = (isSmoothingIG && nbAnneesLacuneAcc > 0) ? (reserveSurplusAcc / nbAnneesLacuneAcc) / 12 : 0;
          const chartAcc = anneesAcc.map((year: number, idx: number) => {
            // 👈 CORRECTION ACCIDENT
            const rente3aAccident = garantiesSaisies3a.renteIG;
            const rentesM = (getVal(invA, "AVS/AI", idx) + getVal(invA, "LPP", idx) + getVal(invA, "LAA", idx) + rente3aAccident) / 12;
            const final = isSmoothingIG ? (rentesM > cibleIGMensuelle ? cibleIGMensuelle : rentesM + bonusAcc) : rentesM;
            return { name: `${year} ans`, revenu: Math.round(final) };
          });

          const periodesAcc: any[] = [];
          anneesAcc.forEach((year: number, idx: number) => {
            if (idx < 2) return;
            // 👈 CORRECTION ACCIDENT
            const rente3aAccident = garantiesSaisies3a.renteIG;
            const rentesM = (getVal(invA, "AVS/AI", idx) + getVal(invA, "LPP", idx) + getVal(invA, "LAA", idx) + rente3aAccident) / 12;
            const apres = isSmoothingIG ? (rentesM > cibleIGMensuelle ? cibleIGMensuelle : rentesM + bonusAcc) : rentesM;
            const lacM = Math.max(0, cibleIGMensuelle - apres);
            if (lacM > 10) {
              if (periodesAcc.length > 0 && Math.abs(periodesAcc[periodesAcc.length - 1].lacune - lacM) < 10) periodesAcc[periodesAcc.length - 1].fin = year;
              else periodesAcc.push({ debut: year, fin: year, lacune: lacM });
            }
          });

          const maxL = periodesAcc.length > 0 ? Math.max(...periodesAcc.map(p => p.lacune)) : 0;
          const revenuTotalAcc = cibleIGMensuelle - maxL;
          const scoreFinalAcc = Math.round((revenuTotalAcc / (salaireAnnuel / 12)) * 100);
          
          const incADesc = scoreFinalAcc >= 90 
            ? "Votre protection contre les accidents est excellente, conformément aux standards LAA."
            : `En cas d'accident, vous ne percevez que ${scoreFinalAcc}% de votre revenu. Attention aux lacunes de prévoyance.`;

          return { score: scoreFinalAcc, desc: incADesc, periodes: periodesAcc, chartData: chartAcc };
        })()
      },
      dec: { score: scoreDecFinal, desc: decDesc, lacune: lacuneDeces, besoin: besoinDecesTotal, actuel: capExistants },
      sol: {
        priceRet, priceInc, priceDec, pricePay, total: finalTotal, taxSaving: monthlyTaxSaving, coverageScore,
        split3a: split3aMensuel, split3b: split3bMensuel, isSpillover: split3bMensuel > 0, existing3a: cotisationsActuelles3a,
        benchmarks: { retraite: bestRet.provider, incapacite: bestInc.provider, deces: bestDec.provider }
      },
      sal: salaireAnnuel
    };
  }, [cloudData, externalPlans, clientAge, allocation3a, isSmoothingIG, includeTaxSavings, selRet, selInc, selDec, selPay, benchmarks]);

  return {
    analysis,
    loading,
    cloudData,
    config: {
      allocation3a, setAllocation3a,
      isSmoothingIG, setIsSmoothingIG,
      includeTaxSavings, setIncludeTaxSavings,
      switches: { selRet, setSelRet, selInc, setSelInc, selDec, setSelDec, selPay, setSelPay }
    }
  };
}