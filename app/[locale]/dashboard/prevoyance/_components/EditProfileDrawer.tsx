//app/[locale]/dashboard/prevoyance/_components/EditProfileDrawer.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { db, auth } from "@/lib/firebase/index"; // Alias mis à jour si besoin
import { doc, setDoc, getDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { normalizeDateMask } from "@/lib/core/dates"; // Alias mis à jour si besoin
import { parseMoneyToNumber, formatMoneyDisplay } from "@/lib/core/format"; // Alias mis à jour si besoin

// 👈 NOUVEAU : Import de next-intl
import { useTranslations } from "next-intl";

interface EditProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  fieldKey: string;
  label: string;
  value: any;
  type?: "text" | "number" | "money" | "date" | "select" | "address_autocomplete" | "tel"; 
  options?: { id: number | string; label: string }[];
  adminUid?: string;
}

export default function EditProfileDrawer({ isOpen, onClose, fieldKey, label, value, type = "text", options, adminUid }: EditProfileDrawerProps) {
  // 👈 NOUVEAU : Récupération des traductions
  const t = useTranslations("EditProfileDrawer");

  const [localValue, setLocalValue] = useState<any>(value);
  const [isSaving, setIsSaving] = useState(false);
  
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [parsedAddress, setParsedAddress] = useState<any>(null);

  useEffect(() => {
    setLocalValue(value);
    setParsedAddress(null); 
  }, [value, isOpen]);

  useEffect(() => {
    if (type !== "address_autocomplete" || !isOpen) return;

    let autocomplete: any; 

    const initAutocomplete = () => {
      if (!addressInputRef.current || !(window as any).google) return;
      
      autocomplete = new (window as any).google.maps.places.Autocomplete(addressInputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "ch" }, 
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;

        let street = "";
        let streetNumber = "";
        let npa = "";
        let city = "";

        for (const component of place.address_components) {
          const types = component.types;
          if (types.includes("route")) street = component.long_name;
          if (types.includes("street_number")) streetNumber = component.long_name;
          if (types.includes("postal_code")) npa = component.long_name;
          if (types.includes("locality")) city = component.long_name;
        }

        const fullStreet = `${street} ${streetNumber}`.trim();

        setParsedAddress({
          Enter_adresse: fullStreet,
          Enter_npa: Number(npa) || "",
          Enter_localite: city
        });
        
        setLocalValue(addressInputRef.current?.value || "");
      });
    };

    if (!(window as any).google) {
      const scriptId = "google-maps-places-script";
      let script = document.getElementById(scriptId) as HTMLScriptElement;

      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
        script.async = true;
        document.head.appendChild(script);
      }

      script.addEventListener("load", initAutocomplete);

      return () => {
        script.removeEventListener("load", initAutocomplete);
      };
    } else {
      initAutocomplete();
    }
  }, [type, isOpen]);

  const handleSave = async (valToSave?: any) => {
    const targetUid = adminUid || auth.currentUser?.uid;
    if (!targetUid) return;

    setIsSaving(true);
    try {
      const profileRef = doc(db, "clients", targetUid, "DonneePersonnelles", "current");
      
      if (type === "address_autocomplete" && parsedAddress) {
        await setDoc(profileRef, parsedAddress, { merge: true });
        onClose();
        return;
      }

      let finalValue = valToSave !== undefined ? valToSave : localValue;

      if (type === "money") {
        finalValue = parseMoneyToNumber(String(localValue));
      } else if (type === "date") {
        finalValue = normalizeDateMask(String(localValue));
      } else if (type === "number" || type === "select") {
        finalValue = Number(finalValue);
      }

      if (fieldKey.startsWith("enfant_")) {
        const parts = fieldKey.split("_");
        const subKey = parts[1] === "prenom" ? "Enter_prenom" : "Enter_dateNaissance";
        const index = parseInt(parts[2]);

        const currentSnap = await getDoc(profileRef);
        const children = [...(currentSnap.data()?.Enter_enfants || [])];
        
        children[index] = { ...children[index], [subKey]: finalValue };
        
        await setDoc(profileRef, { Enter_enfants: children }, { merge: true });
      } else {
        await setDoc(profileRef, { [fieldKey]: finalValue }, { merge: true });
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
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150]" 
          />
        )}
      </AnimatePresence>

      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="bg-white rounded-t-[40px] px-6 pb-12 outline-none border-none z-[200] shadow-2xl">
          <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-200 mt-4 mb-6" />
          <DrawerHeader className="px-0">
          <DrawerTitle className="text-left text-2xl font-black text-slate-900 tracking-tight">
            {type === "select" 
                ? `${t("title_choose")} ${label}` 
                : label.startsWith("Naissance") || label.startsWith("Prénom") 
                ? label 
                : `${t("title_modify")} ${label}`
            }
            </DrawerTitle>
          </DrawerHeader>
          
          <div className="mt-4">
            {type === "select" && options ? (
              <div className="space-y-3">
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => handleSave(opt.id)}
                    className={`w-full p-6 rounded-[24px] text-left font-bold transition-all flex justify-between items-center ${
                      Number(localValue) === Number(opt.id) 
                        ? "bg-[#1a4f8a] text-white shadow-lg scale-[1.02]" 
                        : "bg-slate-50 text-slate-600 active:scale-95"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {Number(localValue) === Number(opt.id) && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-slate-50 rounded-[32px] p-8 flex flex-col items-center justify-center border border-slate-100 shadow-inner">
                  <input 
                    autoFocus
                    ref={type === "address_autocomplete" ? addressInputRef : null}
                    type={type === "tel" ? "tel" : "text"}
                    placeholder={type === "address_autocomplete" ? t("ph_address") : ""}
                    value={localValue ?? ""}
                    onChange={(e) => {
                      setLocalValue(e.target.value);
                      if (type === "address_autocomplete") {
                        setParsedAddress(null); 
                      }
                    }}
                    className={`bg-transparent font-black text-[#1a4f8a] text-center w-full outline-none ${type === "address_autocomplete" ? "text-xl" : "text-3xl"}`}
                  />
                </div>
                <Button 
                  onClick={() => handleSave()}
                  disabled={isSaving || (type === "address_autocomplete" && !parsedAddress)}
                  className={`w-full h-18 py-8 rounded-full font-bold text-lg transition-all ${
                    type === "address_autocomplete" && !parsedAddress 
                      ? "bg-slate-100 text-slate-400" 
                      : "bg-black text-white"
                  }`}
                >
                  {isSaving ? t("btn_saving") : (type === "address_autocomplete" && !parsedAddress) ? t("btn_select_suggestion") : t("btn_confirm")}
                </Button>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}