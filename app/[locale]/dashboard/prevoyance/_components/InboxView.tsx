//app/[locale]/dashboard/prevoyance/_components/InboxView.tsx
"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, CheckCircle2, Bell, Mail, Clock, ShieldCheck } from "lucide-react";
import { db, auth } from "@/lib/firebase/index"; // 👈 Alias mis à jour
import { collection, query, onSnapshot, orderBy, doc, updateDoc } from "firebase/firestore";

// 👈 NOUVEAU : Imports pour la traduction
import { useTranslations, useLocale } from "next-intl";

interface InboxViewProps {
  isOpen: boolean;
  onClose: () => void;
}

// 👈 MAJ : La fonction accepte désormais 'locale' pour formater correctement la date
const formatMessageDate = (timestamp: any, locale: string, formatType: 'list' | 'detail' = 'list') => {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  
  const today = new Date();
  const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();

  // Définition de la locale pour l'API Intl
  const intlLocale = locale === 'de' ? 'de-CH' : 'fr-CH';

  if (formatType === 'list') {
    return isToday 
      ? new Intl.DateTimeFormat(intlLocale, { hour: '2-digit', minute: '2-digit' }).format(date)
      : new Intl.DateTimeFormat(intlLocale, { day: '2-digit', month: 'short' }).format(date);
  }

  return new Intl.DateTimeFormat(intlLocale, { 
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
  }).format(date);
};

export default function InboxView({ isOpen, onClose }: InboxViewProps) {
  // 👈 NOUVEAU : Récupération des traductions et de la locale active
  const t = useTranslations("InboxView");
  const locale = useLocale();

  const [messages, setMessages] = useState<any[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !isOpen) return;

    const q = query(
      collection(db, `clients/${user.uid}/notifications`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubscribe();
  }, [isOpen]);

  const handleOpenMessage = async (msg: any) => {
    setSelectedMessage(msg);
    if (!msg.read) {
      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(db, `clients/${user.uid}/notifications`, msg.id), { read: true });
      }
    }
  };

  const handleCloseMessage = () => {
    setSelectedMessage(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed inset-0 bg-[#F8F9FB] z-[110] flex flex-col overflow-hidden"
        >
          {/* HEADER LISTE */}
          <div className="px-6 pt-14 pb-4 flex items-center justify-between border-b border-slate-100 bg-white/80 backdrop-blur-xl shrink-0 z-10">
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-slate-900 active:scale-90 transition-transform">
              <ChevronLeft size={28} />
            </button>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">{t("title")}</h1>
            <div className="w-10" />
          </div>

          {/* LISTE DES MESSAGES */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                <Mail size={48} className="mb-4 stroke-[1.5px]" />
                <p className="font-bold">{t("empty_inbox")}</p>
              </div>
            ) : (
              messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => handleOpenMessage(msg)}
                  className={`w-full text-left bg-white p-5 rounded-[28px] shadow-sm border transition-all active:scale-[0.98] ${
                    !msg.read ? 'border-blue-200 bg-blue-50/20' : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                      msg.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-[#1a4f8a]'
                    }`}>
                      {msg.type === 'success' ? <CheckCircle2 size={20} /> : <Mail size={20} />}
                    </div>
                    
                    <div className="flex-1 overflow-hidden">
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
                          {msg.category || t("default_category")}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            {formatMessageDate(msg.createdAt, locale, 'list')}
                          </span>
                          {!msg.read && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-sm" />}
                        </div>
                      </div>
                      <h3 className={`text-lg leading-tight mb-1 truncate ${!msg.read ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>
                        {msg.title}
                      </h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed line-clamp-2">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}

            {/* ÉCRAN DE DÉTAIL DU MESSAGE (SLIDE-OVER) */}
            <AnimatePresence>
              {selectedMessage && (
                <motion.div
                  initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="absolute inset-0 bg-white z-20 flex flex-col"
                >
                  {/* HEADER DU MESSAGE */}
                  <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-slate-100 shrink-0">
                    <button onClick={handleCloseMessage} className="flex items-center gap-1 text-[#1a4f8a] p-2 active:opacity-50 transition-opacity">
                      <ChevronLeft size={24} />
                      <span className="font-bold">{t("btn_back")}</span>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {/* EN-TÊTE DE L'EMAIL */}
                    <div className="px-6 py-8 border-b border-slate-50 bg-[#F8F9FB]/50">
                      <h1 className="text-2xl font-black text-slate-900 leading-tight mb-6">
                        {selectedMessage.title}
                      </h1>
                      
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center shrink-0 shadow-md">
                          <ShieldCheck size={20} />
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-slate-900 text-sm">CreditX Sàrl</p>
                          <p className="text-xs font-bold text-slate-500">{t("to_you")}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            {formatMessageDate(selectedMessage.createdAt, locale, 'detail')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* CORPS DE L'EMAIL */}
                    <div className="px-6 py-8">
                      <div className="prose prose-sm md:prose-base prose-slate max-w-none">
                        <p className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                          {selectedMessage.content}
                        </p>
                      </div>

                      {/* Signature Automatique */}
                      <div className="mt-12 pt-8 border-t border-slate-100">
                        <img 
                          src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd" 
                          alt="CreditX" 
                          className="w-24 opacity-80 mb-4" 
                        />
                        <p className="text-xs font-bold text-slate-400 leading-relaxed">
                          {t("team_creditx")}<br />
                          {t("address")}<br />
                          {t("system_notification")}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}