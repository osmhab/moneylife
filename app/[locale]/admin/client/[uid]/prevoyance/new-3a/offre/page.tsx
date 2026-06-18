"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { 
  ArrowLeft, ShieldAlert, CheckCircle2, 
  Edit3, Eye, Printer, BookOpen, Wallet, Shield, Heart, User, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
// Source de vérité des prestations décès (par pilier × bénéficiaire + capitaux).
import { computeDecesMaladie } from "@/lib/calculs/events/decesMaladie";
import { computeDecesAccident } from "@/lib/calculs/events/decesAccident";
import { LEGAL_2025 } from "@/lib/core/legal";
import { Legal_Echelle44_2025 } from "@/lib/registry/echelle44";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// ============================================================================
// COMPOSANTS GRAPHIQUES (SVG)
// ============================================================================

const RetraiteComboChart = ({ salary, target, avs, lpp, capital3a, solution3a = 0, isSolution = false }: any) => {
  // Les 3a (capitaux) sont convertis en rente mensuelle indicative (sur 25 ans).
  const rente3a = (capital3a || 0) / 25 / 12;
  const renteSol = (solution3a || 0) / 25 / 12;
  const total = avs + lpp + rente3a + renteSol;
  const lacune = Math.max(0, Math.round(target - total));
  const scale = Math.max(target, total, 1);
  const pct = (v: number) => `${(Math.max(0, v) / scale) * 100}%`;
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-CH");

  const segs = [
    { label: "AVS / AI", val: avs, color: "#9ca3af" },
    { label: "LPP (2e pilier)", val: lpp, color: "#6b7280" },
    ...(rente3a > 0 ? [{ label: "3e pilier actuel", val: rente3a, color: "#816DEC" }] : []),
    ...(renteSol > 0 ? [{ label: "Solution proposée", val: renteSol, color: "#2563eb" }] : []),
  ];

  return (
    <div className="w-full bg-white/5 print:bg-white border border-white/5 print:border-gray-200 rounded-xl p-6 relative font-sans print:break-inside-avoid space-y-4">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] uppercase font-bold text-white/50 print:text-gray-600">Revenu mensuel dès 65 ans</span>
        <span className="text-xs font-bold text-white/70 print:text-gray-700">Objectif 80% : CHF {fmt(target)}</span>
      </div>

      {/* Barre empilée (proportions) */}
      <div className="h-9 w-full rounded-lg overflow-hidden flex bg-white/10 print:bg-gray-100 border border-white/10 print:border-gray-200">
        {segs.map((seg, i) => (
          <div key={i} className="h-full" style={{ width: pct(seg.val), backgroundColor: seg.color }} title={`${seg.label} : ${fmt(seg.val)} CHF`} />
        ))}
        {lacune > 0 && (
          <div className="h-full" style={{ width: pct(lacune), backgroundColor: "#ef4444", opacity: 0.35 }} title={`Lacune : ${fmt(lacune)} CHF`} />
        )}
      </div>

      {/* Légende (valeurs lisibles, aucun chevauchement) */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {segs.map((seg, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-white/70 print:text-gray-700">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} /> {seg.label}
            </span>
            <span className="font-bold text-white print:text-gray-900">CHF {fmt(seg.val)}</span>
          </div>
        ))}
        {lacune > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-bold text-[#ef4444] print:text-[#b91c1c]">
              <span className="w-3 h-3 rounded-sm shrink-0 bg-[#ef4444]/40" /> Lacune
            </span>
            <span className="font-bold text-[#ef4444] print:text-[#b91c1c]">− CHF {fmt(lacune)}</span>
          </div>
        )}
      </div>

      <p className="text-[11px] print:text-xs text-white/60 print:text-gray-600 leading-snug pt-3 border-t border-white/5 print:border-gray-200">
        Salaire actuel <strong className="text-white print:text-gray-900">CHF {fmt(salary)}</strong> → objectif retraite (80%) <strong className="text-white print:text-gray-900">CHF {fmt(target)}</strong>.{" "}
        {lacune > 0
          ? <strong className="text-[#ef4444] print:text-[#b91c1c]">Manque CHF {fmt(lacune)} / mois.</strong>
          : <strong className="text-emerald-400 print:text-emerald-700">Objectif atteint.</strong>}
      </p>
    </div>
  );
};

