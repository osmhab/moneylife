"use client";

import React, { useState, useEffect } from "react";
import { db, storage } from "@/lib/firebase";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from "@/components/ui/sheet";
import { 
  Mail, Phone, Trash2, CheckCircle2, 
  Search, Briefcase, MapPin, Zap, 
  Loader2, HeartPulse, User, Fingerprint,
  Upload, FileText, Copy, Activity, ShieldAlert, Info, Send,
  CalendarClock, PhoneCall, Star
} from "lucide-react";
import { toast } from "sonner";

export default function LeadsPageClient() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // États pour le traitement de l'offre
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const [realOfferData, setRealOfferData] = useState({
    compagnie: "",
    capital: "",
    prime: "",
    deathCapital: "",
    disabilityRente: "",
    fileUrl: ""
  });

  useEffect(() => {
    const q = query(collection(db, "leads-3a"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leadsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeads(leadsData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      toast.error("Erreur de connexion");
    });
    return () => unsubscribe();
  }, []);

  const updateStatus = async (leadId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'traité' ? 'nouveau' : 'traité';
    try {
      await updateDoc(doc(db, "leads-3a", leadId), { status: newStatus });
      toast.success(`Statut mis à jour`);
    } catch (e) { toast.error("Erreur mise à jour"); }
  };

  const deleteLead = async (lead: any) => {
    if (!confirm("Supprimer ce prospect DÉFINITIVEMENT ?")) return;
    
    const toastId = toast.loading("Suppression en cours...");

    try {
      if (lead.rdv?.eventId) {
        try {
          await fetch("/api/3a-simulator/delete-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: lead.rdv.eventId }),
          });
          toast.success("Rendez-vous annulé dans l'agenda", { id: toastId });
        } catch (calError) {
          console.error("Erreur suppression agenda", calError);
          toast.error("Le lead est supprimé mais vérifiez votre agenda manuel.", { id: toastId });
        }
      }

      await deleteDoc(doc(db, "leads-3a", lead.id));
      toast.dismiss(toastId);
      toast.success("Dossier supprimé");
      
    } catch (e) { 
      toast.error("Erreur suppression", { id: toastId }); 
    }
  };

  const handleGenerateLink = async (leadId: string) => {
    if (!realOfferData.fileUrl || !realOfferData.compagnie) return toast.error("Infos manquantes");
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "leads-3a", leadId), {
        offreReelle: { ...realOfferData, updatedAt: serverTimestamp() },
        status: "offre_prete" 
      });
      const publicLink = `${window.location.origin}/offre/${leadId}`;
      setGeneratedLink(publicLink);
      toast.success("Offre prête !");
    } catch (e) { toast.error("Erreur technique"); }
    setIsProcessing(false);
  };

  const handleSendEmail = async (lead: any) => {
    if (!generatedLink) return;
    setIsSendingEmail(true);
    try {
      const res = await fetch("/api/send-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: lead.client.email,
          firstName: lead.client.firstName,
          lastName: lead.client.lastName,
          offerLink: generatedLink,
          compagnie: realOfferData.compagnie,
          capital: realOfferData.capital,
          prime: realOfferData.prime,
          deathCapital: realOfferData.deathCapital,
          disabilityRente: realOfferData.disabilityRente
        })
      });

      if (res.ok) {
        await updateDoc(doc(db, "leads-3a", lead.id), { status: "offre_envoyee" });
        toast.success("Email envoyé avec succès !");
        setGeneratedLink(null); 
      } else { throw new Error("Erreur API"); }
    } catch (e) { toast.error("Erreur lors de l'envoi."); } finally { setIsSendingEmail(false); }
  };

  const getStatusVisuals = (status: string) => {
    switch (status) {
      case 'rappel_programme':
        return { color: 'bg-purple-100 text-purple-700', border: 'border-l-4 border-purple-500', icon: <CalendarClock size={12} />, label: "RAPPEL PROGRAMMÉ" };
      case 'offre_acceptee':
        return { color: 'bg-green-100 text-green-700', border: 'border-l-4 border-green-500', icon: <CheckCircle2 size={12} />, label: "OFFRE ACCEPTÉE" };
      case 'offre_envoyee':
        return { color: 'bg-blue-100 text-blue-700', border: 'border-l-4 border-blue-500', icon: <Send size={12} />, label: "OFFRE ENVOYÉE" };
      case 'traité':
        return { color: 'bg-slate-100 text-slate-500', border: 'border-l-4 border-slate-300', icon: <Trash2 size={12} />, label: "ARCHIVÉ" };
      default: 
        return { color: 'bg-amber-100 text-amber-700', border: 'border-l-4 border-amber-500', icon: <Star size={12} />, label: "NOUVEAU LEAD" };
    }
  };

  const filteredLeads = leads.filter(l => 
    l.client?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.client?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.client?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
      <Loader2 className="animate-spin text-blue-600" size={40} />
      <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Chargement du pipeline...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans text-slate-900">
      
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white"><Zap size={22} fill="white" /></div>
            <h1 className="text-xl font-black tracking-tight">Pipeline MoneyLife</h1>
          </div>
          <div className="relative w-64 sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <Input placeholder="Rechercher..." className="pl-10 h-10 rounded-xl border-slate-200 bg-slate-50" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-4">
        {filteredLeads.map((lead) => {
          const visuals = getStatusVisuals(lead.status);
          
          return (
            <Sheet key={lead.id} onOpenChange={(open) => {
              if(open) {
                setRealOfferData(lead.offreReelle || { compagnie: "", capital: "", prime: "", deathCapital: "", disabilityRente: "", fileUrl: "" });
                setGeneratedLink(null);
              }
            }}>
              <SheetTrigger asChild>
                <Card className={`cursor-pointer hover:shadow-md transition-all border-y border-r border-slate-200 shadow-sm ${visuals.border} ${lead.status === 'traité' ? 'opacity-60 grayscale' : 'bg-white'}`}>
                  <CardContent className="p-4 grid grid-cols-1 md:grid-cols-12 items-center gap-4">
                    
                    <div className="md:col-span-2 flex flex-col justify-center">
                      <span className={`text-[9px] font-black px-2 py-1 rounded w-fit mb-2 uppercase flex items-center gap-1.5 ${visuals.color}`}>
                        {visuals.icon} {visuals.label}
                      </span>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        {lead.createdAt?.toDate().toLocaleDateString('fr-CH')}
                      </p>
                    </div>

                    <div className="md:col-span-4">
                      <span className="font-black text-lg text-slate-900 block">{lead.client?.firstName} {lead.client?.lastName}</span>
                      <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                        <Briefcase size={12}/> {lead.client?.profession || "Profession inconnue"}
                      </span>
                    </div>

                    <div className="md:col-span-4">
                      {lead.status === 'rappel_programme' && lead.rdv ? (
                        <div className="flex items-center gap-3 bg-purple-50 p-2 rounded-lg border border-purple-100 w-fit">
                          <div className="bg-purple-200 p-1.5 rounded-md text-purple-700"><PhoneCall size={16}/></div>
                          <div>
                            <p className="text-[10px] font-bold text-purple-400 uppercase">Rappel Prévu</p>
                            <p className="text-sm font-black text-purple-900">
                              {new Date(lead.rdv.start).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})} à {new Date(lead.rdv.start).toLocaleTimeString('fr-CH', {hour:'2-digit', minute:'2-digit'})}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Intérêt</p>
                          <p className="text-sm font-black text-blue-600 flex items-center gap-1.5">
                            <Zap size={14} className="fill-blue-600"/>
                            {lead.offreConcernee || lead.offreSelectionnee?.compagnie || "Audit 3a"}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2 text-right flex justify-end">
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-blue-600 transition-colors">
                        <Info size={18} />
                      </div>
                    </div>

                  </CardContent>
                </Card>
              </SheetTrigger>

              <SheetContent className="sm:max-w-xl overflow-y-auto bg-slate-50 p-0">
                <div className="p-8 space-y-8">
                  <header>
                    <div className="flex items-center justify-between">
                      <p className="text-blue-600 font-black text-[10px] uppercase tracking-[0.2em] mb-2">Dossier Prospect</p>
                      <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${visuals.color}`}>
                        {visuals.icon} {visuals.label}
                      </div>
                    </div>
                    <SheetTitle className="text-3xl font-black uppercase leading-none">{lead.client?.firstName} {lead.client?.lastName}</SheetTitle>
                  </header>

                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Fingerprint size={14} className="text-blue-500" /> Profil Civil & Professionnel
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1"><Briefcase size={10}/> Profession actuelle</p>
                        <p className="text-lg font-black text-slate-900">{lead.client?.profession || "Non renseignée"}</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Naissance</p>
                        <p className="text-base font-black text-slate-900">
                          {lead.client?.birthDate ? new Date(lead.client.birthDate).toLocaleDateString('fr-CH') : 'Non renseignée'}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Nationalité</p>
                        <p className="text-base font-black text-slate-900">
                          {lead.client?.nationality} {lead.client?.permitType && `(${lead.client.permitType})`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><User size={14}/> Coordonnées</h4>
                     <div className="flex flex-col gap-2">
                        <a href={`tel:${lead.client?.phone}`} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors font-bold text-slate-800">
                          <Phone size={18} className="text-blue-600"/> {lead.client?.phone}
                        </a>
                        <a href={`mailto:${lead.client?.email}`} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors font-bold text-slate-800">
                          <Mail size={18} className="text-blue-600"/> {lead.client?.email}
                        </a>
                     </div>
                     <div className="pt-2 border-t flex items-start gap-3">
                        <MapPin size={20} className="text-slate-400 mt-1" />
                        <div>
                          <p className="text-sm font-bold text-slate-900">{lead.client?.address}</p>
                          <p className="text-sm text-slate-500">{lead.client?.npa} {lead.client?.city}</p>
                          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.client?.address + ' ' + lead.client?.city)}`} target="_blank" className="text-[10px] text-blue-600 font-bold uppercase hover:underline mt-1 inline-block">Voir sur Maps</a>
                        </div>
                     </div>
                  </div>

                  {/* --- 3. SIMULATION CLIENT (COMPLÈTE) --- */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Activity size={14} className="text-blue-500" /> Simulation client
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Capital 65 */}
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Capital 65 ans (est.)</p>
                        <p className="text-lg font-black text-slate-900">
                          {lead.offreSelectionnee?.capital65ans ? Math.round(lead.offreSelectionnee.capital65ans).toLocaleString() : '-'}
                        </p>
                      </div>
                      {/* Rente Invalidité */}
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Rente Inv. (mensuel)</p>
                        <p className="text-lg font-black text-slate-900">
                          {lead.offreSelectionnee?.renteInvaliditeMensuelle ? Math.round(lead.offreSelectionnee.renteInvaliditeMensuelle).toLocaleString() : '0'}.-
                        </p>
                      </div>
                      {/* Capital Décès */}
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Capital Décès</p>
                        <p className="text-lg font-black text-slate-900">
                          {lead.offreSelectionnee?.capitalDeces ? Math.round(lead.offreSelectionnee.capitalDeces).toLocaleString() : '0'}.-
                        </p>
                      </div>
                      {/* Libération des primes */}
                      <div className="p-3 bg-slate-50 rounded-xl flex flex-col justify-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Libération des primes</p>
                        <div className="flex items-center gap-2">
                           <CheckCircle2 size={16} className="text-emerald-500" />
                           <span className="text-sm font-black text-emerald-700">INCLUS</span>
                        </div>
                      </div>
                    </div>
                    {/* Budget */}
                    <div className="px-3 py-2 bg-blue-50 rounded-lg flex justify-between items-center">
                      <span className="text-[10px] font-bold text-blue-400 uppercase">Budget mensuel</span>
                      <span className="text-sm font-black text-blue-700">{lead.offreSelectionnee?.budgetMensuel || lead.client?.targetMonthlyPremium} CHF</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl space-y-5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                        <Zap size={16} fill="currentColor"/> Établir l'offre finale
                      </h4>
                      {realOfferData.fileUrl && <span className="bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded">PDF OK</span>}
                    </div>
                    
                    {!generatedLink ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400 uppercase font-bold">Compagnie</Label>
                          <Input value={realOfferData.compagnie} onChange={e => setRealOfferData({...realOfferData, compagnie: e.target.value})} placeholder="ex: Swiss Life" className="bg-white/5 border-white/10" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-400 uppercase font-bold">Capital Terme</Label>
                            <Input value={realOfferData.capital} onChange={e => setRealOfferData({...realOfferData, capital: e.target.value})} placeholder="CHF..." className="bg-white/5 border-white/10" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-400 uppercase font-bold">Prime / mois</Label>
                            <Input value={realOfferData.prime} onChange={e => setRealOfferData({...realOfferData, prime: e.target.value})} placeholder="CHF..." className="bg-white/5 border-white/10" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-400 uppercase font-bold">Capital Décès</Label>
                            <Input value={realOfferData.deathCapital} onChange={e => setRealOfferData({...realOfferData, deathCapital: e.target.value})} placeholder="CHF..." className="bg-white/5 border-white/10" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-400 uppercase font-bold">Rente Inv. (an)</Label>
                            <Input value={realOfferData.disabilityRente} onChange={e => setRealOfferData({...realOfferData, disabilityRente: e.target.value})} placeholder="CHF..." className="bg-white/5 border-white/10" />
                          </div>
                        </div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-dashed border-white/20 text-center relative hover:bg-white/10 transition-colors">
                          <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if(!file) return;
                            setIsProcessing(true);
                            const sRef = ref(storage, `offres-3a/${lead.id}.pdf`);
                            await uploadBytes(sRef, file);
                            const url = await getDownloadURL(sRef);
                            setRealOfferData(p => ({...p, fileUrl: url}));
                            setIsProcessing(false);
                            toast.success("PDF Chargé !");
                          }} />
                          <div className="flex flex-col items-center gap-2 pointer-events-none">
                            {realOfferData.fileUrl ? <FileText className="text-emerald-400" /> : <Upload className="text-slate-500" />}
                            <span className="text-[10px] font-bold uppercase text-slate-300">
                              {realOfferData.fileUrl ? "Remplacer le document" : "Glisser ou cliquer pour uploader PDF"}
                            </span>
                          </div>
                        </div>
                        <Button disabled={isProcessing || !realOfferData.fileUrl} className="w-full h-14 bg-white text-slate-900 hover:bg-slate-200 font-black" onClick={() => handleGenerateLink(lead.id)}>
                          {isProcessing ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="mr-2" size={18} />}
                          PRÉPARER L'ENVOI
                        </Button>
                      </div>
                    ) : (
                      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
                         <div className="bg-white/10 p-4 rounded-xl border border-white/10 text-sm">
                            <p className="text-xs text-slate-400 uppercase font-bold mb-2">Aperçu de l'email :</p>
                            <div className="space-y-2 text-white/90">
                              <p><span className="text-blue-300 font-bold">À :</span> {lead.client.email}</p>
                              <p><span className="text-blue-300 font-bold">Objet :</span> Votre offre {realOfferData.compagnie} est prête</p>
                              <div className="pt-3 border-t border-white/10 italic text-white/60 text-xs leading-relaxed">
                                "Bonjour {lead.client.firstName},<br/>
                                Suite à votre demande, nous avons le plaisir de vous transmettre votre offre de prévoyance {realOfferData.compagnie}.<br/><br/>
                                [Bouton: Consulter mon offre]"
                              </div>
                            </div>
                         </div>
                         <div className="grid grid-cols-2 gap-3">
                           <Button variant="secondary" className="h-12 font-bold bg-white/10 hover:bg-white/20 text-white border-none" onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success("Lien copié !"); }}>
                             <Copy size={16} className="mr-2"/> Copier lien
                           </Button>
                           <Button className="h-12 bg-blue-600 hover:bg-blue-500 font-black text-white shadow-lg shadow-blue-900/50" onClick={() => handleSendEmail(lead)} disabled={isSendingEmail}>
                             {isSendingEmail ? <Loader2 className="animate-spin"/> : <Send size={16} className="mr-2"/>} ENVOYER
                           </Button>
                         </div>
                         <p className="text-center text-[10px] text-white/40 cursor-pointer hover:underline hover:text-white" onClick={() => setGeneratedLink(null)}> Modifier les données</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><HeartPulse size={14} className="text-red-500"/> Questionnaire santé</h4>
                    <div className="space-y-3">
                      {[
                        { label: "Fumeur", val: lead.sante?.isSmoker || lead.client?.isSmoker },
                        { label: "Capacité de travail", val: lead.sante?.capaciteTravail },
                        { label: "Hospitalisation (5 ans)", val: lead.sante?.interventionsChirurgicales },
                        { label: "Maladie chronique", val: lead.sante?.affectionsChroniques }
                      ].map((q, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-none">
                          <span className="text-sm text-slate-600">{q.label}</span>
                          <span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${q.val ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{q.val ? 'OUI' : 'NON'}</span>
                        </div>
                      ))}
                    </div>
                    {lead.sante?.notes && <div className="mt-2 p-3 bg-slate-50 rounded-xl text-sm italic text-slate-600">"{lead.sante.notes}"</div>}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-6 border-t">
                    <Button className={`h-14 rounded-xl font-black ${lead.status === 'traité' ? 'bg-slate-200 text-slate-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`} onClick={() => updateStatus(lead.id, lead.status)}>
                      <CheckCircle2 size={18} className="mr-2" /> {lead.status === 'traité' ? 'RÉACTIVER' : 'MARQUER TRAITÉ'}
                    </Button>
                    <Button variant="ghost" className="h-14 rounded-xl text-red-500 hover:bg-red-50 font-bold" onClick={() => deleteLead(lead)}>
                      <Trash2 size={18} className="mr-2" /> SUPPRIMER
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          );
        })}
      </div>
    </div>
  );
}