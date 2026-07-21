"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  TrendingUp, ShieldCheck, Wallet, ArrowRight, 
  CheckCircle2, AlertTriangle, HeartPulse, Sparkles, XCircle, Info
} from "lucide-react";
import { ComparatifOffreReelle } from "@/lib/calculs/3epilier"; // Assure-toi que l'import pointe vers ton fichier

interface ComparatifDashboardProps {
  data: ComparatifOffreReelle;
  onAcceptTransfer?: () => void;
  onReject?: () => void;
}

export default function ComparatifDashboard({ data, onAcceptTransfer, onReject }: ComparatifDashboardProps) {
  const formatCHF = (val: number) => 
    new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 })
      .format(val).replace('CHF', '').trim() + ' CHF';

  // Couleurs conditionnelles basées sur le verdict
  const isRecommended = data.scoring.verdictFinal === "TRANSFERT_RECOMMANDÉ";
  const headerBg = isRecommended ? "from-emerald-500 to-teal-700" : "from-orange-500 to-amber-600";
  const headerIcon = isRecommended ? <Sparkles className="text-white" size={32} /> : <AlertTriangle className="text-white" size={32} />;
  const headerText = isRecommended ? "Transfert Hautement Recommandé" : "Analyse Mitigée";

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      
      {/* 1. L'EN-TÊTE VERDICT */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-[32px] p-8 text-white shadow-2xl bg-gradient-to-br ${headerBg} relative overflow-hidden`}
      >
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <TrendingUp size={120} />
        </div>
        <div className="relative z-10 flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md shadow-inner">
            {headerIcon}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Verdict de l'Algorithme</p>
            <h2 className="text-3xl font-black tracking-tighter">{headerText}</h2>
          </div>
        </div>
        
        {isRecommended && (
          <p className="text-lg font-medium text-white/90 max-w-2xl leading-relaxed">
            Notre analyse montre que votre contrat actuel est sous-optimal. En transférant vers CreditX, 
            vous absorbez la perte de rachat initiale et générez un bénéfice net massif à long terme.
          </p>
        )}
      </motion.div>

      {/* 2. LE MATCH (AVANT / APRÈS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* COLONNE GAUCHE : ANCIEN CONTRAT */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-200 opacity-90 relative">
          <div className="absolute top-4 right-4 bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
            Contrat Actuel
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
            <Wallet className="text-slate-400" /> Votre Assurance
          </h3>
          
          <div className="space-y-4">
            <ComparisonRow 
              label="Capital estimé à 65 ans" 
              value={formatCHF(data.retraite.capitalActuelProjete)} 
              isBetter={false}
            />
            <ComparisonRow 
              label="Prime annuelle" 
              value={formatCHF(data.primes.actuelle)} 
              isBetter={false}
            />
            <div className="h-px bg-slate-100 w-full my-4" />
            <ComparisonRow 
              label="Capital Décès" 
              value={formatCHF(data.risques.decesActuel)} 
              isBetter={false}
            />
            <ComparisonRow 
              label="Rente Invalidité" 
              value={formatCHF(data.risques.invaliditeActuelle)} 
              isBetter={false}
            />
            <ComparisonRow 
              label="Libération des primes" 
              value={data.risques.liberationActuelle ? "Incluse" : "Non incluse"} 
              isBetter={false}
            />
          </div>
        </motion.div>

        {/* COLONNE DROITE : PROPOSITION CREDITX */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="bg-[#111827] rounded-[32px] p-6 shadow-2xl border border-[#816DEC]/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#816DEC] blur-[80px] opacity-20 rounded-full pointer-events-none" />
          <div className="absolute top-4 right-4 bg-gradient-to-r from-[#816DEC] to-fuchsia-600 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">
            Proposition CreditX
          </div>
          
          <h3 className="text-xl font-black text-white mb-6 flex items-center gap-2">
            <ShieldCheck className="text-[#816DEC]" /> Optimisation
          </h3>

          <div className="space-y-4 relative z-10">
            <ComparisonRow 
              label="Capital estimé à 65 ans" 
              value={formatCHF(data.retraite.capitalProposeProjete)} 
              isBetter={data.scoring.isEpargneBetter} 
              dark
              highlight={`+ ${formatCHF(data.retraite.gainNetRetraite)}`}
            />
            <ComparisonRow 
              label="Prime annuelle" 
              value={formatCHF(data.primes.proposee)} 
              isBetter={data.scoring.isPriceBetter} 
              dark
              highlight={data.primes.economieAnnuelle > 0 ? `Éco : ${formatCHF(data.primes.economieAnnuelle)}/an` : null}
            />
            <div className="h-px bg-white/10 w-full my-4" />
            <ComparisonRow 
              label="Capital Décès" 
              value={formatCHF(data.risques.decesPropose)} 
              isBetter={data.risques.decesPropose > data.risques.decesActuel} 
              dark
            />
            <ComparisonRow 
              label="Rente Invalidité" 
              value={formatCHF(data.risques.invaliditeProposee)} 
              isBetter={data.risques.invaliditeProposee > data.risques.invaliditeActuelle} 
              dark
            />
            <ComparisonRow 
              label="Libération des primes" 
              value={data.risques.liberationProposee ? "Incluse" : "Non incluse"} 
              isBetter={data.risques.liberationProposee && !data.risques.liberationActuelle} 
              dark
            />
          </div>
        </motion.div>
      </div>

      {/* 3. L'ÉLÉPHANT DANS LA PIÈCE : LA PERTE DE RACHAT */}
      {data.retraite.perteImmediateRachat > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-blue-50/50 rounded-2xl p-4 flex items-start gap-3 border border-blue-100">
          <Info size={20} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-black text-blue-900 tracking-tight">À propos de la valeur de rachat</p>
            <p className="text-xs font-medium text-blue-800/70 mt-1 leading-relaxed">
              En résiliant votre contrat actuel, vous subirez une perte estimée à <strong>{formatCHF(data.retraite.perteImmediateRachat)}</strong> due aux pénalités de l'assureur. 
              <strong> Cependant, cette perte a déjà été déduite de nos calculs.</strong> Les bénéfices affichés ci-dessus sont des gains NETS, une fois la pénalité absorbée.
            </p>
          </div>
        </motion.div>
      )}

      {/* 4. ACTIONS */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex flex-col sm:flex-row gap-4 pt-4">
        {isRecommended && (
          <button 
            onClick={onAcceptTransfer}
            className="flex-1 py-5 rounded-[24px] bg-black text-white hover:bg-slate-800 transition-all font-black text-lg uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95"
          >
            Je demande le transfert gratuit <ArrowRight size={20} />
          </button>
        )}
        <button 
          onClick={onReject}
          className={`${isRecommended ? 'w-full sm:w-auto px-8' : 'flex-1'} py-5 rounded-[24px] bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95`}
        >
          Conserver mon contrat actuel
        </button>
      </motion.div>

    </div>
  );
}

// --- SOUS-COMPOSANT POUR LES LIGNES ---
function ComparisonRow({ label, value, isBetter, dark = false, highlight }: any) {
  return (
    <div className={`flex justify-between items-center p-3 rounded-xl transition-colors ${dark ? (isBetter ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-white/5 border border-transparent') : 'bg-slate-50 border border-slate-100'}`}>
      <span className={`text-[11px] font-black uppercase tracking-widest ${dark ? 'text-white/50' : 'text-slate-400'}`}>
        {label}
      </span>
      <div className="flex items-center gap-3">
        {highlight && (
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${dark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
            {highlight}
          </span>
        )}
        <span className={`text-base font-black tracking-tight ${dark ? (isBetter ? 'text-emerald-400' : 'text-white') : 'text-slate-900'}`}>
          {value}
        </span>
        {isBetter && dark && <CheckCircle2 size={16} className="text-emerald-400" />}
        {!isBetter && dark && value === "Non incluse" && <XCircle size={16} className="text-white/20" />}
      </div>
    </div>
  );
}