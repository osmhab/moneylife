//app/[locale]/dashboard/documents/_components/AddDocumentDrawer.tsx
"use client";

// Ajout d'un document libre au coffre-fort par le client :
// sélection (photos multi-pages ou PDF) → assemblage PDF → upload Storage →
// analyse IA (titre/type/tags) → revue éditable → sauvegarde dans
// clients/{uid}/documents. Réutilise la taxonomie canonique et le pattern
// d'assemblage PDF (jsPDF) de l'ajout d'assurance.

import React, { useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, UploadCloud, FileText, Check, Loader2, Plus, Tag, Sparkles, Trash2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase/index";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { DOCUMENT_TYPES } from "@/lib/core/documentTypes";

interface AddDocumentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clientUid: string;
}

type Step = "select" | "review";

export default function AddDocumentDrawer({ isOpen, onClose, clientUid }: AddDocumentDrawerProps) {
  const t = useTranslations("AddDocumentDrawer");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploaded, setUploaded] = useState<{ url: string; path: string } | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  // Mots-clés du contenu extraits par l'IA — invisibles dans l'UI, utilisés pour la recherche.
  const [keywords, setKeywords] = useState<string[]>([]);

  const reset = () => {
    setStep("select");
    setFiles([]);
    setAnalyzing(false);
    setSaving(false);
    setUploaded(null);
    setTitle("");
    setType("");
    setTags([]);
    setNewTag("");
    setKeywords([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addTag = (raw: string) => {
    const clean = raw.trim();
    if (clean && !tags.includes(clean)) setTags([...tags, clean]);
    setNewTag("");
  };
  const removeTag = (tag: string) => setTags(tags.filter((x) => x !== tag));

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  // Assemble plusieurs images en un PDF A4 (1 image = 1 page).
  const createPdfFromImages = (imageFiles: File[]): Promise<File> =>
    new Promise((resolve, reject) => {
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      let loaded = 0;
      imageFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const ratio = Math.min(pdfWidth / img.width, pdfHeight / img.height);
            if (index > 0) pdf.addPage();
            pdf.addImage(img.src, "JPEG", (pdfWidth - img.width * ratio) / 2, 0, img.width * ratio, img.height * ratio, index.toString(), "FAST");
            loaded++;
            if (loaded === imageFiles.length) {
              resolve(new File([pdf.output("blob")], "Document_Scanne.pdf", { type: "application/pdf" }));
            }
          };
          img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

  const handleAnalyze = async () => {
    if (files.length === 0 || !clientUid) return;
    setAnalyzing(true);
    const toastId = toast.loading(t("toast_analyzing"));
    try {
      const isPdf = files[0].type === "application/pdf";
      const finalFile = isPdf ? files[0] : await createPdfFromImages(files);

      // 1. Upload Storage
      const safeName = (isPdf ? files[0].name : "Document_Scanne.pdf").replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `clients/${clientUid}/documents/vault/${Date.now()}_${safeName}`;
      await uploadBytes(ref(storage, path), finalFile);
      const url = await getDownloadURL(ref(storage, path));
      setUploaded({ url, path });

      // 2. Analyse IA (titre / type / tags) — non bloquante en cas d'échec
      try {
        const fd = new FormData();
        fd.append("file", finalFile);
        const res = await fetch("/api/documents/classify", { method: "POST", body: fd });
        const json = await res.json();
        const d = json?.data;
        if (res.ok && d) {
          setTitle(d.documentTitle || files[0].name.replace(/\.[^/.]+$/, ""));
          setType(d.documentType || "");
          setTags(Array.isArray(d.suggestedTags) ? d.suggestedTags : []);
          setKeywords(Array.isArray(d.keywords) ? d.keywords : []);
        } else {
          setTitle(files[0].name.replace(/\.[^/.]+$/, ""));
        }
      } catch {
        setTitle(files[0].name.replace(/\.[^/.]+$/, ""));
      }

      setStep("review");
      toast.success(t("toast_analyzed"), { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error(t("toast_err_upload"), { id: toastId });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!uploaded || !title.trim() || !clientUid) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "clients", clientUid, "documents"), {
        name: title.trim(),
        url: uploaded.url,
        path: uploaded.path,
        types: type.trim() ? [type.trim()] : [],
        tags,
        keywords, // mots-clés du contenu (recherche)
        origin: "Client",
        source: "vault",
        isSigned: false,
        isFinalDoc: true,
        uploadedAt: serverTimestamp(),
      });
      toast.success(t("toast_saved"));
      handleClose();
    } catch (e) {
      console.error(e);
      toast.error(t("toast_err_save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DrawerContent className="bg-[#F8F9FB] rounded-t-[32px] px-6 pb-4 outline-none h-[90vh] flex flex-col">
        <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-200 mt-4 mb-6" />
        <div className="flex justify-between items-center mb-6">
          <DrawerTitle className="text-2xl font-black text-slate-900">{t("title")}</DrawerTitle>
          <button onClick={handleClose} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6 pb-4">
          {step === "select" && (
            <>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-[24px] py-10 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer border-slate-300 hover:border-blue-400 bg-white hover:bg-blue-50"
              >
                <UploadCloud size={36} className="text-slate-400" />
                <p className="font-bold text-sm text-slate-600">{t("upload_instruction")}</p>
                <p className="text-xs text-slate-400">{t("upload_hint")}</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={onPickFiles}
                className="hidden"
              />

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest pl-2">
                    {t("pages_count", { count: files.length })}
                  </p>
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={18} className="text-blue-500 shrink-0" />
                        <span className="text-sm font-bold text-slate-700 truncate">{f.name}</span>
                      </div>
                      <button onClick={() => removeFile(i)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-blue-500 hover:text-blue-700 pl-2 pt-1">
                    + {t("add_more")}
                  </button>
                </div>
              )}
            </>
          )}

          {step === "review" && (
            <>
              <div className="flex items-center gap-2 bg-blue-50 text-blue-700 rounded-2xl p-3 text-xs font-bold">
                <Sparkles size={16} /> {t("ai_hint")}
              </div>

              {/* TITRE */}
              <div className="space-y-2 bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest">{t("lbl_title")}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("ph_title")}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>

              {/* TYPE */}
              <div className="space-y-3 bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest">{t("lbl_type")}</label>
                <div className="flex flex-wrap gap-2">
                  {DOCUMENT_TYPES.map((dt) => (
                    <button
                      key={dt}
                      onClick={() => setType(dt)}
                      className={`text-[11px] px-3 py-1.5 rounded-md font-bold transition-colors ${
                        type === dt ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {dt}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={DOCUMENT_TYPES.includes(type as any) ? "" : type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder={t("ph_custom_type")}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>

              {/* TAGS */}
              <div className="space-y-3 bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <Tag size={14} /> {t("lbl_tags")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTag(newTag)}
                    placeholder={t("ph_new_tag")}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                  />
                  <button onClick={() => addTag(newTag)} className="px-4 bg-slate-900 text-white rounded-xl hover:bg-black transition-colors">
                    <Plus size={20} />
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-3 mt-1 border-t border-slate-100">
                    {tags.map((tag) => (
                      <div key={tag} className="flex items-center gap-1 pl-3 pr-1 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="p-1 hover:bg-blue-200 rounded-md transition-colors">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 -mx-6 px-6 pt-4 bg-white border-t border-slate-100">
          {step === "select" ? (
            <Button
              onClick={handleAnalyze}
              disabled={analyzing || files.length === 0}
              className="w-full py-6 rounded-[20px] bg-black text-white font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
              {analyzing ? t("btn_analyzing") : t("btn_analyze")}
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="w-full py-6 rounded-[20px] bg-black text-white font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
              {saving ? t("btn_saving") : t("btn_save")}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
