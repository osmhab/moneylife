//app/[locale]/dashboard/prevoyance/_components/DocumentUploaderModal.tsx
"use client";

import React, { useState, useRef, useMemo } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, UploadCloud, FileText, Check, Loader2, Plus, Tag } from "lucide-react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/index"; // Alias mis à jour si besoin
import { toast } from "sonner";

// 👈 NOUVEAU : Import de la traduction
import { useTranslations } from "next-intl";
import { DOCUMENT_TYPES } from "@/lib/core/documentTypes";

interface DocumentUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientUid: string;
  onUploadSuccess: (newDoc: any) => void;
}

export default function DocumentUploaderModal({ isOpen, onClose, clientUid, onUploadSuccess }: DocumentUploaderModalProps) {
  // 👈 NOUVEAU : Initialisation de useTranslations
  const t = useTranslations("DocumentUploaderModal");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Formulaire
  const [name, setName] = useState("");
  // On utilise la clé comme valeur interne pour "CreditX"
  const [originKey, setOriginKey] = useState("orig_creditx");
  const [customOrigin, setCustomOrigin] = useState("");
  const [selectedTypeKeys, setSelectedTypeKeys] = useState<string[]>([]);
  
  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  // 👈 NOUVEAU : Les tableaux sont maintenant dynamiques avec les traductions
  const ORIGINS = useMemo(() => [
    { key: "orig_creditx", label: t("orig_creditx") },
    { key: "orig_insurance", label: t("orig_insurance") },
    { key: "orig_other", label: t("orig_other") }
  ], [t]);

  // Taxonomie canonique partagée (clé = libellé = valeur stockée).
  const DOC_TYPES = useMemo(() => DOCUMENT_TYPES.map((dt) => ({ key: dt, label: dt })), []);

  const PRESET_TAGS = useMemo(() => [
    t("tag_important"), 
    t("tag_tax"), 
    t("tag_appendix"), 
    "2026", 
    "2027"
  ], [t]);


  const toggleType = (typeKey: string) => {
    setSelectedTypeKeys(prev => 
      prev.includes(typeKey) ? prev.filter(tKey => tKey !== typeKey) : [...prev, typeKey]
    );
  };

  const addTag = (tagToAdd: string) => {
    const cleanTag = tagToAdd.trim();
    if (cleanTag && !tags.includes(cleanTag)) {
      setTags([...tags, cleanTag]);
    }
    setNewTag("");
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tTag => tTag !== tagToRemove));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!name) {
        setName(selectedFile.name.replace(/\.[^/.]+$/, "")); 
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !name || selectedTypeKeys.length === 0 || !clientUid) {
      toast.error(t("err_missing_fields"));
      return;
    }

    setUploading(true);
    const toastId = toast.loading(t("toast_uploading", { filename: file.name }));
    
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const storagePath = `clients/${clientUid}/documents/plans_propositions/${Date.now()}_${safeFileName}`;
    const fileRef = ref(storage, storagePath);

    try {
      await uploadBytesResumable(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);
      
      const finalOrigin = originKey === "orig_other" ? customOrigin : t(originKey);
      // Les clés SONT déjà les libellés canoniques (taxonomie partagée).
      const finalTypes = selectedTypeKeys;

      const newDoc = { 
        name, 
        url: downloadURL, 
        path: storagePath, 
        uploadedAt: new Date(),
        origin: finalOrigin,
        types: finalTypes,
        tags: tags,
        isSigned: false, 
        isFinalDoc: true 
      };
      
      onUploadSuccess(newDoc);
      toast.success(t("toast_success"), { id: toastId });
      
      setFile(null);
      setName("");
      setSelectedTypeKeys([]);
      setTags([]);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(t("toast_error"), { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="bg-[#F8F9FB] rounded-t-[32px] px-6 pb-4 outline-none h-[90vh] flex flex-col">
        <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-200 mt-4 mb-6" />
        
        <div className="flex justify-between items-center mb-6">
            <DrawerTitle className="text-2xl font-black text-slate-900">{t("title")}</DrawerTitle>
            <button onClick={onClose} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
                <X size={20} />
            </button>
        </div>
        
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-8 pb-4">
          
          {/* UPLOAD FILE */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-[24px] py-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${file ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-blue-400 bg-white hover:bg-blue-50'}`}
          >
            {file ? (
              <>
                <FileText size={32} className="text-emerald-500" />
                <p className="font-bold text-sm text-emerald-700">{file.name}</p>
                <p className="text-xs text-emerald-600/70">{t("upload_change")}</p>
              </>
            ) : (
              <>
                <UploadCloud size={32} className="text-slate-400" />
                <p className="font-bold text-sm text-slate-600">{t("upload_instruction")}</p>
              </>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="application/pdf,image/*" />
          </div>

          {/* NOM */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest pl-2">{t("lbl_name")}</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder={t("ph_name")}
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 font-bold text-slate-900 outline-none focus:border-blue-500" 
            />
          </div>

          {/* ORIGINE */}
          <div className="space-y-3">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest pl-2">{t("lbl_origin")}</label>
            <div className="flex gap-2 flex-wrap">
              {ORIGINS.map(orig => (
                <button 
                  key={orig.key}
                  onClick={() => setOriginKey(orig.key)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${originKey === orig.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                >
                  {orig.label}
                </button>
              ))}
            </div>
            {originKey === "orig_other" && (
                <input 
                  type="text" 
                  value={customOrigin} 
                  onChange={(e) => setCustomOrigin(e.target.value)} 
                  placeholder={t("ph_custom_origin")}
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 mt-2" 
                />
            )}
          </div>

          {/* TYPE (Multi-choix) */}
          <div className="space-y-3">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest pl-2">{t("lbl_type")}</label>
            <div className="flex flex-wrap gap-2">
              {DOC_TYPES.map(type => (
                <button 
                  key={type.key}
                  onClick={() => toggleType(type.key)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${selectedTypeKeys.includes(type.key) ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* TAGS */}
          <div className="space-y-3 bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-2">
              <Tag size={14} /> {t("lbl_tags")}
            </label>
            
            {/* Tags suggérés */}
            <div className="flex flex-wrap gap-2 mb-4">
               {PRESET_TAGS.map(tag => (
                   <button 
                    key={tag}
                    onClick={() => addTag(tag)}
                    disabled={tags.includes(tag)}
                    className="text-[10px] px-3 py-1.5 rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-30 transition-colors"
                   >
                     + {tag}
                   </button>
               ))}
            </div>

            {/* Saisie d'un nouveau tag */}
            <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newTag} 
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag(newTag)}
                  placeholder={t("ph_new_tag")}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500" 
                />
                <button onClick={() => addTag(newTag)} className="px-4 bg-slate-900 text-white rounded-xl hover:bg-black transition-colors">
                    <Plus size={20} />
                </button>
            </div>

            {/* Tags actifs */}
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-slate-100">
                    {tags.map(tag => (
                        <div key={tag} className="flex items-center gap-1 pl-3 pr-1 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold">
                            {tag}
                            <button onClick={() => removeTag(tag)} className="p-1 hover:bg-blue-200 rounded-md transition-colors"><X size={12}/></button>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>

        <div className="shrink-0 -mx-6 px-6 pt-4 bg-white border-t border-slate-100">
          <Button 
            onClick={handleUpload}
            disabled={uploading || !file || !name || selectedTypeKeys.length === 0}
            className="w-full py-6 rounded-[20px] bg-black text-white font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
            {uploading ? t("btn_upload_loading") : t("btn_submit")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}