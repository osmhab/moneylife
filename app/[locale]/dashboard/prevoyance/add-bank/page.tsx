//app/[locale]/dashboard/prevoyance/add-bank/page.tsx
"use client";
import type { Occurrence } from "@/lib/core/periodicite";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth, db } from "@/lib/firebase/index"; // Alias mis à jour
import { collection, addDoc, doc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

// Import de la logique de calcul identique à ton Dashboard
import { computeProjections3aBanque } from "@/lib/calculs/3epilier"; // Alias mis à jour

export function AddBankPlanView({ onClose, adminUid }: { onClose: () => void, adminUid?: string }) {
  const t = useTranslations("AddBankPlanPage");
  const targetUid = adminUid || auth.currentUser?.uid;

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [clientAge, setClientAge] = useState(35); // Âge par défaut

  const [formData, setFormData] = useState({
    bankName: "",
    accountNumber: "",
    startDate: "01.01.2026",
    isRegulier: true,
    montantRegulier: 0,
    occurrence: "mois" as Occurrence,
    soldeActuel: 0,
    isInvesti: false,
    profil: "equilibre" as "defensif" | "equilibre" | "growth" | "dynamique",
    isEnGage: false
  });

  // RÉCUPÉRATION DE L'ÂGE RÉEL DU CLIENT
  useEffect(() => {
    if (!targetUid) return;

    const profileRef = doc(db, "clients", targetUid, "DonneePersonnelles", "current");
    const unsub = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.Enter_dateNaissance) {
          const parts = d.Enter_dateNaissance.split('.');
          if (parts.length === 3) {
            const birthYear = parseInt(parts[2]);
            setClientAge(new Date().getFullYear() - birthYear);
          }
        }
      }
    });
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!formData.bankName) return toast.error(t("toast_bank_req"));
    
    setLoading(true);
    if (!targetUid) return;

    try {
      // --- CALCUL DE LA VÉRITÉ (PROJECTION) ---
      const projectionRetraite = computeProjections3aBanque(formData, clientAge);

      await addDoc(collection(db, "clients", targetUid, "plans"), {
        type: "PILIER_3A_BANK",
        institutionName: formData.bankName,
        origin: "external",
        data: {
          ...formData,
          // ON ENREGISTRE LES RÉSULTATS CALCULÉS (Clé unifiée)
          capitalRetraiteProjete: projectionRetraite,
          projectionCalculatedAt: new Date().toISOString(),
          projectionAgeRef: clientAge
        },
        metadata: { 
          createdAt: new Date(), 
          updatedAt: new Date(), 
          isManualEntry: true, 
          sourceFile: "MANUAL" 
        }
      });

      toast.success(t("toast_success"));
      router.push("/dashboard/prevoyance"); 
    } catch (err) {
      console.error(err);
      toast.error(t("toast_error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-20">
      {/* Header fixe avec bouton retour */}
      <div className="bg-white px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 z-30 border-b border-slate-100">
        <button onClick={() => router.back()} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-black text-lg">{t("title")}</h1>
        <div className="w-10" /> 
      </div>

      <div className="p-6 max-w-md mx-auto space-y-8 mt-4">
        <div className="flex flex-col items-center mb-4">
            <div className="w-20 h-20 bg-slate-900 rounded-[28px] flex items-center justify-center text-white shadow-xl mb-4">
                <Landmark size={36} />
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{t("subtitle")}</p>
        </div>

        {/* --- FORMULAIRE --- */}
        <div className="space-y-4">
          <InputGroup label={t("lbl_bank_name")} placeholder={t("ph_bank_name")} value={formData.bankName} onChange={(v: string) => setFormData({...formData, bankName: v})} />
          <InputGroup label={t("lbl_account_num")} placeholder={t("ph_account_num")} value={formData.accountNumber} onChange={(v: string) => setFormData({...formData, accountNumber: v})} />
          <InputGroup label={t("lbl_open_date")} placeholder={t("ph_date")} value={formData.startDate} onChange={(v: string) => setFormData({...formData, startDate: v})} />
          
          <div className="py-6 border-y border-slate-100">
            <p className="text-[13px] font-bold text-slate-500 mb-4 text-center">{t("lbl_regular_deposit")}</p>
            <SegmentedToggle 
              value={formData.isRegulier} 
              onChange={(v: boolean) => setFormData({...formData, isRegulier: v})} 
              labelYes={t("btn_yes")}
              labelNo={t("btn_no")}
            />
          </div>

          {formData.isRegulier && (
            <div className="space-y-4 animate-in fade-in duration-500">
               <InputGroup label={t("lbl_deposit_amount")} placeholder="0.00" type="number" value={formData.montantRegulier.toString()} onChange={(v: string) => setFormData({...formData, montantRegulier: Number(v)})} />
               <div className="bg-white rounded-3xl p-5 border border-slate-100 flex justify-between items-center shadow-sm">
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">{t("lbl_frequency")}</span>
                 <select className="bg-transparent font-black text-slate-900 outline-none" value={formData.occurrence} onChange={(e) => setFormData({...formData, occurrence: e.target.value as any})}>
                   <option value="mois">{t("opt_monthly")}</option>
                   <option value="trimestre">{t("opt_quarterly")}</option>
                   <option value="annee">{t("opt_yearly")}</option>
                 </select>
               </div>
            </div>
          )}

          <InputGroup label={t("lbl_current_balance")} placeholder="0.00" type="number" value={formData.soldeActuel.toString()} onChange={(v: string) => setFormData({...formData, soldeActuel: Number(v)})} />
          

          <div className="space-y-6 bg-blue-50/50 p-6 rounded-[32px] border border-blue-100 mt-6">
              <div className="text-center">
                <p className="text-[11px] leading-relaxed text-blue-400 px-4 mb-4 font-bold italic uppercase tracking-wider">
                  {t("lbl_invested")}
                </p>
                <SegmentedToggle 
                  value={formData.isInvesti} 
                  onChange={(v: boolean) => setFormData({...formData, isInvesti: v})} 
                  labelYes={t("btn_yes")}
                  labelNo={t("btn_no")}
                />
              </div>

              {formData.isInvesti && (
                <div className="bg-white rounded-2xl p-4 flex justify-between items-center border border-blue-100">
                   <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest">{t("lbl_risk_profile")}</span>
                   <select className="bg-transparent font-black text-blue-600 outline-none" value={formData.profil} onChange={(e) => setFormData({...formData, profil: e.target.value as any})}>
                     <option value="defensif">{t("opt_defensive")}</option>
                     <option value="equilibre">{t("opt_balanced")}</option>
                     <option value="growth">{t("opt_growth")}</option>
                     <option value="dynamique">{t("opt_dynamic")}</option>
                   </select>
                </div>
              )}

              <div className="text-center border-t border-blue-100 pt-6">
                <p className="text-[13px] font-bold text-slate-500 mb-4">{t("lbl_pledged")}</p>
                <SegmentedToggle 
                  value={formData.isEnGage} 
                  onChange={(v: boolean) => setFormData({...formData, isEnGage: v})} 
                  labelYes={t("btn_yes")}
                  labelNo={t("btn_no")}
                />
              </div>
            </div>
          <div className="pt-10">
            <Button 
                onClick={handleSave} 
                disabled={loading}
                className="w-full h-18 rounded-[24px] bg-[#1a4f8a] text-white font-black text-xl shadow-xl active:scale-95 transition-all py-8"
            >
                {loading ? t("btn_saving") : t("btn_add")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputGroup({ label, placeholder, value, onChange, type = "text" }: { 
  label: string, 
  placeholder: string, 
  value: string, 
  onChange: (v: string) => void, 
  type?: string 
}) {
    let displayVal = value || "";
    if (type === "date" && displayVal.includes(".")) {
      const parts = displayVal.split(".");
      if (parts.length === 3) displayVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;
      if (type === "date" && val.includes("-")) {
        const parts = val.split("-");
        if (parts.length === 3) val = `${parts[2]}.${parts[1]}.${parts[0]}`;
      }
      onChange(val);
    };

    return (
      <div className="relative group">
        <div className="absolute left-6 top-3 text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none pointer-events-none group-focus-within:text-blue-500 transition-colors z-10">
          {label}
        </div>
        <input 
          type={type}
          placeholder={placeholder}
          value={displayVal}
          onChange={handleChange}
          className="w-full bg-white border border-slate-100 rounded-[24px] pt-8 pb-4 px-6 font-black text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm relative"
        />
      </div>
    );
}

function SegmentedToggle({ value, onChange, labelYes, labelNo }: { value: boolean, onChange: (v: boolean) => void, labelYes: string, labelNo: string }) {
    return (
      <div className="flex bg-slate-200/50 rounded-full p-1.5 max-w-[240px] mx-auto">
        <button type="button" onClick={() => onChange(true)} className={`flex-1 py-3 text-xs font-black rounded-full transition-all ${value ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}>{labelYes}</button>
        <button type="button" onClick={() => onChange(false)} className={`flex-1 py-3 text-xs font-black rounded-full transition-all ${!value ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}>{labelNo}</button>
      </div>
    );
}

// 👈 NOUVEAU : On exporte la page pour l'espace client
export default function AddBankPlanPage() {
  const router = useRouter();
  return <AddBankPlanView onClose={() => router.back()} />;
}