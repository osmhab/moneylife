"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { simulateThreeAFromModels, ClientProfile, SimulationResult, ProviderModelDoc } from "lib/engines/threeA-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { 
  TrendingUp, ShieldAlert, 
  ArrowRight, ArrowLeft, Landmark, Zap, PiggyBank, User, MapPin, ShieldCheck, Mail, Phone, FileText,
  CheckCircle2, Trophy, Info, Calendar as CalendarIcon, Clock, Loader2,
  HeartPulse, ArrowRightLeft, Mars, Venus
} from "lucide-react";

import Confetti from "react-confetti";
import { toast } from "sonner";

// --- IMPORTS CRITIQUES POUR LE PDF ---
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRIES } from "lib/constants/countries";

declare global {
  interface Window {
    google: any;
  }
}

const initialProfile: ClientProfile = {
  age: 30,
  gender: "M",
  isSmoker: false,
  targetMonthlyPremium: 300,
  retirementAge: 65,
  desiredDeathCapital: 0,
  desiredDisabilityRente: 0
};


// --- CONFIGURATION DU FILTRAGE ---
// Seuls ces partenaires seront affichés (peu importe ce que renvoie le moteur)
const ALLOWED_PROVIDERS_KEYS = [
  "AXA", "Axa", 
  "Swiss Life", "SwissLife", "Swisslife", 
  "Helvetia", "Baloise", "La Baloise", "Bâloise", "Helvetia Baloise",
  "Pax", "PAX"
];

// Fonction bidon pour compatibilité (on ne l'utilise plus vraiment car on floute en CSS)
const getAnonymizedDisplay = (realProvider: string, realProduct: string) => {
  return { provider: realProvider, productName: realProduct };
};


