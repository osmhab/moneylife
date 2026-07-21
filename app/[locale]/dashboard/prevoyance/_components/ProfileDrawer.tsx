//app/[locale]/dashboard/prevoyance/_components/ProfileDrawer.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  User, 
  ChevronRight, 
  LogOut, 
  X, 
  Settings, 
  Bell,
  CreditCard,
  Camera,
  Loader2,
  ShieldCheck,
  FolderLock,
  ClipboardList
} from "lucide-react";
import { auth, db, storage } from "@/lib/firebase/index";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useRouter, usePathname } from "next/navigation";
import InboxView from "./InboxView";

// Import de la traduction
import { useTranslations, useLocale } from "next-intl";

interface ProfileViewProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDetails: () => void;
  userName: string;
  targetUid?: string;
}

export default function ProfileView({ isOpen, onClose, onOpenDetails, userName, targetUid }: ProfileViewProps) {
  const effectiveUid = targetUid || auth.currentUser?.uid;
  const t = useTranslations("ProfileDrawer");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // 👈 NOUVEAU : On gère l'état de la photo localement
  const [photoURL, setPhotoURL] = useState<string | null>(null);

  // Fallback si la photo n'est pas encore chargée
  const displayPhotoURL = photoURL || `https://api.dicebear.com/7.x/rings/svg?seed=${effectiveUid}&radius=25`;

  const userDisplaySubtitle = targetUid 
    ? "Mode Administration" 
    : (auth.currentUser?.email || t("email_empty"));

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !effectiveUid) return;

    try {
      setIsUploading(true);
      const fileRef = ref(storage, `clients/${effectiveUid}/profile_pictures/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);

      if (!targetUid && auth.currentUser) {
        await updateProfile(auth.currentUser, { photoURL: downloadUrl });
      }
      
      // Met à jour la racine "clients" pour déclencher le temps réel partout
      const rootClientRef = doc(db, "clients", effectiveUid);
      await updateDoc(rootClientRef, { photoURL: downloadUrl });

      // Garde la mise à jour dans DonneePersonnelles au cas où tu en aurais besoin ailleurs
      try {
        const userDocRef = doc(db, "clients", effectiveUid, "DonneePersonnelles", "current");
        await updateDoc(userDocRef, { photoURL: downloadUrl });
      } catch (e) {
        // Ignore si le document "current" n'existe pas encore
      }
      
      // (On supprime le setPhotoURL car le contexte va mettre à jour l'image tout seul)
    } catch (error) {
      console.error("Erreur d'upload :", error);
      alert(t("err_upload"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!effectiveUid) return;

    // 1. Écoute des notifications
    const q = query(
      collection(db, `clients/${effectiveUid}/notifications`),
      where("read", "==", false)
    );
    const unsubNotifs = onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    });

    // 2. Écoute de la photo de profil (racine du client)
    const unsubRoot = onSnapshot(doc(db, "clients", effectiveUid), (snap) => {
      if (snap.exists() && snap.data().photoURL) {
        setPhotoURL(snap.data().photoURL);
      }
    });

    return () => {
      unsubNotifs();
      unsubRoot();
    };
  }, [effectiveUid]); // 👈 Dépendance à effectiveUid ajoutée

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/login");
  };

  // Logique de changement de langue
  const switchLanguage = (newLocale: string) => {
    if (newLocale === locale) return;
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
    router.refresh();
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]"
            />

            <motion.div
              initial={{ x: "-100%" }} 
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}    
              transition={{ type: "spring", damping: 30, stiffness: 250 }}
              className="fixed top-0 left-0 bottom-0 w-full sm:w-[400px] bg-white shadow-2xl z-[100] overflow-y-auto flex flex-col"
            >
              
              {/* Header Compact */}
              <div className="px-6 py-6 flex items-center justify-between border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-md">
                <h1 className="text-xs font-black uppercase tracking-widest text-slate-500">
                  {t("header_title")}
                </h1>
                <button 
                  onClick={onClose}
                  className="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors active:scale-95 shadow-sm"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              <div className="flex-1 px-6 py-8 flex flex-col">
                
                {/* User Info Section */}
                <div className="flex items-center gap-5 mb-10 p-5 bg-slate-50 border border-slate-100 rounded-3xl">
                  <div className="relative group cursor-pointer shrink-0" onClick={() => fileInputRef.current?.click()}>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handlePhotoUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                    <div className="w-16 h-16 rounded-full bg-white overflow-hidden relative border-2 border-white shadow-md transition-transform duration-300 group-active:scale-95">
                      <img 
                        src={displayPhotoURL} 
                        alt={userName} 
                        className={`w-full h-full object-cover transition-all duration-500 ${isUploading ? 'opacity-30 scale-105' : 'group-hover:scale-110 group-hover:opacity-60'}`}
                      />
                      
                      {isUploading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                          <Loader2 size={16} className="animate-spin text-black" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20">
                          <Camera size={16} className="text-white drop-shadow-md" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-slate-900 truncate leading-tight">{userName}</h2>
                    <p className={`font-medium text-[13px] truncate mt-0.5 ${targetUid ? 'text-blue-600 font-bold' : 'text-slate-500'}`}>
                      {userDisplaySubtitle}
                    </p>
                  </div>
                </div>

                {/* Menu de navigation */}
                <div className="space-y-1">
                  <MenuRow 
                    icon={<User />} 
                    label={t("menu_personal_data")} 
                    subLabel={t("menu_personal_data_sub")}
                    onClick={onOpenDetails} 
                    t={t}
                  />
                  <MenuRow 
                    icon={<FolderLock />} 
                    label={t("menu_vault")} 
                    subLabel={t("menu_vault_sub")}
                    onClick={() => {
                      onClose(); 
                      router.push("/dashboard/documents"); 
                    }} 
                    t={t}
                  />
                  <MenuRow 
                    icon={<ClipboardList />} 
                    label="Mes Audits & Conseils" 
                    subLabel="Historique et notes de vos entretiens"
                    onClick={() => {
                      onClose(); 
                      router.push("/dashboard/audits"); 
                    }} 
                    t={t}
                  />
                  <MenuRow 
                    icon={<Bell />} 
                    label={t("menu_inbox")} 
                    subLabel={t("menu_inbox_sub")}
                    badge={unreadCount > 0 ? unreadCount.toString() : null}
                    onClick={() => setIsInboxOpen(true)}
                    t={t}
                  />

                  <MenuRow 
                    icon={<CreditCard />} 
                    label={t("menu_billing")} 
                    subLabel={t("menu_billing_sub")}
                    disabled={true} 
                    t={t}
                  />
                  <MenuRow 
                    icon={<Settings />} 
                    label={t("menu_security")} 
                    subLabel={t("menu_security_sub")}
                    disabled={true} 
                    t={t}
                  />
                </div>

                <div className="h-px w-full bg-slate-100 my-6" />

                <MenuRow 
                  icon={<LogOut />} 
                  label={t("menu_logout")} 
                  onClick={handleLogout}
                  isDestructive={true}
                  t={t}
                />
                
                {/* SECTION DU BAS : Langue, Version et Logo */}
                <div className="mt-auto pt-8 flex flex-col gap-6">
                  
                  {/* Sélecteur de langue Full Width */}
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full">
                    <button 
                      onClick={() => switchLanguage('fr')}
                      className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${locale === 'fr' ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      FR
                    </button>
                    <button 
                      onClick={() => switchLanguage('de')}
                      className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${locale === 'de' ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      DE
                    </button>
                  </div>

                  <div className="flex flex-col items-center gap-6">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("app_version")}</p>
                    <div className="opacity-20 hover:opacity-40 transition-opacity duration-500">
                      <img 
                        src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd" 
                        alt="CreditX Logo" 
                        className="h-6 object-contain filter grayscale"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <InboxView 
        isOpen={isInboxOpen} 
        onClose={() => setIsInboxOpen(false)} 
      />
    </>
  );
}

// --- SOUS-COMPOSANT MENU ROW ---
function MenuRow({ icon, label, subLabel, onClick, badge, isDestructive = false, disabled = false, t }: any) {
  return (
    <button 
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      className={`w-full flex items-center justify-between p-4 rounded-2xl group transition-all outline-none 
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 active:scale-[0.98]'}
      `}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300
          ${disabled 
            ? 'bg-slate-100 text-slate-400'
            : isDestructive 
              ? 'bg-red-50 text-red-500' 
              : 'bg-white border border-slate-200 text-slate-600 shadow-sm group-hover:border-slate-300 group-hover:text-slate-900'
          }`}
        >
          {React.cloneElement(icon, { size: 18, strokeWidth: 2 })}
        </div>
        <div className="text-left min-w-0">
          <span className={`block text-[14px] font-bold truncate transition-colors 
            ${disabled ? 'text-slate-500' : isDestructive ? 'text-red-600' : 'text-slate-900'}`}
          >
            {label}
          </span>
          {subLabel && !disabled && !isDestructive && (
             <span className="block text-[11px] text-slate-500 font-medium truncate mt-0.5">
               {subLabel}
             </span>
          )}
          {disabled && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1 block">{t("badge_coming_soon")}</span>}
        </div>
      </div>
      
      {badge ? (
        <div className="bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-sm">
          {badge}
        </div>
      ) : (
        <div className={`shrink-0 transition-colors 
          ${disabled ? 'text-transparent' : isDestructive ? 'text-transparent' : 'text-slate-300 group-hover:text-slate-400'}`}
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </div>
      )}
    </button>
  );
}