const RetraiteConsoAreaChart = ({ target = 0, avs = 0, lpp = 0, capital3a = 0, solution3a = 0, isSolution = false }: any) => {
  const totalCapital = capital3a + solution3a;
  if (totalCapital <= 0) return null;
  const hasSol = solution3a > 0; // page solution (vs simple diagnostic)

  // Manque mensuel à combler à la retraite (cible - rentes viagères AVS+LPP).
  const gapMensuel = Math.max(0, target - (avs + lpp));
  const gapAnnuel = gapMensuel * 12;

  // Nombre d'années que le capital total permet de combler (puis âge d'épuisement).
  const yearsTotal = gapAnnuel > 0 ? totalCapital / gapAnnuel : 999;
  const ageTotal = Math.min(90, 65 + yearsTotal);
  const totalReaches90 = 65 + yearsTotal >= 90;

  // Position sur la frise 65 -> 90 (en %).
  const pct = (age: number) => ((Math.min(90, Math.max(65, age)) - 65) / 25) * 100;
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-CH");

  return (
    <div className="w-full bg-white/5 print:bg-white border border-white/5 print:border-gray-200 rounded-xl p-6 relative mt-4 print:break-inside-avoid space-y-5">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] uppercase font-bold text-white/50 print:text-gray-600">Durée de couverture du manque</span>
        <span className="text-xs font-bold text-white/70 print:text-gray-700">Manque : CHF {fmt(gapMensuel)} / mois</span>
      </div>

      {/* AVEC la solution */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#2563eb] print:text-[#2563eb]">
          <span>{hasSol ? "Avec la solution proposée" : "Votre épargne 3a actuelle"}</span>
          <span>{totalReaches90 ? "à vie (90 ans +)" : `jusqu'à ~${Math.round(ageTotal)} ans`}</span>
        </div>
        <div className="h-5 w-full bg-white/10 print:bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#2563eb] rounded-full" style={{ width: `${pct(ageTotal)}%` }} />
        </div>
      </div>


      {/* Échelle d'âge */}
      <div className="flex justify-between text-[9px] font-bold text-white/40 print:text-gray-400 px-0.5">
        <span>65 ans</span><span>75</span><span>85</span><span>90 +</span>
      </div>

      {/* Synthèse */}
      <p className="text-[11px] print:text-xs text-white/60 print:text-gray-600 leading-snug pt-3 border-t border-white/5 print:border-gray-200">
        {hasSol ? "Capital total " : "Votre capital 3a "}<strong className="text-white print:text-gray-900">CHF {fmt(totalCapital)}</strong> consommé pour combler le manque de CHF {fmt(gapMensuel)}/mois →{" "}
        {totalReaches90
          ? <strong className="text-emerald-400 print:text-emerald-700">couvre le manque à vie.</strong>
          : <strong className="text-[#2563eb] print:text-[#2563eb]">tient jusqu'à ~{Math.round(ageTotal)} ans.</strong>}
      </p>
    </div>
  );
};

const PerteGainAreaChart = ({ type, salary, target, current, ai = 0, lpp = 0, enfant = 0, isSolution = false, coverage = 0, laa = 0 }: any) => {
  const isMaladie = type === "maladie";
  const maxVal = salary * 1.1;
  const getY = (val: number) => 150 - (val / maxVal) * 130;
  
  const yTarget = getY(target);
  const yCurrent = getY(current);
  const ySansEnfant = getY(current - enfant);
  const yAI = getY(ai);
  const yLPP = getY(ai + lpp);
  
  const yBase = 150; 
  const xDrop = 340; // Point de chute de la rente (Majorité des enfants)
  
  // Analyse intelligente des lacunes (Début vs Fin)
  const hasLacuneInitiale = target > current;
  const hasLacuneFinale = target > (current - enfant);
  
  // Points de base pour le graphique Accident
  const ptsAccidentBase = enfant > 0 
    ? `50,${yCurrent} ${xDrop},${yCurrent} ${xDrop},${ySansEnfant} 500,${ySansEnfant} 500,${yBase} 50,${yBase}`
    : `50,${yCurrent} 500,${yCurrent} 500,${yBase} 50,${yBase}`;
    
  const ptsAccidentLine = enfant > 0
    ? `50,${yCurrent} ${xDrop},${yCurrent} ${xDrop},${ySansEnfant} 500,${ySansEnfant}`
    : `50,${yCurrent} 500,${yCurrent}`;

  // Calcul du bloc Solution/Lacune pour Accident
  let polyAccPoints = "";
  let accTxX = 0;
  let accTxY = 0;
  if (hasLacuneInitiale) {
      polyAccPoints = enfant > 0
        ? `50,${yTarget} 500,${yTarget} 500,${ySansEnfant} ${xDrop},${ySansEnfant} ${xDrop},${yCurrent} 50,${yCurrent}`
        : `50,${yTarget} 500,${yTarget} 500,${yCurrent} 50,${yCurrent}`;
      accTxX = enfant > 0 ? 420 : 275;
      accTxY = yTarget + ((ySansEnfant - yTarget) / 2) + 4;
  } else if (hasLacuneFinale) {
      polyAccPoints = `${xDrop},${yTarget} 500,${yTarget} 500,${ySansEnfant} ${xDrop},${ySansEnfant}`;
      accTxX = (xDrop + 500) / 2;
      accTxY = yTarget + ((ySansEnfant - yTarget) / 2) + 4;
  }

  // Calcul du bloc Solution/Lacune pour Maladie
  let polyMalPoints = "";
  let malTxX = 0;
  let malTxY = 0;
  if (hasLacuneInitiale) {
      polyMalPoints = enfant > 0
        ? `180,${yTarget} 500,${yTarget} 500,${yLPP} ${xDrop},${yLPP} ${xDrop},${yCurrent} 180,${yCurrent}`
        : `180,${yTarget} 500,${yTarget} 500,${yCurrent} 180,${yCurrent}`;
      malTxX = enfant > 0 ? 420 : 340;
      malTxY = yTarget + ((yLPP - yTarget) / 2) + 4;
  } else if (hasLacuneFinale) {
      polyMalPoints = `${xDrop},${yTarget} 500,${yTarget} 500,${yLPP} ${xDrop},${yLPP}`;
      malTxX = (xDrop + 500) / 2;
      malTxY = yTarget + ((yLPP - yTarget) / 2) + 4;
  }

  // --- Solution maladie plafonnée au montant RÉELLEMENT assuré (coverage) ---
  // L'assurance ajoute une rente plate ; on n'affiche comme « comblé » que ce
  // qu'elle couvre vraiment, le reste demeure une lacune (rouge).
  const malCov = Number(coverage) || 0;
  const malBaseFinal = Math.max(0, current - enfant);
  const malCovTop = Math.min(target, malBaseFinal + malCov);
  const yMalCovTop = getY(malCovTop);
  const malSolutionPoints = enfant > 0
    ? `180,${yMalCovTop} 500,${yMalCovTop} 500,${yLPP} ${xDrop},${yLPP} ${xDrop},${yCurrent} 180,${yCurrent}`
    : `180,${yMalCovTop} 500,${yMalCovTop} 500,${yCurrent} 180,${yCurrent}`;
  const malResidualPoints = `180,${yTarget} 500,${yTarget} 500,${yMalCovTop} 180,${yMalCovTop}`;
  const malCoveredAmount = Math.max(0, malCovTop - malBaseFinal);
  const malResidualAmount = Math.max(0, target - malCovTop);

  return (
    <div className="w-full h-64 bg-white/5 print:bg-white border border-white/5 print:border-gray-200 rounded-xl p-6 relative font-sans print:break-inside-avoid">
      <span className="absolute top-4 left-6 text-[11px] uppercase font-bold text-white/50 print:text-gray-600">
        Évolution du revenu : {isMaladie ? "Cas de Maladie" : "Cas d'Accident"}
      </span>
      <svg className="w-full h-full mt-6 overflow-visible" viewBox="0 0 600 180" preserveAspectRatio="none">
        
        <line x1="50" y1={yTarget} x2="500" y2={yTarget} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,4" />
        <text x="510" y={yTarget + 4} fontSize="11" fill="#ef4444" fontWeight="bold" textAnchor="start">Objectif 90%</text>
        <text x="510" y={yTarget + 18} fontSize="10" fill="#ef4444" textAnchor="start">{target.toLocaleString('fr-CH')} CHF</text>
        
        {!isMaladie && (
          <g>
            {/* LAA / SUVA : base ~80% dès le 1er jour */}
            <polygon points={`50,${getY(laa)} 500,${getY(laa)} 500,150 50,150`} className="fill-white/20 print:fill-gray-200" />
            <text x="275" y={getY(laa / 2)} fontSize="10" fill="currentColor" className="text-white print:text-gray-800 font-bold" textAnchor="middle">LAA / SUVA</text>
            <text x="275" y={getY(laa / 2) + 12} fontSize="9" fill="currentColor" className="text-white/70 print:text-gray-700" textAnchor="middle">{Math.round(laa).toLocaleString('fr-CH')} CHF</text>

            {/* AI (si applicable) */}
            {ai > 0 && (
              <g>
                <polygon points={`50,${getY(laa + ai)} 500,${getY(laa + ai)} 500,${getY(laa)} 50,${getY(laa)}`} className="fill-white/30 print:fill-gray-300" />
                <text x="275" y={getY(laa + ai / 2)} fontSize="10" fill="currentColor" className="text-white print:text-gray-800 font-bold" textAnchor="middle">AI</text>
                <text x="275" y={getY(laa + ai / 2) + 12} fontSize="9" fill="currentColor" className="text-white/70 print:text-gray-700" textAnchor="middle">{Math.round(ai).toLocaleString('fr-CH')} CHF</text>
              </g>
            )}

            {/* LPP (si applicable) */}
            {lpp > 0 && (
              <g>
                <polygon points={`50,${ySansEnfant} 500,${ySansEnfant} 500,${getY(laa + ai)} 50,${getY(laa + ai)}`} className="fill-white/40 print:fill-gray-400" />
                <text x="275" y={getY(laa + ai + lpp / 2)} fontSize="10" fill="currentColor" className="text-white print:text-gray-800 font-bold" textAnchor="middle">LPP</text>
                <text x="275" y={getY(laa + ai + lpp / 2) + 12} fontSize="9" fill="currentColor" className="text-white/70 print:text-gray-700" textAnchor="middle">{Math.round(lpp).toLocaleString('fr-CH')} CHF</text>
              </g>
            )}

            {/* Enfants : rentes qui chutent à la majorité */}
            {enfant > 0 && (
              <g>
                <polygon points={`50,${yCurrent} ${xDrop},${yCurrent} ${xDrop},${ySansEnfant} 50,${ySansEnfant}`} className="fill-white/50 print:fill-gray-500" />
                <text x={(50 + xDrop) / 2} y={getY(current - enfant / 2)} fontSize="10" fill="currentColor" className="text-white print:text-gray-900 font-bold" textAnchor="middle">Enfants</text>
                <text x={(50 + xDrop) / 2} y={getY(current - enfant / 2) + 12} fontSize="9" fill="currentColor" className="text-white/70 print:text-gray-800" textAnchor="middle">{Math.round(enfant).toLocaleString('fr-CH')} CHF</text>
                <polyline points={`${xDrop},${yCurrent} ${xDrop},150`} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" className="text-white/30 print:text-gray-400" />
                <text x={xDrop} y="160" fontSize="9" fill="currentColor" className="text-white/50 print:text-gray-500" textAnchor="middle">Fin rentes</text>
              </g>
            )}

            {/* Ligne de couverture */}
            <polyline points={ptsAccidentLine} fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 print:text-gray-500" />

            {/* Lacune éventuelle (l'accident est en général bien couvert par la LAA) */}
            {hasLacuneFinale ? (
              <g>
                <polygon points={polyAccPoints} fill="#ef4444" opacity="0.3" />
                <text x={accTxX} y={accTxY} fontSize="11" fill="#b91c1c" fontWeight="bold" textAnchor="middle">
                  Lacune : {(target - (current - enfant)).toLocaleString('fr-CH')} CHF
                </text>
              </g>
            ) : (
              <text x="275" y={yTarget - 8} fontSize="10" fill="#059669" fontWeight="bold" textAnchor="middle">Couverture suffisante (LAA 80%)</text>
            )}
          </g>
        )}

        {isMaladie && (
          <g>
            <polygon points={`50,20 180,20 180,150 50,150`} className="fill-white/10 print:fill-gray-100" />
            <polyline points={`50,20 180,20 180,${yCurrent}`} fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 print:text-gray-400" />
            <text x="115" y={45} fontSize="10" fill="currentColor" className="text-white/60 print:text-gray-700 font-bold" textAnchor="middle">100% Employeur</text>
            
            <polygon points={`180,${yAI} 500,${yAI} 500,150 180,150`} className="fill-white/20 print:fill-gray-200" />
            <text x="340" y={getY(ai / 2)} fontSize="10" fill="currentColor" className="text-white print:text-gray-800 font-bold" textAnchor="middle">AI</text>
            <text x="340" y={getY(ai / 2) + 12} fontSize="9" fill="currentColor" className="text-white/70 print:text-gray-700" textAnchor="middle">{ai.toLocaleString()} CHF</text>
            
            <polygon points={`180,${yLPP} 500,${yLPP} 500,${yAI} 180,${yAI}`} className="fill-white/30 print:fill-gray-300" />
            <text x="340" y={getY(ai + lpp / 2)} fontSize="10" fill="currentColor" className="text-white print:text-gray-800 font-bold" textAnchor="middle">LPP</text>
            <text x="340" y={getY(ai + lpp / 2) + 12} fontSize="9" fill="currentColor" className="text-white/70 print:text-gray-700" textAnchor="middle">{lpp.toLocaleString()} CHF</text>

            {enfant > 0 && (
              <g>
                <polygon points={`180,${yCurrent} ${xDrop},${yCurrent} ${xDrop},${yLPP} 180,${yLPP}`} className="fill-white/40 print:fill-gray-400" />
                <text x={(180 + xDrop) / 2} y={getY(ai + lpp + enfant / 2)} fontSize="10" fill="currentColor" className="text-white print:text-gray-800 font-bold" textAnchor="middle">Enfants</text>
                <text x={(180 + xDrop) / 2} y={getY(ai + lpp + enfant / 2) + 12} fontSize="9" fill="currentColor" className="text-white/70 print:text-gray-700" textAnchor="middle">{enfant.toLocaleString()} CHF</text>
                
                <polyline points={`${xDrop},${yCurrent} ${xDrop},150`} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" className="text-white/30 print:text-gray-400" />
                <text x={xDrop} y="160" fontSize="9" fill="currentColor" className="text-white/50 print:text-gray-500" textAnchor="middle">Fin rentes</text>
              </g>
            )}

            <polyline points={enfant > 0 ? `180,${yCurrent} ${xDrop},${yCurrent} ${xDrop},${yLPP} 500,${yLPP}` : `180,${yCurrent} 500,${yCurrent}`} fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 print:text-gray-400" />
            
            {/* ANALYSE : lacune complète (rouge) */}
            {hasLacuneFinale && !isSolution && (
              <g>
                <polygon points={polyMalPoints} fill="#ef4444" opacity="0.3" />
                <text x={malTxX} y={malTxY} fontSize="11" fill="#b91c1c" fontWeight="bold" textAnchor="middle">
                  Lacune : {(target - (current - enfant)).toLocaleString('fr-CH')} CHF
                </text>
              </g>
            )}
            {/* SOLUTION : on ne comble que le montant réellement assuré */}
            {isSolution && malCoveredAmount > 0 && (
              <g>
                <polygon points={malSolutionPoints} fill="#2563eb" opacity="0.85" />
                <text x={malTxX} y={getY((malBaseFinal + malCovTop) / 2) + 4} fontSize="11" fill="white" fontWeight="bold" textAnchor="middle">
                  Solution : {malCoveredAmount.toLocaleString('fr-CH')} CHF
                </text>
              </g>
            )}
            {isSolution && malResidualAmount > 0 && (
              <g>
                <polygon points={malResidualPoints} fill="#ef4444" opacity="0.3" />
                <text x={malTxX} y={getY((malCovTop + target) / 2) + 4} fontSize="10" fill="#b91c1c" fontWeight="bold" textAnchor="middle">
                  Reste : {malResidualAmount.toLocaleString('fr-CH')} CHF
                </text>
              </g>
            )}
          </g>
        )}

        <line x1="50" y1="150" x2="500" y2="150" stroke="currentColor" className="text-white/20 print:text-gray-300" strokeWidth="1" />
        <text x="50" y="165" fontSize="10" fill="currentColor" className="text-white/50 print:text-gray-600">1er jour</text>
        {isMaladie && <text x="180" y="165" fontSize="10" fill="currentColor" className="text-white/50 print:text-gray-600 font-bold" textAnchor="middle">Fin des droits</text>}
        <text x="500" y="165" fontSize="10" fill="currentColor" className="text-white/50 print:text-gray-600" textAnchor="end">Retraite (65 ans)</text>
      </svg>
    </div>
  );
};

// Ligne de légende par PILIER : qui verse quoi à chaque survivant
// (rente du conjoint = à vie ; rente d'orphelin = jusqu'à la majorité).
const PilierLegend = ({ label, color, conjoint, orphelin }: any) => {
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-CH");
  return (
    <div className="flex items-center justify-between text-xs gap-3">
      <span className="flex items-center gap-2 text-white/80 print:text-gray-800 font-bold shrink-0">
        <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} /> {label}
      </span>
      <span className="text-white/60 print:text-gray-600 text-right">
        Conjoint <strong className="text-white print:text-gray-900">{fmt(conjoint)}</strong>
        <span className="opacity-50"> · </span>
        Orphelins <strong className="text-white print:text-gray-900">{fmt(orphelin)}</strong> /m
      </span>
    </div>
  );
};

