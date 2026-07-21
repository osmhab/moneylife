//app/[locale]/dashboard/prevoyance/_components/ScanningStep.tsx
"use client";

import React, { useState, useEffect } from "react";
import { ScanLine, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/index";

interface ScanningStepProps {
  jobId?: string;
  targetUid?: string;
}

export default function ScanningStep({ jobId, targetUid }: ScanningStepProps) {
  const t = useTranslations("ScanningStep");
  const [progress, setProgress] = useState(0);
  const [statusKey, setStatusKey] = useState("status_scanning");
  const [currentStepLabel, setCurrentStepLabel] = useState("");

  // 1. Écoute en temps réel de l'état du Job d'extraction IA dans Firestore
  useEffect(() => {
    if (!db || !targetUid || !jobId) {
      // Mode Fallback (si appelé sans ID, on garde la simulation classique)
      const timer = setInterval(() => {
        setProgress((old) => (old >= 98 ? 98 : old + Math.floor(Math.random() * 5) + 2));
      }, 500);
      return () => clearInterval(timer);
    }

    const jobDocRef = doc(db, "clients", targetUid, "lpp_jobs", jobId);
    
    const unsubscribe = onSnapshot(jobDocRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      
      // Adaptation des statuts réels renvoyés par ton API et Firestore
      switch (data.status) {
        case "PENDING":
          setProgress(25);
          setStatusKey("status_scanning");
          setCurrentStepLabel("Initialisation et téléversement du document HD...");
          break;
        case "PROCESSING_GEMINI": // Si tu veux rajouter cette étape intermédiaire plus tard
          setProgress(60);
          setStatusKey("status_ai_analysis");
          setCurrentStepLabel(`Analyse actuarielle par Gemini...`);
          break;
        case "EXTRACTING_TABLES":
          setProgress(80);
          setStatusKey("status_extracting");
          setCurrentStepLabel("Extraction des 8 paliers du tableau de projections...");
          break;
        case "DONE_FAST":
          setProgress(100);
          setStatusKey("status_final_check");
          setCurrentStepLabel("Structuration du modèle financier terminée !");
          break;
        case "ERROR":
          setStatusKey("status_error");
          setCurrentStepLabel(`Erreur : ${data.errorMessage || "Échec de la lecture"}`);
          break;
        default:
          // Progression fluide d'attente intelligente
          setProgress((old) => (old >= 95 ? 95 : old + 1));
      }
    });

    return () => unsubscribe();
  }, [jobId, targetUid]);

  // 2. Textes génériques dynamiques si pas de labels d'étapes précis
  useEffect(() => {
    if (progress === 100) return;
    if (progress > 85) setStatusKey("status_final_check");
    else if (progress > 50) setStatusKey("status_ai_analysis");
    else if (progress > 25) setStatusKey("status_extracting");
  }, [progress]);

  // Calculs géométriques pour l'anneau de progression Apple-like
  const circleRadius = 70;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center h-screen w-screen px-8 text-center bg-black animate-in fade-in duration-300">
      
      {/* ANIMATION CENTRALE : Anneau + Pourcentage */}
      <div className="relative flex items-center justify-center mb-10">
        
        {/* Cercles d'ondes pulsatiles */}
        <div className="absolute inset-0 rounded-full bg-blue-500/5 animate-ping" style={{ animationDuration: '3s' }}></div>
        <div className="absolute inset-[-20px] rounded-full bg-blue-500/5 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>

        {/* Anneau SVG de progression */}
        <svg className="w-48 h-48 transform -rotate-90 relative z-10" viewBox="0 0 160 160">
          <circle
            cx="80" cy="80" r={circleRadius}
            stroke="currentColor" strokeWidth="8" fill="transparent"
            className="text-slate-100"
          />
          <circle
            cx="80" cy="80" r={circleRadius}
            stroke="url(#gradient)" strokeWidth="8" fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
        </svg>

        {/* Chiffre au centre */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className="text-5xl font-black tracking-tighter text-white bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-400">
            {progress}<span className="text-2xl text-slate-500">%</span>
          </span>
        </div>
      </div>

      {/* TEXTES DE STATUT */}
      <div className="space-y-4 max-w-[320px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h2 className="text-2xl font-black text-white tracking-tight">
          {statusKey === "status_error" ? "Une analyse a échoué" : t("title")}
        </h2>
        
        {/* Boîte de statut dynamique connectée - Style Glassmorphism */}
        <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3 shadow-2xl">
          <div className={`w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10 ${statusKey === "status_error" ? "text-red-400" : "text-blue-400"}`}>
            {statusKey === "status_error" ? (
              <AlertTriangle size={16} />
            ) : progress > 50 ? (
              <Sparkles size={16} className="animate-pulse" />
            ) : (
              <ScanLine size={16} className="animate-pulse" />
            )}
          </div>
          <div className="flex flex-col text-left flex-1 min-w-0">
            <p className="text-sm font-black text-white leading-tight">
              {t(statusKey)}
            </p>
            {currentStepLabel && (
              <p className="text-[11px] font-bold text-white/40 truncate mt-0.5">
                {currentStepLabel}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-16 opacity-50">
        <p className="text-[9px] uppercase font-black tracking-[0.3em] text-slate-400">
          {t("powered_by")}
        </p>
      </div>

    </div>
  );
}