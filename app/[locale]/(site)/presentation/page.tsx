"use client";

import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, Lock, Target, HeartPulse, Activity, 
  Smartphone, Building2, Briefcase, TrendingUp, ChevronLeft, ChevronRight,
  Scale, ArrowRight, UserCheck, CheckCircle2, Globe, Award
} from "lucide-react";

export default function PresentationPage() {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Navigation au clavier pour tes rendez-vous
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide]);

  const nextSlide = () => setCurrentSlide((prev) => Math.min(prev + 1, slides.length - 1));
  const prevSlide = () => setCurrentSlide((prev) => Math.max(prev - 1, 0));

  const slides = [
    // --- SLIDE 1 : INTRODUCTION ---
    (
        <div key="intro" className="flex flex-col justify-center w-full h-full animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 rounded-full text-xs font-black tracking-widest uppercase mb-10 border border-blue-500/20">
              <Award size={14} /> Mandat de Gestion & Conseil Indépendant
            </div>
            
            <h1 className="text-8xl font-black text-white leading-[0.9] mb-10 tracking-tighter">
              La Prévoyance <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Intelligente.</span>
            </h1>
            
            <p className="text-2xl text-slate-400 font-medium leading-relaxed mb-16 max-w-2xl">
              Analyse experte, indépendance totale et technologie de pointe pour sécuriser votre avenir financier.
            </p>
  
            <div className="flex flex-wrap items-center gap-12 pt-8 border-t border-white/5">
              {/* PHOTO DE PROFIL CIRCULAIRE */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-full blur-sm opacity-50"></div>
                  <div className="relative w-24 h-24 rounded-full border-2 border-slate-800 overflow-hidden shadow-2xl">
                    <img 
                      src="/images/habib-hero.jpg" 
                      alt="Habib Osmani" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white leading-tight">Habib Osmani</h3>
                  <p className="text-blue-400 text-sm font-black tracking-widest uppercase">Pension & Assets Specialist</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase mt-1">
                    <ShieldCheck size={12} className="text-emerald-500" />
                    FINMA n° F01536085
                  </div>
                </div>
              </div>
  
              <div className="w-px h-16 bg-slate-800 hidden md:block"></div>
  
              {/* ACCRÉDITATION FINMA */}
              <div className="flex flex-col">
                <span className="text-white font-black text-2xl tracking-tighter uppercase">CreditX Sàrl</span>
                <span className="text-slate-500 text-[10px] font-black tracking-[0.2em] uppercase">Intermédiaire non-lié n° F01536084</span>
              </div>
            </div>
          </div>
        </div>
      ),

    // --- SLIDE 2 : PROTECTION DES DONNÉES ---
    (
      <div key="data" className="flex flex-col justify-center items-center w-full h-full text-center animate-in fade-in zoom-in-95 duration-700">
        <div className="w-28 h-28 bg-blue-600/10 rounded-3xl flex items-center justify-center mb-12 shadow-inner border border-blue-500/20">
          <Lock size={56} className="text-blue-500" />
        </div>
        <h2 className="text-6xl font-black text-white mb-8 tracking-tighter">Votre sécurité, <br/>notre priorité absolue.</h2>
        <p className="text-2xl text-slate-400 max-w-3xl leading-relaxed mb-16">
            Vos données sont traitées conformément à la <strong>Loi fédérale sur la protection des données (nLPD)</strong>. Nous agissons avec une discrétion totale.
        </p>
        <div className="grid grid-cols-3 gap-8 w-full max-w-6xl">
          {[
            { icon: <UserCheck className="text-blue-400" />, title: "Utilisation stricte", desc: "Vos données servent exclusivement à l'analyse de vos besoins et à la comparaison d'offres." },
            { icon: <ShieldCheck className="text-emerald-400" />, title: "Confidentialité", desc: "Transmission uniquement aux assureurs nécessaires à l'exécution de votre mandat." },
            { icon: <Globe className="text-indigo-400" />, title: "Hébergement Suisse", desc: "Serveurs hautement sécurisés situés sur le territoire helvétique pour une protection optimale." }
          ].map((item, i) => (
            <div key={i} className="bg-white/5 p-10 rounded-[35px] border border-white/5 backdrop-blur-xl text-left hover:bg-white/10 transition-all">
              <div className="mb-6">{item.icon}</div>
              <h4 className="text-2xl font-black text-white mb-4 tracking-tight">{item.title}</h4>
              <p className="text-slate-400 leading-relaxed font-bold text-sm uppercase tracking-wide">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),

    // --- SLIDE 3 : COMMENT ON TRAVAILLE (3 AXES) ---
    (
      <div key="method" className="flex flex-col justify-center w-full h-full animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="mb-16">
          <h2 className="text-6xl font-black text-white mb-6 tracking-tighter">Check-up Prévoyance</h2>
          <p className="text-2xl text-slate-500 max-w-2xl font-medium">Une approche holistique structurée autour des trois piliers de votre vie financière.</p>
        </div>
        
        <div className="grid grid-cols-3 gap-8">
          {[
            { 
              icon: <Target size={40} />, 
              title: "Situation à la retraite", 
              desc: "Analyse de vos rentes futures et optimisation de votre capital pour maintenir votre niveau de vie une fois votre activité cessée.",
              color: "from-blue-600 to-blue-400"
            },
            { 
              icon: <Activity size={40} />, 
              title: "Incapacité de gain", 
              desc: "Protection de vos revenus en cas de maladie ou d'accident. Nous vérifions que votre famille est à l'abri du besoin, quoi qu'il arrive.",
              color: "from-indigo-600 to-indigo-400"
            },
            { 
              icon: <HeartPulse size={40} />, 
              title: "Protection famille", 
              desc: "Analyse de la couverture en cas de décès. Sécurisation financière de vos proches pour leur garantir un avenir sans inquiétude.",
              color: "from-rose-600 to-rose-400"
            }
          ].map((axe, i) => (
            <div key={i} className="relative group">
              <div className={`absolute inset-0 bg-gradient-to-br ${axe.color} opacity-0 group-hover:opacity-10 rounded-[40px] transition-opacity`}></div>
              <div className="bg-slate-900/50 p-12 rounded-[40px] border border-white/5 h-full transition-transform group-hover:-translate-y-2">
                <div className={`w-20 h-20 bg-gradient-to-br ${axe.color} rounded-2xl flex items-center justify-center mb-10 shadow-lg`}>
                  {axe.icon}
                </div>
                <h3 className="text-3xl font-black text-white mb-6 tracking-tight">{axe.title}</h3>
                <p className="text-slate-400 text-lg leading-relaxed">{axe.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),

    // --- SLIDE 4 : ANALYSE & APP ---
    (
      <div key="app" className="flex items-center w-full h-full animate-in fade-in zoom-in-95 duration-700">
        <div className="w-1/2 pr-20">
          <h2 className="text-6xl font-black text-white mb-10 tracking-tighter leading-[1.1]">Indépendance & <br/><span className="text-blue-500">Transparence.</span></h2>
          <p className="text-xl text-slate-400 mb-12 font-medium">Nous travaillons exclusivement dans l'intérêt du client. Aucune exclusivité, aucun conflit d'intérêt.</p>
          
          <div className="space-y-8">
            {[
              { icon: <TrendingUp className="text-blue-400" />, title: "Analyse de rendement", desc: "Optimisation de la performance de vos avoirs actuels." },
              { icon: <Scale className="text-indigo-400" />, title: "Analyse du besoin réel", desc: "Ajustement sur-mesure : ni trop, ni trop peu." },
              { icon: <Briefcase className="text-emerald-400" />, title: "Optimisation fiscale", desc: "Réduisez votre charge fiscale via le 3ème pilier." }
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-6 group">
                <div className="mt-1 bg-white/5 p-3 rounded-2xl border border-white/5 group-hover:bg-blue-500/20 transition-colors">{item.icon}</div>
                <div>
                  <h4 className="text-2xl font-black text-white tracking-tight">{item.title}</h4>
                  <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="w-1/2 flex justify-center">
          <div className="relative">
            <div className="absolute -inset-20 bg-blue-600/10 rounded-full blur-[100px]"></div>
            <div className="w-[320px] bg-slate-900 rounded-[60px] p-4 shadow-2xl border-[8px] border-slate-800">
               <div className="bg-black rounded-[45px] overflow-hidden h-[550px] relative">
                  <div className="p-8 pt-12">
                    <div className="w-12 h-12 bg-blue-600 rounded-xl mb-6 flex items-center justify-center">
                        <Smartphone className="text-white" size={24} />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2 tracking-tighter">App CreditX</h3>
                    <p className="text-slate-500 text-sm mb-10 font-bold uppercase tracking-widest leading-tight">Votre prévoyance surveillée 24/7</p>
                    
                    <div className="space-y-4">
                        {[1, 2, 3].map(j => (
                          <div key={j} className="h-14 bg-white/5 rounded-2xl flex items-center px-4 gap-4">
                             <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                             <div className="h-2 w-2/3 bg-white/10 rounded-full"></div>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-blue-600/20 to-transparent"></div>
               </div>
            </div>
          </div>
        </div>
      </div>
    ),

    // --- SLIDE 5 : PARTENAIRES ---
    (
      <div key="partners" className="flex flex-col justify-center items-center w-full h-full text-center animate-in fade-in duration-700">
        <h2 className="text-6xl font-black text-white mb-6 tracking-tighter">Partenaires de confiance.</h2>
        <p className="text-2xl text-slate-500 mb-20 font-medium">Nous collaborons avec les institutions les plus sérieuses de Suisse.</p>
        
        <div className="grid grid-cols-5 gap-6 w-full max-w-6xl mb-24 px-10">
          {[
            { name: "AXA", color: "text-[#00008F]" },
            { name: "SwissLife", color: "text-[#E2001A]" },
            { name: "Pax", color: "text-slate-900" },
            { name: "Helvetia", color: "text-[#E3000F]" }
          ].map((p, i) => (
            <div key={i} className="bg-white rounded-[30px] h-32 flex items-center justify-center shadow-xl p-8 hover:scale-105 transition-transform cursor-pointer">
              <span className={`text-2xl font-black ${p.color}`}>{p.name}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-6">
          {["Capitalisation", "Gestion de retraite", "Gestion de fortune"].map((badge, i) => (
            <div key={i} className="px-10 py-5 bg-white/5 rounded-full text-white font-black text-sm tracking-widest uppercase border border-white/5 backdrop-blur-md">
              {badge}
            </div>
          ))}
        </div>
      </div>
    )
  ];

  return (
    <div className="h-screen w-screen bg-[#050505] overflow-hidden flex flex-col relative">
      
      {/* Background Ambience */}
      <div className="absolute top-[-10%] right-[-5%] w-[1000px] h-[1000px] bg-blue-600/5 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-5%] w-[1000px] h-[1000px] bg-indigo-600/5 rounded-full blur-[150px] pointer-events-none"></div>

      {/* Header UI */}
      <div className="absolute top-0 left-0 w-full p-12 flex justify-between items-center z-50">
    
        <div className="flex items-center gap-6">
            <div className="flex gap-1">
                {slides.map((_, i) => (
                    <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === currentSlide ? 'w-8 bg-blue-500' : 'w-2 bg-slate-800'}`}></div>
                ))}
            </div>
            <div className="text-slate-600 font-black text-sm tracking-widest uppercase">
              Slide {currentSlide + 1} / {slides.length}
            </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-12 flex items-center justify-center z-10">
        {slides[currentSlide]}
      </main>

      {/* Controls Overlay */}
      <div className="absolute bottom-12 right-12 flex gap-4 z-50">
        <button 
          onClick={prevSlide}
          disabled={currentSlide === 0}
          className="w-16 h-16 rounded-2xl bg-slate-900/80 text-white hover:bg-slate-800 disabled:opacity-20 border border-white/5 backdrop-blur-xl transition-all flex items-center justify-center"
        >
          <ChevronLeft size={28} />
        </button>
        <button 
          onClick={nextSlide}
          disabled={currentSlide === slides.length - 1}
          className="w-20 h-16 rounded-2xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-20 shadow-2xl shadow-blue-600/40 transition-all flex items-center justify-center"
        >
          <ChevronRight size={28} />
        </button>
      </div>

      {/* Background Decor Layer */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.02] pointer-events-none pointer-events-none select-none overflow-hidden">
        <span className="text-[400px] font-black absolute -top-40 -left-20">PREVOYANCE</span>
      </div>

    </div>
  );
}