// Rentes de survivants dans le temps, par cause (maladie / accident).
// Même esprit que les graphes incapacité de gain : composantes empilées,
// chute à la majorité du dernier enfant, lacune vs besoin + légende détaillée.
const DecesRentesChart = ({ cause, target = 0, data = {} }: any) => {
  const isAcc = cause === "accident";
  // Détail par pilier × bénéficiaire : conjoint (rente à vie) + orphelin (baisse).
  const laaC = data.laaC || 0, laaE = data.laaE || 0;
  const avsC = data.avsC || 0, avsE = data.avsE || 0;
  const lppC = data.lppC || 0, lppE = data.lppE || 0;
  // Pour le graphe empilé : base = rentes conjoint ; bloc orphelins = baisse totale.
  const laa = laaC, ai = avsC, lpp = lppC;
  const enfant = laaE + avsE + lppE;
  const baseFinal = laa + ai + lpp;        // rente stable (après majorité)
  const current = baseFinal + enfant;      // rente aujourd'hui (avec orphelins)
  const maxVal = Math.max(target, current, 1) * 1.12;
  const getY = (v: number) => 140 - (v / maxVal) * 118;
  const yTarget = getY(target);
  const yCur = getY(current);
  const yFin = getY(baseFinal);
  const yLaa = getY(laa);
  const yLaaAi = getY(laa + ai);
  const xDrop = 340;
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-CH");
  const lacune = Math.max(0, target - baseFinal);

  return (
    <div className="w-full bg-white/5 print:bg-white border border-white/5 print:border-gray-200 rounded-xl p-5 relative font-sans print:break-inside-avoid space-y-3">
      <span className="text-[11px] uppercase font-bold text-white/50 print:text-gray-600">
        Rentes de survivants — Décès par {isAcc ? "accident" : "maladie"}
      </span>
      <svg className="w-full h-36 overflow-visible" viewBox="0 0 600 155" preserveAspectRatio="none">
        <line x1="50" y1={yTarget} x2="500" y2={yTarget} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,4" />
        <text x="508" y={yTarget + 3} fontSize="10" fill="#ef4444" fontWeight="bold">Besoin</text>
        <text x="508" y={yTarget + 15} fontSize="9" fill="#ef4444">{fmt(target)}</text>

        {laa > 0 && (
          <g>
            <polygon points={`50,${yLaa} 500,${yLaa} 500,140 50,140`} fill="#cbd5e1" opacity="0.85" className="print:opacity-100" />
            <text x="275" y={getY(laa / 2) + 3} fontSize="10" fill="#1f2937" fontWeight="bold" textAnchor="middle">LAA survivants</text>
          </g>
        )}
        {ai > 0 && (
          <g>
            <polygon points={`50,${yLaaAi} 500,${yLaaAi} 500,${yLaa} 50,${yLaa}`} fill="#94a3b8" opacity="0.9" className="print:opacity-100" />
            <text x="275" y={getY(laa + ai / 2) + 3} fontSize="10" fill="#1f2937" fontWeight="bold" textAnchor="middle">AVS / AI</text>
          </g>
        )}
        {lpp > 0 && (
          <g>
            <polygon points={`50,${yFin} 500,${yFin} 500,${yLaaAi} 50,${yLaaAi}`} fill="#64748b" opacity="0.9" className="print:opacity-100" />
            <text x="275" y={getY(laa + ai + lpp / 2) + 3} fontSize="10" fill="#ffffff" fontWeight="bold" textAnchor="middle">LPP</text>
          </g>
        )}
        {enfant > 0 && (
          <g>
            <polygon points={`50,${yCur} ${xDrop},${yCur} ${xDrop},${yFin} 50,${yFin}`} fill="#816DEC" opacity="0.7" />
            <text x={(50 + xDrop) / 2} y={getY(baseFinal + enfant / 2) + 3} fontSize="9" fill="#ffffff" fontWeight="bold" textAnchor="middle">Orphelins</text>
            <polyline points={`${xDrop},${yCur} ${xDrop},140`} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" className="text-white/30 print:text-gray-400" />
            <text x={xDrop} y="150" fontSize="8" fill="currentColor" className="text-white/50 print:text-gray-500" textAnchor="middle">Majorité dernier enfant</text>
          </g>
        )}
        {lacune > 0 && (
          <g>
            {/* Lacune posée DESSUS la prestation (en escalier), du sommet des rentes
                jusqu'à la cible — s'élargit après la majorité du dernier enfant. */}
            <polygon points={`50,${yTarget} 500,${yTarget} 500,${yFin} ${xDrop},${yFin} ${xDrop},${yCur} 50,${yCur}`} fill="#ef4444" opacity="0.3" />
            <text x={415} y={(yTarget + yFin) / 2 + 3} fontSize="10" fill="#b91c1c" fontWeight="bold" textAnchor="middle">Lacune {fmt(lacune)}</text>
          </g>
        )}
        <line x1="50" y1="140" x2="500" y2="140" stroke="currentColor" className="text-white/20 print:text-gray-300" strokeWidth="1" />
        <text x="50" y="152" fontSize="9" fill="currentColor" className="text-white/50 print:text-gray-600">Aujourd'hui</text>
        <text x="500" y="152" fontSize="9" fill="currentColor" className="text-white/50 print:text-gray-600" textAnchor="end">Long terme</text>
      </svg>

      {/* Légende par PILIER : qui verse quoi à chaque survivant */}
      <div className="space-y-1.5 pt-2 border-t border-white/5 print:border-gray-200">
        {isAcc && <PilierLegend label="LAA / SUVA" color="#cbd5e1" conjoint={laaC} orphelin={laaE} />}
        <PilierLegend label="AVS / AI" color="#94a3b8" conjoint={avsC} orphelin={avsE} />
        <PilierLegend label="LPP (2e pilier)" color="#64748b" conjoint={lppC} orphelin={lppE} />
        <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5 print:border-gray-100">
          <span className="font-bold text-[#ef4444] print:text-[#b91c1c]">Lacune (après majorité du dernier enfant)</span>
          <span className="font-bold text-[#ef4444] print:text-[#b91c1c]">− CHF {fmt(lacune)} /m</span>
        </div>
      </div>
    </div>
  );
};