export default function ThreeASimulator() {
  const [benchmarks, setBenchmarks] = useState<ProviderModelDoc[]>([]);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [profile, setProfile] = useState<ClientProfile>(initialProfile);
  const [countrySearch, setCountrySearch] = useState("Suisse");
  
  // --- STATE BOOKING ---
  const [bookingDate, setBookingDate] = useState<Date | null>(null);
  const [availableSlots, setAvailableSlots] = useState<{start: string, end: string}[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{start: string, end: string} | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  const [showComparison, setShowComparison] = useState(false);
  const [currentContract, setCurrentContract] = useState({
    provider: "", startDate: "", endDate: "", annualPremium: 0,
    deathCapital: 0, disabilityRente: 0, projectedCapital: 0
  });

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", profession: "", birthDate: "",
    nationality: "CH", permitType: "", email: "", phone: "",
    address: "", npa: "", city: ""
  });

  const addressInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);


  // --- MICROSOFT CLARITY ---
  useEffect(() => {
    (function(c: any, l: any, a: any, r: any, i: any, t?: any, y?: any){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);
        t.async=1;
        t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];
        y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "ve5skvbnqx");
  }, []);


  // --- LOGIQUE DATES ---
  const getNextWeekDays = () => {
    const dates = [];
    let d = new Date();
    d.setDate(d.getDate() + 1);
    while (dates.length < 5) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) dates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  };
  const formatDateParam = (date: Date) => date.toISOString().split('T')[0];
  const getNextMonthFirstDay = () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toLocaleDateString('fr-CH');
  };

  // --- EFFECTS ---

  // 1. Scroll automatique
  useEffect(() => {
    if (isFinalizing) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 100);
    }
  }, [isFinalizing, currentStep]);

  // 2. Fetch Benchmarks
  useEffect(() => {
  const fetchModels = async () => {
    const snap = await getDocs(collection(db, "learner_models_3a"));
    setBenchmarks(
      snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as unknown as ProviderModelDoc[]
    );
  };
  fetchModels();
}, []);

  // 3. Charger les slots Calendar
  useEffect(() => {
    if (currentStep === 8 && bookingDate) {
      const load = async () => {
        setLoadingSlots(true);
        setSelectedSlot(null);
        try {
          const res = await fetch(`/api/3a-simulator/slots?date=${formatDateParam(bookingDate)}`);
          const data = await res.json();
          if (data.ok) setAvailableSlots(data.available);
        } catch(e) { toast.error("Erreur planning"); }
        finally { setLoadingSlots(false); }
      };
      load();
    }
  }, [bookingDate, currentStep]);

  // 4. Initialisation Google Maps (Logique)
  const initAutocomplete = () => {
    const win = window as any;
    if (!addressInputRef.current || !win.google) return;
    
    const autocomplete = new win.google.maps.places.Autocomplete(addressInputRef.current, {
      componentRestrictions: { country: "ch" },
      fields: ["address_components", "formatted_address"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      let npa = "";
      let city = "";
      place.address_components?.forEach((c: any) => {
        if (c.types.includes("postal_code")) npa = c.long_name;
        if (c.types.includes("locality")) city = c.long_name;
      });
      setFormData(prev => ({
        ...prev,
        address: place.formatted_address || "",
        npa: npa,
        city: city
      }));
    });
  };

  // 5. Chargement Script Google Maps (CORRIGÉ & ROBUSTE)
  useEffect(() => {
    if (currentStep !== 3) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const win = window as any;
    
    const runInit = () => {
      if (win.google && addressInputRef.current) initAutocomplete();
    };

    if (win.google) {
      runInit();
      return;
    }

    const existingScript = document.querySelector(`script[src*="maps.googleapis.com/maps/api/js"]`) as HTMLScriptElement | null;
    
    if (existingScript) {
      existingScript.addEventListener('load', runInit);
      return () => {
        existingScript.removeEventListener('load', runInit);
      };
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = runInit;
    document.head.appendChild(script);
  }, [currentStep]);

  // 6. Chargement jsPDF (Lazy load)
  useEffect(() => {
    const win = window as any;
    if (isFinalizing && typeof win !== "undefined" && !win.jspdf) {
      const jspdfScript = document.createElement("script");
      jspdfScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      document.head.appendChild(jspdfScript);

      const autotableScript = document.createElement("script");
      autotableScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js";
      document.head.appendChild(autotableScript);
    }
  }, [isFinalizing]);


  // --- ACTIONS ---

  const handleBookSlot = async () => {
    if (!selectedSlot || !formData.firstName || !formData.phone) {
      toast.error("Nom et Téléphone requis");
      return;
    }
    setBookingLoading(true);
    try {
      const res = await fetch('/api/3a-simulator/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${formData.firstName} ${formData.lastName}`,
          phone: formData.phone,
          email: formData.email,
          start: selectedSlot.start,
          end: selectedSlot.end,
          details: selectedOffer
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error("Créneau pris");

      await addDoc(collection(db, "leads-3a"), {
        createdAt: serverTimestamp(),
        status: "rappel_programme",
        type: "rappel",
        client: formData,
        offreConcernee: selectedOffer,
        rdv: {
          start: selectedSlot.start,
          end: selectedSlot.end,
          eventId: data.eventId
        }
      });

      toast.success("Rappel confirmé !");
      setCurrentStep(6);
    } catch (e) {
      toast.error("Erreur technique ou créneau indisponible");
    } finally {
      setBookingLoading(false);
    }
  };

  const handleReset = () => {
    setProfile(initialProfile);
    setResults([]);
    setSelectedOffer(null);
    setIsFinalizing(false);
    setCurrentStep(1);
    toast.info("Formulaire réinitialisé");
  };

  const handleSimulate = () => {
    if (benchmarks.length === 0) return toast.error("Modèles indisponibles. Recalculer dans l’admin.");
    
    setIsSimulating(true);
    setResults([]);
    setSelectedOffer(null);

    // Scroll vers loader
    setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);

    setTimeout(() => {
      const simResults = simulateThreeAFromModels(profile, benchmarks);
      const filteredResults = simResults.filter(r => 
        ALLOWED_PROVIDERS_KEYS.some((k: string) => k.toLowerCase() === r.provider.toLowerCase())
      );
      const sortedResults = filteredResults.sort((a, b) => b.moneyLifeScore - a.moneyLifeScore);
      setResults(sortedResults);
      if (sortedResults.length > 0) setSelectedOffer(sortedResults[0].provider);
      setIsSimulating(false);
      toast.success("Analyse terminée");
      setTimeout(() => {
        if (resultsRef.current) {
          resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }, 2000);
  };
  const generatePDF = () => {
    if (!selectedResult) {
      toast.error("Données manquantes pour le PDF");
      return;
    }

    const doc = new jsPDF();
    const updatedResults = simulateThreeAFromModels(profile, benchmarks);
    const currentOffer = updatedResults.find(r => r.provider === selectedOffer) || selectedResult;
    const formatCH = (num: number) => Math.round(num).toLocaleString('fr-CH').replace(/\s/g, "'");
    const logoUrl = "/logo_ml_light_mode.png"; 

    try {
      doc.addImage(logoUrl, 'PNG', 14, 10, 50, 16.8);
    } catch (e) {
      console.error("Erreur logo:", e);
      doc.setFillColor(37, 99, 235);
      doc.rect(14, 10, 2, 16.8, 'F');
    }

    const title = showComparison ? "COMPARATIF & OPTIMISATION 3A" : "OFFRE DE PRÉVOYANCE 3A";
    
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235);
    doc.text(title, 14, 38);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Document généré le ${new Date().toLocaleDateString('fr-CH')}`, 14, 44);

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text("DONNÉES DU PROJET", 14, 58);
    doc.setDrawColor(230);
    doc.line(14, 60, 196, 60);

    doc.setFontSize(10);
    doc.text(`Assuré : ${profile.gender === "M" ? "Monsieur" : "Madame"} ${formData.firstName} ${formData.lastName}`, 14, 68);
    doc.text(`Profession : ${formData.profession || "Non spécifiée"}`, 14, 75);
    doc.text(`Date de naissance : ${formData.birthDate ? new Date(formData.birthDate).toLocaleDateString('fr-CH') : "-"}`, 14, 82);
    doc.text(`Adresse : ${formData.address}, ${formData.npa} ${formData.city}`, 14, 89);

    let startY = 105;

    if (showComparison) {
      const mlPremiumAnn = profile.targetMonthlyPremium * 12;
      const gainCap = currentOffer.projectedCapital - currentContract.projectedCapital;

      const compareRows = [
        ["Compagnie", currentContract.provider || "Actuelle", "XXXX"],
        ["Prime Annuelle", `${formatCH(currentContract.annualPremium)} CHF`, `${formatCH(mlPremiumAnn)} CHF`],
        ["Capital Décès", `${formatCH(currentContract.deathCapital)} CHF`, `${formatCH(currentOffer.deathCapital)} CHF`],
        ["Rente Invalidité", `${formatCH(currentContract.disabilityRente)} CHF`, `${formatCH(currentOffer.disabilityRente)} CHF`],
        ["CAPITAL TERME", `${formatCH(currentContract.projectedCapital)} CHF`, `${formatCH(currentOffer.projectedCapital)} CHF`],
      ];

      autoTable(doc, {
        startY: startY,
        head: [['Paramètre', 'Situation Actuelle', 'Solution MoneyLife']],
        body: compareRows,
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139], textColor: 255 },
        columnStyles: { 
          0: { fontStyle: 'bold' },
          2: { fillColor: [239, 246, 255], textColor: [37, 99, 235], fontStyle: 'bold' }
        }
      });

      startY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFillColor(37, 99, 235);
      doc.rect(14, startY, 182, 20, 'F');
      doc.setTextColor(255);
      doc.setFontSize(14);
      doc.text(`GAIN EN CAPITAL ESTIMÉ : + ${formatCH(gainCap)} CHF`, 105, startY + 13, { align: "center" });
      startY += 30;
    } else {
      const offerRows = [
        ["Compagnie sélectionnée", "XXXX"],
        ["Début des investissements", getNextMonthFirstDay()],
        ["Versement mensuel", `${formatCH(profile.targetMonthlyPremium)} CHF`],
        ["Capital net estimé à 65 ans", `${formatCH(currentOffer.projectedCapital)} CHF`],
        ["Couverture en cas de Décès", `${formatCH(currentOffer.deathCapital)} CHF`],
        ["Rente Invalidité (mensuelle)", `${formatCH(currentOffer.disabilityRente / 12)} CHF`]
      ];

      autoTable(doc, {
        startY: startY,
        head: [['Désignation', 'Détails du contrat']],
        body: offerRows,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], fontSize: 11 },
        styles: { cellPadding: 5, fontSize: 10 }
      });
      startY = (doc as any).lastAutoTable.finalY + 20;
    }

    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text("INFORMATIONS IMPORTANTES", 14, startY);
    doc.setFontSize(9);
    doc.setTextColor(100);
    const legalText = [
      "• Cette offre est basée sur une projection de rendement de " + (currentOffer.yieldUsed || "0") + "%.",
      "• Les montants de couvertures sont sujets à l'acceptation médicale de la compagnie.",
      "• MoneyLife s'efforce de fournir les calculs les plus précis selon les benchmarks actuels.",
      "• Seule l'offre ferme émise par la compagnie d'assurance après analyse du dossier fera foi juridiquement."
    ];
    doc.text(legalText, 14, startY + 8);
    doc.save(`Offre_MoneyLife_${formData.lastName}.pdf`);
  };

  const canGoToNextStep = () => {
    if (currentStep === 1) {
      if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.profession.trim() || !formData.birthDate) {
        toast.error("Veuillez remplir tous les champs obligatoires");
        return false;
      }
      if (formData.nationality !== "CH" && !formData.permitType) {
        toast.error("Veuillez sélectionner votre autorisation de séjour");
        return false;
      }
    }
    if (currentStep === 3) {
      if (!formData.address.trim() || !formData.npa.trim() || !formData.city.trim() || !formData.email.trim()) {
        toast.error("Veuillez remplir toutes les coordonnées");
        return false;
      }
      if (!formData.email.includes("@") || !formData.email.includes(".")) {
        toast.error("Format d'email invalide");
        return false;
      }
    }
    return true;
  };

  const saveLeadToFirebase = async () => {
    try {
      const loadingToast = toast.loading("Enregistrement de votre dossier...");
      const leadData = {
        createdAt: serverTimestamp(),
        status: "nouveau",
        type: showComparison ? "comparatif" : "standard",
        client: {
          ...formData,
          gender: profile.gender,
          age: profile.age
        },
        contratActuel: showComparison ? currentContract : null,
        offreSelectionnee: {
          compagnie: selectedOffer,
          budgetMensuel: profile.targetMonthlyPremium,
          capital65ans: currentOffer?.projectedCapital,
          capitalDeces: currentOffer?.deathCapital,
          renteInvaliditeMensuelle: (currentOffer?.disabilityRente || 0) / 12,
          transfertInitial: profile.initialCapital || 0
        },
        sante: {
          isSmoker: profile.isSmoker,
          capaciteTravail: (document.getElementById('h1') as any)?.checked || false,
          interventionsChirurgicales: (document.getElementById('h2') as any)?.checked || false,
          affectionsChroniques: (document.getElementById('h3') as any)?.checked || false,
          notes: (document.querySelector('textarea') as any)?.value || ""
        }
      };
      await addDoc(collection(db, "leads-3a"), leadData);
      toast.dismiss(loadingToast);
      setCurrentStep(6);
    } catch (error) {
      console.error("Erreur Firebase:", error);
      toast.error("Une erreur est survenue.");
    }
  };

  const selectedResult = results.find(r => r.provider === selectedOffer);
  const dynamicResults = simulateThreeAFromModels(profile, benchmarks);
  const currentOffer = dynamicResults.find(r => r.provider === selectedOffer) || selectedResult;

  const animationStyles = (
    <style>{`
      @keyframes softFadeIn { from { opacity: 0; transform: scale(0.99); } to { opacity: 1; transform: scale(1); } }
      @keyframes slideUpElegant { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
      .animate-simulator { animation: softFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .animate-form { animation: slideUpElegant 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    `}</style>
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8">
      {animationStyles}
      <div className="pb-6 text-center sm:text-left">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Comparateur 3a</h1>
        <p className="text-slate-500 text-xs font-medium mt-1">
          Analysez le marché en temps réel. <span className="text-blue-600 font-bold">Trouvez le meilleur produit.</span>
        </p>
      </div>

      {!isFinalizing ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-simulator">
          {/* --- COLONNE GAUCHE : PARAMÈTRES (DESIGN PREMIUM) --- */}

<div className="lg:col-span-4 space-y-6">
  
  {/* 1. CARTE PROFIL */}
  <Card className="border-0 shadow-sm ring-1 ring-slate-100 overflow-hidden bg-white">
    <CardHeader className="py-4 px-5 bg-slate-50/50 border-b border-slate-100">
      <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
        <User size={18} className="text-slate-500" /> Votre Profil
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-5 pt-5 px-5 pb-5">
      
      {/* LIGNE 1 : AGE & SEXE */}
      <div className="grid grid-cols-2 gap-4">
        {/* AGE */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-500 uppercase">Âge</Label>
          <div className="relative">
            <Input 
              type="number" min={18} max={60} 
              className="pl-4 pr-10 h-12 text-base font-bold text-slate-900 border-slate-200 focus:ring-blue-500 bg-slate-50/30"
              value={profile.age || ""} 
              onChange={e => setProfile({...profile, age: parseInt(e.target.value) || 0})} 
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">ans</span>
          </div>
        </div>

        {/* SEXE */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-500 uppercase">Sexe</Label>
          <div className="flex bg-slate-100 p-1 rounded-lg h-12">
            <button
              onClick={() => setProfile({...profile, gender: 'M'})}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md text-sm font-bold transition-all ${
                profile.gender === 'M' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Mars size={16} className={profile.gender === 'M' ? "fill-blue-600" : ""} /> M
            </button>
            <button
              onClick={() => setProfile({...profile, gender: 'F'})}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md text-sm font-bold transition-all ${
                profile.gender === 'F' ? 'bg-white text-pink-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Venus size={16} className={profile.gender === 'F' ? "fill-pink-600" : ""} /> F
            </button>
          </div>
        </div>
      </div>

      {/* LIGNE 2 : TABAGISME */}
      <div 
        className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
          profile.isSmoker ? 'border-red-100 bg-red-50/40' : 'border-slate-100 hover:border-slate-200'
        }`}
        onClick={() => setProfile({...profile, isSmoker: !profile.isSmoker})}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${profile.isSmoker ? 'bg-red-100 text-red-500' : 'bg-slate-100 text-slate-400'}`}>
            <HeartPulse size={20} className={profile.isSmoker ? "text-red-500" : ""} />
          </div>
          <div className="space-y-0.5">
            <span className={`text-sm font-bold ${profile.isSmoker ? 'text-red-900' : 'text-slate-600'}`}>
              {profile.isSmoker ? "Fumeur" : "Non-fumeur"}
            </span>
            <p className="text-xs text-slate-400 font-medium">Tabac ou cigarette élec.</p>
          </div>
        </div>
        <Switch checked={profile.isSmoker} onCheckedChange={() => {}} className="data-[state=checked]:bg-red-500 scale-110" />
      </div>

    </CardContent>
  </Card>

  {/* 2. CARTE ÉPARGNE MENSUELLE (BUDGET) */}
  <Card className="border-0 shadow-lg shadow-blue-100 ring-1 ring-blue-50 overflow-hidden relative bg-white">
    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600"></div>
    <CardHeader className="py-4 px-5 border-b border-blue-50/50">
      <CardTitle className="text-sm font-black text-blue-900 uppercase tracking-widest flex items-center gap-2">
        <PiggyBank size={20} className="text-blue-600" /> Épargne Mensuelle
      </CardTitle>
    </CardHeader>
    <CardContent className="pt-5 px-5 pb-5">
      <div className="relative">
        <Input 
          type="number" min={100} max={604} 
          className="h-16 pl-5 pr-14 text-3xl font-black text-blue-900 bg-blue-50/30 border-blue-100 focus:border-blue-500 focus:ring-blue-200"
          placeholder="300"
          value={profile.targetMonthlyPremium || ""} 
          onChange={e => setProfile({...profile, targetMonthlyPremium: parseFloat(e.target.value) || 0})} 
        />
        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-blue-400">CHF</span>
      </div>
      <p className="text-xs font-medium text-slate-400 mt-2 text-right">Max fiscal 2025 : 604.80 CHF</p>
    </CardContent>
  </Card>

  {/* 3. CARTE TRANSFERT */}
  <Card className="border-0 shadow-sm ring-1 ring-slate-100 overflow-hidden bg-white">
    <CardHeader className="py-4 px-5 bg-slate-50/50 border-b border-slate-100">
      <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
        <ArrowRightLeft size={18} className="text-slate-500" /> Transfert Existant
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4 pt-5 px-5 pb-5">
      <div className="relative">
        <Input 
          type="number" 
          className="pl-5 pr-14 h-14 text-lg font-bold text-slate-700 border-slate-200 focus:ring-blue-500"
          placeholder="0"
          value={profile.initialCapital || ""} 
          onChange={e => setProfile({...profile, initialCapital: parseFloat(e.target.value) || 0})} 
        />
        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">CHF</span>
      </div>
      <div className="flex gap-3 items-start bg-slate-50 p-3 rounded-lg text-xs text-slate-500 leading-relaxed">
        <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
        <p>Si vous avez déjà un compte 3a ailleurs, indiquez le montant ici pour simuler son transfert.</p>
      </div>
    </CardContent>
  </Card>

  {/* 4. CARTE PROTECTIONS */}
  <Card className="border-0 shadow-xl shadow-slate-200/60 ring-1 ring-slate-100 bg-white">
    <CardHeader className="py-4 px-5 border-b border-slate-50">
      <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
        <ShieldCheck size={18} className="text-emerald-500" /> Protections
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-7 pt-6 px-5 pb-6">
      
      {/* SLIDERS */}
      <div className="space-y-6">
        <div className="space-y-2.5">
          <div className="flex justify-between items-baseline">
            <Label className="text-xs font-bold text-slate-500 uppercase">Capital Décès</Label>
            <span className="text-sm font-black text-slate-800">{(profile.desiredDeathCapital || 0).toLocaleString()} CHF</span>
          </div>
          <input 
            type="range" min="0" max="500000" step="10000" 
            className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900"
            value={profile.desiredDeathCapital || 0}
            onChange={e => setProfile({...profile, desiredDeathCapital: parseFloat(e.target.value)})}
          />
        </div>

        <div className="space-y-2.5">
          <div className="flex justify-between items-baseline">
            <Label className="text-xs font-bold text-slate-500 uppercase">Rente Invalidité / an</Label>
            <span className="text-sm font-black text-slate-800">{(profile.desiredDisabilityRente || 0).toLocaleString()} CHF</span>
          </div>
          <input 
            type="range" min="0" max="60000" step="1000" 
            className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900"
            value={profile.desiredDisabilityRente || 0}
            onChange={e => setProfile({...profile, desiredDisabilityRente: parseFloat(e.target.value)})}
          />
        </div>
      </div>

      {/* INCLUSION (CHECK) */}
      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
        <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <span className="text-sm font-bold text-emerald-900 block">Libération des primes (incl.)</span>
          <span className="text-xs text-emerald-700 block mt-0.5">L'assurance paie vos primes si vous ne pouvez plus travailler (maladie/accident).</span>
        </div>
      </div>

      {/* BOUTONS D'ACTION */}
      <div className="pt-4 flex gap-4">
        <Button 
          variant="outline" 
          className="flex-1 h-14 text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-wider border-slate-200" 
          onClick={handleReset}
        >
          Effacer
        </Button>
        <Button 
          className="flex-[2] h-14 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5" 
          onClick={handleSimulate}
        >
          Comparer <ArrowRight size={18} className="ml-2" />
        </Button>
      </div>

    </CardContent>
  </Card>

</div>

          <div ref={resultsRef} className="lg:col-span-8 space-y-6 scroll-mt-24">
            {isSimulating ? (
              <div className="h-full flex flex-col items-center justify-center py-20 bg-muted/20 border-2 border-dashed rounded-3xl">
                <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <p className="mt-6 text-sm font-bold tracking-widest text-primary animate-pulse uppercase">Analyse en cours...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-3xl opacity-40">
                <Zap size={48} className="mb-4" />
                <p className="font-medium">Saisissez un profil pour lancer la comparaison</p>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Trophy className="text-yellow-500 fill-yellow-500/20" size={20} />
                    Top {results.length} des meilleures offres
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                    Sélection Indépendante
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {results.map((res, i) => (
    <Card 
      key={`${res.provider}-${i}`} 
      onClick={() => setSelectedOffer(res.provider)} 
      className={`relative overflow-hidden transition-all duration-500 cursor-pointer group border-2 ${selectedOffer === res.provider ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-2xl scale-[1.02] bg-blue-50/5' : 'border-transparent hover:border-muted-foreground/20 shadow-md'}`}
    >
      {i === 0 && <div className="absolute top-0 right-0 z-10"><div className="bg-primary text-white text-[10px] font-black px-4 py-1.5 rounded-bl-xl flex items-center gap-1.5 tracking-widest uppercase"><Zap size={10} fill="currentColor" /> Choix MoneyLife</div></div>}
      
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="text-blue-600" size={18} />
            <div className="flex items-center gap-2 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Compagnie d'assurance</span>
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 font-medium italic tracking-wide">Solution de prévoyance sélectionnée</p>
      </CardHeader>
  
  <CardContent className="space-y-4">
    {/* 1. Section Capital & Rendement & Score */}
    <div className="flex justify-between items-start border-b border-slate-100 pb-4">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase font-bold text-slate-500">Capital estimé à 65 ans</Label>
        <p className="text-2xl font-black text-emerald-600 leading-none">
          {Math.round(res.projectedCapital).toLocaleString()} CHF
        </p>
        <p className="text-[10px] text-slate-400 font-medium">
          Calculé avec un rendement de {res.yieldUsed}% par an
        </p>
      </div>
      
      <div className="text-right">
        <Label className="text-[10px] uppercase font-bold text-slate-500">Score Global</Label>
        <p className="text-sm font-bold text-blue-600">{res.moneyLifeScore}/100</p>
      </div>
    </div>

    {/* 2. --- NOUVEAU BLOC : ANALYSE DES FRAIS (C'est ici qu'il manquait) --- */}
    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Amortissement des frais</span>
        <div className="flex items-center gap-1.5">
          {/* Logique couleur : Vert (Rapide) / Bleu (Moyen) / Gris (Long - pas de rouge) */}
          <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
            (res.breakEvenYear || 20) <= 2 ? "bg-emerald-100 text-emerald-700" :
            (res.breakEvenYear || 20) <= 5 ? "bg-blue-50 text-blue-700" :
            "bg-slate-200 text-slate-600"
          }`}>
            {res.breakEvenYear && res.breakEvenYear <= 1 ? "Immédiat" : 
             res.breakEvenYear ? `${res.breakEvenYear} ans` : "> 10 ans"}
          </span>
          <Info size={12} className="text-slate-300" />
        </div>
      </div>
    </div>

    {/* 3. Section Risques (Affichée uniquement si montants > 0) */}
    {(res.deathCapital > 0 || res.disabilityRente > 0) && (
      <div className="grid grid-cols-2 gap-2 pt-1">
        {res.deathCapital > 0 && (
          <div className="bg-white border border-slate-100 p-2 rounded-lg">
            <span className="block text-[9px] font-bold text-slate-400 uppercase">Décès</span>
            <span className="font-bold text-sm text-slate-700">{res.deathCapital.toLocaleString()}</span>
          </div>
        )}
        {res.disabilityRente > 0 && (
          <div className="bg-white border border-slate-100 p-2 rounded-lg">
            <span className="block text-[9px] font-bold text-slate-400 uppercase">Invalidité</span>
            <span className="font-bold text-sm text-slate-700">{res.disabilityRente.toLocaleString()}</span>
          </div>
        )}
      </div>
    )}

    <Button 
      variant={selectedOffer === res.provider ? "default" : "outline"} 
      onClick={(e) => { 
        e.stopPropagation(); 
        setSelectedOffer(res.provider); 
        setCurrentStep(0);
        setTimeout(() => setIsFinalizing(true), 150); 
      }} 
      className={`w-full mt-2 transition-all duration-300 font-bold ${selectedOffer === res.provider ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg translate-y-[-2px]' : ''}`}
    >
      Voir détails <ArrowRight size={16} className="ml-2" />
    </Button>
  </CardContent>
</Card>
    
))}
</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto animate-form pb-20">
          
          {/* --- STEP 0 : DÉTAILS DE L'OFFRE --- */}
          {currentStep === 0 && currentOffer ? (
            <Card className="border shadow-2xl overflow-hidden bg-white">
              <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="sm" onClick={() => setIsFinalizing(false)} className="text-slate-500 hover:text-slate-800">
                    <ArrowLeft size={16} className="mr-2"/> Retour
                  </Button>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Analyse de la solution</p>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-slate-900">Offre Partenaire</h2>
                      <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100 text-[10px] font-bold uppercase tracking-wider">
                        Officiel
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 sm:p-8 space-y-8">
                
                {/* 1. CHIFFRES CLÉS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                    <p className="text-xs font-bold text-blue-800 uppercase mb-1">Capital à 65 ans (est.)</p>
                    <p className="text-2xl font-black text-blue-700">{Math.round(currentOffer.projectedCapital).toLocaleString()} CHF</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Prime Mensuelle</p>
                    <p className="text-xl font-black text-slate-900">{profile.targetMonthlyPremium} CHF</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Rendement Hist.</p>
                    <div className="flex items-center gap-2">
                      <TrendingUp size={20} className="text-emerald-500"/>
                      <p className="text-xl font-black text-slate-900">{currentOffer.yieldUsed}%</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-full ${
                      (currentOffer.breakEvenYear || 20) <= 2 ? "bg-emerald-100 text-emerald-600" :
                      (currentOffer.breakEvenYear || 20) <= 5 ? "bg-blue-100 text-blue-600" :
                      "bg-slate-100 text-slate-500"
                    }`}>
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 uppercase">Rentabilité des frais</h4>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Moment où la valeur de rachat dépasse le cumul de vos primes d'épargne investies.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span className={`text-lg font-black px-3 py-1 rounded-lg ${
                      (currentOffer.breakEvenYear || 20) <= 2 ? "bg-emerald-100 text-emerald-700" :
                      (currentOffer.breakEvenYear || 20) <= 5 ? "bg-blue-50 text-blue-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {currentOffer.breakEvenYear && currentOffer.breakEvenYear <= 1 ? "Immédiat" : 
                       currentOffer.breakEvenYear ? `${currentOffer.breakEvenYear} ans` : "> 10 ans"}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 mt-1">Hors coût du risque</span>
                  </div>
                </div>

                {/* 2. ANALYSE MONEYLIFE & RISQUE */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {results.length > 0 && results[0].provider === currentOffer.provider ? (
                      <>
                        <h3 className="font-bold text-sm uppercase flex items-center gap-2 text-slate-800">
                          <Zap size={16} className="text-yellow-500 fill-yellow-500" /> L'avis de l'Expert
                        </h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          L'algorithme MoneyLife a classé cette offre <strong>N°1</strong> pour son rapport performance/frais exceptionnel. C'est mathématiquement la solution la plus efficace pour votre profil aujourd'hui.
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="font-bold text-sm uppercase flex items-center gap-2 text-slate-800">
                          <User size={16} className="text-blue-500" /> Votre Sélection
                        </h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          Vous avez retenu l'offre d'un de nos <span className="text-blue-600 font-bold underline decoration-blue-200 underline-offset-4">Partenaires Agréés</span>. Bien que notre algorithme ait identifié une autre solution comme étant mathématiquement supérieure, celle-ci reste une <strong>alternative de qualité</strong> proposée par un partenaire de confiance.
                        </p>
                      </>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-bold text-sm uppercase flex items-center gap-2 text-slate-800">
                      <TrendingUp size={16} className="text-blue-500" /> Stratégie d'investissement
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Ce produit se base sur une gestion <strong>Balanced (Équilibrée)</strong>, cherchant le compromis idéal entre sécurité et croissance.
                      <br/><span className="text-xs italic text-slate-500">Note : Vous pourrez ajuster ce profil (plus prudent ou plus dynamique) lors de la finalisation du contrat.</span>
                    </p>
                  </div>
                </div>

                {/* 3. COUVERTURES ASSURANCE (LISTE EXHAUSTIVE) */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                  <h3 className="font-bold text-sm uppercase flex items-center gap-2 text-slate-800 border-b border-slate-200 pb-2">
                    <ShieldCheck size={16} className="text-emerald-600"/> Garanties de risques incluses
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* CAPITAL DÉCÈS */}
                    <div>
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-xs font-bold text-slate-500">Capital Décès</span>
                        <span className={`font-black ${currentOffer.deathCapital > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                          {currentOffer.deathCapital > 0 ? `${currentOffer.deathCapital.toLocaleString('fr-CH').replace(/\s/g, "'")} CHF` : 'Non inclus'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Capital versé aux bénéficiaires en cas de décès avant le terme du contrat.
                      </p>
                    </div>

                    {/* RENTE INVALIDITÉ */}
                    <div>
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-xs font-bold text-slate-500">Rente Invalidité</span>
                        <span className={`font-black ${currentOffer.disabilityRente > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                          {currentOffer.disabilityRente > 0 ? `${Math.round(currentOffer.disabilityRente).toLocaleString('fr-CH').replace(/\s/g, "'")} CHF / an` : 'Non inclus'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        {currentOffer.disabilityRente > 0 
                          ? `Soit environ ${Math.round(currentOffer.disabilityRente / 12).toLocaleString()} CHF par mois en cas d'incapacité de gain.` 
                          : "Rente versée en cas d'incapacité de gain pour maintenir votre niveau de vie."}
                      </p>
                    </div>
                  </div>

                  {/* LIBÉRATION DES PRIMES */}
                  <div className="pt-3 border-t border-slate-200/60 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-emerald-500"/> Libération des prime
                      </span>
                      <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">INCLUS</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      En cas d'incapacité de gain, la compagnie paie les primes à votre place pour garantir votre capital retraite.
                    </p>
                  </div>
                </div>

                {/* 4. CONFIANCE & LÉGAL */}
                <div className="bg-blue-600 text-white rounded-xl p-5 shadow-lg shadow-blue-200">
                  <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                    <div className="p-3 bg-white/10 rounded-full">
                      <ShieldCheck size={32} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm uppercase mb-1">Agréé FINMA  & Partenaire Officiel</h4>
                      <p className="text-xs text-blue-100 leading-relaxed opacity-90">
                        CreditX (moneylife.ch) est autorisé par l'Autorité fédérale de surveillance des marchés financiers (FINMA) Numéro FINMA F01536084. 
                        Nous travaillons en direct avec les <span className="text-600 font-bold decoration-blue-200 underline-offset-4">Compagnies d'assurance</span> pour garantir que cette offre est conforme aux standards suisses.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-center space-y-2 pt-2">
                  <p className="text-[10px] text-slate-400">
                    * Ces chiffres sont des projections basées sur les données actuelles. Seule une offre ferme émise après analyse fait foi.
                  </p>
                </div>

                {/* 5. ACTIONS */}
                <div className="flex flex-col gap-3 pt-2">
                  <Button 
                    size="lg" 
                    className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold shadow-xl rounded-xl gap-2 transition-all animate-in slide-in-from-bottom-2 fade-in"
                    onClick={() => setCurrentStep(1)}
                  >
                    <Mail size={20} /> Recevoir mon offre par email <ArrowRight size={20}/>
                  </Button>
                  
                  <Button 
                    variant="outline"
                    size="lg" 
                    className="w-full h-12 border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-xl gap-2"
                    onClick={() => {
                      if (!bookingDate) setBookingDate(getNextWeekDays()[0]);
                      setCurrentStep(8);
                    }}
                  >
                    <Phone size={18} /> Parler à un humain
                  </Button>
                </div>

              </CardContent>
            </Card>
          ) : currentStep === 8 ? (
            // --- STEP 8 : BOOKING ---
            <Card className="border shadow-2xl bg-white animate-in slide-in-from-right-4">
              <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(0)} className="text-slate-500">
                    <ArrowLeft size={16} className="mr-2"/> Retour
                  </Button>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Rappel téléphonique</p>
                    <h2 className="text-xl font-black text-slate-900">Programmer un échange</h2>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 sm:p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase">Prénom & Nom</Label>
                    <div className="flex gap-2">
                      <Input placeholder="Prénom" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="bg-white" />
                      <Input placeholder="Nom" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="bg-white" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase">Téléphone (Mobile)</Label>
                    <Input placeholder="079 123 45 67" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="bg-white" />
                  </div>
                </div>
                <div className="space-y-4">
                  <Label className="text-xs font-bold uppercase flex items-center gap-2"><CalendarIcon size={14}/> Choisir un jour</Label>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {getNextWeekDays().map(d => {
                      const isSelected = bookingDate && formatDateParam(bookingDate) === formatDateParam(d);
                      return (
                        <button key={d.toString()} onClick={() => setBookingDate(d)} className={`flex-shrink-0 w-20 h-20 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${isSelected ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-600 hover:border-slate-300'}`}>
                          <span className="text-[10px] font-bold uppercase">{d.toLocaleDateString('fr-FR', {weekday: 'short'})}</span>
                          <span className="text-xl font-black">{d.getDate()}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-4">
                  <Label className="text-xs font-bold uppercase flex items-center gap-2"><Clock size={14}/> Choisir l'heure (30 min)</Label>
                  {loadingSlots ? (
                    <div className="py-8 flex justify-center text-slate-400"><Loader2 className="animate-spin"/></div>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-center p-4 bg-slate-100 rounded-lg text-sm text-slate-500">Aucun créneau disponible ce jour-là.</div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {availableSlots.map((slot, i) => {
                        const timeStr = new Date(slot.start).toLocaleTimeString('fr-CH', {hour:'2-digit', minute:'2-digit'});
                        const isSel = selectedSlot?.start === slot.start;
                        return (
                          <button key={i} onClick={() => setSelectedSlot(slot)} className={`py-2 rounded-lg text-sm font-bold border transition-all ${isSel ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
                            {timeStr}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t border-slate-100">
                  <Button className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700" disabled={!selectedSlot || !formData.phone || bookingLoading} onClick={handleBookSlot}>
                    {bookingLoading ? <Loader2 className="animate-spin mr-2"/> : <CheckCircle2 className="mr-2"/>}
                    {bookingLoading ? "Confirmation..." : "Confirmer le rendez-vous"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            // --- LE FORMULAIRE CLASSIQUE (STEPS 1 à 6) ---
            <Card className="border shadow-2xl overflow-hidden bg-white">
              <div className="h-1.5 w-full bg-slate-100 flex">
                {[1, 2, 3, 4, 5].map(step => (
                  <div key={step} className={`flex-1 transition-all duration-500 ${currentStep >= step ? 'bg-blue-600' : 'bg-transparent'}`} />
                ))}
              </div>

              <CardHeader className="bg-white border-b border-slate-100 p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                  <Button 
                    variant="outline" 
                    className="h-10 border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0" 
                    onClick={() => currentStep > 1 ? setCurrentStep(v => v-1) : setIsFinalizing(false)}
                  >
                    <ArrowLeft size={16} className="mr-2"/> {currentStep === 1 ? 'Annuler' : 'Retour'}
                  </Button>
                  
                  <div className="text-center flex-1 sm:pr-24">
                    <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
                      Voir les détails de l'offre
                    </p>
                    <CardTitle className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                      {currentStep === 1 && "Profil de l'assuré"}
                      {currentStep === 2 && "Couvertures & Risques"}
                      {currentStep === 3 && "Coordonnées de contact"}
                      {currentStep === 4 && "Récapitulatif de l'offre"}
                      {currentStep === 5 && "Questionnaire de santé"}
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-8">
                {currentStep === 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-slate-500">Sexe</Label>
                      <select 
                        className="w-full h-12 rounded-md border border-slate-200 bg-background px-3 font-bold"
                        value={profile.gender}
                        onChange={e => setProfile({...profile, gender: e.target.value as any})}
                      >
                        <option value="M">Masculin</option>
                        <option value="F">Féminin</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-slate-500">Prénom <span className="text-red-500">*</span></Label>
                      <Input className="h-12 border-slate-200" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-slate-500">Nom de famille <span className="text-red-500">*</span></Label>
                      <Input className="h-12 border-slate-200" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-slate-500">Profession actuelle <span className="text-red-500">*</span></Label>
                      <Input 
                        placeholder="Ex: Comptable, Infirmier..." 
                        className="h-12 border-slate-200" 
                        value={formData.profession} 
                        onChange={e => setFormData({...formData, profession: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-slate-500">Date de naissance <span className="text-red-500">*</span></Label>
                      <Input type="date" className="h-12 border-slate-200" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                    </div>
                    
                    {/* SÉLECTEUR DE PAYS CORRIGÉ */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-slate-500">Nationalité</Label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xl z-10 pointer-events-none">
                          {COUNTRIES.find(c => c.code === formData.nationality)?.flag || "🏳️"}
                        </div>
                        <Input
                          className="h-12 border-slate-200 pl-12 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                          placeholder="Tapez le nom d'un pays..."
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          onFocus={() => setCountrySearch("")} 
                          onBlur={() => {
                            setTimeout(() => {
                              const current = COUNTRIES.find(c => c.code === formData.nationality);
                              if (current && !countrySearch) setCountrySearch(current.name);
                            }, 200);
                          }}
                        />
                        {countrySearch && !COUNTRIES.some(c => c.name === countrySearch && c.code === formData.nationality) && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1">
                            {COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase())).length > 0 ? (
                              COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase())).map(c => (
                                <div
                                  key={c.code}
                                  className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors"
                                  onMouseDown={(e) => {
                                    e.preventDefault(); 
                                    setFormData(prev => ({ ...prev, nationality: c.code }));
                                    setCountrySearch(c.name);
                                  }}
                                >
                                  <span className="text-xl">{c.flag}</span>
                                  <span className="text-sm font-bold text-slate-700">{c.name}</span>
                                </div>
                              ))
                            ) : (
                              <div className="p-4 text-xs text-slate-400 italic text-center">Aucun pays trouvé</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {formData.nationality !== "CH" && (
                      <div className="space-y-2 animate-in zoom-in-95">
                        <Label className="text-xs font-bold uppercase text-slate-500">Autorisation de séjour <span className="text-red-500">*</span></Label>
                        <Select value={formData.permitType} onValueChange={v => setFormData({...formData, permitType: v})}>
                          <SelectTrigger className="h-12 border-slate-200">
                            <SelectValue placeholder="Sélectionnez votre permis" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="B">Permis B (Autorisation de séjour)</SelectItem>
                            <SelectItem value="C">Permis C (Autorisation d'établissement)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {/* STEPS SUIVANTS INCHANGÉS */}
                {currentStep === 2 && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-6">
                      <h3 className="flex items-center gap-2 font-black text-slate-900 uppercase text-xs tracking-widest"><ShieldCheck size={16}/> Ajustement des couvertures</h3>
                      <div className="space-y-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center"><span className="text-sm font-bold text-slate-500">Capital Décès :</span><span className="font-black text-blue-600">{profile.desiredDeathCapital?.toLocaleString()} CHF</span></div>
                        <input type="range" min="0" max="1000000" step="10000" className="w-full accent-blue-600" value={profile.desiredDeathCapital || 0} onChange={e => setProfile({...profile, desiredDeathCapital: parseFloat(e.target.value)})} />
                      </div>
                      <div className="space-y-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center"><span className="text-sm font-bold text-slate-500">Rente Invalidité / an :</span><span className="font-black text-blue-600">{profile.desiredDisabilityRente?.toLocaleString()} CHF</span></div>
                        <input type="range" min="0" max="50000" step="1000" className="w-full accent-blue-600" value={profile.desiredDisabilityRente || 0} onChange={e => setProfile({...profile, desiredDisabilityRente: parseFloat(e.target.value)})} />
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase flex items-center gap-1 text-slate-500"><MapPin size={12}/> Adresse <span className="text-red-500">*</span></Label>
                      <Input ref={addressInputRef} placeholder="Rue et numéro" className="h-12 border-slate-200" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2"><Label className="text-xs font-bold uppercase text-slate-500">NPA <span className="text-red-500">*</span></Label><Input placeholder="1234" className="h-12 border-slate-200" value={formData.npa} onChange={e => setFormData({...formData, npa: e.target.value})} /></div>
                      <div className="col-span-2 space-y-2"><Label className="text-xs font-bold uppercase text-slate-500">Localité <span className="text-red-500">*</span></Label><Input placeholder="Ville" className="h-12 border-slate-200" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} /></div>
                    </div>
                    <div className="pt-6 border-t border-slate-100">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase flex items-center gap-1 text-slate-500"><Mail size={12}/> Votre Email <span className="text-red-500">*</span></Label>
                        <Input type="email" placeholder="client@email.ch" className="h-12 border-slate-200" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                        <p className="text-[10px] text-slate-400">Votre offre personnalisée sera envoyée à cette adresse.</p>
                      </div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
                      <div className="bg-white p-1.5 rounded-full h-fit shadow-sm"><ShieldCheck size={16} className="text-blue-600"/></div>
                      <div>
                        <h4 className="text-xs font-bold text-blue-900 uppercase mb-1">Pourquoi ces infos ?</h4>
                        <p className="text-[11px] text-blue-800 leading-relaxed">
                          Pour générer votre offre officielle auprès de la compagnie <strong>sélectionnée</strong>, nous avons besoin de vos coordonnées légales. 
                          Vos données ne sont <strong>jamais transmises</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 4 && currentOffer && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="border-t-4 border-blue-600 pt-6 relative">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                          {showComparison ? "Votre Comparatif" : "Votre Offre Personnalisée"}
                        </h2>
                        <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={generatePDF}>
                          <FileText size={16} className="mr-2" /> Télécharger PDF
                        </Button>
                      </div>

                      {showComparison ? (
                        <div className="space-y-6">
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="col-span-1 text-left"><span className="text-xs font-bold uppercase text-slate-400">Paramètre</span></div>
                            <div className="bg-slate-100 rounded-t-lg py-1"><span className="text-[10px] font-black uppercase text-slate-600">{currentContract.provider || "Actuel"}</span></div>
                            <div className="bg-blue-600 rounded-t-lg py-1">
                            <span className="text-[10px] font-black uppercase text-white flex justify-center gap-1">
                              MoneyLife (<span className="blur-[3px] select-none">{selectedOffer}</span>)
                            </span>
                          </div>
                          </div>

                          {[
                            { l: "Prime Annuelle", v1: currentContract.annualPremium, v2: profile.targetMonthlyPremium * 12, inv: true },
                            { l: "Capital au Terme", v1: currentContract.projectedCapital, v2: currentOffer.projectedCapital, highlight: true },
                            { l: "Couverture Décès", v1: currentContract.deathCapital, v2: currentOffer.deathCapital },
                            { l: "Rente Invalidité", v1: currentContract.disabilityRente, v2: currentOffer.disabilityRente },
                          ].map((row, i) => {
                            const diff = row.v2 - row.v1;
                            const isBetter = row.inv ? diff < 0 : diff > 0;
                            return (
                              <div key={i} className="grid grid-cols-3 gap-4 items-center border-b border-slate-50 pb-2">
                                <div className="text-xs font-bold text-slate-600">{row.l}</div>
                                <div className="text-center text-sm font-medium text-slate-500">{Math.round(row.v1).toLocaleString('fr-CH')} CHF</div>
                                <div className={`text-center text-sm font-black ${row.highlight ? 'text-blue-600 text-lg' : 'text-slate-900'}`}>
                                  {Math.round(row.v2).toLocaleString('fr-CH')} CHF
                                  {diff !== 0 && (
                                    <div className={`text-[10px] font-bold ${isBetter ? 'text-green-600' : 'text-red-500'}`}>
                                      {diff > 0 ? '+' : ''}{Math.round(diff).toLocaleString('fr-CH')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          
                          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-4 text-center">
                            <p className="text-xs text-blue-800 uppercase font-bold mb-1">Gain potentiel en capital</p>
                            <p className="text-3xl font-black text-blue-600">
                              + {Math.round(currentOffer.projectedCapital - currentContract.projectedCapital).toLocaleString('fr-CH')} CHF
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="space-y-1">
                              <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">Identité & Profession</p>
                              <p className="text-lg font-black">{profile.gender === "M" ? "Monsieur" : "Madame"} {formData.firstName} {formData.lastName}</p>
                              <p className="text-sm text-slate-600 font-medium">{formData.profession || "Profession non spécifiée"}</p>
                              <p className="text-sm text-muted-foreground italic">Né(e) le {formData.birthDate ? new Date(formData.birthDate).toLocaleDateString('fr-CH') : ""}</p>
                            </div>
                            <div className="space-y-1 md:text-right">
                              <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">Contact & Domicile</p>
                              <p className="text-sm font-bold">{formData.email}</p>
                              <p className="text-sm">{formData.address}, {formData.npa} {formData.city}</p>
                              <p className="text-sm font-bold uppercase text-[10px]">Nationalité: {formData.nationality} {formData.permitType && `(Permis ${formData.permitType})`}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            {[
                              { label: "Début", val: getNextMonthFirstDay() },
                              { label: "Versement", val: `${profile.targetMonthlyPremium.toLocaleString('fr-CH').replace(/\s/g, "'")} CHF / mois` },
                              { label: "Capital net", val: `${Math.round(currentOffer.projectedCapital).toLocaleString('fr-CH').replace(/\s/g, "'")} CHF` },
                              { label: "Risque / mois", val: `${Math.round(currentOffer.annualRiskTotal / 12).toLocaleString('fr-CH').replace(/\s/g, "'")} CHF` }
                            ].map((item, idx) => (
                              <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">{item.label}</p>
                                <p className="text-base font-black text-slate-900">{item.val}</p>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-4 mb-8">
                            <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2"><ShieldCheck size={16} className="text-blue-600"/> Couvertures d'assurance</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="p-4 bg-white border border-slate-200 rounded-xl border-dashed">
                                <p className="text-[10px] font-bold uppercase text-slate-500">Versement décès avant 65 ans (Montant unique)</p>
                                <p className="text-xl font-black text-slate-900">{currentOffer.deathCapital.toLocaleString('fr-CH').replace(/\s/g, "'")} CHF</p>
                              </div>
                              <div className="p-4 bg-white border border-slate-200 rounded-xl border-dashed">
                                <p className="text-[10px] font-bold uppercase text-slate-500">Versement en cas d'incapacité de gain / mois</p>
                                <p className="text-xl font-black text-slate-900">{Math.round(currentOffer.disabilityRente / 12).toLocaleString('fr-CH').replace(/\s/g, "'")} CHF</p>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {currentStep === 5 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 items-start">
                      <ShieldAlert className="text-amber-600 shrink-0" size={20} />
                      <p className="text-xs text-amber-800 leading-relaxed"><strong>Déclaration médicale :</strong> Toute omission peut entraîner la suppression des prestations d'assurance.</p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border border-blue-100 bg-blue-50/30 rounded-xl">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-bold text-blue-900">Consommation de tabac</Label>
                          <p className="text-[10px] text-blue-600 italic">Êtes-vous fumeur ou l'avez-vous été dans les 12 derniers mois ?</p>
                        </div>
                        <Switch checked={profile.isSmoker} onCheckedChange={v => setProfile({...profile, isSmoker: v})} />
                      </div>

                      {[
                        { id: 'h1', t: "Êtes-vous actuellement en pleine capacité de travail ?" },
                        { id: 'h2', t: "Interventions chirurgicales ou hospitalisations (5 dernières années) ?" },
                        { id: 'h3', t: "Affections chroniques (Dos, Psychisme, Cœur, Diabète) ?" }
                      ].map(q => (
                        <div key={q.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                          <Label className="text-sm font-medium leading-tight max-w-[75%] text-slate-700">{q.t}</Label>
                          <Switch id={q.id} />
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <Label className="text-[10px] font-bold uppercase text-slate-500 block mb-2">Détails complémentaires</Label>
                      <textarea className="w-full bg-white border border-slate-200 rounded-md p-3 text-sm min-h-[80px] focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Précisez ici si nécessaire..." />
                    </div>
                  </div>
                )}

                {currentStep === 6 && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-500">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full p-8 sm:p-12 text-center space-y-8 animate-in slide-in-from-bottom-8 zoom-in-95 duration-500 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-green-500" />
                      <div className="inline-flex p-5 bg-green-50 rounded-full shadow-xl shadow-green-100/50">
                        <CheckCircle2 size={64} className="text-green-500 animate-pulse" strokeWidth={2.5} />
                      </div>
                      <h2 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                        {selectedSlot ? "C'est noté !" : "Félicitations !"}
                      </h2>
                      <div className="space-y-6">
                        {selectedSlot ? (
                          <>
                            <p className="text-lg font-bold text-slate-600 leading-snug">Votre demande de rappel a bien été enregistrée.</p>
                            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 space-y-1">
                              <p className="text-blue-600 font-bold text-xs uppercase tracking-wide mb-2">Un expert MoneyLife vous appellera le</p>
                              <p className="text-2xl font-black text-slate-900 capitalize">
                                {new Date(selectedSlot.start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                              </p>
                              <p className="text-3xl font-black text-blue-600">
                                à {new Date(selectedSlot.start).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className="text-xs text-slate-400 mt-4 font-medium">Sur le numéro : <strong>{formData.phone}</strong></p>
                            </div>
                            <p className="text-xs text-slate-400">Un email de confirmation vient de vous être envoyé.</p>
                          </>
                        ) : (
                          <>
                            <p className="text-xl font-bold text-slate-800 leading-snug">Votre demande a été transmise avec succès.</p>
                            <p className="text-base text-slate-600 font-medium leading-relaxed">
                              Un conseiller MoneyLife analyse votre dossier.
                              <span className="block mt-6 font-bold text-blue-700 bg-blue-50 p-4 rounded-xl border border-blue-100">
                                Vous recevrez votre offre ferme par email sous 24 heures.
                              </span>
                            </p>
                          </>
                        )}
                      </div>
                      <div className="pt-4">
                        <Button size="lg" variant="outline" onClick={handleReset} className="h-12 px-8 font-bold rounded-full border-2 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all">
                          Retour à l'accueil
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep < 6 && (
                  <div className="pt-10">
                    <Button 
                      className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-lg font-bold shadow-xl rounded-2xl gap-2 transition-all" 
                      onClick={() => {
                        if (!canGoToNextStep()) return;
                        if (currentStep < 5) {
                          setCurrentStep(v => v + 1);
                        } else {
                          saveLeadToFirebase();
                        }
                      }}
                    >
                      {currentStep === 4 ? "Continuer" : currentStep === 5 ? "Demander mon offre" : "Étape Suivante"} <ArrowRight size={20}/>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* --- FOOTER LÉGAL --- */}
      <div className="mt-12 border-t border-slate-200 pt-8 pb-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-2">MoneyLife.ch</p>
        <p className="text-[10px] text-slate-400 leading-relaxed max-w-4xl mx-auto px-6">
          Ce comparateur est fourni à titre indicatif. CreditX (exploitant Moneylife.ch) agit en qualité de courtier neutre et indépendant conformément à la LSA. 
          Les résultats présentés ne constituent pas une offre contractuelle ferme. L'acceptation finale et la tarification définitive restent soumises à l'analyse du risque (questionnaire médical et financier) par la compagnie d'assurance sélectionnée. 
          Les projections de capital et les estimations de primes sont calculées sur la base de paramètres de marché standard et d'hypothèses de rendement non garanties. 
          En validant votre demande, vous acceptez que vos données soient traitées confidentiellement pour l'établissement de votre dossier. 
          <br></br>CreditX Sàrl est agréé FINMA no F01536084 
        </p>
        <p className="text-[10px] text-slate-300 mt-4">
          © {new Date().getFullYear()} Creditx Sàrl - Exploitant Moneylife. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}
