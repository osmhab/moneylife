"use client";

import React, { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Loader2, 
  CheckCircle2, 
  PhoneCall,
  BadgeCheck,
  CalendarCheck,
  Download,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ShieldCheck,
  Search,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  UserCheck,
  Target,
  BarChart3,
  Lightbulb,
  History,
  Users
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";

// --- HELPERS ---
const getNextWeekDays = () => {
  const dates = [];
  let d = new Date();
  while (dates.length < 5) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
};

const formatDateParam = (date: Date) => date.toISOString().split('T')[0];

const generateCalendarLinks = (startStr: string, endStr: string) => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const title = "Analyse Prévoyance CreditX (Habib Osmani)";
  const formatGoogle = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const googleUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${formatGoogle(start)}/${formatGoogle(end)}&sf=true&output=xml`;
  const formatICS = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const icsContent = ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',`URL:${googleUrl}`,`DTSTART:${formatICS(start)}`,`DTEND:${formatICS(end)}`,`SUMMARY:${title}`,'END:VEVENT','END:VCALENDAR'].join('\n');
  return { googleUrl, icsHref: `data:text/calendar;charset=utf8,${encodeURIComponent(icsContent)}` };
};

// --- COMPOSANT PRINCIPAL ---
function RappelContent() {
  const searchParams = useSearchParams();
  const leadId = searchParams.get('leadId');
  const formRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'immediate' | 'schedule' | 'success_immediate' | 'success_schedule'>('immediate');
  const [bookingDate, setBookingDate] = useState<Date>(getNextWeekDays()[0]);
  const [availableSlots, setAvailableSlots] = useState<{start: string, end: string}[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{start: string, end: string} | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({ firstName: "", phone: "" });

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth' });

  // API & Handlers
  useEffect(() => {
    if (viewMode === 'schedule' && bookingDate) {
      const load = async () => {
        setLoadingSlots(true);
        try {
          const res = await fetch(`/api/3a-simulator/slots?date=${formatDateParam(bookingDate)}`);
          const data = await res.json();
          if (data.ok) {
            const now = new Date();
            const futureSlots = data.available.filter((s: any) => new Date(s.start) > new Date(now.getTime() + 15 * 60000));
            setAvailableSlots(futureSlots);
          }
        } catch(e) { toast.error("Erreur planning"); } finally { setLoadingSlots(false); }
      };
      load();
    }
  }, [bookingDate, viewMode]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.startsWith("0")) val = val.substring(1);
    if (val.startsWith("41") && val.length > 2) val = val.substring(2);
    val = val.substring(0, 9);
    let formatted = "";
    if (val.length > 0) formatted += val.substring(0, 2);
    if (val.length > 2) formatted += " " + val.substring(2, 5);
    if (val.length > 5) formatted += " " + val.substring(5, 7);
    if (val.length > 7) formatted += " " + val.substring(7, 9);
    setFormData({ ...formData, phone: formatted });
  };

  const isPhoneValid = formData.phone.replace(/\D/g, "").length === 9;

  const handleSubmit = async () => {
    setLoading(true);
    const fullPhone = `+41 ${formData.phone}`;
    try {
      if (viewMode === 'immediate') {
        // 1. Sauvegarde Firebase
        await addDoc(collection(db, "leads-3a"), { 
          createdAt: serverTimestamp(), 
          status: "demande_rappel", 
          client: { ...formData, phone: fullPhone } 
        });
        // 2. Envoi Email API
        await fetch('/api/notify-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName: formData.firstName, phone: fullPhone, type: "immédiat" })
        });
        setViewMode('success_immediate');

      } else if (selectedSlot) {
        // 1. Sauvegarde dans Google Agenda (ton API existante)
        const res = await fetch('/api/3a-simulator/book', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ name: formData.firstName, phone: fullPhone, start: selectedSlot.start, end: selectedSlot.end }) 
        });
        
        if ((await res.json()).ok) {
          // 2. Sauvegarde Firebase POUR TON DASHBOARD
          await addDoc(collection(db, "leads-3a"), { 
            createdAt: serverTimestamp(), 
            status: "rappel_programme", 
            client: { ...formData, phone: fullPhone },
            rdv: { start: selectedSlot.start, end: selectedSlot.end }
          });
          // 3. Envoi Email API
          await fetch('/api/notify-lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName: formData.firstName, phone: fullPhone, type: "planifié", date: selectedSlot.start })
          });
          setViewMode('success_schedule');
        }
      }
    } catch (e) { toast.error("Erreur lors de l'envoi"); } finally { setLoading(false); }
  };

  // --- RENDU SUCCÈS ---
  if (viewMode.startsWith('success')) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-20">
        <Card className="w-full max-w-xl rounded-[40px] border-slate-200 p-10 shadow-2xl text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={40} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">C'est parfait !</h1>
            <p className="mt-4 text-lg text-slate-600 font-medium">
                {viewMode === 'success_immediate' 
                  ? "Votre demande est bien reçue. Je vous recontacte très rapidement pour échanger tranquillement."
                  : "Le créneau est bloqué dans mon agenda. On se parle très bientôt !"}
            </p>
            <Button asChild className="mt-8 rounded-full bg-slate-900 px-8 py-6 text-white font-bold hover:bg-slate-800">
                <Link href="/">Retour à l'accueil</Link>
            </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-[#F8F9FB] text-slate-900 overflow-x-hidden">
      
      {/* --- HERO SECTION --- */}
      <section className="relative flex min-h-[90vh] items-center justify-center px-6 pt-32 lg:pt-40 pb-32 overflow-hidden">
        <div className="absolute inset-0 z-0">
          {/* ⚠️ N'OUBLIE PAS DE METTRE LE BON NOM DE TON IMAGE DE FOND ICI : */}
          <Image 
            src="/images/hero-table.png" 
            alt="Background Hero CreditX"
            fill
            priority
            className="object-cover"
          />
          {/* Overlay sombre pour la lisibilité */}
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-[2px]" />
        </div>
        
        <div className="relative z-10 max-w-5xl text-center space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          
          {/* PONT VISUEL : Suite à la vidéo avec ta photo */}
          <div className="inline-flex items-center gap-3 rounded-full bg-slate-800/80 pr-4 pl-1.5 py-1.5 text-sm font-bold uppercase tracking-widest text-slate-200 shadow-sm border border-slate-700 backdrop-blur-md">
            <div className="relative w-7 h-7 rounded-full overflow-hidden border border-slate-600">
               <Image src="/images/habib.png" alt="Habib Osmani" fill className="object-cover" />
            </div>
            <span>Suite à ma vidéo</span>
          </div>
          
          {/* Titre aligné sur le contenu vidéo */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black leading-[0.9] tracking-tighter text-white">
            Votre 3e pilier <br /> 
            <span className="text-indigo-400">est-il optimisé ?</span>
          </h1>
          
          {/* Sous-titre conversationnel */}
          <p className="mx-auto max-w-2xl text-xl sm:text-2xl font-medium text-slate-300 leading-relaxed">
            Comme promis, faisons le point ensemble. Demandez votre check-up gratuit pour traquer les erreurs et construire une stratégie qui vous protège vraiment.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button onClick={scrollToForm} className="h-16 rounded-full bg-white px-10 text-lg font-black text-slate-900 hover:bg-slate-100 shadow-2xl transition-all hover:scale-105">
              Réserver mon appel
            </Button>
            <Button variant="ghost" onClick={() => document.getElementById('erreurs')?.scrollIntoView({behavior:'smooth'})} className="h-16 font-bold text-slate-300 hover:text-white hover:bg-white/10">
               Voir les 6 erreurs fréquentes <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* PREUVE SOCIALE HERO (Adaptée au fond sombre) */}
          <div className="pt-4 flex items-center justify-center gap-2 text-sm font-bold text-slate-400">
             <ShieldCheck size={18} className="text-emerald-400" /> 
             Plus de 120 dossiers analysés depuis janvier 2026
          </div>
        </div>
      </section>

      {/* --- TRUST BANNER (LOGOS) --- */}
      <section className="bg-white py-12 border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs font-black uppercase tracking-widest text-slate-400 mb-8">
            On travaille uniquement avec les institutions les plus sérieuses
          </p>
          <div className="flex flex-wrap justify-center items-center gap-12 sm:gap-24 opacity-60 hover:opacity-100 transition-opacity duration-500 grayscale hover:grayscale-0">
            {/* Logos massifs (cercles) : on réduit la hauteur */}
            <img src="/images/logo-axa.png" alt="AXA" className="object-contain h-8 sm:h-9 w-auto" />
            
            {/* Logo horizontal fin : on augmente la hauteur */}
            <img src="/images/logo-helvetiaBaloise.png" alt="Helvetia" className="object-contain h-10 sm:h-12 w-auto" />
            
            {/* Logo vertical : on augmente encore un peu pour équilibrer le texte */}
            <img src="/images/logo-swisslife.png" alt="SwissLife" className="object-contain h-12 sm:h-14 w-auto" />
            
            {/* Logos massifs (cercles) : on réduit la hauteur */}
            <img src="/images/logo-pax.png" alt="Pax" className="object-contain h-8 sm:h-9 w-auto" />
          </div>
        </div>
      </section>

      {/* --- SECTION 2: L'EXPÉRIENCE --- */}
<section className="py-32 bg-slate-900 text-white px-6">
  <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
    
    {/* COLONNE GAUCHE : TITRE ET DESCRIPTION */}
    <div className="space-y-8 lg:sticky lg:top-32">
      <h2 className="text-4xl sm:text-6xl font-black leading-tight">
        L'Expérience CreditX : <br/>
      </h2>
      <p className="text-slate-400 text-lg sm:text-xl leading-relaxed font-medium max-w-md">
        Nous avons supprimé les barrières. Vous bénéficiez d'une analyse experte sans aucune obligation, pour que vous puissiez décider en toute liberté.
      </p>
      <div className="pt-4">
        <Button 
          onClick={scrollToForm} 
          className="h-16 rounded-full bg-white px-10 text-slate-900 font-black hover:bg-slate-100 shadow-xl transition-transform hover:scale-105"
        >
          Réserver mon appel <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>

    {/* COLONNE DROITE : LISTE NUMÉROTÉE */}
    <div className="space-y-12">
      {[
        { 
          step: "01", 
          t: "Prise de contact", 
          d: "On échange sur votre situation globale, vos objectifs et vos craintes. C'est le moment de poser toutes vos questions." 
        },
        { 
          step: "02", 
          t: "Analyse experte", 
          d: "J'étudie vos polices actuelles et identifie précisément les corrections, les doublons et les améliorations nécessaires." 
        },
        { 
          step: "03", 
          t: "Restitution gratuite", 
          d: "Je vous montre les résultats de l'audit. Vous repartez avec des inputs concrets et des solutions chiffrées, sans débourser un centime." 
        },
        { 
          step: "04", 
          t: "Mise en place & Suivi", 
          d: "Si la stratégie vous convainc, CreditX s'occupe de toute la partie administrative et assure un suivi régulier de votre dossier." 
        },
      ].map((s, i) => (
        <div key={i} className="flex gap-8 items-start group">
          <span className="text-indigo-500 font-black text-3xl sm:text-4xl transition-transform group-hover:scale-110 duration-300">
            {s.step}
          </span>
          <div className="space-y-2">
            <h4 className="text-2xl font-bold text-white">{s.t}</h4>
            <p className="text-slate-400 text-lg leading-relaxed">{s.d}</p>
          </div>
        </div>
      ))}
    </div>

  </div>
</section>


      {/* --- SECTION 3: BIO HABIB --- */}
      <section className="py-32 bg-white px-6">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-20 items-center">
          <div className="relative w-full max-w-md aspect-[4/5] rounded-[40px] overflow-hidden shadow-2xl bg-slate-100 flex-shrink-0">
             <Image src="/images/habib.png" alt="Habib Osmani" fill className="object-cover" />
          </div>
          
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight">Habib Osmani</h2>
              <p className="text-indigo-600 font-black uppercase tracking-[0.2em] text-sm">Fondateur de CreditX • Spécialiste Prévoyance</p>
            </div>
            
            <p className="text-xl text-slate-600 font-medium leading-relaxed italic border-l-4 border-indigo-600 pl-6">
              "J'ai vu trop de clients payer pour des promesses vides. J'ai créé CreditX pour apporter une alternative transparente et réellement indépendante."
            </p>

            <div className="text-lg text-slate-500 space-y-4 font-medium leading-relaxed">
              <p>Fort de plus de 10 ans d'expérience, j'ai accompagné des centaines de clients dans la sécurisation de leur patrimoine et de leur retraite. Après un parcours d'excellence chez <strong>AXA Prévoyance & Patrimoine</strong>, j'ai décidé de briser les codes du conseil traditionnel.</p>
              <p>Titulaire du Certificat d'Intermédiaire d'Assurance (AFA) et officiellement inscrit au registre de la <strong>FINMA</strong>, je mets mon expertise au service d'une méthode que j'ai voulue transparente et sans compromis depuis août 2025.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-6">
              <div><p className="text-slate-900 font-black text-2xl">10+</p><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Années d'exp.</p></div>
              <div><p className="text-slate-900 font-black text-2xl">AFA</p><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Certifié</p></div>
              <div><p className="text-slate-900 font-black text-2xl">FINMA</p><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Professionnel Agréé</p></div>
            </div>
            <div className="pt-4">
              <Button onClick={scrollToForm} variant="outline" className="rounded-full border-slate-200 text-slate-900 font-bold hover:bg-slate-50">
                 Réserver mon appel <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 4: LE FORMULAIRE --- */}
      <section ref={formRef} className="py-32 bg-slate-50 px-6">
        <div className="max-w-4xl mx-auto space-y-16">
          <div className="text-center space-y-4">
             <h2 className="text-4xl font-black">Réserver mon appel</h2>
             <p className="text-slate-500 font-medium text-lg">On en discute simplement, à votre rythme.</p>
          </div>

          <Card className="rounded-[40px] border-slate-200 shadow-2xl bg-white overflow-hidden p-8 sm:p-12">
             <div className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Votre Prénom</Label>
                    <Input placeholder="Ex: David" className="h-16 rounded-2xl text-xl font-medium bg-slate-50" value={formData.firstName} onChange={e => setFormData({...formData, firstName:e.target.value})} />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Mobile</Label>
                    <div className="flex h-16 items-center rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden focus-within:ring-2 focus-within:ring-slate-900 transition-all">
                      <div className="px-5 font-black text-slate-400 border-r border-slate-200">+41</div>
                      <Input placeholder="79 123 45 67" className="border-0 bg-transparent text-xl font-medium focus-visible:ring-0 shadow-none rounded-none" value={formData.phone} onChange={handlePhoneChange} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-6">
                   <div className="flex bg-slate-100 p-1.5 rounded-full">
                      <button onClick={() => setViewMode('immediate')} className={`px-6 py-3 rounded-full text-sm font-black transition-all ${viewMode === 'immediate' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>RAPPEL RAPIDE</button>
                      <button onClick={() => setViewMode('schedule')} className={`px-6 py-3 rounded-full text-sm font-black transition-all ${viewMode === 'schedule' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>PLANIFIER</button>
                   </div>

                   {viewMode === 'schedule' && (
                     <div className="w-full space-y-8 animate-in slide-in-from-top-4 duration-500">
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                          {getNextWeekDays().map(d => (
                            <button key={d.toString()} onClick={() => setBookingDate(d)} className={`flex-shrink-0 w-20 h-24 rounded-[20px] border-2 flex flex-col items-center justify-center transition-all ${formatDateParam(bookingDate) === formatDateParam(d) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 bg-white text-slate-600'}`}>
                              <span className="text-[10px] font-bold uppercase">{d.toLocaleDateString('fr-FR', {weekday: 'short'})}</span>
                              <span className="text-2xl font-black">{d.getDate()}</span>
                            </button>
                          ))}
                        </div>
                        {loadingSlots ? <div className="flex justify-center"><Loader2 className="animate-spin" /></div> : (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                             {availableSlots.map((s, i) => (
                               <button key={i} onClick={() => setSelectedSlot(s)} className={`py-3 rounded-xl text-sm font-black border-2 transition-all ${selectedSlot?.start === s.start ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-100'}`}>
                                 {new Date(s.start).toLocaleTimeString('fr-CH', {hour:'2-digit', minute:'2-digit'})}
                               </button>
                             ))}
                          </div>
                        )}
                     </div>
                   )}

                   <Button onClick={handleSubmit} disabled={!isPhoneValid || !formData.firstName || loading} className="w-full h-20 rounded-[24px] bg-slate-900 text-lg font-black text-white hover:bg-slate-800 shadow-2xl transition-all hover:scale-[1.02]">
                      {loading ? <Loader2 className="animate-spin mr-2" /> : viewMode === 'immediate' ? <PhoneCall className="mr-2" /> : <CalendarCheck className="mr-2" />}
                      {viewMode === 'immediate' ? "Demander un rappel" : "BLOQUER MON CRÉNEAU"}
                   </Button>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <ShieldCheck size={14} className="text-emerald-500" /> Plus de 120 dossiers analysés depuis janvier 2026
                   </p>
                </div>
             </div>
          </Card>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="bg-white py-20 px-6 border-t border-slate-100">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="space-y-4 text-center md:text-left">
          <img src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd" alt="CreditX Logo" className="h-8 w-auto mb-3" />
            <p className="text-sm font-medium text-slate-400 max-w-xs">Indépendance, transparence et expertise en prévoyance individuelle en Suisse.</p>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-2">
             <p className="text-xs font-black text-slate-900">HABIB OSMANI</p>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expert agréé FINMA F01536084 • Valais, Suisse</p>
             <p className="text-[10px] text-slate-300 mt-4">© {new Date().getFullYear()} Tous droits réservés.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default function RappelPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-slate-900 h-10 w-10" /></div>}>
      <RappelContent />
    </Suspense>
  );
}