const DecesCapitalChart = ({ target, coverage = 0, isSolution = false }: any) => {
  const tgt = Number(target) || 0;
  const covered = Math.min(Number(coverage) || 0, tgt);
  const residual = Math.max(0, tgt - covered);
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-CH");
  const pct = (v: number) => (tgt > 0 ? `${(v / tgt) * 100}%` : "0%");

  if (tgt <= 0) {
    return (
      <div className="w-full bg-white/5 print:bg-white border border-white/5 print:border-gray-200 rounded-xl p-6 text-center">
        <span className="text-sm font-bold text-emerald-400 print:text-emerald-600">CHF 0 — aucun besoin de capital immédiat</span>
      </div>
    );
  }

  return (
    <div className="w-full bg-white/5 print:bg-white border border-white/5 print:border-gray-200 rounded-xl p-6 relative print:break-inside-avoid space-y-4">
      {/* Barre horizontale : couvert (bleu) + reste (rouge), pleine largeur = besoin */}
      <div className="h-9 w-full rounded-lg overflow-hidden flex bg-white/10 print:bg-gray-100 border border-white/10 print:border-gray-200">
        {covered > 0 && <div className="h-full bg-[#2563eb]" style={{ width: pct(covered) }} title={`${isSolution ? "Garantie" : "Déjà couvert"} : ${fmt(covered)} CHF`} />}
        {residual > 0 && <div className="h-full" style={{ width: pct(residual), backgroundColor: "#ef4444", opacity: 0.4 }} title={`Reste à couvrir : ${fmt(residual)} CHF`} />}
      </div>

      {/* Montants en légende — jamais tronqués */}
      <div className="space-y-2">
        {covered > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-white/70 print:text-gray-700">
              <span className="w-3 h-3 rounded-sm shrink-0 bg-[#2563eb]" /> {isSolution ? "Garantie proposée" : "Déjà couvert (capital versé)"}
            </span>
            <span className="font-bold text-white print:text-gray-900">CHF {fmt(covered)}</span>
          </div>
        )}
        {residual > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-bold text-[#ef4444] print:text-[#b91c1c]">
              <span className="w-3 h-3 rounded-sm shrink-0 bg-[#ef4444]/50" /> Reste à couvrir
            </span>
            <span className="font-bold text-[#ef4444] print:text-[#b91c1c]">CHF {fmt(residual)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm pt-2 border-t border-white/5 print:border-gray-200">
          <span className="font-bold text-white/80 print:text-gray-800">Besoin de capital immédiat</span>
          <span className="font-bold text-white print:text-gray-900">CHF {fmt(tgt)}</span>
        </div>
      </div>
    </div>
  );
};

const DonutChart = ({ percentage, colorClass, printColor }: { percentage: number, colorClass: string, printColor: string }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  return (
    <div className="relative w-24 h-24 flex items-center justify-center print:break-inside-avoid">
      <svg className="w-full h-full transform -rotate-90 overflow-visible" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5 print:text-gray-100" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className={`${colorClass} ${printColor}`} />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-lg font-black text-white print:text-gray-900">{percentage}%</span>
      </div>
    </div>
  );
};

// --- HELPERS D'EXTRACTION DES DONNÉES D'ANALYSE ---
const getVal = (proj: any, label: string, col: number = 0) => {
    const row = proj?.rows?.find((r: any) => r.label && r.label.trim() === label.trim());
    return Number(row?.cells?.[col]) || 0;
  };
  
  const getSumIncludes = (proj: any, keyword: string, col: number = 0) => {
    if (!proj || !proj.rows) return 0;
    return proj.rows
      .filter((r: any) => r.label && r.label.toLowerCase().includes(keyword.toLowerCase()))
      .reduce((sum: number, r: any) => sum + (Number(r.cells?.[col]) || 0), 0);
  };

  // Répartit le montant RÉELLEMENT versé d'un pilier (déjà coordonné) entre le
  // conjoint et les orphelins, au prorata des montants bruts du moteur.
  const splitPilier = (total: number, brutConjoint: number, brutOrphelin: number) => {
    const g = brutConjoint + brutOrphelin;
    if (g <= 0) return { c: Math.round(total), e: 0 };
    return { c: Math.round((total * brutConjoint) / g), e: Math.round((total * brutOrphelin) / g) };
  };

  export default function AdminCustomOfferBookletPage() {
    const router = useRouter();
    const params = useParams();
    const clientUid = params.uid as string;
  
    const [loading, setLoading] = useState(true);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [clientProfile, setClientProfile] = useState<any>(null);
    const [editMode, setEditMode] = useState(true);
  
    // --- DONNÉES DU DIAGNOSTIC ---
    const [currentRetState, setCurrentRetState] = useState({ current: 4850, target: 8400, salary: 10500, avs: 2390, lpp: 2460, cap3a: 0 });
    const [currentIncState, setCurrentIncState] = useState({ currentMaladie: 4200, aiMaladie: 2000, lppMaladie: 2200, enfantsMaladie: 0, currentAccident: 8400, laaAccident: 6720, aiAccident: 0, lppAccident: 1680, enfantsAccident: 0, target: 9450 });
    const [currentDecState, setCurrentDecState] = useState({ current: 150000, target: 100000, renteDeces: 3500, renteAvs: 2100, renteLpp: 1400 });
    // Rentes de survivants par cause (décès maladie vs accident), mensuelles.
    const [decRentes, setDecRentes] = useState({
      target: 6720,
      maladie: { avsC: 2100, avsE: 700, lppC: 1400, lppE: 500, laaC: 0, laaE: 0 },
      accident: { laaC: 4200, laaE: 900, avsC: 2100, avsE: 700, lppC: 1400, lppE: 500 },
    });
  
    // --- DONNÉES DE L'OFFRE ---
    const [providerRet, setProviderRet] = useState("Swiss Life");
    const [premiumRet, setPremiumRet] = useState(350);
    const [capitalRet, setCapitalRet] = useState(245000);
    const [isReplaceMode, setIsReplaceMode] = useState(false); // 👈 NOUVEAU SWITCH
  
    const [providerInc, setProviderInc] = useState("Allianz");
    const [premiumInc, setPremiumInc] = useState(45);
    const [coverageInc, setCoverageInc] = useState(3150);
  
    const [providerDec, setProviderDec] = useState("Retraites Populaires");
    const [premiumDec, setPremiumDec] = useState(28);
    const [coverageDec, setCoverageDec] = useState(100000);
  
    const [premiumPay, setPremiumPay] = useState(12);

    // Couverture proposée ou non (switch on/off du configurateur). Off = la
    // solution n'apparaît pas dans la présentation client.
    const [selRet, setSelRet] = useState(true);
    const [selInc, setSelInc] = useState(true);
    const [selDec, setSelDec] = useState(true);
    const [selPay, setSelPay] = useState(true);

    const [isSavingOffer, setIsSavingOffer] = useState(false);
    const [offerSaved, setOfferSaved] = useState(false);

    // Notes libres du conseiller (page finale du dossier).
    const [notes, setNotes] = useState("Aucune note.");

    useEffect(() => {
      const loadData = async () => {
        if (!clientUid) return;
        try {
          const profileSnap = await getDoc(doc(db, "clients", clientUid, "DonneePersonnelles", "current"));
          let pData: any = {};
          if (profileSnap.exists()) {
            pData = profileSnap.data();
            setClientProfile(pData);
          }
          
          const salaireAnnuel = Number(pData.Enter_salaireAnnuel) || 105000;
          const salaireMensuel = salaireAnnuel / 12;
  
          const analyseSnap = await getDoc(doc(db, "clients", clientUid, "Analyse", "current"));
          let analyseData: any = {};
          if (analyseSnap.exists()) {
            analyseData = analyseSnap.data();
          }

          // --- FETCH DES PLANS 3A EXISTANTS ---
          const plansSnap = await getDocs(collection(db, "clients", clientUid, "plans"));
          let capital3aExistant = 0;
          let lppPlanData: any = {}; // champs Enter_* du certificat LPP (rentes/capitaux survivants)
          plansSnap.forEach(d => {
            const p = d.data();
            const type = (p.type || "").toLowerCase();
            const isActive = p.status === "ACTIVE" || !p.status;
            const isPrivatePlan = type.includes("3a") || type.includes("3b") || type.includes("pilier");

            if (p.type === "LPP_BASE" && isActive) lppPlanData = p.data || {};

            if (isPrivatePlan && isActive) {
              const pd = p.data || {};
              const montantStr = String(pd.capitalRetraiteProjete || pd.capitalRetraiteGlobal || pd.soldeActuel || pd.montant || "0");
              const montantNum = Number(montantStr.replace(/[^0-9.-]+/g, "")) || 0;
              capital3aExistant += montantNum;
            }
          });
  
          const projections = analyseData?.projections || {};
  
          // --- A. DONNÉES RETRAITE ---
          const retProj = projections.retraite || {};
          const avsRet = getVal(retProj, "AVS/AI", 0) / 12;
          const lppRet = getVal(retProj, "LPP", 0) / 12;
          const cibleRet = (getVal(retProj, "Revenu cible", 0) / 12) || Math.round(salaireMensuel * 0.8);
          
          setCurrentRetState({ 
            current: Math.round(avsRet + lppRet), 
            target: Math.round(cibleRet), 
            salary: Math.round(salaireMensuel), 
            avs: Math.round(avsRet), 
            lpp: Math.round(lppRet), 
            cap3a: Math.round(capital3aExistant) // <--- INJECTION DU VRAI CAPITAL
          });
  
// --- B. DONNÉES INCAPACITÉ (Détection Delta par Matrice) ---
const invM = projections.invalidite_maladie || {};
const invA = projections.invalidite_accident || {};

// On cherche la dernière colonne (l'âge de la retraite)
const lastColM = Math.max(2, (invM.headerYears?.length || 3) - 1);
const lastColA = Math.max(2, (invA.headerYears?.length || 3) - 1);

// --- Maladie ---
const aiM_cur = getVal(invM, "AVS/AI", 2) / 12;
const aiM_fin = getVal(invM, "AVS/AI", lastColM) / 12;
const lppM_cur = getVal(invM, "LPP", 2) / 12;
const lppM_fin = getVal(invM, "LPP", lastColM) / 12;

// S'il y a une baisse entre aujourd'hui et la retraite, c'est la rente enfant !
const enfantsMaladie = Math.max(0, (aiM_cur - aiM_fin) + (lppM_cur - lppM_fin));
const cibleIncM = (getVal(invM, "Revenu cible", 2) / 12) || Math.round(salaireMensuel * 0.9);

// --- Accident ---
const laaA_cur = (getVal(invA, "LAA", 2) || getVal(invA, "LAA/SUVA", 2)) / 12;
const laaA_fin = (getVal(invA, "LAA", lastColA) || getVal(invA, "LAA/SUVA", lastColA)) / 12;
const aiA_cur = getVal(invA, "AVS/AI", 2) / 12;
const aiA_fin = getVal(invA, "AVS/AI", lastColA) / 12;
const lppA_cur = getVal(invA, "LPP", 2) / 12;
const lppA_fin = getVal(invA, "LPP", lastColA) / 12;

const enfantsAccident = Math.max(0, (laaA_cur - laaA_fin) + (aiA_cur - aiA_fin) + (lppA_cur - lppA_fin));
const currentAccident = (laaA_fin + aiA_fin + lppA_fin + enfantsAccident) || Math.round(salaireMensuel * 0.8);

setCurrentIncState({ 
  currentMaladie: Math.round(aiM_fin + lppM_fin + enfantsMaladie), 
  aiMaladie: Math.round(aiM_fin), // On passe la base stricte
  lppMaladie: Math.round(lppM_fin), // On passe la base stricte
  enfantsMaladie: Math.round(enfantsMaladie), // L'écart créera l'escalier !
  currentAccident: Math.round(currentAccident),
  laaAccident: Math.round(laaA_fin),
  aiAccident: Math.round(aiA_fin),
  lppAccident: Math.round(lppA_fin),
  enfantsAccident: Math.round(enfantsAccident),
  target: Math.round(cibleIncM)
});
  
          // --- C. DONNÉES DÉCÈS ---
          const decM = projections.deces_maladie || {};
          const decA = projections.deces_accident || {};
          const renteVeuve = getVal(decM, "AVS/AI", 0) / 12;
          const renteLpp = getVal(decM, "LPP", 0) / 12;
          const totalRentesDeces = renteVeuve + renteLpp;
          const capExistants = getVal(decM, "Prestations en capital / indemnité unique", 0);

          // Rentes de survivants dans le temps (col 2 = aujourd'hui, dernière col
          // = après majorité du dernier enfant). L'écart = rentes d'orphelins.
          const lastColDM = Math.max(2, (decM.headerYears?.length || 3) - 1);
          const lastColDA = Math.max(2, (decA.headerYears?.length || 3) - 1);
          // Décès par maladie
          const dmAi_cur = getVal(decM, "AVS/AI", 2) / 12, dmAi_fin = getVal(decM, "AVS/AI", lastColDM) / 12;
          const dmLpp_cur = getVal(decM, "LPP", 2) / 12, dmLpp_fin = getVal(decM, "LPP", lastColDM) / 12;
          const dmEnfant = Math.max(0, (dmAi_cur - dmAi_fin) + (dmLpp_cur - dmLpp_fin));
          // Décès par accident (rentes de survivants LAA en plus)
          const daLaa_cur = (getVal(decA, "LAA", 2) || getVal(decA, "LAA/SUVA", 2)) / 12;
          const daLaa_fin = (getVal(decA, "LAA", lastColDA) || getVal(decA, "LAA/SUVA", lastColDA)) / 12;
          const daAi_cur = getVal(decA, "AVS/AI", 2) / 12, daAi_fin = getVal(decA, "AVS/AI", lastColDA) / 12;
          const daLpp_cur = getVal(decA, "LPP", 2) / 12, daLpp_fin = getVal(decA, "LPP", lastColDA) / 12;
          const daEnfant = Math.max(0, (daLaa_cur - daLaa_fin) + (daAi_cur - daAi_fin) + (daLpp_cur - daLpp_fin));
          // Besoin de revenu des survivants (cible) — fallback 80% du salaire.
          const cibleDeces =
            (getVal(decM, "Revenu cible", 2) / 12) ||
            (getVal(decA, "Revenu cible", 2) / 12) ||
            Math.round(salaireMensuel * 0.8);

          // Repli (dérivé des matrices) si le moteur échoue (données incomplètes).
          const decRentesFallback = {
            target: Math.round(cibleDeces),
            maladie: {
              avsC: Math.round(dmAi_fin), avsE: Math.round(Math.max(0, dmAi_cur - dmAi_fin)),
              lppC: Math.round(dmLpp_fin), lppE: Math.round(Math.max(0, dmLpp_cur - dmLpp_fin)),
              laaC: 0, laaE: 0,
            },
            accident: {
              laaC: Math.round(daLaa_fin), laaE: Math.round(Math.max(0, daLaa_cur - daLaa_fin)),
              avsC: Math.round(daAi_fin), avsE: Math.round(Math.max(0, daAi_cur - daAi_fin)),
              lppC: Math.round(daLpp_fin), lppE: Math.round(Math.max(0, daLpp_cur - daLpp_fin)),
            },
          };

          // SOURCE DE VÉRITÉ : moteur décès (détail par pilier × bénéficiaire + capitaux).
          let decCapitalMaladie = Math.round(capExistants);
          try {
            // ClientData : DonneePersonnelles fait FOI (salaire brut, naissance, enfants,
            // état civil). Le plan LPP ne sert qu'à COMPLÉTER les champs absents (rentes /
            // capitaux survivants) — il ne doit PAS écraser le salaire (le plan porte le
            // salaire ASSURÉ LPP, plus bas, qui fausserait AVS/LAA).
            const clientForEngine = { ...lppPlanData, ...(pData || {}) } as any;
            const today = new Date();
            const dm = computeDecesMaladie(today, clientForEngine, LEGAL_2025, Legal_Echelle44_2025.rows);
            const da = computeDecesAccident(today, clientForEngine, LEGAL_2025, Legal_Echelle44_2025.rows);
            const nbA = da.meta.inputs.nbEnfantsEligibles || 0;

            // Répartition conjoint/orphelin (au prorata du brut) du montant réellement versé.
            const mLpp = splitPilier(dm.monthly.lpp, dm.meta.breakdown.lpp.spouseOrPartnerAnnual / 12, dm.meta.breakdown.lpp.orphansAnnual / 12);
            const aLaa = splitPilier(da.monthly.laa, da.meta.breakdown.laa.spouseAnnual / 12, (da.meta.breakdown.laa.perChildAnnual * nbA) / 12);
            const aLpp = splitPilier(da.monthly.lpp, da.meta.breakdown.lpp.spouseOrPartnerAnnual / 12, (da.meta.breakdown.lpp.perChildAnnual * nbA) / 12);

            setDecRentes({
              target: Math.round(cibleDeces),
              maladie: {
                avsC: Math.round(dm.meta.breakdown.avs.widowMonthly),
                avsE: Math.round(dm.meta.breakdown.avs.orphanMonthlyTotal),
                lppC: mLpp.c, lppE: mLpp.e, laaC: 0, laaE: 0,
              },
              accident: {
                laaC: aLaa.c, laaE: aLaa.e,
                avsC: Math.round(da.meta.breakdown.avs.widowMonthly),
                avsE: Math.round(da.meta.breakdown.avs.orphanMonthlyTotal),
                lppC: aLpp.c, lppE: aLpp.e,
              },
            });
            decCapitalMaladie = Math.round(dm.capitals.totalCapitalsMaladie || capExistants);
          } catch (e) {
            console.warn("Moteur décès indisponible, repli sur les matrices:", e);
            setDecRentes(decRentesFallback);
          }
  
          const isMarried = pData.Enter_etatCivil == 1 || pData.Enter_etatCivil == "1";
          const enfants = pData.Enter_enfants || [];
          let besoinDecesCible = 0;
          
          if (isMarried) {
            besoinDecesCible += salaireAnnuel * 3;
          }
          
          enfants.forEach((enf: any) => {
            const dateStr = enf.Enter_dateNaissance || enf.dateNaissance;
            if (dateStr) {
              let birthYear = dateStr.includes('.') ? Number(dateStr.split('.')[2]) : new Date(dateStr).getFullYear();
              const age = new Date().getFullYear() - birthYear;
              besoinDecesCible += (age < 16) ? 100000 : 50000;
            } else {
              besoinDecesCible += 50000;
            }
          });
  
          if (!isMarried && enfants.length === 0) besoinDecesCible = 50000;
  
          setCurrentDecState({
            current: decCapitalMaladie,
            target: Math.round(besoinDecesCible),
            renteDeces: Math.round(totalRentesDeces > 0 ? totalRentesDeces : 0),
            renteAvs: Math.round(renteVeuve),
            renteLpp: Math.round(renteLpp)
          });
  
          // --- D. OFFRE ---
          // Applique une offre (depuis resultat OU depuis Firestore). Gère les
          // deux formes : `provider` unique (resultat) ou providerRet/Inc/Dec.
          const applyOffer = (data: any) => {
            const n = (v: any) => (v == null || isNaN(Number(v)) ? null : Math.round(Number(v)));
            if (n(data.premiumRet) != null) setPremiumRet(n(data.premiumRet)!);
            if (n(data.premiumInc) != null) setPremiumInc(n(data.premiumInc)!);
            if (n(data.premiumDec) != null) setPremiumDec(n(data.premiumDec)!);
            if (n(data.premiumPay) != null) setPremiumPay(n(data.premiumPay)!);
            if (n(data.capitalRet) != null) setCapitalRet(n(data.capitalRet)!);
            if (n(data.coverageInc) != null) setCoverageInc(n(data.coverageInc)!);
            if (n(data.coverageDec) != null) setCoverageDec(n(data.coverageDec)!);
            if (data.provider) { setProviderRet(data.provider); setProviderInc(data.provider); setProviderDec(data.provider); }
            if (data.providerRet) setProviderRet(data.providerRet);
            if (data.providerInc) setProviderInc(data.providerInc);
            if (data.providerDec) setProviderDec(data.providerDec);
            if (data.isReplaceMode != null) setIsReplaceMode(!!data.isReplaceMode);
            setSelRet(data.selRet ?? ((n(data.premiumRet) || 0) > 0 || (n(data.capitalRet) || 0) > 0));
            setSelInc(data.selInc ?? ((n(data.premiumInc) || 0) > 0));
            setSelDec(data.selDec ?? ((n(data.premiumDec) || 0) > 0));
            setSelPay(data.selPay ?? ((n(data.premiumPay) || 0) > 0));
            if (typeof data.notes === "string" && data.notes.trim()) setNotes(data.notes);
          };

          const freshFromResultat = sessionStorage.getItem("creditx_temp_offer");
          if (freshFromResultat) {
            // Arrivée depuis resultat = chiffrage frais, prioritaire.
            applyOffer(JSON.parse(freshFromResultat));
          } else {
            // Sinon, on recharge la dernière offre enregistrée (édition admin).
            const offerSnap = await getDoc(doc(db, "clients", clientUid, "prevoyance_offer", "current"));
            if (offerSnap.exists()) applyOffer(offerSnap.data());
          }
        } catch (err) {
          console.error("Erreur:", err);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }, [clientUid]);

  // Enregistre l'offre éditée (durable) → rechargée à la prochaine visite.
  const handleSaveOffer = async () => {
    if (!clientUid) return;
    setIsSavingOffer(true);
    try {
      await setDoc(doc(db, "clients", clientUid, "prevoyance_offer", "current"), {
        providerRet, premiumRet, capitalRet, isReplaceMode,
        providerInc, premiumInc, coverageInc,
        providerDec, premiumDec, coverageDec,
        premiumPay,
        selRet, selInc, selDec, selPay,
        notes,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      // L'offre Firestore fait foi : on purge le temporaire de resultat.
      sessionStorage.removeItem("creditx_temp_offer");
      setOfferSaved(true);
      setTimeout(() => setOfferSaved(false), 2500);
    } catch (e) {
      console.error("Erreur d'enregistrement de l'offre:", e);
      alert("Erreur lors de l'enregistrement de l'offre.");
    } finally {
      setIsSavingOffer(false);
    }
  };

  // Fonction d'arrondi aux 5 centimes suisses et formatage à 2 décimales
  const formatCHF = (val: number) => {
    const num = Number(val) || 0;
    return (Math.round(num * 20) / 20).toFixed(2);
  };

  // Une couverture ne figure dans la SOLUTION que si elle est proposée (switch
  // on/off du configurateur). Off → ni affichée, ni comptée, ni « lacune comblée ».
  const hasRet = selRet;
  const hasInc = selInc;
  const hasDec = selDec;
  const hasPay = selPay;

  const totalPremium =
    (hasRet ? Number(premiumRet) : 0) +
    (hasInc ? Number(premiumInc) : 0) +
    (hasDec ? Number(premiumDec) : 0) +
    (hasPay ? Number(premiumPay) : 0);

  // Numérotation dynamique : les pages 1–8 sont fixes ; les pages solution
  // (2.1/2.2/2.3) n'existent que si proposées, donc le résumé décale.
  const padPage = (n: number) => String(n).padStart(2, "0");
  let _pageCursor = 10; // pages fixes 1–9 (dont 1.5 rentes de survivants)
  const pageRet = hasRet ? _pageCursor++ : null;
  const pageInc = hasInc ? _pageCursor++ : null;
  const pageDec = hasDec ? _pageCursor++ : null;
  const pageResume = _pageCursor++;
  const pageNotes = _pageCursor;
  const pageSolutionsStart = pageRet ?? pageInc ?? pageDec ?? pageResume;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0E12] flex items-center justify-center text-white">
        <div className="w-6 h-6 border-2 border-[#816DEC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // --- LA CLASSE PARFAITE POUR LE PDF ---
  // Dimensions A4 strictes. max-h empêche les dépassements. box-border garde le padding à l'intérieur.
  const pageWrapperClass = "bg-[#14161F] print:bg-white rounded-3xl p-16 print:p-[15mm] min-h-[1050px] print:min-h-0 print:h-[296mm] print:max-h-[296mm] print:w-[210mm] print:box-border print:m-0 print:rounded-none flex flex-col justify-between border border-white/5 print:border-none break-after-page [&:last-child]:break-after-auto shadow-2xl print:shadow-none relative overflow-hidden";

  return (
    <div className="min-h-screen bg-[#0D0E12] print:bg-white text-white print:text-[#1f2937] pb-20 selection:bg-[#816DEC]/30 font-sans">
      
      {/* Moteur natif pour forcer l'imprimante à se caler sur A4 */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}} />

      {/* HEADER ADMIN */}
      <div className="sticky top-0 z-50 bg-[#14161F] border-b border-white/5 px-6 py-4 flex items-center justify-between print:hidden shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white">
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="text-[10px] font-black tracking-widest text-[#816DEC] uppercase block">Mode Administrateur</span>
            <h1 className="text-sm font-bold text-white/90">Générateur PDF : {clientProfile?.Enter_prenom}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setEditMode(!editMode)} className={`rounded-full text-xs font-bold px-4 py-2 flex gap-1.5 ${editMode ? 'bg-white/10 text-white' : 'bg-[#816DEC] text-white'}`}>
            {editMode ? <Eye size={14} /> : <Edit3 size={14} />} {editMode ? "Aperçu Impression" : "Ajuster l'Offre"}
          </Button>
          <Button onClick={handleSaveOffer} disabled={isSavingOffer} className={`rounded-full text-xs font-bold px-4 py-2 flex gap-1.5 ${offerSaved ? 'bg-emerald-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
            {isSavingOffer ? <Loader2 size={14} className="animate-spin" /> : offerSaved ? <CheckCircle2 size={14} /> : <Edit3 size={14} />}
            {isSavingOffer ? "Enregistrement…" : offerSaved ? "Enregistré" : "Enregistrer"}
          </Button>
          <Button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-xs font-bold px-4 py-2 flex gap-1.5">
            <Printer size={14} /> Exporter PDF
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 print:block print:p-0 print:m-0 print:w-full">
        
        {/* PANNEAU ADMIN D'ÉDITION (Création de l'Offre) */}
        {editMode && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-4 bg-[#14161F] border border-white/5 rounded-3xl p-6 space-y-6 h-fit print:hidden">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <Edit3 size={16} className="text-[#816DEC]" />
              <h2 className="text-xs font-black uppercase text-white/70">Configuration de l'Offre</h2>
            </div>
            
            <div className="space-y-4">
               {/* --- SOLUTION 1 : ÉPARGNE RETRAITE --- */}
               <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelRet(!selRet)}
                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${selRet ? 'bg-emerald-500' : 'bg-white/20'}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${selRet ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                      <label className="text-[11px] font-bold text-emerald-400 uppercase block">1. Épargne Retraite (3A)</label>
                    </div>
                    <div className={`flex items-center gap-2 ${selRet ? '' : 'opacity-30 pointer-events-none'}`}>
                      <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest">{isReplaceMode ? "Rachat & Transfert" : "Ajout"}</span>
                      <button 
                        onClick={() => setIsReplaceMode(!isReplaceMode)} 
                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${isReplaceMode ? 'bg-[#2563eb]' : 'bg-white/20'}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isReplaceMode ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                  
                  {isReplaceMode && (
                    <p className="text-[9px] text-[#3b82f6] font-bold leading-snug mt-[-4px]">
                      Saisissez le capital projeté <span className="uppercase">final</span> (incluant la valeur de rachat transférée de l'ancien 3A).
                    </p>
                  )}
                  
                  <div>
                    <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">Compagnie / Prestataire</label>
                    <input type="text" value={providerRet} onChange={(e) => setProviderRet(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC]" placeholder="Ex: Swiss Life, AXA..." />
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="w-1/2">
                      <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">Prime Mensuelle</label>
                      <input type="number" value={premiumRet} onChange={(e) => setPremiumRet(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC]" placeholder="CHF" />
                    </div>
                    <div className="w-1/2">
                      <label className={`text-[9px] font-bold uppercase block mb-1 ${isReplaceMode ? "text-[#3b82f6]" : "text-white/40"}`}>
                        {isReplaceMode ? "Capital Final (Transfert incl.)" : "Capital Projeté"}
                      </label>
                      <input type="number" value={capitalRet} onChange={(e) => setCapitalRet(Number(e.target.value))} className={`w-full bg-black/40 border rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC] ${isReplaceMode ? "border-[#3b82f6]/50" : "border-white/10"}`} placeholder="Total CHF" />
                    </div>
                  </div>
               </div>

               {/* --- SOLUTION 2 : PERTE DE GAIN MALADIE --- */}
               <div className={`bg-white/5 p-3 rounded-xl border border-white/10 space-y-3 ${selInc ? '' : 'opacity-60'}`}>
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-[#816DEC] uppercase block">2. Maintien du Salaire (Maladie)</label>
                    <button onClick={() => setSelInc(!selInc)} className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${selInc ? 'bg-emerald-500' : 'bg-white/20'}`}>
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${selInc ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">Compagnie / Prestataire</label>
                    <input type="text" value={providerInc} onChange={(e) => setProviderInc(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC]" placeholder="Ex: Allianz, Generali..." />
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="w-1/2">
                      <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">Prime Mensuelle</label>
                      <input type="number" value={premiumInc} onChange={(e) => setPremiumInc(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC]" placeholder="CHF" />
                    </div>
                    <div className="w-1/2">
                      <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">Rente Assurée (Mensuelle)</label>
                      <input type="number" value={coverageInc} onChange={(e) => setCoverageInc(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC]" placeholder="CHF / mois" />
                    </div>
                  </div>
               </div>

               {/* --- SOLUTION 3 : CAPITAL DÉCÈS --- */}
               <div className={`bg-white/5 p-3 rounded-xl border border-white/10 space-y-3 ${selDec ? '' : 'opacity-60'}`}>
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-purple-400 uppercase block">3. Capital Décès Constant</label>
                    <button onClick={() => setSelDec(!selDec)} className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${selDec ? 'bg-emerald-500' : 'bg-white/20'}`}>
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${selDec ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">Compagnie / Prestataire</label>
                    <input type="text" value={providerDec} onChange={(e) => setProviderDec(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC]" placeholder="Ex: Retraites Populaires..." />
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="w-1/2">
                      <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">Prime Mensuelle</label>
                      <input type="number" value={premiumDec} onChange={(e) => setPremiumDec(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC]" placeholder="CHF" />
                    </div>
                    <div className="w-1/2">
                      <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">Capital Assuré (Immédiat)</label>
                      <input type="number" value={coverageDec} onChange={(e) => setCoverageDec(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC]" placeholder="Total CHF" />
                    </div>
                  </div>
               </div>

               {/* --- SOLUTION 4 : LIBÉRATION DES PRIMES --- */}
               <div className={`bg-white/5 p-3 rounded-xl border border-white/10 space-y-3 ${selPay ? '' : 'opacity-60'}`}>
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-blue-400 uppercase block">4. Libération des Primes</label>
                    <button onClick={() => setSelPay(!selPay)} className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${selPay ? 'bg-emerald-500' : 'bg-white/20'}`}>
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${selPay ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">Prime Mensuelle (Option)</label>
                    <input type="number" value={premiumPay} onChange={(e) => setPremiumPay(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC]" placeholder="CHF / mois" />
                  </div>
               </div>

               {/* --- NOTES DU CONSEILLER --- */}
               <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-3">
                  <label className="text-[11px] font-bold text-white/70 uppercase block">Notes du conseiller</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#816DEC] resize-y leading-relaxed"
                    placeholder="Aucune note."
                  />
                  <p className="text-[9px] text-white/30">Apparaît sur la dernière page du dossier client.</p>
               </div>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* LIVRET PDF A4 INSTITUTIONNEL                                              */}
        {/* ========================================================================= */}
        <div className={`print:block print:w-full print:m-0 space-y-12 print:space-y-0 ${editMode ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
          
          {/* --- PAGE 1 : COUVERTURE --- */}
          <div className={pageWrapperClass}>
            <div className="text-2xl font-black tracking-tighter text-white print:hidden">
              <span>Credit</span><span className="text-[#816DEC]">X</span>
            </div>
            
            <div className="hidden print:flex justify-start w-full">
              <img 
                src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd" 
                alt="Logo CreditX" 
                className="h-10 w-auto object-contain" 
              />
            </div>

            <div className="space-y-6 max-w-2xl my-auto print:mt-40">
              <div className="w-12 h-1 bg-[#816DEC] print:bg-gray-800" />
              <h1 className="text-4xl print:text-5xl font-black tracking-tight leading-tight text-white print:text-[#111827]">
                Analyse et stratégie <br />
                <span className="text-[#816DEC] print:text-gray-500">de prévoyance</span>
              </h1>
              <p className="text-sm print:text-base font-medium text-white/50 print:text-[#4b5563] leading-relaxed max-w-md">
                Rapport de conseil stratégique pour l'optimisation des capitaux et couvertures de risques.
              </p>
            </div>

            <div className="border-t border-white/5 print:border-gray-300 pt-8 grid grid-cols-2 gap-6 print:mb-12">
              <div>
                <span className="text-[10px] font-bold uppercase text-white/30 print:text-[#6b7280] block tracking-widest mb-1">Dossier établi pour</span>
                <span className="text-sm print:text-base font-bold text-white/90 print:text-[#111827]">{clientProfile?.Enter_prenom} {clientProfile?.Enter_nom}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-white/30 print:text-[#6b7280] block tracking-widest mb-1">Date d'édition</span>
                <span className="text-sm print:text-base font-bold text-white/90 print:text-[#111827]">{new Date().toLocaleDateString('fr-CH')}</span>
              </div>
            </div>

            <div className="hidden print:block mt-auto text-sm text-gray-600 space-y-1">
              <p className="font-bold text-gray-900">CreditX Sàrl</p>
              <p>Cour de Gare</p>
              <p>Place de l'Aubade 3</p>
              <p>1950 Sion</p>
              <p className="pt-2 text-xs">creditx.ch | info@creditx.ch | blog.creditx.ch</p>
            </div>
          </div>

          {/* --- PAGE 2 : SOMMAIRE --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <BookOpen size={18} className="text-[#816DEC] print:text-gray-700" />
                <h2 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">Sommaire</h2>
              </div>

              <div className="space-y-4 max-w-2xl text-sm print:text-base">
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2">
                  <span className="font-bold text-white/90 print:text-[#111827]">Avertissements & Indépendance</span>
                  <span className="font-bold text-[#816DEC] print:text-gray-500">03</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 mt-4">
                  <span className="font-bold text-white/90 print:text-[#111827]">Informations Personnelles</span>
                  <span className="font-bold text-[#816DEC] print:text-gray-500">04</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 mt-4">
                  <span className="font-bold text-white/90 print:text-[#111827]">1. Le Diagnostic Prévoyance</span>
                  <span className="font-bold text-[#816DEC] print:text-gray-500">05</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 pl-6">
                  <span className="text-white/60 print:text-[#4b5563]">1.1 Focus retraite et avenir (Âge 65 ans)</span>
                  <span className="text-white/40 print:text-gray-400">05</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 pl-6">
                  <span className="text-white/60 print:text-[#4b5563]">1.2 Focus perte de gain (Maladie)</span>
                  <span className="text-white/40 print:text-gray-400">06</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 pl-6">
                  <span className="text-white/60 print:text-[#4b5563]">1.3 Focus perte de gain (Accident)</span>
                  <span className="text-white/40 print:text-gray-400">07</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 pl-6">
                  <span className="text-white/60 print:text-[#4b5563]">1.4 Focus protection familiale</span>
                  <span className="text-white/40 print:text-gray-400">08</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 pl-6">
                  <span className="text-white/60 print:text-[#4b5563]">1.5 Rentes de survivants (décès)</span>
                  <span className="text-white/40 print:text-gray-400">09</span>
                </div>
                {(hasRet || hasInc || hasDec) && (
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 mt-6">
                  <span className="font-bold text-white/90 print:text-[#111827]">2. Solutions Recommandées</span>
                  <span className="font-bold text-[#816DEC] print:text-gray-500">{padPage(pageSolutionsStart)}</span>
                </div>
                )}
                {hasRet && (
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 pl-6">
                  <span className="text-white/60 print:text-[#4b5563]">2.1 Solution Épargne Retraite</span>
                  <span className="text-white/40 print:text-gray-400">{pageRet ? padPage(pageRet) : ""}</span>
                </div>
                )}
                {hasInc && (
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 pl-6">
                  <span className="text-white/60 print:text-[#4b5563]">2.2 Solution Maintien du Salaire (Maladie)</span>
                  <span className="text-white/40 print:text-gray-400">{pageInc ? padPage(pageInc) : ""}</span>
                </div>
                )}
                {hasDec && (
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 pl-6">
                  <span className="text-white/60 print:text-[#4b5563]">2.3 Solution Capital Décès Constant</span>
                  <span className="text-white/40 print:text-gray-400">{pageDec ? padPage(pageDec) : ""}</span>
                </div>
                )}
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 mt-6">
                  <span className="font-bold text-white/90 print:text-[#111827]">Résumé de l'investissement</span>
                  <span className="font-bold text-[#816DEC] print:text-gray-500">{padPage(pageResume)}</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-white/10 print:border-gray-300 pb-2 mt-4">
                  <span className="font-bold text-white/90 print:text-[#111827]">Notes du conseiller</span>
                  <span className="font-bold text-[#816DEC] print:text-gray-500">{padPage(pageNotes)}</span>
                </div>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page 02</span>
            </div>
          </div>

          {/* --- PAGE 3 : DISCLAIMER --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <ShieldAlert size={18} className="text-[#816DEC] print:text-gray-700" />
                <h2 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">Cadre Légal & Indépendance</h2>
              </div>

              <div className="space-y-6 text-sm print:text-[13px] text-white/50 print:text-[#4b5563] text-justify leading-relaxed">
                <h3 className="text-base font-bold text-white/80 print:text-[#111827] uppercase tracking-wider mb-4">Avertissement Légal & Projections</h3>
                <p className="mb-4">
                  L'analyse et les projections présentées dans ce rapport ont été établies sur la base des documents et informations remis à CreditX par le mandant, ainsi que sur le cadre législatif et réglementaire en vigueur à la date d'édition (notamment la LPP, les ordonnances correspondantes, et les lois sur l'AVS/AI). Bien que nous nous attachions à garantir la plus haute précision dans leurs modèles actuariels, il convient de souligner que ces projections demeurent par nature indicatives.
                </p>
                <p className="mb-4">
                  Les prestations effectives (telles que les rentes AVS ou AI) dépendront in fine des inscriptions au compte individuel de l'assuré. Par ailleurs, les calculs sont basés sur une projection des lois actuelles ; toutefois, la législation fiscale et sociale (y compris l'échelle 44) est susceptible d'évoluer d'ici la survenance d'un sinistre ou l'âge de la retraite de l'assuré, ce qui pourrait modifier substantiellement les résultats exposés. Les projections de capitaux sur les offres proposées sont des estimations mathématiques ; les rendements passés ne sauraient confirmer un scénario de performance identique dans le futur.
                </p>
                <h3 className="text-base font-bold text-white/80 print:text-[#111827] uppercase tracking-wider mb-4 mt-8">Indépendance de CreditX</h3>
                <p>
                  CreditX agit en stricte indépendance à l'égard des établissements bancaires et des compagnies d'assurance partenaires. Notre mandat exclusif est la défense des intérêts patrimoniaux de nos clients. À ce titre, CreditX est un intermédiaire dûment agréé par l'Autorité fédérale de surveillance des marchés financiers (FINMA). L'ensemble de nos conseillers en prévoyance sont certifiés par l'AFA et soumis à une obligation de formation continue régulière, garantissant un standard de conseil éthique, souverain et au fait des dernières normes du marché.
                </p>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page 03</span>
            </div>
          </div>

          {/* --- PAGE 4 : INFORMATIONS PERSONNELLES --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <User size={18} className="text-[#816DEC] print:text-gray-700" />
                <h2 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">Informations Personnelles</h2>
              </div>

              <div className="grid grid-cols-2 gap-x-12 gap-y-8 text-sm print:text-base">
                <div>
                  <span className="block text-[10px] print:text-xs font-bold text-white/40 print:text-gray-500 uppercase tracking-wider mb-1">Nom Complet</span>
                  <span className="font-bold text-white print:text-gray-900">{clientProfile?.Enter_prenom} {clientProfile?.Enter_nom}</span>
                </div>
                <div>
                  <span className="block text-[10px] print:text-xs font-bold text-white/40 print:text-gray-500 uppercase tracking-wider mb-1">Date de Naissance</span>
                  <span className="font-bold text-white print:text-gray-900">{clientProfile?.Enter_dateNaissance || "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] print:text-xs font-bold text-white/40 print:text-gray-500 uppercase tracking-wider mb-1">Adresse de Domicile</span>
                  <span className="font-bold text-white print:text-gray-900">{clientProfile?.Enter_adresse}, {clientProfile?.Enter_npa} {clientProfile?.Enter_localite}</span>
                </div>
                <div>
                  <span className="block text-[10px] print:text-xs font-bold text-white/40 print:text-gray-500 uppercase tracking-wider mb-1">État Civil</span>
                  <span className="font-bold text-white print:text-gray-900">{clientProfile?.Enter_etatCivil == 1 ? "Marié(e)" : clientProfile?.Enter_etatCivil == 0 ? "Célibataire" : "Autre"}</span>
                </div>
                <div>
                  <span className="block text-[10px] print:text-xs font-bold text-white/40 print:text-gray-500 uppercase tracking-wider mb-1">Enfants à charge</span>
                  <span className="font-bold text-white print:text-gray-900">{clientProfile?.Enter_enfants?.length || 0} enfant(s)</span>
                </div>
                <div className="col-span-2 border-t border-white/5 print:border-gray-200 pt-6 mt-2">
                  <span className="block text-[10px] print:text-xs font-bold text-[#816DEC] print:text-gray-500 uppercase tracking-wider mb-4">Situation Professionnelle</span>
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <span className="block text-[10px] print:text-xs font-bold text-white/40 print:text-gray-500 uppercase tracking-wider mb-1">Profession</span>
                      <span className="font-bold text-white print:text-gray-900">{clientProfile?.Enter_profession || "—"}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] print:text-xs font-bold text-white/40 print:text-gray-500 uppercase tracking-wider mb-1">Salaire Annuel Brut</span>
                      <span className="font-bold text-white print:text-gray-900">CHF {Number(clientProfile?.Enter_salaireAnnuel || 0).toLocaleString('fr-CH')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page 04</span>
            </div>
          </div>

          {/* --- PAGE 5 : DIAGNOSTIC RETRAITE --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <Wallet size={18} className="text-emerald-400 print:text-[#374151]" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">1.1 Focus retraite et avenir (Âge 65 ans)</h3>
              </div>

              <div className="space-y-8 text-sm print:text-base">
                <p className="text-white/60 print:text-[#4b5563] leading-relaxed">
                  L'objectif pour conserver son niveau de vie à la retraite est fixé à <strong>80% du dernier revenu</strong> (AVS + LPP). Les projections mathématiques basées sur l'évolution de vos avoirs révèlent une lacune face à cette cible.
                </p>

                <div className="space-y-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white/40 print:text-gray-500">Analyse Graphique des Rentes</h4>
                  <RetraiteComboChart 
                    salary={currentRetState.salary} 
                    target={currentRetState.target} 
                    avs={currentRetState.avs} 
                    lpp={currentRetState.lpp} 
                    capital3a={currentRetState.cap3a} 
                  />
                  
                  <RetraiteConsoAreaChart 
                    target={currentRetState.target} 
                    avs={currentRetState.avs} 
                    lpp={currentRetState.lpp} 
                    capital3a={currentRetState.cap3a} 
                  />
                </div>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page 05</span>
            </div>
          </div>

          {/* --- PAGE 6 : DIAGNOSTIC MALADIE --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <Shield size={18} className="text-[#816DEC] print:text-[#374151]" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">1.2 Focus perte de gain (Maladie)</h3>
              </div>

              <div className="space-y-8 text-sm print:text-base">
                <p className="text-white/60 print:text-[#4b5563] leading-relaxed">
                  L'incapacité de travail suite à une maladie de longue durée engendre une chute drastique de vos revenus dès la fin des obligations de votre employeur.
                </p>

                <div className="bg-black/20 print:bg-gray-50 border border-white/5 print:border-gray-200 rounded-xl p-8 space-y-6 w-full">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase text-red-400 print:text-[#dc2626] tracking-wider text-sm">Cas de Maladie</span>
                    <DonutChart percentage={Math.round((currentIncState.currentMaladie / currentRetState.salary) * 100)} colorClass="text-red-500" printColor="print:text-[#dc2626]" />
                  </div>
                  <PerteGainAreaChart 
                    type="maladie" 
                    salary={currentRetState.salary} 
                    current={currentIncState.currentMaladie} 
                    target={currentIncState.target} 
                    ai={currentIncState.aiMaladie}
                    lpp={currentIncState.lppMaladie}
                    enfant={currentIncState.enfantsMaladie}
                  />
                </div>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page 06</span>
            </div>
          </div>

          {/* --- PAGE 7 : DIAGNOSTIC ACCIDENT --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <Shield size={18} className="text-[#816DEC] print:text-[#374151]" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">1.3 Focus perte de gain (Accident)</h3>
              </div>

              <div className="space-y-8 text-sm print:text-base">
                <p className="text-white/60 print:text-[#4b5563] leading-relaxed">
                  L'incapacité de travail suite à un accident est généralement mieux prise en charge par l'assurance accident obligatoire (LAA), couvrant rapidement 80% de votre salaire.
                </p>

                <div className="bg-black/20 print:bg-gray-50 border border-white/5 print:border-gray-200 rounded-xl p-8 space-y-6 w-full">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase text-amber-500 print:text-[#d97706] tracking-wider text-sm">Cas d'Accident</span>
                    <DonutChart percentage={Math.round((currentIncState.currentAccident / currentRetState.salary) * 100)} colorClass="text-amber-500" printColor="print:text-[#d97706]" />
                  </div>
                  <PerteGainAreaChart
                    type="accident"
                    salary={currentRetState.salary}
                    current={currentIncState.currentAccident}
                    target={currentIncState.target}
                    laa={currentIncState.laaAccident}
                    ai={currentIncState.aiAccident}
                    lpp={currentIncState.lppAccident}
                    enfant={currentIncState.enfantsAccident}
                  />
                </div>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page 07</span>
            </div>
          </div>

          {/* --- PAGE 8 : DIAGNOSTIC DÉCÈS --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <Heart size={18} className="text-purple-400 print:text-[#374151]" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">1.4 Focus protection familiale</h3>
              </div>

              <div className="space-y-8 text-sm print:text-base">
                <p className="text-white/60 print:text-[#4b5563] leading-relaxed">
                  Garantir le maintien des projets de vie et de la sécurité du foyer nécessite l'injection d'un capital immédiat en cas de décès prématuré.
                </p>

                <div className="bg-black/20 print:bg-gray-50 border border-white/5 print:border-gray-200 rounded-xl p-8 space-y-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/40 print:text-gray-500">Besoin de capital immédiat vs capital versé</span>
                  <DecesCapitalChart target={currentDecState.target} coverage={currentDecState.current} />
                  <p className="text-xs print:text-sm text-white/50 print:text-[#4b5563] leading-relaxed">
                    CreditX recommande un filet de sécurité immédiat estimé ici à <strong>CHF {currentDecState.target.toLocaleString('fr-CH')}</strong> pour amortir le choc financier des premières années (frais fixes, succession, impôts) et garantir la transition sereine pour le conjoint et les enfants, selon la situation maritale et familiale actuelle.
                  </p>
                </div>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page 08</span>
            </div>
          </div>

          {/* --- PAGE 9 : RENTES DE SURVIVANTS (DÉCÈS) --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <Heart size={18} className="text-purple-400 print:text-[#374151]" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">1.5 Rentes de survivants (décès)</h3>
              </div>
              <div className="space-y-6 text-sm print:text-base">
                <p className="text-white/60 print:text-[#4b5563] leading-relaxed">
                  Au-delà du capital immédiat, vos proches perçoivent des rentes de survivants. Leur montant et leur durée diffèrent selon que le décès survient par maladie ou par accident (rentes LAA en plus).
                </p>
                <DecesRentesChart cause="maladie" target={decRentes.target} data={decRentes.maladie} />
                <DecesRentesChart cause="accident" target={decRentes.target} data={decRentes.accident} />
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page 09</span>
            </div>
          </div>

          {/* --- PAGE 10 : SOLUTION RETRAITE --- */}
          {hasRet && (
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <CheckCircle2 size={18} className="text-[#2563eb] print:text-[#2563eb]" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">2.1 Solution Épargne Retraite</h3>
              </div>

              <div className="space-y-8">
                <p className="text-sm print:text-base text-white/60 print:text-[#4b5563] leading-relaxed">
                  Afin de combler votre déficit de vieillesse tout en profitant d'une réduction fiscale immédiate, nous recommandons la mise en place d'une solution d'épargne ciblée. La zone bleue démontre l'harmonisation financière apportée par cette recommandation, sécurisant votre niveau de vie à 65 ans.
                </p>

                <div className="bg-black/20 print:bg-gray-50 border border-white/5 print:border-gray-200 rounded-xl p-8 w-full">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-bold uppercase tracking-wider text-emerald-400 print:text-[#2563eb] block">
                      {isReplaceMode ? `Remplacement 3A - ${providerRet}` : `Épargne 3A - ${providerRet}`}
                    </span>
                    <div className="text-right">
                      <span className="block text-xs text-white/50 print:text-gray-500 uppercase tracking-wider">
                        Lacune initiale : CHF {Math.round(Math.max(0, currentRetState.target - (currentRetState.avs + currentRetState.lpp + (isReplaceMode ? 0 : (currentRetState.cap3a / 25 / 12))))).toLocaleString('fr-CH')}
                      </span>
                      <span className="block text-sm font-bold text-white print:text-gray-900 mt-1">
                        {isReplaceMode ? "Capital Projeté Final : " : `Apport ${providerRet} : + `} 
                        CHF {capitalRet.toLocaleString('fr-CH')}
                      </span>
                    </div>
                  </div>
                  
                  <RetraiteComboChart 
                    salary={currentRetState.salary} 
                    target={currentRetState.target} 
                    avs={currentRetState.avs} 
                    lpp={currentRetState.lpp} 
                    capital3a={isReplaceMode ? 0 : currentRetState.cap3a} 
                    solution3a={capitalRet} 
                    isSolution={true} 
                  />
                  
                  {(currentRetState.cap3a > 0 || isReplaceMode || capitalRet > 0) && (
                    <RetraiteConsoAreaChart
                      target={currentRetState.target}
                      avs={currentRetState.avs}
                      lpp={currentRetState.lpp}
                      capital3a={isReplaceMode ? 0 : currentRetState.cap3a}
                      solution3a={capitalRet}
                      isSolution={true}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page {pageRet ? padPage(pageRet) : ""}</span>
            </div>
          </div>
          )}

          {/* --- PAGE 10 : SOLUTION MALADIE --- */}
          {hasInc && (
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <CheckCircle2 size={18} className="text-[#2563eb] print:text-[#2563eb]" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">2.2 Solution Maintien du Salaire (Maladie)</h3>
              </div>

              <div className="space-y-8">
                <p className="text-sm print:text-base text-white/60 print:text-[#4b5563] leading-relaxed">
                  Pour pallier la chute brutale de vos revenus à l'épuisement de vos droits légaux, nous avons intégré une assurance perte de gain maladie. Celle-ci prend le relais de votre employeur pour vous garantir un versement mensuel stable, vous permettant de maintenir 90% de votre salaire habituel.
                </p>

                <div className="bg-black/20 print:bg-gray-50 border border-white/5 print:border-gray-200 rounded-xl p-8 w-full">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-bold uppercase tracking-wider text-[#816DEC] print:text-[#2563eb] block">Rente Maladie - {providerInc}</span>
                    <div className="text-right">
                      <span className="block text-sm font-bold text-white print:text-gray-900 mt-1">Apport {providerInc} : + CHF {coverageInc.toLocaleString('fr-CH')} /m</span>
                    </div>
                  </div>
                  <PerteGainAreaChart
                    type="maladie"
                    salary={currentRetState.salary}
                    current={currentIncState.currentMaladie}
                    target={currentIncState.target}
                    ai={currentIncState.aiMaladie}
                    lpp={currentIncState.lppMaladie}
                    enfant={currentIncState.enfantsMaladie}
                    isSolution={true}
                    coverage={coverageInc}
                  />
                </div>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page {pageInc ? padPage(pageInc) : ""}</span>
            </div>
          </div>
          )}

          {/* --- PAGE 11 : SOLUTION DÉCÈS --- */}
          {hasDec && (
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <CheckCircle2 size={18} className="text-[#2563eb] print:text-[#2563eb]" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">2.3 Solution Capital Décès Constant</h3>
              </div>

              <div className="space-y-8">
                <p className="text-sm print:text-base text-white/60 print:text-[#4b5563] leading-relaxed">
                  Afin d'éviter à votre famille de supporter une charge financière critique en cas de coup dur, cette ligne de prévoyance libère un capital immédiat. Il permet d'amortir les frais incompressibles (hypothèque, loyer, études) et de sécuriser l'avenir de vos proches de manière entièrement libérée d'impôts.
                </p>

                <div className="bg-black/20 print:bg-gray-50 border border-white/5 print:border-gray-200 rounded-xl p-8 w-full">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-bold uppercase tracking-wider text-purple-400 print:text-[#2563eb] block">Capital Décès - {providerDec}</span>
                    <div className="text-right">
                      <span className="block text-xs text-white/50 print:text-gray-500 uppercase tracking-wider">Besoin ciblé : CHF {currentDecState.target.toLocaleString('fr-CH')}</span>
                      <span className="block text-sm font-bold text-white print:text-gray-900 mt-1">Garantie {providerDec} : CHF {coverageDec.toLocaleString('fr-CH')} immédiat</span>
                    </div>
                  </div>
                  <DecesCapitalChart target={currentDecState.target} coverage={coverageDec} isSolution={true} />
                </div>
              </div>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page {pageDec ? padPage(pageDec) : ""}</span>
            </div>
          </div>
          )}

          {/* --- PAGE 12 : RÉSUMÉ DE L'INVESTISSEMENT --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <Wallet size={18} className="text-emerald-400 print:text-[#374151]" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">Résumé de l'investissement</h3>
              </div>

              <div className="space-y-0 border-y border-white/5 print:border-gray-300 divide-y divide-white/5 print:divide-gray-200">
                {hasRet && (
                <div className="py-6 flex justify-between items-center">
                  <div>
                    <h4 className="text-base print:text-lg font-bold text-white print:text-[#111827]">Épargne Retraite 3A</h4>
                    <span className="text-sm text-white/50 print:text-[#4b5563]">Couverture via {providerRet} — Objectif: CHF {capitalRet.toLocaleString('fr-CH')}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg print:text-xl font-bold text-white print:text-[#111827]">CHF {formatCHF(premiumRet)}</span>
                    <span className="text-xs text-white/40 print:text-gray-500 block uppercase">/ mois</span>
                  </div>
                </div>
                )}

                {hasInc && (
                <div className="py-6 flex justify-between items-center">
                  <div>
                    <h4 className="text-base print:text-lg font-bold text-white print:text-[#111827]">Assurance Perte de Gain</h4>
                    <span className="text-sm text-white/50 print:text-[#4b5563]">Couverture via {providerInc} — Rente: CHF {coverageInc.toLocaleString('fr-CH')}/m</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg print:text-xl font-bold text-white print:text-[#111827]">CHF {formatCHF(premiumInc)}</span>
                    <span className="text-xs text-white/40 print:text-gray-500 block uppercase">/ mois</span>
                  </div>
                </div>
                )}

                {hasDec && (
                <div className="py-6 flex justify-between items-center">
                  <div>
                    <h4 className="text-base print:text-lg font-bold text-white print:text-[#111827]">Capital Décès Constant</h4>
                    <span className="text-sm text-white/50 print:text-[#4b5563]">Couverture via {providerDec} — Capital: CHF {coverageDec.toLocaleString('fr-CH')}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg print:text-xl font-bold text-white print:text-[#111827]">CHF {formatCHF(premiumDec)}</span>
                    <span className="text-xs text-white/40 print:text-gray-500 block uppercase">/ mois</span>
                  </div>
                </div>
                )}

                {hasPay && (
                <div className="py-6 flex justify-between items-center">
                  <div>
                    <h4 className="text-base print:text-lg font-bold text-white print:text-[#111827]">Libération des Primes</h4>
                    <span className="text-sm text-white/50 print:text-[#4b5563]">Prise en charge à 100% en cas d'incapacité</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg print:text-xl font-bold text-white print:text-[#111827]">CHF {formatCHF(premiumPay)}</span>
                    <span className="text-xs text-white/40 print:text-gray-500 block uppercase">/ mois</span>
                  </div>
                </div>
                )}
              </div>

              <div className="bg-[#2563eb]/10 print:bg-gray-100 border border-[#2563eb]/20 print:border-gray-300 rounded-xl p-8 flex justify-between items-center mt-8">
                <span className="text-sm print:text-base font-bold uppercase text-[#2563eb] print:text-[#374151] tracking-wider">Investissement Mensuel Consolidé</span>
                <span className="text-xl print:text-2xl font-bold text-white print:text-[#111827]">CHF {formatCHF(totalPremium)}</span>
              </div>
            </div>

            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page {padPage(pageResume)}</span>
            </div>
          </div>

          {/* --- PAGE NOTES : NOTES DU CONSEILLER --- */}
          <div className={pageWrapperClass}>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 border-b border-white/5 print:border-gray-300 pb-4 mb-8">
                <BookOpen size={18} className="text-[#816DEC] print:text-gray-700" />
                <h3 className="text-sm print:text-lg font-bold uppercase tracking-widest text-white/60 print:text-[#374151] leading-none">Notes du conseiller</h3>
              </div>
              <p className="whitespace-pre-wrap text-sm print:text-base text-white/70 print:text-[#374151] leading-relaxed">
                {notes && notes.trim() ? notes : "Aucune note."}
              </p>
            </div>
            <div className="w-full mt-auto pt-4 text-[9px] print:text-[10px] text-white/20 print:text-gray-400 uppercase tracking-widest font-bold border-t border-white/5 print:border-gray-300 flex justify-between">
              <span>CreditX | Analyse de prévoyance</span>
              <span>Page {padPage(pageNotes)}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}