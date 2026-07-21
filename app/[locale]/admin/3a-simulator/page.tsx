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
  CheckCircle2, Info
} from "lucide-react";

import Confetti from "react-confetti"; // <-- Animation
import jsPDF from "jspdf"; // <-- PDF Stable
import autoTable from "jspdf-autotable"; // <-- Tableaux PDF Stables
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

declare global {
  interface Window {
    google: any;
  }
}

const COUNTRIES = [
  { code: "CH", name: "Suisse", flag: "🇨🇭" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "IT", name: "Italie", flag: "🇮🇹" },
  { code: "DE", name: "Allemagne", flag: "🇩🇪" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "ES", name: "Espagne", flag: "🇪🇸" },
];

const initialProfile: ClientProfile = {
  age: 30,
  gender: "M",
  isSmoker: false,
  targetMonthlyPremium: 300,
  retirementAge: 65,
  desiredDeathCapital: 0,
  desiredDisabilityRente: 0
};

export default function ThreeASimulator() {
  const [benchmarks, setBenchmarks] = useState<ProviderModelDoc[]>([]);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [profile, setProfile] = useState<ClientProfile>(initialProfile);
  
  // --- NOUVEAU STATE POUR LE COMPARATIF ---
  const [showComparison, setShowComparison] = useState(false);
  const [currentContract, setCurrentContract] = useState({
    provider: "",
    startDate: "",
    endDate: "",
    annualPremium: 0,
    deathCapital: 0,
    disabilityRente: 0, // Rente annuelle
    projectedCapital: 0
  });

  const addressInputRef = useRef<HTMLInputElement>(null);

  const getNextMonthFirstDay = () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toLocaleDateString('fr-CH');
  };

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const win = window as any;
    
    const attemptInit = () => {
      if (win.google && currentStep === 3) {
        initAutocomplete();
      }
    };

    if (typeof win !== "undefined" && !win.google) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.onload = attemptInit;
      document.head.appendChild(script);
    } else {
      attemptInit();
    }

  }, [isFinalizing, currentStep]);

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

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    profession: "",
    birthDate: "",
    nationality: "CH",
    permitType: "",
    email: "",
    phone: "",
    address: "",
    npa: "",
    city: ""
  });

  const handleReset = () => {
    setProfile(initialProfile);
    setResults([]);
    setSelectedOffer(null);
    setIsFinalizing(false);
    setCurrentStep(1);
    toast.info("Formulaire réinitialisé");
  };

  useEffect(() => {
    const fetchBenches = async () => {
      const snap = await getDocs(collection(db, "learner_models_3a"));
      setBenchmarks(
  snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as unknown as ProviderModelDoc[]
);
    };
    fetchBenches();
  }, []);

  const handleSimulate = () => {
    if (benchmarks.length === 0) return toast.error("Analyse indisponible – données en cours d’actualisation");
    setIsSimulating(true);
    setResults([]);
    setSelectedOffer(null);
    setTimeout(() => {
      const simResults = simulateThreeAFromModels(profile, benchmarks);
      const sortedResults = simResults.sort((a, b) => b.moneyLifeScore - a.moneyLifeScore);
      setResults(sortedResults);
      if (sortedResults.length > 0) setSelectedOffer(sortedResults[0].provider);
      setIsSimulating(false);
      toast.success("Analyse terminée");
    }, 800); 
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

    // Titre dynamique selon le mode
    const title = showComparison ? "COMPARATIF & OPTIMISATION 3A" : "OFFRE DE PRÉVOYANCE 3A";
    
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235);
    doc.text(title, 14, 38);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Document généré le ${new Date().toLocaleDateString('fr-CH')}`, 14, 44);

    // Infos Client
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

    // --- TABLEAU : Si Comparatif activé ---
    if (showComparison) {
      const mlPremiumAnn = profile.targetMonthlyPremium * 12;
      const gainCap = currentOffer.projectedCapital - currentContract.projectedCapital;
      const diffPrem = mlPremiumAnn - currentContract.annualPremium;

      const compareRows = [
        ["Compagnie", currentContract.provider || "Actuelle", selectedOffer || "MoneyLife"],
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
        headStyles: { fillColor: [100, 116, 139], textColor: 255 }, // Gris pour l'entête
        columnStyles: { 
          0: { fontStyle: 'bold' },
          2: { fillColor: [239, 246, 255], textColor: [37, 99, 235], fontStyle: 'bold' } // Colonne MoneyLife en bleu
        }
      });

      startY = (doc as any).lastAutoTable.finalY + 15;

      // Bloc GAIN
      doc.setFillColor(37, 99, 235);
      doc.rect(14, startY, 182, 20, 'F');
      doc.setTextColor(255);
      doc.setFontSize(14);
      doc.text(`GAIN EN CAPITAL ESTIMÉ : + ${formatCH(gainCap)} CHF`, 105, startY + 13, { align: "center" });
      
      startY += 30;
    } 
    // --- TABLEAU : Si Mode Standard (Pas de comparatif) ---
    else {
      const offerRows = [
        ["Compagnie sélectionnée", ],
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

    // Notes légales
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text("INFORMATIONS IMPORTANTES", 14, startY);
    doc.setFontSize(9);
    doc.setTextColor(100);
    const legalText = [
      "• Cette offre est basée sur une projection de rendement de " + (currentOffer.yieldUsed || "0") + "%.",
      "• Les montants de couvertures sont sujets à l'acceptation médicale de la compagnie.",
      "• MoneyLife s'efforce de fournir les calculs les plus précis selon les benchmarks actuels.",
      "• Seule l'offre ferme émise par la compagnie après analyse du dossier fera foi juridiquement."
    ];
    doc.text(legalText, 14, startY + 8);
    
    doc.save(`Offre_MoneyLife_${formData.lastName}.pdf`);
  };

  const canGoToNextStep = () => {
    if (currentStep === 1) {
      if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.profession.trim() || !formData.birthDate) {
        toast.error("Veuillez remplir tous les champs obligatoires (Prénom, Nom, Profession, Date de naissance)");
        return false;
      }
      if (formData.nationality !== "CH" && !formData.permitType) {
        toast.error("Veuillez sélectionner votre autorisation de séjour");
        return false;
      }
    }
    if (currentStep === 3) {
      if (!formData.address.trim() || !formData.npa.trim() || !formData.city.trim() || !formData.email.trim() || !formData.phone.trim()) {
        toast.error("Veuillez remplir toutes les coordonnées (Adresse, NPA, Localité, Email, Téléphone)");
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
        type: showComparison ? "comparatif" : "standard", // Info utile pour le tri
        client: {
          ...formData,
          gender: profile.gender,
          age: profile.age
        },
        contratActuel: showComparison ? currentContract : null, // Sauvegarde des données actuelles
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
      toast.error("Une erreur est survenue lors de l'envoi. Veuillez réessayer.");
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
      <div className="flex items-center gap-4 border-b pb-6">
        <div className="p-2 bg-white border shadow-sm rounded-xl">
          <img src="/logoMoneyLifeIconeDark.svg" alt="MoneyLife Logo" className="w-12 h-12 object-contain" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Optimisateur de Prévoyance 3a</h1>
          <p className="text-blue-600 text-[10px] font-bold uppercase tracking-[0.15em]">Analysez, comparez et maximisez votre retraite</p>
        </div>
      </div>

      {!isFinalizing ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-simulator">
          {/* SIMULATEUR LEFT COL */}
          {/* SIMULATEUR LEFT COL */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. PROFIL CLIENT (Inputs au lieu de Sliders) */}
            <Card className="border-primary/20 shadow-sm">
              <CardHeader><CardTitle className="text-sm uppercase">Profil Client</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  
                  {/* AGE */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase">Âge actuel</Label>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number" 
                        min={18} max={50}
                        className="h-10 font-bold" 
                        placeholder="Age"
                        value={profile.age || ""} 
                        onChange={e => setProfile({...profile, age: e.target.value === '' ? 0 : parseInt(e.target.value)})} 
                      />
                      <span className="text-xs font-bold text-slate-400 w-8">ans</span>
                    </div>
                  </div>

                  {/* TRANSFERT */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase flex items-center gap-2"><PiggyBank size={14} /> Transfert 3a existant</Label>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number" 
                        min={0} max={100000}
                        className="h-10 font-bold" 
                        placeholder="0"
                        value={profile.initialCapital || ""} 
                        onChange={e => setProfile({...profile, initialCapital: e.target.value === '' ? 0 : parseFloat(e.target.value)})} 
                      />
                      <span className="text-xs font-bold text-slate-400 w-8">CHF</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs">Sexe</Label>
                    <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-bold" value={profile.gender} onChange={e => setProfile({...profile, gender: e.target.value as any})}><option value="M">Masculin</option><option value="F">Féminin</option></select>
                  </div>
                  <div className="flex items-center gap-3 pt-6 border rounded-md px-3">
                    <Label className="text-xs">Fumeur</Label>
                    <Switch checked={profile.isSmoker} onCheckedChange={v => setProfile({...profile, isSmoker: v})} />
                  </div>
                </div>

                {/* BUDGET */}
                <div className="space-y-2 pt-4 border-t">
                  <Label className="text-xs font-bold uppercase text-primary">Budget Mensuel</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      min={100} max={604.80}
                      className="h-10 font-black text-lg text-primary border-primary/30" 
                      placeholder="Montant"
                      value={profile.targetMonthlyPremium || ""} 
                      onChange={e => setProfile({...profile, targetMonthlyPremium: e.target.value === '' ? 0 : parseFloat(e.target.value)})} 
                    />
                    <span className="text-xs font-bold text-slate-400 w-8">CHF</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">Max légal: 604.80 CHF/mois</p>
                </div>
              </CardContent>
            </Card>

            {/* 2. COUVERTURES SPÉCIFIQUES (Inputs au lieu de Sliders) */}
            <Card>
              <CardHeader><CardTitle className="text-sm uppercase font-bold">Couvertures spécifiques</CardTitle></CardHeader>
              <CardContent className="space-y-6">
               
               {/* DECES */}
               <div className="space-y-2">
                 <Label className="text-xs font-bold uppercase">Capital Décès souhaité</Label>
                 <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      min={0} max={1000000}
                      className="h-10 font-bold" 
                      placeholder="0"
                      value={profile.desiredDeathCapital || ""} 
                      onChange={e => setProfile({...profile, desiredDeathCapital: e.target.value === '' ? 0 : parseFloat(e.target.value)})} 
                    />
                    <span className="text-xs font-bold text-slate-400 w-8">CHF</span>
                 </div>
               </div>

               {/* INVALIDITE */}
               <div className="space-y-2">
                 <Label className="text-xs font-bold uppercase">Rente Invalidité / an</Label>
                 <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      min={0} max={50000}
                      className="h-10 font-bold" 
                      placeholder="0"
                      value={profile.desiredDisabilityRente || ""} 
                      onChange={e => setProfile({...profile, desiredDisabilityRente: e.target.value === '' ? 0 : parseFloat(e.target.value)})} 
                    />
                    <span className="text-xs font-bold text-slate-400 w-8">CHF</span>
                 </div>
               </div>

               <div className="flex gap-2 pt-2">
                 <Button variant="outline" className="flex-1 h-12 text-xs uppercase font-bold tracking-wider" onClick={handleReset}>Réinitialiser</Button>
                 <Button className="flex-[2] h-12 shadow-md bg-primary hover:bg-primary/90" onClick={handleSimulate}>Afficher offres <ArrowRight size={16} className="ml-2" /></Button>
               </div>
              </CardContent>
            </Card>

            {/* 3. CARTE COMPARATIF */}
            <Card className={`transition-all duration-300 ${showComparison ? 'border-blue-500 shadow-md' : 'border-dashed opacity-80'}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm uppercase font-bold flex items-center gap-2">
                    <FileText size={16} /> J'ai déjà un 3ème pilier
                  </CardTitle>
                  <Switch checked={showComparison} onCheckedChange={setShowComparison} />
                </div>
              </CardHeader>
              {showComparison && (
                <CardContent className="space-y-4 animate-in slide-in-from-top-2">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-bold">Compagnie actuelle</Label>
                    <Input className="h-8 text-xs" placeholder="Ex: Swiss Life, AXA..." value={currentContract.provider} onChange={e => setCurrentContract({...currentContract, provider: e.target.value})} />
                  </div>
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-[10px] uppercase font-bold text-slate-600">Prime Annuelle Totale</Label>
                    <div className="flex gap-2 items-center">
                      <Input type="number" className="h-8 text-xs font-bold" value={currentContract.annualPremium || ''} onChange={e => setCurrentContract({...currentContract, annualPremium: parseFloat(e.target.value)})} />
                      <span className="text-xs font-bold text-slate-400">CHF</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-slate-600">Capital projeté (Terme)</Label>
                    <div className="flex gap-2 items-center">
                      <Input type="number" className="h-8 text-xs font-bold text-blue-600" value={currentContract.projectedCapital || ''} onChange={e => setCurrentContract({...currentContract, projectedCapital: parseFloat(e.target.value)})} />
                      <span className="text-xs font-bold text-slate-400">CHF</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                    <div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Décès</Label><Input type="number" className="h-8 text-xs" value={currentContract.deathCapital || ''} onChange={e => setCurrentContract({...currentContract, deathCapital: parseFloat(e.target.value)})} /></div>
                    <div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Rente Inv.</Label><Input type="number" className="h-8 text-xs" value={currentContract.disabilityRente || ''} onChange={e => setCurrentContract({...currentContract, disabilityRente: parseFloat(e.target.value)})} /></div>
                  </div>
                </CardContent>
              )}
            </Card>

          </div>
          <div className="lg:col-span-8 space-y-6">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {results.map((res, i) => (
    <Card 
      key={`${res.provider}-${i}`} // <--- CORRECTIF CLÉ UNIQUE
      onClick={() => setSelectedOffer(res.provider)} 
      className={`relative overflow-hidden transition-all duration-500 cursor-pointer group border-2 ${selectedOffer === res.provider ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-2xl scale-[1.02] bg-blue-50/5' : 'border-transparent hover:border-muted-foreground/20 shadow-md'}`}
    >
      {i === 0 && <div className="absolute top-0 right-0 z-10"><div className="bg-primary text-white text-[10px] font-black px-4 py-1.5 rounded-bl-xl flex items-center gap-1.5 tracking-widest uppercase"><Zap size={10} fill="currentColor" /> Choix MoneyLife</div></div>}
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2"><Landmark className="text-primary" size={18} /><CardTitle className="text-lg">{res.provider}</CardTitle></div>
        <p className="text-[11px] text-muted-foreground">{res.productName}</p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Section Capital & Rendement & Score */}
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

        {/* --- NOUVEAU BLOC : ANALYSE DES FRAIS & AMORTISSEMENT --- */}
        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Amortissement des frais</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
                (res.breakEvenYear || 20) <= 2 ? "bg-emerald-100 text-emerald-700" :
                (res.breakEvenYear || 20) <= 5 ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              }`}>
                {res.breakEvenYear && res.breakEvenYear <= 1 ? "Immédiat" : 
                 res.breakEvenYear ? `${res.breakEvenYear} ans` : "> 10 ans"}
              </span>
              <Info size={12} className="text-slate-300" />
            </div>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-400 block">Sur prime épargne</span>
            <span className="text-[9px] text-slate-500 italic">Risque exclu</span>
          </div>
        </div>

        {/* Section Risques (Affichée uniquement si montants > 0) */}
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
            setTimeout(() => setIsFinalizing(true), 150); 
          }} 
          className={`w-full mt-2 transition-all duration-300 font-bold ${selectedOffer === res.provider ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg translate-y-[-2px]' : ''}`}
        >
          Choisir cette offre <ArrowRight size={16} className="ml-2" />
        </Button>
      </CardContent>
    </Card>
  ))}
