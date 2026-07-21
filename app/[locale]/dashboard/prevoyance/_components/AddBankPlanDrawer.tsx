// app/[locale]/dashboard/prevoyance/_components/AddBankPlanDrawer.tsx
"use client";

import React, { useState } from "react";
import { X, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";

// Définition du type pour les données du formulaire
interface BankPlanFormData {
  bankName: string;
  accountNumber: string;
  startDate: string;
  isRegulier: boolean;
  montantRegulier: number;
  occurrence: "mois" | "annee";
  soldeActuel: number;
  isInvesti: boolean;
  profil: "defensif" | "equilibre" | "growth" | "dynamique";
  isEnGage: boolean;
}

interface AddBankPlanDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: BankPlanFormData) => void;
}

export default function AddBankPlanDrawer({ isOpen, onClose, onAdd }: AddBankPlanDrawerProps) {
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("AddBankPlanDrawer");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState<BankPlanFormData>({
    bankName: "",
    accountNumber: "",
    startDate: "01.01.2026",
    isRegulier: true,
    montantRegulier: 0,
    occurrence: "mois",
    soldeActuel: 0,
    isInvesti: false,
    profil: "equilibre",
    isEnGage: false
  });

  if (!isOpen) return null;

  const handleSave = () => {
    if (!formData.bankName) return alert(t("alert_bank_name_req"));
    onAdd(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-t-[40px] p-8 animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
        
        <div className="flex justify-between items-start mb-6">
           <button onClick={onClose} className="p-2 bg-slate-100 rounded-full"><X size={20}/></button>
           <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-white shadow-xl -mt-16 border-4 border-white">
             <Landmark size={32} />
           </div>
           <div className="w-10" />
        </div>

        <h2 className="text-center font-black text-xl mb-8">{t("title")}</h2>

        <div className="space-y-4">
          <InputGroup label={t("lbl_bank_name")} placeholder={t("ph_bank_name")} value={formData.bankName} onChange={(v: string) => setFormData({...formData, bankName: v})} />
          <InputGroup label={t("lbl_account_num")} placeholder="0" value={formData.accountNumber} onChange={(v: string) => setFormData({...formData, accountNumber: v})} />
          <InputGroup label={t("lbl_start_date")} placeholder="01.01.2026" value={formData.startDate} onChange={(v: string) => setFormData({...formData, startDate: v})} />
          
          <div className="py-4 text-center">
            <p className="text-[13px] font-bold text-slate-500 mb-3">{t("lbl_is_regular")}</p>
            <SegmentedToggle 
              value={formData.isRegulier} 
              onChange={(v: boolean) => setFormData({...formData, isRegulier: v})} 
              labelYes={t("opt_yes")} 
              labelNo={t("opt_no")} 
            />
          </div>

          {formData.isRegulier && (
            <div className="space-y-4">
               <InputGroup label={t("lbl_regular_amount")} placeholder="0.00" type="number" value={formData.montantRegulier.toString()} onChange={(v: string) => setFormData({...formData, montantRegulier: Number(v)})} />
               <div className="bg-slate-50 rounded-3xl p-4 flex justify-between items-center">
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">{t("lbl_occurrence")}</span>
                 <select 
                   className="bg-transparent font-bold text-slate-900 outline-none"
                   value={formData.occurrence}
                   onChange={(e) => setFormData({...formData, occurrence: e.target.value as any})}
                 >
                   <option value="mois">{t("opt_per_month")}</option>
                   <option value="annee">{t("opt_per_year")}</option>
                 </select>
               </div>
            </div>
          )}

          <InputGroup label={t("lbl_current_balance")} placeholder="0.00" type="number" value={formData.soldeActuel.toString()} onChange={(v: string) => setFormData({...formData, soldeActuel: Number(v)})} />
          
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
            {showAdvanced ? t("btn_less_params") : t("btn_more_params")}
          </button>

          {showAdvanced && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-[11px] text-slate-400 mb-4 italic">{t("lbl_is_invested")}</p>
                <SegmentedToggle 
                  value={formData.isInvesti} 
                  onChange={(v: boolean) => setFormData({...formData, isInvesti: v})} 
                  labelYes={t("opt_yes")} 
                  labelNo={t("opt_no")} 
                />
              </div>

              {formData.isInvesti && (
                <div className="bg-slate-50 rounded-3xl p-4 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase ml-2">{t("lbl_profile")}</span>
                  <select className="bg-transparent font-bold text-slate-900 outline-none" value={formData.profil} onChange={(e) => setFormData({...formData, profil: e.target.value as any})}>
                    <option value="defensif">{t("opt_defensive")}</option>
                    <option value="equilibre">{t("opt_balanced")}</option>
                    <option value="growth">{t("opt_growth")}</option>
                    <option value="dynamique">{t("opt_dynamic")}</option>
                  </select>
                </div>
              )}

              <div className="text-center">
                <p className="text-[13px] font-bold text-slate-500 mb-4">{t("lbl_pledged")}</p>
                <SegmentedToggle 
                  value={formData.isEnGage} 
                  onChange={(v: boolean) => setFormData({...formData, isEnGage: v})} 
                  labelYes={t("opt_yes")} 
                  labelNo={t("opt_no")} 
                />
              </div>
            </div>
          )}

          <Button onClick={handleSave} className="w-full h-16 rounded-full bg-slate-900 text-white font-black text-lg mt-8">
            {t("btn_add_plan")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --- SOUS-COMPOSANTS TYPÉS --- */

interface InputGroupProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}

function InputGroup({ label, placeholder, value, onChange, type = "text" }: InputGroupProps) {
  return (
    <div className="relative group">
      <div className="absolute left-6 top-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
        {label}
      </div>
      <input 
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 rounded-[28px] pt-8 pb-4 px-6 font-bold text-slate-900 outline-none border-none"
      />
    </div>
  );
}

interface SegmentedToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  labelYes: string;
  labelNo: string;
}

function SegmentedToggle({ value, onChange, labelYes, labelNo }: SegmentedToggleProps) {
  return (
    <div className="flex bg-slate-100 rounded-full p-1 max-w-[280px] mx-auto">
      <button onClick={() => onChange(true)} className={`flex-1 py-3 text-sm font-bold rounded-full transition-all ${value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{labelYes}</button>
      <button onClick={() => onChange(false)} className={`flex-1 py-3 text-sm font-bold rounded-full transition-all ${!value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{labelNo}</button>
    </div>
  );
}