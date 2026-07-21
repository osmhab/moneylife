// app/[locale]/invite/[referralCode]/page.tsx
"use client";

import React, { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useLocale } from "next-intl";
import { Sparkles, ShieldCheck, ArrowRight, TrendingUp, Lock } from "lucide-react";

function InviteContent() {
  const { referralCode } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();

  // Lecture instantanée du prénom depuis l'URL (ex: ?n=Habib)
  const nameParam = searchParams.get("n");
  const referrerName = nameParam ? decodeURIComponent(nameParam) : "Un membre";

  const handleAccept = () => {
    // Redirection vers le signup en passant le code de parrainage
    router.push(`/${locale}/signup?ref=${referralCode}`);
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col lg:flex-row font-sans overflow-hidden">
      
      {/* === COLONNE GAUCHE : L'IMAGE GÉANTE & LE BRANDING === */}
      <div className="w-full lg:w-1/2 relative min-h-[40vh] lg:min-h-screen bg-slate-100 flex flex-col justify-between p-8 lg:p-14">
        {/* L'image de fond (tu peux utiliser /images/hero.jpg, expert.jpg, etc.) */}
        <img 
          src="/images/sharing.jpg" 
          alt="CreditX Prévoyance" 
          className="absolute inset-0 w-full h-full object-cover" 
        />
        {/* Dégradé pour rendre le texte lisible */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/5 to-transparent lg:bg-gradient-to-r" />

        {/* Logo en haut à gauche */}
        <div className="relative z-10">
          <img 
            src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd" 
            alt="CreditX" 
            className="h-8 md:h-12 invert brightness-200" 
          />
        </div>

        {/* Accroche visuelle sur l'image */}
        <div className="relative z-10 mt-auto pt-20 lg:pt-0">
          <div className="flex items-center gap-2 text-emerald-400 mb-4 bg-emerald-400/10 w-fit px-4 py-2 rounded-full backdrop-blur-sm border border-emerald-400/20">
             <ShieldCheck size={16} />
             <span className="font-black tracking-widest uppercase text-[10px]">Agréé FINMA</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-black text-white leading-[1.1] tracking-tight">
            La prévoyance suisse,<br />claire et intelligente.
          </h2>
        </div>
      </div>

      {/* === COLONNE DROITE : L'INVITATION ET LE CALL-TO-ACTION === */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-20 bg-white relative">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-[480px] space-y-8"
        >
          {/* Badge d'invitation */}
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full border border-blue-100">
            <Sparkles size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Invitation Privilège</span>
          </div>

          {/* Titre personnalisé */}
          <h1 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
            <span className="text-blue-600">{referrerName}</span> vous offre votre audit 360°.
          </h1>

          {/* Explication claire de ce qu'est CreditX */}
          <div className="space-y-4 text-slate-600 font-medium leading-relaxed text-sm md:text-base">
            <p>
              <strong>CreditX</strong> est la plateforme suisse qui centralise, analyse et optimise votre prévoyance (1er, 2ème et 3ème pilier). 
            </p>
            <ul className="space-y-3 pt-2">
              <li className="flex items-start gap-3">
                <TrendingUp size={20} className="text-blue-600 shrink-0 mt-0.5" />
                <span>Nous identifions vos lacunes de revenus et maximisons vos <strong>économies d'impôts</strong>.</span>
              </li>
              <li className="flex items-start gap-3">
                <Lock size={20} className="text-blue-600 shrink-0 mt-0.5" />
                <span>Vos données sont analysées dans un <strong>coffre-fort numérique</strong> hautement sécurisé.</span>
              </li>
            </ul>
          </div>

          {/* Boîte de cadeau / Preuve sociale */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex gap-4 items-center shadow-inner">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-xl shadow-sm shrink-0">
              🎁
            </div>
            <p className="text-sm text-slate-700 font-medium leading-snug">
              Grâce à l'invitation de <strong className="text-slate-900">{referrerName}</strong>, vos frais d'analyse et votre rendez-vous avec un expert vous sont intégralement offerts.
            </p>
          </div>

          {/* Bouton d'action */}
          <div className="pt-4">
            <button 
              onClick={handleAccept}
              className="w-full h-16 bg-slate-900 hover:bg-blue-600 text-white rounded-2xl font-black text-[15px] uppercase tracking-widest transition-all shadow-xl shadow-slate-900/10 flex items-center justify-center gap-3 group"
            >
              Créer mon compte gratuit
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">
               Lien d'invitation valide 72 heures
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}