</div>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto animate-form pb-20">
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
                  <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Adhésion {selectedOffer}</p>
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
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-slate-500">Nationalité</Label>
                    <Select value={formData.nationality} onValueChange={v => setFormData({...formData, nationality: v})}>
                      <SelectTrigger className="h-12 border-slate-200"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase flex items-center gap-1 text-slate-500"><Mail size={12}/> Email <span className="text-red-500">*</span></Label>
                      <Input type="email" placeholder="client@email.ch" className="h-12 border-slate-200" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase flex items-center gap-1 text-slate-500"><Phone size={12}/> Mobile <span className="text-red-500">*</span></Label>
                      <Input type="tel" placeholder="+41 7x xxx xx xx" className="h-12 border-slate-200" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    </div>
                  </div>
                </div>
              )}

              {/* SLIDE 4 : RÉCAPITULATIF INTELLIGENT */}
              {currentStep === 4 && currentOffer && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="border-t-4 border-blue-600 pt-6 relative">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                        {showComparison ? "Analyse Comparative" : "Offre MoneyLife pour :"}
                      </h2>
                      <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={generatePDF}>
                        <FileText size={16} className="mr-2" /> Télécharger PDF
                      </Button>
                    </div>

                    {/* MODE COMPARATIF */}
                    {showComparison ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="col-span-1 text-left"><span className="text-xs font-bold uppercase text-slate-400">Paramètre</span></div>
                          <div className="bg-slate-100 rounded-t-lg py-1"><span className="text-[10px] font-black uppercase text-slate-600">{currentContract.provider || "Actuel"}</span></div>
                          <div className="bg-blue-600 rounded-t-lg py-1"><span className="text-[10px] font-black uppercase text-white">MoneyLife ({selectedOffer})</span></div>
                        </div>

                        {/* Lignes du tableau comparatif */}
                        {[
                          { l: "Prime Annuelle", v1: currentContract.annualPremium, v2: profile.targetMonthlyPremium * 12, inv: true }, // inv=true veut dire moins c'est mieux
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
                          <p className="text-xs text-blue-800 uppercase font-bold mb-1">Gain en capital estimé</p>
                          <p className="text-3xl font-black text-blue-600">
                            + {Math.round(currentOffer.projectedCapital - currentContract.projectedCapital).toLocaleString('fr-CH')} CHF
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* MODE STANDARD (Ton ancien code) */
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
                            <p className="text-sm font-bold">{formData.phone}</p>
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
                        <Switch />
                      </div>
                    ))}
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <Label className="text-[10px] font-bold uppercase text-slate-500 block mb-2">Détails complémentaires</Label>
                    <textarea className="w-full bg-white border border-slate-200 rounded-md p-3 text-sm min-h-[80px] focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Précisez ici si nécessaire..." />
                  </div>
                </div>
              )}

              {/* STEP 6 : SUCCÈS & CONFETTIS */}
              {currentStep === 6 && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white animate-in fade-in duration-700 p-4">
                  <Confetti recycle={false} numberOfPieces={800} gravity={0.2} />
                  
                  <div className="max-w-2xl w-full text-center space-y-8 animate-in slide-in-from-bottom-10 duration-1000 delay-200">
                    <div className="inline-flex p-6 bg-green-50 rounded-full shadow-2xl shadow-green-100 mb-6">
                      <CheckCircle2 size={120} className="text-green-500 animate-pulse" strokeWidth={1.5} />
                    </div>

                    <h2 className="text-5xl sm:text-7xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                      Félicitations !
                    </h2>

                    <div className="space-y-6 max-w-lg mx-auto">
                      <p className="text-2xl sm:text-3xl font-bold text-blue-600 leading-snug">
                        Votre demande a été transmise avec succès.
                      </p>
                      <p className="text-lg sm:text-xl text-slate-600 font-medium leading-relaxed">
                        Un conseiller MoneyLife analyse votre dossier.
                        <span className="block mt-4 font-black text-slate-900 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          Vous recevrez votre offre ferme par email sous <span className="text-blue-600 underline decoration-4 underline-offset-4 decoration-blue-200">24 heures</span>.
                        </span>
                      </p>
                    </div>

                    <div className="pt-8">
                      <Button 
                        size="lg" 
                        variant="outline" 
                        onClick={handleReset} 
                        className="h-14 px-10 text-lg font-bold rounded-full border-2 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all"
                      >
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
                {currentStep === 4 ? "Continuer" : currentStep === 5 ? "Finaliser et créer lead" : "Étape Suivante"} <ArrowRight size={20}/>
                </Button>
              </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}