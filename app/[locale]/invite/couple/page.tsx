// app/[locale]/invite/couple/page.tsx
//
// Page de REPLI de l'invitation « relier son conjoint ».
// Le lien partagé est un Universal Link (https://creditx.ch/invite/couple?code=…) :
//  - app INSTALLÉE  → iOS l'ouvre directement dans l'app (AASA), cette page ne s'affiche pas ;
//  - app ABSENTE    → le navigateur affiche CETTE page (explication + code + « bientôt »).
// Segment STATIQUE « couple » → prioritaire sur app/[locale]/invite/[referralCode].
"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Users, ShieldCheck, ArrowRight } from "lucide-react";

function CoupleInviteContent() {
  const searchParams = useSearchParams();
  const code = (searchParams.get("code") || "").trim().toUpperCase();

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        {/* Marque */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <span className="text-2xl font-black tracking-tight text-slate-900">CreditX</span>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-8 border border-slate-100">
          {/* Icône */}
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-6">
            <Users className="w-7 h-7 text-indigo-600" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 text-center leading-tight">
            Votre conjoint vous invite sur CreditX
          </h1>
          <p className="text-slate-500 text-center mt-3 text-[15px] leading-relaxed">
            Reliez vos comptes pour calculer votre prévoyance de{" "}
            <span className="font-semibold text-slate-700">couple</span> — notamment votre rente
            AVS commune (plafonnée à 150 %).
          </p>

          {/* Code */}
          {code ? (
            <div className="mt-7">
              <p className="text-xs font-semibold text-slate-400 text-center uppercase tracking-wider mb-2">
                Votre code d&apos;invitation
              </p>
              <div className="bg-slate-900 rounded-2xl py-5 text-center">
                <span className="text-3xl font-black tracking-[0.2em] text-white font-mono">{code}</span>
              </div>
            </div>
          ) : null}

          {/* Étapes */}
          <div className="mt-8 space-y-4">
            {[
              "Installez l'app CreditX sur votre iPhone.",
              "Créez votre compte (gratuit).",
              code ? `Saisissez le code ${code} pour relier vos comptes.` : "Saisissez le code reçu pour relier vos comptes.",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-[15px] text-slate-700 leading-relaxed">{step}</span>
              </div>
            ))}
          </div>

          {/* Bientôt */}
          <div className="mt-8 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-4 flex items-center gap-3">
            <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <p className="text-sm text-slate-500">
              L&apos;app CreditX arrive <span className="font-semibold text-slate-700">bientôt</span> sur l&apos;App
              Store. Conservez ce code — il vous suffira à ce moment-là.
            </p>
          </div>
        </div>

        {/* Réassurance */}
        <div className="flex items-center gap-2 justify-center mt-6 text-slate-400">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-xs">Données du conjoint minimales, jamais partagées entre vous.</span>
        </div>
      </div>
    </div>
  );
}

export default function CoupleInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <CoupleInviteContent />
    </Suspense>
  );
}
