//app/[locale]/dashboard/prevoyance/_components/EditAmountDrawer.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { db, auth } from "@/lib/firebase/index"; // Alias mis à jour si besoin
import { doc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { computeProjections3aBanque, computeProjections3aAssurance, computeDeathBenefitAssurance } from "@/lib/calculs/3epilier";
// 👈 NOUVEAU : Import de next-intl
import { useTranslations } from "next-intl";

interface EditAmountDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  fieldPath: string;
  label: string;
  value: any; 
  institutionName?: string;
  adminUid?: string;
  plan?: any;
  clientAge?: number;
}

export default function EditAmountDrawer({ isOpen, onClose, planId, fieldPath, label, value, institutionName, adminUid, plan, clientAge }: EditAmountDrawerProps) {
  // 👈 NOUVEAU : Récupération des traductions
  const t = useTranslations("EditAmountDrawer");

  const [localValue, setLocalValue] = useState<any>(value);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalValue(value);
  }, [value, isOpen]);

  // --- DÉTECTION DU TYPE DE CHAMP ---
  const isProjection = fieldPath.startsWith("projections_");
  const age = isProjection ? fieldPath.split("_")[1] : "";

  const isBoolean = typeof value === "boolean";
  const isDate = fieldPath.toLowerCase().includes("date");
  
  const isSelect = fieldPath === "data.profil" || 
                   fieldPath === "data.occurrence" || 
                   fieldPath === "data.typeContrat" || 
                   fieldPath === "data.typeCapitalDeces";

  // 👈 NOUVEAU : Configuration des options traduites via useMemo
  const selectOptions = useMemo(() => {
    if (fieldPath === "data.profil") {
      return [
        { label: t("opt_defensive"), value: "defensif" },
        { label: t("opt_balanced"), value: "equilibre" },
        { label: t("opt_growth"), value: "growth" },
        { label: t("opt_dynamic"), value: "dynamique" }
      ];
    } else if (fieldPath === "data.occurrence") {
      return [
        { label: t("opt_monthly"), value: "mois" },
        { label: t("opt_quarterly"), value: "trimestre" },
        { label: t("opt_yearly"), value: "annee" }
      ];
    } else if (fieldPath === "data.typeContrat") {
      return [
        { label: t("opt_pillar_3a"), value: "3a" },
        { label: t("opt_pillar_3b"), value: "3b" }
      ];
    } else if (fieldPath === "data.typeCapitalDeces") {
      return [
        { label: t("opt_fixed_amount"), value: "fixe" },
        { label: t("opt_premium_refund"), value: "primes" }
      ];
    }
    return [];
  }, [fieldPath, t]);

  // --- LOGIQUE DE FORMATAGE ---
  const formatDisplay = (val: any) => {
    if (val === "" || val === null || val === undefined) return "";
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  const handleNumberChange = (val: string, key?: string) => {
    const onlyNums = val.replace(/\s/g, "").replace(/[^0-9]/g, ""); 
    const numValue = onlyNums === "" ? "" : Number(onlyNums);

    if (isProjection && key) {
      setLocalValue((prev: any) => ({ ...prev, [key]: numValue }));
    } else {
      setLocalValue(numValue);
    }
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    const targetUid = adminUid || user?.uid; 
    
    if (!targetUid || !planId) return;

    setIsSaving(true);
    try {
      const planRef = doc(db, "clients", targetUid, "plans", planId);
      let updatePayload: any = {};
      let learningPayloads: any[] = [];

      if (isProjection) {
        const renteKey = `data.Enter_rentevieillesseLPP${age}`;
        const capitalKey = age === "65" ? "data.Enter_lppCapitalProjete65" : `data.Enter_prestationCapital${age}`;
        
        updatePayload[renteKey] = localValue.rente || 0;
        updatePayload[capitalKey] = localValue.capital || 0;

        if (localValue.rente !== value.rente) learningPayloads.push({ fieldKey: renteKey, old: value.rente, new: localValue.rente, lbl: `Rente ${age} ans` });
        if (localValue.capital !== value.capital) learningPayloads.push({ fieldKey: capitalKey, old: value.capital, new: localValue.capital, lbl: `Capital ${age} ans` });
      } else {
        updatePayload[fieldPath] = localValue;

        if (fieldPath === "data.typeCapitalDeces" && localValue === "primes") {
            updatePayload["data.capitalDecesFixe"] = 0;
        }

        // Le pilier (3a/3b) vit dans DEUX champs qui doivent rester cohérents :
        // data.typeContrat (affichage) ET le `type` canonique lu par le fiscal, les
        // filtres, le remplacement, etc. Éditer seulement typeContrat laissait un 3b
        // compté comme 3a (faux « dépassement du plafond 3a »). On synchronise donc
        // le type ici. Les comptes bancaires restent PILIER_3A_BANK (toujours 3a).
        if (fieldPath === "data.typeContrat" && plan && plan.type !== "PILIER_3A_BANK") {
            updatePayload["type"] = localValue === "3b" ? "PILIER_3B" : "PILIER_3A_POLICE";
        }

        // 👈 RECALCUL DEPUIS LE TIROIR
        if (fieldPath.startsWith("data.") && plan && clientAge !== undefined) {
          const fieldName = fieldPath.replace("data.", "");
          const simulatedData = { ...plan.data, [fieldName]: localValue };

          if (plan.type === "PILIER_3A_BANK") {
              updatePayload["data.capitalRetraiteProjete"] = computeProjections3aBanque(simulatedData as any, clientAge);
          } else if (plan.type === "PILIER_3A_POLICE" || plan.type === "PILIER_3B") {
              updatePayload["data.capitalRetraiteProjete"] = computeProjections3aAssurance(simulatedData as any, clientAge);
              updatePayload["data.capitalDecesCalcule"] = computeDeathBenefitAssurance(simulatedData as any);
          }
        }

        if (localValue !== value) learningPayloads.push({ fieldKey: fieldPath, old: value, new: localValue, lbl: label });
      }

      await updateDoc(planRef, { ...updatePayload, "metadata.updatedAt": new Date() });

      // Historique des modifications (Learnings)
      for (const lesson of learningPayloads) {
        await addDoc(collection(db, "lpp_learnings"), {
          institutionName: institutionName || "Inconnue",
          fieldKey: lesson.fieldKey,
          oldValue: lesson.old ?? 0,
          newValue: lesson.new ?? 0,
          label: lesson.lbl,
          timestamp: serverTimestamp(),
          correctedBy: user?.uid || "Inconnu" 
        });
      }

      onClose();
    } catch (error) {
      console.error(error);
      alert(t("err_saving"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="bg-white rounded-t-[32px] px-6 pb-12 outline-none">
        <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-200 mt-4 mb-6" />
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-left text-2xl font-black text-slate-900">
            {isProjection ? t("title_projections", { age }) : `${t("title_modify")} ${label}`}
          </DrawerTitle>
        </DrawerHeader>
        
        <div className="mt-4 space-y-6">
          
          {isProjection ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-[28px] p-6 border border-slate-100">
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2 text-center">{t("lbl_annual_pension")}</p>
                <input 
                  type="text"
                  inputMode="numeric"
                  value={formatDisplay(localValue?.rente)}
                  onChange={(e) => handleNumberChange(e.target.value, "rente")}
                  className="bg-transparent text-2xl font-black text-slate-900 text-center w-full outline-none"
                  placeholder="0"
                />
              </div>
              <div className="bg-slate-50 rounded-[28px] p-6 border border-slate-100">
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2 text-center">{t("lbl_capital")}</p>
                <input 
                  type="text"
                  inputMode="numeric"
                  value={formatDisplay(localValue?.capital)}
                  onChange={(e) => handleNumberChange(e.target.value, "capital")}
                  className="bg-transparent text-2xl font-black text-slate-900 text-center w-full outline-none"
                  placeholder="0"
                />
              </div>
            </div>
          ) : isBoolean ? (
            <div className="bg-slate-50 p-2 rounded-full flex border border-slate-100">
              <button 
                onClick={() => setLocalValue(true)} 
                className={`flex-1 py-4 text-sm font-black rounded-full transition-all ${localValue === true ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}
              >
                {t("btn_yes")}
              </button>
              <button 
                onClick={() => setLocalValue(false)} 
                className={`flex-1 py-4 text-sm font-black rounded-full transition-all ${localValue === false ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}
              >
                {t("btn_no")}
              </button>
            </div>
          ) : isSelect ? (
            <div className="space-y-3">
              {selectOptions.map((opt) => (
                <button 
                  key={opt.value} 
                  onClick={() => setLocalValue(opt.value)} 
                  className={`w-full py-5 rounded-[24px] font-black text-lg transition-all border-2 ${localValue === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-50 bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : isDate ? (
            <div className="bg-slate-50 rounded-[32px] p-6 flex justify-center border border-slate-100">
              <input 
                type="date"
                value={localValue || ""}
                onChange={(e) => setLocalValue(e.target.value)}
                className="bg-transparent text-2xl font-black text-slate-900 text-center w-full outline-none"
              />
            </div>
          ) : (
            <div className="bg-slate-50 rounded-[32px] p-8 flex flex-col items-center justify-center border border-slate-100">
              <input 
                type="text"
                inputMode={typeof value === "number" ? "numeric" : "text"}
                value={typeof value === "number" ? formatDisplay(localValue) : (localValue ?? "")}
                onChange={(e) => {
                  if (typeof value === "number") handleNumberChange(e.target.value);
                  else setLocalValue(e.target.value);
                }}
                className="bg-transparent text-3xl font-black text-slate-900 text-center w-full outline-none"
                placeholder={t("ph_type_here")}
                autoFocus
              />
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {typeof value === "number" ? t("lbl_amount_chf") : t("lbl_text")}
              </p>
            </div>
          )}

          <Button 
            onClick={handleSave}
            disabled={isSaving}
            className="w-full h-18 py-8 rounded-[24px] bg-[#1a4f8a] text-white font-black text-xl shadow-xl active:scale-95 transition-all mt-6"
          >
            {isSaving ? t("btn_saving") : t("btn_confirm")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}