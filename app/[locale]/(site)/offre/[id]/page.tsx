//app/(site)/offre/[id]/page.tsx
"use client";

import { useEffect, useState, use } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ShieldCheck, Zap, ArrowRight, Phone, 
  Loader2, CheckCircle2, FileText, HeartPulse, ShieldAlert, CalendarClock
} from "lucide-react";
import { toast } from "sonner";
import Confetti from "react-confetti";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ClientOfferPage({ params }: PageProps) {
  const { id } = use(params);

  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchLead = async () => {
      try {
        const docRef = doc(db, "leads-3a", id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setLead({ id: snap.id, ...snap.data() });
          if (snap.data().status === 'offre_acceptee') {
            setSuccess(true);
          }
        }
      } catch (e) {
        console.error("Erreur fetch:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchLead();
  }, [id]);

  const handleAcceptOffer = async () => {
    setIsAccepting(true);
    try {
      const docRef = doc(db, "leads-3a", id);
      await updateDoc(docRef, {
        status: "offre_acceptee",
        acceptedAt: serverTimestamp()
      });
      setSuccess(true);
      toast.success("Offre validée avec succès !");
    } catch (e) {
      toast.error("Erreur lors de la validation. Réessayez ou contactez-nous.");
    } finally {
      setIsAccepting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
      <Loader2 className="animate-spin text-blue-600" size={40} />
      <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Chargement de votre offre...</p>
    </div>
  );

  if (!lead || !lead.offreReelle) return (
    <div className="pt-40 text-center px-6">
      <h1 className="text-2xl font-black text-slate-900">Offre introuvable</h1>
      <p className="text-slate-500 mt-2">Ce lien semble invalide ou a expiré.</p>
    </div>
  );

  // --- ÉCRAN DE SUCCÈS & REDIRECTION RDV ---
  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center animate-in fade-in duration-700">
        <Confetti recycle={false} numberOfPieces={500} gravity={0.15} />
        
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-100/50">
          <CheckCircle2 size={48} className="text-green-600" />
        </div>
        
        <h1 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
          Excellent choix {lead.client?.firstName} !
        </h1>
        
        <p className="text-lg text-slate-600 max-w-lg mx-auto leading-relaxed mb-8">
          Votre accord pour l'offre <strong>{lead.offreReelle.compagnie}</strong> a bien été enregistré.
        </p>

        {/* Bloc d'instruction pour le RDV */}
        <div className="bg-blue-50 p-8 rounded-3xl border border-blue-100 max-w-xl w-full space-y-6 shadow-xl shadow-blue-100/50">
          <div className="flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full mx-auto mb-2">
            <CalendarClock size={24} />
          </div>
          
          <div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Dernière étape requise</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Pour finaliser votre dossier, nous devons impérativement <strong>valider votre profil de risque</strong> (questions médicales) et confirmer les détails pour la signature électronique.
            </p>
          </div>

          <Button size="lg" className="w-full h-16 text-lg font-black bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-200 rounded-xl transition-all hover:scale-[1.02]" asChild>
            <a href={`/rappel?leadId=${id}`}>
              <Phone className="mr-3" size={20}/> PROGRAMMER MON APPEL
            </a>
          </Button>
          
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Cet appel est nécessaire pour l'émission de la police
          </p>
        </div>
      </div>
    );
  }

  // --- ÉCRAN OFFRE (AVANT VALIDATION) ---
  return (
    <div className="max-w-4xl mx-auto pt-32 pb-20 px-6 space-y-8 animate-in slide-in-from-bottom-8 duration-700">
      
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex p-3 bg-blue-50 rounded-2xl text-blue-600 mb-2 shadow-sm">
          <Zap fill="currentColor" size={32} />
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-slate-900 uppercase tracking-tight">Votre offre personnalisée</h1>
        <p className="text-slate-500 font-medium">Préparée pour {lead.client?.firstName} {lead.client?.lastName}</p>
      </div>

      <Card className="border-none shadow-2xl overflow-hidden bg-white ring-1 ring-slate-200/60 rounded-3xl">
        <div className="h-3 w-full bg-gradient-to-r from-blue-600 to-cyan-500" />
        
        <CardContent className="p-8 md:p-12 space-y-10">
          
          {/* 1. PRINCIPALES INFOS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={14}/> Compagnie retenue
              </p>
              <p className="text-4xl font-black text-slate-900 tracking-tight">{lead.offreReelle.compagnie}</p>
            </div>
            <div className="space-y-2 md:text-right">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Capital estimé au terme</p>
              <p className="text-4xl font-black text-emerald-600 tracking-tight">{lead.offreReelle.capital} CHF</p>
            </div>
          </div>

          {/* 2. GARANTIES RISQUES */}
          {(lead.offreReelle.deathCapital || lead.offreReelle.disabilityRente) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert size={12}/> Capital Décès
                </p>
                <p className="text-xl font-black text-slate-900">
                   {lead.offreReelle.deathCapital ? `${lead.offreReelle.deathCapital} CHF` : "Non inclus"}
                </p>
              </div>
              <div className="space-y-1 md:text-right">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 md:justify-end">
                   <HeartPulse size={12}/> Rente Incapacité (an)
                 </p>
                 <p className="text-xl font-black text-slate-900">
                   {lead.offreReelle.disabilityRente ? `${lead.offreReelle.disabilityRente} CHF` : "Non inclus"}
                 </p>
              </div>
            </div>
          )}

          {/* 3. PRIME & ACTION PDF */}
          <div className="bg-slate-900 text-white p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-slate-200">
            <div className="text-center md:text-left">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Prime mensuelle</p>
              <p className="text-3xl font-black">{lead.offreReelle.prime} CHF</p>
            </div>
            
            <div className="h-12 w-px bg-slate-700 hidden md:block"></div>

            <Button asChild size="lg" className="h-14 px-8 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl shadow-sm text-base w-full md:w-auto transition-all hover:scale-105">
              <a href={lead.offreReelle.fileUrl} target="_blank">
                <FileText className="mr-2 text-blue-600" size={20}/> 
                Voir l'offre officielle (PDF)
              </a>
            </Button>
          </div>

          {/* 4. VALIDATION */}
          <div className="pt-8 border-t border-slate-100 space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="text-blue-600" /> Validation du dossier
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed max-w-2xl">
                En cliquant sur "Accepter l'offre", vous confirmez votre intérêt pour cette solution. 
                Une dernière étape de validation téléphonique sera nécessaire pour finaliser le dossier.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg"
                className="flex-[2] h-16 rounded-2xl font-black text-lg bg-blue-600 hover:bg-blue-500 shadow-xl shadow-blue-200 transition-all hover:translate-y-[-2px]"
                onClick={handleAcceptOffer}
                disabled={isAccepting}
              >
                {isAccepting ? <Loader2 className="animate-spin mr-2"/> : "ACCEPTER L'OFFRE"} 
                {!isAccepting && <ArrowRight className="ml-2" size={20}/>}
              </Button>
              
              <Button variant="outline" size="lg" className="flex-1 h-16 rounded-2xl font-bold border-2 hover:bg-slate-50" asChild>
                <a href={`/rappel?leadId=${id}`}><Phone className="mr-2" size={18}/> ÊTRE RAPPELÉ</a>
              </Button>
            </div>
            
            <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest font-bold pt-4">
              Document confidentiel • CreditX (Suisse) Sàrl
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}