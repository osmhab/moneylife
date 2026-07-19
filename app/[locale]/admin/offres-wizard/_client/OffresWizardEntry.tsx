//app/admin/offres-wizard/_client/OffresWizardEntry.tsx
"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc, where, addDoc, serverTimestamp, deleteDoc, collectionGroup, setDoc } from "firebase/firestore";
import { 
  Search, ChevronRight, CheckCircle2, AlertCircle,
  LayoutDashboard, User, Phone, MapPin, 
  Stethoscope, Briefcase, X, ShieldCheck, Loader2, Plus, Trash2, Landmark, CalendarDays, Mail, Heart, Clock, FileSignature, Edit2, Users, Sparkles, FolderLock, ScanSearch, Hash, PhoneCall
} from "lucide-react"; // 👈 Ajout de ScanSearch
import { motion } from "framer-motion";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import AdminPlanGenerator from "./AdminPlanGenerator";
import AdminSignedPlanProcessor from "./AdminSignedPlanProcessor";
import AdminConseilWizard from "./AdminConseilWizard";

const optionsSexe = [
  { id: 0, label: "Masculin" },
  { id: 1, label: "Féminin" }
];

const optionsEtatCivil = [
  { id: 0, label: "Célibataire" },
  { id: 1, label: "Marié·e" },
  { id: 2, label: "Divorcé·e" },
  { id: 3, label: "Partenariat enregistré" },
  { id: 4, label: "Concubinage" },
  { id: 5, label: "Veuf·ve" }
];

// Fonction pour calculer le nombre de jours écoulés
const getDaysAgo = (dateValue: any) => {
  if (!dateValue) return 0;
  let pastDate;
  if (typeof dateValue.toDate === 'function') pastDate = dateValue.toDate();
  else if (dateValue.seconds) pastDate = new Date(dateValue.seconds * 1000);
  else return 0;

  const now = new Date();
  const diffTime = Math.abs(now.getTime() - pastDate.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

export default function OffresWizardEntry() {
  // 👈 NOUVEAU : États pour la création manuelle de client
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [newClient, setNewClient] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  const handleCreateManualClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.firstName || !newClient.lastName || !newClient.email) {
      toast.error("Le prénom, le nom et l'email sont obligatoires !");
      return;
    }
    
    setIsCreatingClient(true);
    const toastId = toast.loading("Création du compte et envoi de l'email...");

    try {
      // On appelle notre nouvelle API serveur
      const response = await fetch("/api/admin/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClient),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur de création");
      }

      toast.success("Client créé et email envoyé !", { id: toastId });
      setIsAddClientOpen(false);
      setNewClient({ firstName: "", lastName: "", email: "", phone: "" });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message, { id: toastId });
    } finally {
      setIsCreatingClient(false);
    }
  };

  // 👈 MAJ : Ajout de l'onglet 'rappels'
  const [activeTab, setActiveTab] = useState<"requests" | "signed" | "rejected" | "clients" | "expertises" | "rappels">("requests");
  const [callbacks, setCallbacks] = useState<any[]>([]); // 👈 NOUVEAU : État pour les rappels (leads-3a)
  const [requests, setRequests] = useState<any[]>([]);
  const [signedPlans, setSignedPlans] = useState<any[]>([]);
  const [rejectedPlans, setRejectedPlans] = useState<any[]>([]); 
  const [expertReviews, setExpertReviews] = useState<any[]>([]); // 👈 NOUVEAU : État pour les expertises
  const [allClients, setAllClients] = useState<any[]>([]); // 👈 NOUVEAU : État pour tous les clients
  const [searchTerm, setSearchTerm] = useState("");
  
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPlanGeneratorOpen, setIsPlanGeneratorOpen] = useState(false);
  
  const [draftPlans, setDraftPlans] = useState<any[]>([]);
  const [planToEdit, setPlanToEdit] = useState<any>(null);
  const [clientPersonalInfo, setClientPersonalInfo] = useState<any>(null);

  const [selectedSignedPlan, setSelectedSignedPlan] = useState<any>(null);
  
  // NOUVEAU : État pour l'identifiant du client en mode "Offre Proactive"
  const [proactiveClientUid, setProactiveClientUid] = useState<string | null>(null);

  // 👈 NOUVEAU : États pour le Dossier Client 360°
  const [selectedClient360, setSelectedClient360] = useState<any>(null);
  const [client360Plans, setClient360Plans] = useState<any[]>([]);

  // 👈 États pour le tunnel de conseil physique
  const [isConseilWizardOpen, setIsConseilWizardOpen] = useState(false);

  

  

  // 1. Récupération des demandes d'offres
  useEffect(() => {
    const q = query(collection(db, "offers_requests_3e"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsubscribe();
  }, []);

  // 2. Récupération des offres signées
  useEffect(() => {
    const q = query(collectionGroup(db, "plans"), where("status", "==", "PENDING_INSURANCE"));
    const unsub = onSnapshot(q, async (snap) => {
      const plans = snap.docs.map(d => {
        const clientUid = d.ref.parent.parent?.id || "";
        return { id: d.id, clientUid, ...(d.data() as any) };
      });
      plans.sort((a: any, b: any) => (b.metadata?.updatedAt?.seconds || 0) - (a.metadata?.updatedAt?.seconds || 0));
      setSignedPlans(plans);
    });
    return () => unsub();
  }, []);

  // 3. Récupération des offres refusées
  useEffect(() => {
    const q = query(collectionGroup(db, "plans"), where("status", "==", "REJECTED_CLIENT"));
    const unsub = onSnapshot(q, async (snap) => {
      const plans = snap.docs.map(d => {
        const clientUid = d.ref.parent.parent?.id || "";
        return { id: d.id, clientUid, ...(d.data() as any) };
      });
      plans.sort((a: any, b: any) => (b.metadata?.rejectedAt?.seconds || 0) - (a.metadata?.rejectedAt?.seconds || 0));
      setRejectedPlans(plans);
    });
    return () => unsub();
  }, []);

  // 👈 NOUVEAU : Récupération des demandes d'expertises payées
  useEffect(() => {
    const q = query(collectionGroup(db, "plans"), where("reviewStatus", "==", "PENDING"));
    const unsub = onSnapshot(q, async (snap) => {
      const plans = snap.docs.map(d => {
        const clientUid = d.ref.parent.parent?.id || "";
        return { id: d.id, clientUid, ...(d.data() as any) };
      });
      plans.sort((a: any, b: any) => (b.metadata?.reviewPaidAt?.seconds || 0) - (a.metadata?.reviewPaidAt?.seconds || 0));
      setExpertReviews(plans);
    });
    return () => unsub();
  }, []);

  // 👈 NOUVEAU : Récupération des demandes de rappel (immédiates & planifiées)
  useEffect(() => {
    const q = query(collection(db, "leads-3a"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setCallbacks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);


  // 👈 MAJ : Récupération de TOUS les clients (Priorité au sous-dossier DonneePersonnelles)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), async (snap) => {
      const promises = snap.docs.map(async (d) => {
        const data = d.data();
        let firstName = data.firstName || data.displayName?.split(" ")[0] || "";
        let lastName = data.lastName || data.displayName?.split(" ").slice(1).join(" ") || "";
        let dob = data.dateNaissance || "";
        
        let address = data.adresse || data.address || "";
        let npa = data.npa || "";
        let localite = data.localite || data.city || "";

        try {
          const pdSnap = await getDoc(doc(db, `clients/${d.id}/DonneePersonnelles/current`));
          if (pdSnap.exists()) {
            const pd = pdSnap.data();
            // LA RÈGLE D'OR : Ce que le client tape dans son formulaire prime sur TOUT le reste !
            if (pd.Enter_prenom) firstName = pd.Enter_prenom;
            if (pd.Enter_nom) lastName = pd.Enter_nom;
            if (pd.Enter_dateNaissance) dob = pd.Enter_dateNaissance;
            
            if (pd.Enter_adresse) address = pd.Enter_adresse;
            if (pd.Enter_npa) npa = pd.Enter_npa;
            if (pd.Enter_localite) localite = pd.Enter_localite;
          }
        } catch (e) {
          console.error("Erreur lecture sous-dossier pour", d.id, e);
        }

        // Assemblage propre et garanti
        const addressParts = [];
        if (address) addressParts.push(address);
        
        const cityParts = [];
        if (npa) cityParts.push(npa);
        if (localite) cityParts.push(localite);
        
        if (cityParts.length > 0) addressParts.push(cityParts.join(" "));
        
        return {
          uid: d.id,
          ...data,
          firstName,
          lastName,
          dateNaissance: dob,
          adresse: addressParts.join(", "),
          _sortTime: data.createdAt?.seconds || 0
        };
      });

      const clientsList = await Promise.all(promises);
      clientsList.sort((a, b) => b._sortTime - a._sortTime);
      setAllClients(clientsList);
    });
    return () => unsub();
  }, []);

  // 4. Écoute des infos personnelles pour la demande sélectionnée
  useEffect(() => {
    if (!selectedReq) {
      setClientPersonalInfo(null);
      return;
    }
    const fetchPersonalInfo = async () => {
      try {
        const snap = await getDoc(doc(db, `clients/${selectedReq.clientUid}/DonneePersonnelles/current`));
        if (snap.exists()) setClientPersonalInfo(snap.data());
      } catch (error) { console.error("Erreur client info:", error); }
    };
    fetchPersonalInfo();
  }, [selectedReq]);

  // 5. Écoute des brouillons de plans
  useEffect(() => {
    if (!selectedReq) { setDraftPlans([]); return; }
    const qPlans = query(collection(db, `clients/${selectedReq.clientUid}/plans`), where("linkedRequestId", "==", selectedReq.id));
    const unsub = onSnapshot(qPlans, (snap) => {
      setDraftPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedReq]);

  // 6. 👈 NOUVEAU : Récupération des plans du client pour le Dossier 360°
  useEffect(() => {
    if (!selectedClient360) {
      setClient360Plans([]);
      return;
    }
    const qPlans = query(collection(db, `clients/${selectedClient360.uid}/plans`));
    const unsub = onSnapshot(qPlans, (snap) => {
      setClient360Plans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedClient360]);

  const mergedClients = allClients.map(client => {
    const req = requests.find(r => r.clientUid === client.uid);
    
    return {
      uid: client.uid,
      email: client.email || req?.client?.email || "Email non renseigné",
      firstName: client.firstName || req?.client?.firstName || "Nouveau",
      lastName: client.lastName || req?.client?.lastName || "Client",
      phone: client.phone || req?.client?.phone || "Non renseigné",
      dob: client.dateNaissance || req?.client?.dateNaissance || req?.client?.dob || "",
      // Correction ici : req utilise .address (anglais) et client utilise .adresse (français)
      address: client.adresse || req?.client?.address || req?.client?.adresse || "",
      aiEmails: client.aiEmails
    };
  });

  // Dédoublonnage par email
  const deduplicatedClients = Array.from(
    new Map(mergedClients.map(c => [c.email !== "Email non renseigné" ? c.email : c.uid, c])).values()
  );

  // Filtrage par recherche (on inclut l'UID dans la recherche au cas où)
  const uniqueClients = deduplicatedClients.filter(c => 
    `${c.firstName} ${c.lastName} ${c.email} ${c.uid}`.toLowerCase().includes(searchTerm.toLowerCase())
  );


  const formatDate = (dateValue: any) => {
    if (!dateValue) return "En cours...";
    if (typeof dateValue.toDate === 'function') return dateValue.toDate().toLocaleDateString('fr-CH');
    if (dateValue.seconds) return new Date(dateValue.seconds * 1000).toLocaleDateString('fr-CH');
    return "N/A";
  };

  const fmt = new Intl.NumberFormat('fr-CH');
  const formatPrice = (val: any) => Number(val || 0).toFixed(2);

  const handleFinalizeDossier = async () => {
    if(draftPlans.length === 0) return toast.error("Vous devez ajouter au moins un contrat !");
    try {
      // 1. Validation de la requête
      await updateDoc(doc(db, "offers_requests_3e", selectedReq.id), { 
        status: "APPROVED",
        updatedAt: serverTimestamp() // 👈 NOUVEAU : On enregistre l'heure exacte de l'approbation
      });
      
      // 2. Construction de la notification In-App (HTML Riche)
      const fmt = new Intl.NumberFormat('fr-CH');
      let plansHtml = `
      <table style="width:100%; font-size:14px; border-collapse: collapse; margin-top: 10px;">
      `;
      draftPlans.forEach(plan => {
        const price = plan.data?.primeTotale || plan.data?.montantRegulier || 0;
        plansHtml += `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:12px 0; color:#4A4A4A;"><strong>${plan.institutionName}</strong></td>
            <td style="padding:12px 0; text-align:right; color:#1A1A1A; font-black;">${fmt.format(price)} CHF/m</td>
          </tr>
        `;
      });
      plansHtml += `</table>`;

      const notificationHtml = `
        <p>Bonjour ${selectedReq.client?.firstName || "Client"},</p>
        <p>Nos experts ont finalisé l'étude de votre dossier. Vos offres personnalisées sont maintenant prêtes à être consultées et signées.</p>
        <div style="background:#ffffff; padding:24px; border-radius:12px; margin:32px 0; border:1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <h3 style="margin:0 0 16px 0; font-size:12px; text-transform:uppercase; color:#1a4f8a; letter-spacing:0.05em;">Vos propositions</h3>
          ${plansHtml}
        </div>
        <p>Rendez-vous dans votre espace prévoyance pour découvrir les détails de chaque offre et valider votre choix.</p>
      `;

      // 3. Envoi de la notification In-App
      await addDoc(collection(db, `clients/${selectedReq.clientUid}/notifications`), {
        title: "Vos offres sont prêtes",
        content: `Vos plans personnalisés sont disponibles. Veuillez consulter les détails dans votre espace prévoyance.`,
        html: notificationHtml,
        type: "success",
        category: "OFFRE",
        actionUrl: `/dashboard/prevoyance?tab=prive`, 
        read: false,
        createdAt: serverTimestamp()
      });

      // 4. Appel à l'API pour envoyer l'email SendGrid
      await fetch('/api/send-offer-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedReq.client?.email,
          firstName: selectedReq.client?.firstName,
          locale: selectedReq.client?.locale || "fr", // 👈 NOUVEAU : On ajoute la langue ici !
          plans: draftPlans.map(p => ({
            institutionName: p.institutionName,
            price: p.data?.primeTotale || p.data?.montantRegulier || 0
          }))
        })
      });

      toast.success("Dossier validé et envoyé au client !");
      setIsDrawerOpen(false);
    } catch (e) { 
      console.error(e);
      toast.error("Erreur lors de la validation"); 
    }
  };

  const handleDeleteDraft = async (planId: string) => {
    try {
      await deleteDoc(doc(db, `clients/${selectedReq.clientUid}/plans`, planId));
      toast.success("Contrat retiré");
    } catch(e) { toast.error("Erreur"); }
  };
  
  const openEditorForPlan = (plan: any) => { setPlanToEdit(plan); setIsPlanGeneratorOpen(true); };
  const openGeneratorForNewPlan = () => { setPlanToEdit(null); setIsPlanGeneratorOpen(true); };

  const filteredRequests = requests.filter(r => `${r.client?.firstName} ${r.client?.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8">
      
      {/* HEADER & TABS */}
      <div className="flex flex-col gap-6 border-b pb-6 border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <LayoutDashboard size={14} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">CreditX Admin</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 italic">CreditX CRM</h1>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="relative w-full md:w-72">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Rechercher un client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-full py-3 pl-10 pr-4 text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400"
                />
              </div>
              <button 
                onClick={() => setIsAddClientOpen(true)}
                className="w-full sm:w-auto px-5 py-3 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-full flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Plus size={16} />
                Nouveau Dossier
              </button>
            </div>
          </div>
        </div>
        
        {/* MENU DES ONGLETS ÉLARGI (4 Boutons) */}
        <div className="flex bg-slate-100 p-1.5 rounded-full w-full overflow-x-auto scrollbar-hide">
          <button 
            onClick={() => setActiveTab("requests")} 
            className={`flex-1 min-w-[160px] py-3 text-xs font-black rounded-full flex items-center justify-center gap-2 transition-all ${activeTab === "requests" ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Clock size={16} /> Nouvelles Demandes
          </button>
          <button 
            onClick={() => setActiveTab("signed")} 
            className={`flex-1 min-w-[160px] py-3 text-xs font-black rounded-full flex items-center justify-center gap-2 transition-all ${activeTab === "signed" ? 'bg-black shadow-md text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <FileSignature size={16} /> {signedPlans.length > 0 && <span className="bg-emerald-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full mr-1">{signedPlans.length}</span>} Offres Signées
          </button>
          <button 
            onClick={() => setActiveTab("rejected")} 
            className={`flex-1 min-w-[160px] py-3 text-xs font-black rounded-full flex items-center justify-center gap-2 transition-all ${activeTab === "rejected" ? 'bg-red-500 shadow-md text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <X size={16} /> {rejectedPlans.length > 0 && <span className="bg-white text-red-500 text-[10px] w-5 h-5 flex items-center justify-center rounded-full mr-1">{rejectedPlans.length}</span>} Refusées
          </button>
          <button 
            onClick={() => setActiveTab("clients")} 
            className={`flex-1 min-w-[160px] py-3 text-xs font-black rounded-full flex items-center justify-center gap-2 transition-all ${activeTab === "clients" ? 'bg-blue-600 shadow-md text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Users size={16} /> Clients
          </button>

          {/* 👈 NOUVEAU BOUTON : EXPERTISES LPP */}
          <button 
            onClick={() => setActiveTab("expertises")} 
            className={`flex-1 min-w-[160px] py-3 text-xs font-black rounded-full flex items-center justify-center gap-2 transition-all ${activeTab === "expertises" ? 'bg-indigo-600 shadow-md text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <ScanSearch size={16} /> {expertReviews.length > 0 && <span className="bg-indigo-400 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full mr-1">{expertReviews.length}</span>} Expertises
          </button>
          
          {/* 👈 NOUVEAU BOUTON : RAPPELS TÉLÉPHONIQUES */}
          <button 
            onClick={() => setActiveTab("rappels")} 
            className={`flex-1 min-w-[160px] py-3 text-xs font-black rounded-full flex items-center justify-center gap-2 transition-all ${activeTab === "rappels" ? 'bg-orange-500 shadow-md text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <PhoneCall size={16} /> {callbacks.filter(c => c.status !== 'execute').length > 0 && <span className="bg-white text-orange-500 text-[10px] w-5 h-5 flex items-center justify-center rounded-full mr-1">{callbacks.filter(c => c.status !== 'execute').length}</span>} Rappels
          </button>
        </div>
      </div>

      {/* CONTENU ONGLET 1 : DEMANDES */}
      {/* CONTENU ONGLET 1 : DEMANDES */}
      {activeTab === "requests" && (
        <div className="grid grid-cols-1 gap-5 animate-in fade-in slide-in-from-bottom-4">
          {filteredRequests.map((req, index) => {
            // Calcul du temps écoulé basé sur updatedAt (si approuvé) ou createdAt
            const refDate = req.updatedAt || req.createdAt;
            const days = getDaysAgo(refDate);
            const timeText = days === 0 ? "Aujourd'hui" : days === 1 ? "Depuis 1 jour" : `Depuis ${days} jours`;
            
            // Si c'est en attente depuis plus de 3 jours, on met le texte en rouge pour attirer l'oeil !
            const isLate = days >= 3 && req.status === 'APPROVED';

            return (
              <motion.div 
                key={req.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
                onClick={() => { setSelectedReq(req); setIsDrawerOpen(true); }}
                className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 hover:border-black hover:shadow-md transition-all group cursor-pointer flex flex-col gap-4"
              >
                {/* LIGNE DU HAUT : ID et Statut */}
                <div className="flex justify-between items-center w-full border-b border-slate-50 pb-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                    <Hash size={12} className="text-slate-300" /> ID: {req.id}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${req.status === 'PENDING' ? 'border-orange-200 text-orange-600 bg-orange-50' : 'border-emerald-200 text-emerald-600 bg-emerald-50'}`}>
                    {req.status}
                  </span>
                </div>

                {/* LIGNE DU BAS : Client, Date, Bouton, Prix */}
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center text-white font-black text-lg shrink-0 shadow-inner">
                    {req.client?.firstName?.[0]}{req.client?.lastName?.[0]}
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">{req.client?.firstName} {req.client?.lastName}</h3>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mt-1">
                      <CalendarDays size={12} className="text-slate-300" />
                      <span className="text-slate-500">{formatDate(refDate)}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full mx-1"></span>
                      {/* Affichage du "Depuis X jours" (En rouge si ça traîne !) */}
                      <span className={isLate ? "text-red-500 font-black flex items-center gap-1" : "text-slate-500"}>
                        {isLate && <AlertCircle size={10} />} {timeText}
                      </span>
                    </div>
                  </div>

                  {/* Le bouton Relancer (Uniquement si Approved) */}
                  {req.status === 'APPROVED' && (
                    <div className="hidden sm:block px-4 border-r border-slate-100 pr-6">
                      <SendRequestReminderButton 
                        clientUid={req.clientUid} 
                        requestId={req.id} 
                        hasBeenReminded={req.reminderSent} 
                      />
                    </div>
                  )}

                  {/* Le Prix */}
                  <div className="text-right px-2 hidden sm:block">
                    <p className="font-black text-slate-900 text-lg">{formatPrice(req.selection?.mensualite)}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">CHF/m</p>
                  </div>
                  
                  <ChevronRight size={20} className="text-slate-200 group-hover:text-black transition-colors ml-2" />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* CONTENU ONGLET 2 : CONTRATS SIGNÉS */}
      {activeTab === "signed" && (
        <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4">
          {signedPlans.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px]">
              <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-black text-slate-900">Aucun contrat en attente</h3>
              <p className="text-slate-500 font-bold mt-2">Vous êtes à jour ! Les contrats signés par les clients apparaîtront ici.</p>
            </div>
          ) : (
            signedPlans.map((plan, index) => {
              const relatedReq = requests.find(r => r.id === plan.linkedRequestId || r.clientUid === plan.clientUid);
              const clientName = relatedReq?.client ? `${relatedReq.client.firstName} ${relatedReq.client.lastName}` : "Client inconnu";

              return (
              <motion.div 
                key={plan.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
                onClick={() => setSelectedSignedPlan(plan)}
                className="bg-white rounded-[24px] p-5 shadow-sm border border-blue-200 hover:border-blue-500 transition-all group cursor-pointer flex items-center gap-6"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 ${plan.type === "PILIER_3A_BANK" ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                  {plan.type === "PILIER_3A_BANK" ? <Landmark size={24} /> : <ShieldCheck size={24} />}
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-slate-900 tracking-tight">{plan.institutionName}</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                    <User size={10} /> {clientName}
                  </p>
                  <div className="flex flex-col gap-1 mt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Accepté le : {formatDate(plan.metadata?.acceptedAt)}
                    </span>
                    <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full self-start">
                      À TRANSMETTRE COMPAGNIE
                    </span>
                  </div>
                </div>
                <ChevronRight size={20} className="text-slate-200 group-hover:text-blue-500 transition-colors" />
              </motion.div>
            )})
          )}
        </div>
      )}

      {/* CONTENU ONGLET 3 : OFFRES REFUSÉES */}
      {activeTab === "rejected" && (
        <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4">
          {rejectedPlans.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px]">
              <CheckCircle2 size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-black text-slate-900">Aucun refus</h3>
              <p className="text-slate-500 font-bold mt-2">Toutes vos offres sont en bonne voie !</p>
            </div>
          ) : (
            rejectedPlans.map((plan, index) => {
              const relatedReq = requests.find(r => r.id === plan.linkedRequestId || r.clientUid === plan.clientUid);
              const clientName = relatedReq?.client ? `${relatedReq.client.firstName} ${relatedReq.client.lastName}` : "Client inconnu";

              return (
              <motion.div 
                key={plan.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
                onClick={() => {
                  if(confirm("Voulez-vous ouvrir cette offre dans l'éditeur pour l'ajuster et faire une nouvelle proposition ?")) {
                    const planToResend = { ...plan, status: "PENDING_CLIENT" };
                    setPlanToEdit(planToResend);
                    setIsPlanGeneratorOpen(true);
                  }
                }}
                className="bg-white rounded-[24px] p-5 shadow-sm border border-red-200 hover:border-red-500 transition-all group cursor-pointer flex items-start gap-6"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 bg-red-500 shadow-sm mt-1">
                  <X size={28} strokeWidth={3} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-slate-900 tracking-tight text-lg truncate">{plan.institutionName}</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                        <User size={10} /> {clientName}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap ml-2 mt-1">
                      {formatDate(plan.metadata?.rejectedAt)}
                    </span>
                  </div>
                  
                  <div className="mt-3 bg-red-50 p-4 rounded-xl border border-red-100">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <AlertCircle size={12} /> Raison du refus : {plan.metadata?.rejectReason}
                    </p>
                    {plan.metadata?.rejectDetails && (
                      <p className="text-sm font-bold text-red-900/80 leading-snug mt-1">
                        "{plan.metadata.rejectDetails}"
                      </p>
                    )}
                  </div>
                  
                  <p className="text-[10px] text-slate-400 font-bold mt-4 uppercase tracking-widest flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit2 size={12}/> Cliquez pour modifier et refaire une offre
                  </p>
                </div>
              </motion.div>
            )})
          )}
        </div>
      )}

      {/* 👈 NOUVEAU CONTENU ONGLET 4 : BASE CLIENTS */}
      {activeTab === "clients" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4">
          {uniqueClients.length === 0 ? (
            <div className="col-span-full text-center py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px]">
              <Users size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-black text-slate-900">Aucun client trouvé</h3>
              <p className="text-slate-500 font-bold mt-2">Réduisez votre recherche.</p>
            </div>
          ) : (
            uniqueClients.map((client, index) => (
              <motion.div 
                key={client.uid}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
                onClick={() => setSelectedClient360(client)}
                className="group bg-white rounded-[24px] p-5 border border-slate-100 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors shrink-0">
                    <User size={20} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Ligne du haut : UID du client */}
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      No du client : <span className="text-blue-600">{client.uid}</span>
                    </p>

                    {/* Gros Titre : Prénom et Nom */}
                    <p className="text-base font-black text-slate-900 truncate mb-2">
                      {client.firstName} {client.lastName}
                    </p>

                    {/* Détails du profil */}
                    <div className="grid grid-cols-1 gap-y-1.5">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <Mail size={12} className="text-slate-300" />
                        <span className="truncate font-medium">{client.email}</span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <CalendarDays size={12} className="text-slate-300" />
                        <span className={client.dob ? "font-medium text-slate-700" : "italic text-slate-400"}>
                          {client.dob || "Date de naissance"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <MapPin size={12} className="text-slate-300" />
                        <span className={client.address ? "font-medium text-slate-700 truncate" : "italic text-slate-400"}>
                          {client.address || "Adresse"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end justify-between h-full min-h-[80px]">
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-blue-500 group-hover:text-white transition-all">
                      <ChevronRight size={18} />
                    </div>
                    
                    {/* Badges discrets des Agents IA */}
                    <div className="flex flex-col gap-1.5">
                      {client.aiEmails?.missingProfileSent && (
                        <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded-lg" title="Rappel IA (Profil) envoyé">
                          <Sparkles size={14} />
                        </div>
                      )}
                      {client.aiEmails?.lastOfferReminderSentAt && (
                        <div className="bg-blue-50 text-blue-600 p-1.5 rounded-lg" title="Rappel IA (Création d'offre) envoyé">
                          <Mail size={14} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* 👈 NOUVEAU CONTENU ONGLET 5 : EXPERTISES LPP PAYÉES */}
      {activeTab === "expertises" && (
        <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4">
          {expertReviews.length === 0 ? (
            <div className="text-center py-20 bg-indigo-50/30 border-2 border-dashed border-indigo-100 rounded-[32px]">
              <ScanSearch size={48} className="mx-auto text-indigo-200 mb-4" />
              <h3 className="text-xl font-black text-indigo-900">Aucune expertise en attente</h3>
              <p className="text-indigo-900/50 font-bold mt-2">Dès qu'un client paie pour un contrôle, il apparaîtra ici.</p>
            </div>
          ) : (
            expertReviews.map((plan, index) => (
              <motion.div 
                key={plan.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
                className="bg-white rounded-[24px] p-5 shadow-sm border border-indigo-200 hover:border-indigo-500 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-6"
              >
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0 shadow-inner">
                    <Landmark size={28} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 tracking-tight text-lg">Contrôle {plan.institutionName || "LPP"}</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                      <User size={10} /> UID Client : {plan.clientUid.substring(0, 8)}...
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                        19 CHF PAYÉS ({formatDate(plan.metadata?.reviewPaidAt)})
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <button 
                    onClick={() => {
                      if (plan.metadata?.sourceFile || plan.metadata?.sourceFileUrl) {
                        window.open(plan.metadata.sourceFile || plan.metadata.sourceFileUrl, '_blank');
                      } else {
                        toast.error("Impossible de trouver le fichier source original.");
                      }
                    }}
                    className="flex-1 sm:flex-none px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-colors flex justify-center items-center gap-2"
                  >
                    Voir l'original
                  </button>
                  <button 
                    onClick={async () => {
                      // On copie l'UID pour faciliter la recherche s'il faut
                      navigator.clipboard.writeText(plan.clientUid);
                      window.open(`/admin/client/${plan.clientUid}/prevoyance`, '_blank');
                    }}
                    className="flex-1 sm:flex-none px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-md transition-colors flex justify-center items-center gap-2"
                  >
                    Corriger & Valider
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* 👈 NOUVEAU CONTENU ONGLET 6 : RAPPELS */}
      {activeTab === "rappels" && (
        <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4">
          {callbacks.length === 0 ? (
            <div className="text-center py-20 bg-orange-50/30 border-2 border-dashed border-orange-200 rounded-[32px]">
              <PhoneCall size={48} className="mx-auto text-orange-300 mb-4" />
              <h3 className="text-xl font-black text-orange-900">Aucun rappel en attente</h3>
              <p className="text-orange-900/50 font-bold mt-2">Votre liste d'appels est vide.</p>
            </div>
          ) : (
            callbacks.map((lead, index) => {
              const isExecute = lead.status === "execute";
              const isScheduled = lead.status === "rappel_programme" || lead.rdv;
              const date = lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleString('fr-CH') : "Date inconnue";

              return (
                <motion.div 
                  key={lead.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
                  className={`bg-white rounded-[24px] p-5 shadow-sm border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-6 ${isExecute ? 'opacity-60 border-slate-100 bg-slate-50' : isScheduled ? 'border-indigo-200 hover:border-indigo-500' : 'border-orange-200 hover:border-orange-500'}`}
                >
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${isExecute ? 'bg-slate-200 text-slate-400' : isScheduled ? 'bg-indigo-100 text-indigo-600' : 'bg-orange-100 text-orange-600'}`}>
                      {isScheduled ? <CalendarDays size={28} /> : <PhoneCall size={28} />}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 tracking-tight text-lg">
                        {lead.client?.firstName} {lead.client?.lastName || ""}
                      </h3>
                      <p className="text-sm font-bold text-slate-600 mt-0.5 flex items-center gap-1.5">
                        <Phone size={14} className="text-slate-400" /> {lead.client?.phone || "Numéro inconnu"}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${isExecute ? 'bg-slate-100 text-slate-500 border-slate-200' : isScheduled ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                          {isExecute ? "Traité" : isScheduled ? "Planifié" : "Rappel 5 min"}
                        </span>
                        {!isExecute && isScheduled && lead.rdv && (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            Le {new Date(lead.rdv.start).toLocaleString('fr-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' })}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 flex items-center gap-1">
                          <Clock size={10} /> Reçu le {date}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    {!isExecute ? (
                      <button 
                        onClick={async () => {
                          try {
                            await updateDoc(doc(db, "leads-3a", lead.id), { status: "execute" });
                            toast.success("Marqué comme traité !");
                          } catch(e) { toast.error("Erreur lors de la mise à jour"); }
                        }}
                        className="flex-1 sm:flex-none px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 shadow-md transition-colors flex justify-center items-center gap-2"
                      >
                        <CheckCircle2 size={16} /> Marqué comme appelé
                      </button>
                    ) : (
                      <div className="px-6 py-3 text-slate-400 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle2 size={16} /> Terminé
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* TIROIR DÉTAILS DEMANDE ORIGINALE (Déjà existant) */}
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerContent className="h-[96vh] flex flex-col bg-[#F8F9FB] border-none font-sans rounded-t-[32px] outline-none">
          {selectedReq && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="w-full max-w-6xl mx-auto px-8 py-6 flex justify-between items-center shrink-0 border-b border-slate-200/50">
                <div>
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Dossier de souscription</span>
                   <DrawerTitle className="text-3xl font-black tracking-tighter text-slate-900 mt-1 uppercase">
                     {selectedReq.client?.firstName} {selectedReq.client?.lastName}
                   </DrawerTitle>
                </div>
                <button onClick={() => setIsDrawerOpen(false)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto w-full">
                <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
                  
                  {/* --- SECTION 1 : RAPPELS (Le Contexte) --- */}
                  {/* Affichage en 4 bannières horizontales pleine largeur (100%) */}
                  <div className="flex flex-col gap-4">
                    
                    {/* CARTE 1 : CLIENT */}
                    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6">
                      <div className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4 flex flex-col justify-center">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-2"><User size={14}/> Client</h3>
                        <p className="text-xl font-black text-slate-900 leading-tight">{selectedReq.client?.firstName} {selectedReq.client?.lastName}</p>
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2">
                        {clientPersonalInfo && (
                          <>
                            <DetailRow icon={<User size={14}/>} label="Sexe / Civilité" value={optionsSexe.find(o => o.id === Number(clientPersonalInfo?.Enter_sexe))?.label || clientPersonalInfo?.Enter_civilite || "Non renseigné"} last />
                            <DetailRow icon={<CalendarDays size={14}/>} label="Date de naissance" value={clientPersonalInfo.Enter_dateNaissance} last />
                            <DetailRow icon={<Heart size={14}/>} label="État civil" value={optionsEtatCivil.find(o => o.id === Number(clientPersonalInfo?.Enter_etatCivil))?.label || "Non renseigné"} last />
                          </>
                        )}
                        <DetailRow icon={<Mail size={14}/>} label="Email" value={selectedReq.client?.email} last />
                        <DetailRow icon={<Phone size={14}/>} label="Téléphone" value={selectedReq.client?.phone} last />
                        <DetailRow icon={<MapPin size={14}/>} label="Nationalité" value={selectedReq.client?.nationality} last />
                        {selectedReq.client?.permit && selectedReq.client?.permit !== "N/A" && (
                          <DetailRow icon={<ShieldCheck size={14}/>} label="Permis" value={selectedReq.client?.permit} last />
                        )}
                        <DetailRow icon={<Briefcase size={14}/>} label="Profession" value={selectedReq.client?.profession} last />
                        <div className="sm:col-span-2 lg:col-span-4">
                          <DetailRow icon={<MapPin size={14}/>} label="Adresse" value={selectedReq.client?.address} last />
                        </div>
                      </div>
                    </div>

                    {/* CARTE 2 : SANTÉ */}
                    <div className={`rounded-[24px] p-6 border-2 flex flex-col md:flex-row gap-6 ${selectedReq.sante?.healthOk ? 'bg-white border-transparent shadow-sm' : 'bg-orange-50 border-orange-200'}`}>
                      <div className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4 flex flex-col justify-center">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-2"><Stethoscope size={14}/> Santé</h3>
                      </div>
                      <div className="flex-1 flex flex-wrap items-center gap-12">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Fumeur</span>
                          <span className="font-black text-sm text-slate-900">{selectedReq.sante?.isSmoker ? "Oui 🚬" : "Non 🚭"}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Morphologie</span>
                          <span className="font-black text-sm text-slate-900">{selectedReq.sante?.height}cm / {selectedReq.sante?.weight}kg</span>
                        </div>
                        {!selectedReq.sante?.healthOk && (
                          <div className="md:ml-auto px-4 py-3 bg-white rounded-xl border border-orange-200 flex items-center gap-3 text-orange-800">
                            <AlertCircle size={16} className="shrink-0" />
                            <p className="text-[11px] font-bold leading-tight uppercase tracking-tight">Antécédents déclarés. Vigilance requise.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CARTE 3 : DEMANDE INITIALE */}
                    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6">
                      <div className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4 flex flex-col justify-center">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-2"><Sparkles size={14}/> Demande Initiale</h3>
                      </div>
                      <div className="flex-1 flex flex-col sm:flex-row gap-8 items-start sm:items-center">
                        <div className="flex-1">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Objectifs sélectionnés</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedReq.strategie?.objectives?.map((obj: string) => (
                              <span key={obj} className="px-3 py-1.5 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 uppercase">
                                {obj === 'fiscal' ? 'Fiscalité' : obj === 'yield' ? 'Rendement' : obj === 'immo' ? 'Immobilier' : obj === 'protection_family' ? 'Décès' : 'Revenu'}
                              </span>
                            )) || <span className="text-xs text-slate-300 italic">Aucun</span>}
                          </div>
                        </div>
                        <div className="sm:w-64 shrink-0">
                          <DetailRow 
                            icon={<Landmark size={14}/>} 
                            label="Approche choisie" 
                            value={selectedReq.strategie?.philosophy === 'flexibility' ? "Flexible (Banque)" : selectedReq.strategie?.philosophy === 'security' ? "Régulière (Assurance)" : "Non définie"} 
                            last
                          />
                        </div>
                      </div>
                    </div>

                    {/* CARTE 4 : STRATÉGIE CONSEILLÉE */}
                    <div className="bg-slate-900 text-white rounded-[24px] p-6 shadow-sm flex flex-col md:flex-row gap-6">
                      <div className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-700 pb-4 md:pb-0 md:pr-4 flex flex-col justify-center">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-2"><ShieldCheck size={14}/> Stratégie Conseillée</h3>
                      </div>
                      <div className="flex-1 flex flex-wrap items-center justify-between gap-6">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Véhicule</span>
                          <span className="font-black text-blue-400 uppercase text-lg">{selectedReq.strategie?.recommandation}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Profil de risque</span>
                          <span className="font-black text-white capitalize text-lg">{selectedReq.strategie?.riskProfile}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cible Mensuelle</span>
                          <p className="text-3xl font-black tracking-tighter">{formatPrice(selectedReq.selection?.mensualite)} <span className="text-sm font-bold text-slate-400">CHF/m</span></p>
                        </div>
                      </div>
                      
                      {/* Affichage du Split 3A / 3B si le plafond est atteint */}
                      {selectedReq.selection?.details?.epargne?.isSpillover && (
                        <div className="w-full md:w-auto md:min-w-[200px] border-t md:border-t-0 md:border-l border-slate-700 pt-4 md:pt-0 md:pl-6 flex flex-col justify-center space-y-2 animate-in fade-in duration-300">
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                            <Landmark size={12} /> Plafond 3A atteint
                          </p>
                          <div className="flex justify-between items-center text-xs font-bold text-slate-300 gap-4">
                            <span>Part 3A</span>
                            <span className="text-white bg-slate-800 px-2 py-0.5 rounded-md">{formatPrice(selectedReq.selection?.details?.epargne?.split3a)} CHF</span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-bold text-slate-300 gap-4">
                            <span>Part 3B</span>
                            <span className="text-white bg-slate-800 px-2 py-0.5 rounded-md">{formatPrice(selectedReq.selection?.details?.epargne?.split3b)} CHF</span>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>


                  {/* 👈 RÉCAPITULATIF LSFIN 3 COLONNES : CREDITX / AXA / SWISSLIFE */}
                  {selectedReq.questionnaireInvestisseur && (
                    <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden mt-8">
                      <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <div>
                          <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                            <Landmark className="text-blue-600" /> Mapping LSFin & Compagnies
                          </h3>
                          <p className="text-xs font-bold text-slate-500 mt-1">Comparatif direct des 16 critères pour la saisie dans les portails.</p>
                        </div>
                      </div>

                      <div className="p-0">
                        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                          
                          {/* COLONNE 1 : CREDITX (Original) */}
                          <div className="p-6 space-y-2 bg-white">
                            <div className="flex items-center gap-3 mb-6">
                              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-black text-[10px]">CX</div>
                              <p className="font-black text-slate-900 uppercase tracking-tighter">Réponses CreditX</p>
                            </div>
                            <DetailRow label="1. Exp. Assurances Vie" value={selectedReq.questionnaireInvestisseur.expAssurance ? "Oui" : "Non"} />
                            <DetailRow label="2. Exp. Fonds Placement" value={selectedReq.questionnaireInvestisseur.expFonds ? "Oui" : "Non"} />
                            <DetailRow label="3. Revenu Mensuel" value={selectedReq.questionnaireInvestisseur.revenuMensuel} />
                            <DetailRow label="4. Engagements Mensuels" value={selectedReq.questionnaireInvestisseur.engagements} />
                            <DetailRow label="5. Fortune Globale (Brute)" value={selectedReq.questionnaireInvestisseur.fortuneGlobale} />
                            <DetailRow label="6. Fortune Disponible (Nette)" value={selectedReq.questionnaireInvestisseur.fortuneLiquide} />
                            <DetailRow label="7. Évolution Revenus" value={selectedReq.questionnaireInvestisseur.evolutionRevenus} />
                            <DetailRow label="8. Capacité Épargne (%)" value={selectedReq.questionnaireInvestisseur.epargnePourcent} />
                            <DetailRow label="9. Dépenses Prévues" value={selectedReq.questionnaireInvestisseur.depensesPrevues} />
                            <DetailRow label="10. Réserve de Sécurité" value={selectedReq.questionnaireInvestisseur.reserveMois} />
                            <DetailRow label="11. Personnes à Charge" value={selectedReq.questionnaireInvestisseur.personnesCharge} />
                            <DetailRow label="12. Horizon Long Terme" value={selectedReq.questionnaireInvestisseur.horizonLong ? "Oui" : "Non"} />
                            <DetailRow label="13. Perte Acceptable" value={selectedReq.questionnaireInvestisseur.perteAcceptable} />
                            <DetailRow label="14. Objectif Risque/Rend." value={selectedReq.questionnaireInvestisseur.objectifRendement} />
                            <DetailRow label="15. Scénarios (1 à 5)" value={`Scénario ${selectedReq.questionnaireInvestisseur.scenario}`} />
                            <DetailRow label="16. Réaction à la Baisse" value={selectedReq.questionnaireInvestisseur.reactionBaisse} />
                            <DetailRow label="17. Critères ESG" value={selectedReq.questionnaireInvestisseur.critereESG} last />
                          </div>

                          {/* COLONNE 2 : AXA */}
                          <div className="p-6 space-y-2 bg-blue-50/30">
                            <div className="flex items-center gap-3 mb-6">
                              <div className="w-8 h-8 bg-[#00008f] rounded-lg flex items-center justify-center text-white font-black text-[10px]">AXA</div>
                              <p className="font-black text-[#00008f] uppercase tracking-tighter">Portail AXA</p>
                            </div>
                            <DetailRow label="Comprendre SmartFlex" value={selectedReq.questionnaireInvestisseur.expAssurance ? "Oui" : "Non"} />
                            <DetailRow label="Exp. des actions" value={selectedReq.questionnaireInvestisseur.expFonds ? "Oui" : "Non"} />
                            <DetailRow label="Revenu annuel brut" value={
                              selectedReq.questionnaireInvestisseur.revenuMensuel === "<4000" ? "0 à 29'999" : 
                              selectedReq.questionnaireInvestisseur.revenuMensuel === "4000-6000" ? "30'000 à 74'999" : 
                              selectedReq.questionnaireInvestisseur.revenuMensuel === "6000-9000" || selectedReq.questionnaireInvestisseur.revenuMensuel === "9000-12000" ? "75'000 à 149'999" : "150'000 à 250'000"
                            } />
                            <DetailRow label="Engagements" value="-" />
                            <DetailRow label="Fortune totale" value={
                              selectedReq.questionnaireInvestisseur.fortuneGlobale === "0" ? "Je n'ai pas de fortune" : 
                              selectedReq.questionnaireInvestisseur.fortuneGlobale === "<50000" ? "Moins de 50'000" : 
                              selectedReq.questionnaireInvestisseur.fortuneGlobale === "50000-249999" ? "50'000 à 249'999" : 
                              selectedReq.questionnaireInvestisseur.fortuneGlobale === "250000-999999" ? "250'000 à 999'999" : 
                              selectedReq.questionnaireInvestisseur.fortuneGlobale === "1M-3M" ? "1 MIO. à 3 MIO." : "Plus de 3 MIO."
                            } />
                            <DetailRow label="Fortune dispo." value="-" />
                            <DetailRow label="Évolution 3 pro. années" value={
                              selectedReq.questionnaireInvestisseur.evolutionRevenus === "hausse" ? "À la hausse" : 
                              selectedReq.questionnaireInvestisseur.evolutionRevenus === "baisse" ? "À la baisse" : "Stables"
                            } />
                            <DetailRow label="% revenu épargné" value={
                              selectedReq.questionnaireInvestisseur.epargnePourcent === "0%" ? "Je ne peux pas" : 
                              selectedReq.questionnaireInvestisseur.epargnePourcent === "<10%" ? "Moins de 10%" : 
                              selectedReq.questionnaireInvestisseur.epargnePourcent === "10-20%" ? "Entre 10 et 20%" : "Plus de 20%"
                            } />
                            <DetailRow label="Dépenses importantes" value={
                              selectedReq.questionnaireInvestisseur.depensesPrevues === "non" ? "Non" : 
                              selectedReq.questionnaireInvestisseur.depensesPrevues === "<20%" ? "Oui, moins de 20%" : 
                              selectedReq.questionnaireInvestisseur.depensesPrevues === "20-40%" ? "Oui, entre 20% et 40%" : "Oui, plus de 40%"
                            } />
                            <DetailRow label="Réserve de sécurité" value={
                              selectedReq.questionnaireInvestisseur.reserveMois === "<3" ? "Moins de 3 mois" : 
                              selectedReq.questionnaireInvestisseur.reserveMois === "3-6" ? "Entre 3 et 6 mois" : 
                              selectedReq.questionnaireInvestisseur.reserveMois === "7-12" ? "Entre 7 et 12 mois" : "Plus de 12 mois"
                            } />
                            <DetailRow label="Personnes à charge" value={
                              selectedReq.questionnaireInvestisseur.personnesCharge === "0" ? "Aucune" : 
                              selectedReq.questionnaireInvestisseur.personnesCharge === "1" ? "1" : 
                              selectedReq.questionnaireInvestisseur.personnesCharge === "2-3" ? "2 ou 3" : 
                              selectedReq.questionnaireInvestisseur.personnesCharge === "4-5" ? "4 ou 5" : "Plus de 5"
                            } />
                            <DetailRow label="Horizon de placement" value={selectedReq.questionnaireInvestisseur.horizonLong ? "15 ans ou plus" : "Max 14 ans"} />
                            <DetailRow label="Pertes acceptables" value="-" />
                            <DetailRow label="But investissement" value={
                              selectedReq.questionnaireInvestisseur.objectifRendement === "securite" ? "Risque faible / pas priorité" : 
                              selectedReq.questionnaireInvestisseur.objectifRendement === "prudent" || selectedReq.questionnaireInvestisseur.objectifRendement === "equilibre" ? "Risque accepté / gains modérés" : "Risque élevé / gains importants"
                            } />
                            <DetailRow label="Scénarios rendement" value={
                              selectedReq.questionnaireInvestisseur.scenario === "1" ? "-1% à +1%" : 
                              selectedReq.questionnaireInvestisseur.scenario === "2" ? "-3% à +5%" : 
                              selectedReq.questionnaireInvestisseur.scenario === "3" ? "-8% à +12%" : 
                              selectedReq.questionnaireInvestisseur.scenario === "4" ? "-13% à +19%" : "-18% à +26%"
                            } />
                            <DetailRow label="Baisse de 10%" value={
                              selectedReq.questionnaireInvestisseur.reactionBaisse === "vente_totale" ? "Je vends tout" : 
                              selectedReq.questionnaireInvestisseur.reactionBaisse === "vente_partielle" ? "Je vends une partie" : 
                              selectedReq.questionnaireInvestisseur.reactionBaisse === "attente" ? "Je ne fais rien" : "J'investis davantage"
                            } />
                            <DetailRow label="Aspects durabilité" value={
                              selectedReq.questionnaireInvestisseur.critereESG === "non" ? "Pas de préférence" : 
                              selectedReq.questionnaireInvestisseur.critereESG === "esg" ? "Encouragé" : "Objectif de durabilité"
                            } last />
                          </div>

                          {/* COLONNE 3 : SWISSLIFE */}
                          <div className="p-6 space-y-2 bg-red-50/30">
                            <div className="flex items-center gap-3 mb-6">
                              <div className="w-8 h-8 bg-[#e10613] rounded-lg flex items-center justify-center text-white font-black text-[10px]">SL</div>
                              <p className="font-black text-[#e10613] uppercase tracking-tighter">Portail SwissLife</p>
                            </div>
                            <DetailRow label="Exp. Assurance Vie" value={selectedReq.questionnaireInvestisseur.expAssurance ? "Oui" : "Non"} />
                            <DetailRow label="Connaissance Fonds" value={selectedReq.questionnaireInvestisseur.expFonds ? "Oui" : "Non"} />
                            <DetailRow label="Revenu du ménage" value={
                              selectedReq.questionnaireInvestisseur.revenuMensuel === "<4000" ? "Moins de 4000" : 
                              selectedReq.questionnaireInvestisseur.revenuMensuel === "4000-6000" ? "4000 à 6000" : 
                              selectedReq.questionnaireInvestisseur.revenuMensuel === "6000-9000" ? "6000 à 9000" : 
                              selectedReq.questionnaireInvestisseur.revenuMensuel === "9000-12000" ? "9000 à 12'000" : "Plus de 12'000"
                            } />
                            <DetailRow label="Engagements financiers" value={
                              selectedReq.questionnaireInvestisseur.engagements === "<2000" ? "Moins de 2000" : 
                              selectedReq.questionnaireInvestisseur.engagements === "2000-3000" ? "2000 à 3000" : 
                              selectedReq.questionnaireInvestisseur.engagements === "3000-5000" ? "3000 à 5000" : 
                              selectedReq.questionnaireInvestisseur.engagements === "5000-8000" ? "5000 à 8000" : "Plus de 8000"
                            } />
                            <DetailRow label="Fortune totale" value="-" />
                            <DetailRow label="Fortune disponible" value={
                              selectedReq.questionnaireInvestisseur.fortuneLiquide === "<50000" ? "Moins de 50'000" : 
                              selectedReq.questionnaireInvestisseur.fortuneLiquide === "50000-100000" ? "50'000 à 100'000" : 
                              selectedReq.questionnaireInvestisseur.fortuneLiquide === "100000-250000" ? "100'000 à 250'000" : 
                              selectedReq.questionnaireInvestisseur.fortuneLiquide === "250000-1000000" ? "250'000 à 1'000'000" : "Plus de 1'000'000"
                            } />
                            <DetailRow label="Évolution Revenus" value="-" />
                            <DetailRow label="Capacité Épargne" value="-" />
                            <DetailRow label="Dépenses Prévues" value="-" />
                            <DetailRow label="Réserve de Sécurité" value="-" />
                            <DetailRow label="Personnes à Charge" value="-" />
                            <DetailRow label="Sans besoin impératif" value={selectedReq.questionnaireInvestisseur.horizonLong ? "Oui" : "Non"} />
                            <DetailRow label="Perte acceptable" value={
                              selectedReq.questionnaireInvestisseur.perteAcceptable === "minime" ? "Pertes minimes" : 
                              selectedReq.questionnaireInvestisseur.perteAcceptable === "moderee" ? "Pertes modérées" : 
                              selectedReq.questionnaireInvestisseur.perteAcceptable === "importante" ? "Pertes plus importantes" : "Pertes élevées"
                            } />
                            <DetailRow label="Objectif de rendement" value={
                              selectedReq.questionnaireInvestisseur.objectifRendement === "securite" ? "Maintien du capital prioritaire" : 
                              selectedReq.questionnaireInvestisseur.objectifRendement === "prudent" ? "Risque léger / Rendement modéré" : 
                              selectedReq.questionnaireInvestisseur.objectifRendement === "equilibre" ? "Risque accru / Rendements élevés" : "Rendement maximal / Risques élevés"
                            } />
                            <DetailRow label="Scénarios" value="-" />
                            <DetailRow label="Réaction Baisse" value="-" />
                            <DetailRow label="Critères ESG" value="-" last />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}


                  {/* --- SECTION 2 : LE TABLEAU DE RÉFÉRENCE --- */}
                  <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-8 border-b border-slate-100">
                      <h3 className="text-xl font-black text-slate-900">Analyse de l'algorithme (Demande du client)</h3>
                      <p className="text-xs font-bold text-slate-500 mt-1">Utilisez ces données pour générer vos contrats définitifs.</p>
                    </div>
                    <div className="px-8 pb-8">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b-2 border-slate-900 text-slate-400 text-[10px] uppercase tracking-widest">
                            <th className="py-4 font-black w-1/3">Garantie</th>
                            <th className="py-4 font-black w-1/4">Lacune identifiée</th>
                            <th className="py-4 font-black w-1/4">Prime Mensuelle</th>
                            <th className="py-4 font-black w-1/6">Partenaire</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {/* ÉPARGNE */}
                          <tr className="border-b border-slate-100 group hover:bg-slate-50 transition-colors">
                            <td className="py-5 pr-4">
                              <p className="font-black text-slate-900 text-base">Partie Épargne</p>
                              <p className="text-xs text-slate-500 font-medium capitalize mt-1">Stratégie : {selectedReq.strategie?.riskProfile}</p>
                            </td>
                            <td className="py-5 font-bold text-slate-600">
                              {selectedReq.selection?.lacuneRetraite > 0 ? `${fmt.format(selectedReq.selection?.lacuneRetraite)}.-` : '0'}
                            </td>
                            <td className="py-5 font-black text-slate-900 text-lg">
                              {formatPrice(selectedReq.selection?.details?.epargne?.montant)}
                            </td>
                            <td className="py-5">
                              <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-tight">
                                {selectedReq.selection?.details?.epargne?.compagnie}
                              </span>
                            </td>
                          </tr>

                          {/* DÉCÈS */}
                          <tr className="border-b border-slate-100 group hover:bg-slate-50 transition-colors">
                            <td className="py-5 pr-4">
                              <p className="font-black text-slate-900 text-base">Risque Décès</p>
                            </td>
                            <td className="py-5 font-bold text-red-600">
                              {selectedReq.selection?.details?.deces?.lacune > 0 ? `${fmt.format(selectedReq.selection?.details?.deces?.lacune)}.-` : '0'}
                            </td>
                            <td className="py-5 font-black text-slate-900 text-lg">
                              {selectedReq.selection?.details?.deces?.prix > 0 ? formatPrice(selectedReq.selection?.details?.deces?.prix) : 'Inclus'}
                            </td>
                            <td className="py-5">
                              {selectedReq.selection?.details?.deces?.prix > 0 ? (
                                <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-tight">
                                  {selectedReq.selection?.details?.deces?.compagnie}
                                </span>
                              ) : <span className="text-slate-400 text-xs italic">-</span>}
                            </td>
                          </tr>

                          {/* IG MALADIE */}
                          <tr className="border-b border-slate-50 group hover:bg-slate-50 transition-colors">
                            <td className="py-5 pr-4 align-top">
                              <p className="font-black text-slate-900 text-base">Incapacité de gain</p>
                              <p className="text-xs text-slate-500 font-bold mt-1">Maladie</p>
                            </td>
                            <td className="py-5 align-top font-bold text-orange-600">
                              {selectedReq.selection?.details?.invalidite?.lacuneMaladie > 0 ? `${fmt.format(selectedReq.selection?.details?.invalidite?.lacuneMaladie)}.- / an` : '0'}
                            </td>
                            <td className="py-5 align-top font-black text-slate-900 text-lg" rowSpan={2}>
                               {selectedReq.selection?.details?.invalidite?.prix > 0 ? formatPrice(selectedReq.selection?.details?.invalidite?.prix) : '0.00'}
                            </td>
                            <td className="py-5 align-top" rowSpan={2}>
                              {selectedReq.selection?.details?.invalidite?.prix > 0 ? (
                                <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-tight">
                                  {selectedReq.selection?.details?.invalidite?.compagnie}
                                </span>
                              ) : <span className="text-slate-400 text-xs italic">-</span>}
                            </td>
                          </tr>

                          {/* IG ACCIDENT */}
                          <tr className="border-b border-slate-100 group hover:bg-slate-50 transition-colors">
                            <td className="pb-5 pr-4 align-top">
                              <p className="text-xs text-slate-500 font-bold">Accident</p>
                            </td>
                            <td className="pb-5 align-top font-bold text-orange-600">
                              {selectedReq.selection?.details?.invalidite?.lacuneAccident > 0 ? `${fmt.format(selectedReq.selection?.details?.invalidite?.lacuneAccident)}.- / an` : '0'}
                            </td>
                          </tr>

                          {/* LIBÉRATION */}
                          <tr className="group hover:bg-slate-50 transition-colors">
                            <td className="py-5 pr-4">
                              <p className="font-black text-slate-900 text-base">Libération des primes</p>
                            </td>
                            <td className="py-5 font-bold text-slate-400 italic">
                              -
                            </td>
                            <td className="py-5 font-black text-slate-900 text-lg">
                              {selectedReq.selection?.details?.liberation?.prix > 0 ? formatPrice(selectedReq.selection?.details?.liberation?.prix) : <span className="text-slate-400 text-sm font-bold">Non désiré</span>}
                            </td>
                            <td className="py-5">
                              {selectedReq.selection?.details?.liberation?.prix > 0 ? (
                                <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-tight">
                                  {selectedReq.selection?.details?.liberation?.compagnie}
                                </span>
                              ) : <span className="text-slate-400 text-xs italic">-</span>}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* --- SECTION 3 : LE PANIER (Où tu agis) --- */}
                  <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden mt-8">
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-blue-50/30">
                      <div>
                        <h3 className="text-xl font-black text-slate-900">Offres Définitives (Votre Dossier)</h3>
                        <p className="text-xs font-bold text-slate-500 mt-1">Ce sont ces contrats qui seront envoyés au client pour signature.</p>
                      </div>
                      <Button onClick={openGeneratorForNewPlan} className="rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2">
                        <Plus size={16} /> Ajouter un contrat
                      </Button>
                    </div>
                    
                    <div className="p-8">
                      {draftPlans.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-[24px]">
                          <p className="text-sm font-bold text-slate-400">Aucun contrat ajouté pour le moment. Cliquez sur Ajouter un contrat.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {draftPlans.map((plan) => (
                            <div key={plan.id} className="flex justify-between items-center p-5 rounded-2xl border border-slate-100 bg-slate-50 hover:border-blue-300 cursor-pointer group transition-colors">
                              <div className="flex items-center gap-4 flex-1" onClick={() => openEditorForPlan(plan)}>
                                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400 group-hover:text-blue-600">
                                  {plan.type === "PILIER_3A_BANK" ? <Landmark size={20} /> : <ShieldCheck size={20} />}
                                </div>
                                <div>
                                  <p className="font-black text-slate-900">{plan.institutionName}</p>
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Prime : {formatPrice(plan.data?.primeTotale || plan.data?.montantRegulier)} CHF/m</p>
                                </div>
                              </div>
                              <button onClick={() => handleDeleteDraft(plan.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2 z-10 relative">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BOUTON FINAL DE VALIDATION */}
                  <div className="pt-4 pb-12">
                    <Button 
                      onClick={handleFinalizeDossier}
                      disabled={draftPlans.length === 0}
                      className="w-full py-8 rounded-[24px] bg-black hover:bg-slate-800 text-white font-black text-lg shadow-xl uppercase tracking-tighter disabled:opacity-30"
                    >
                      Valider le dossier complet & Notifier le client
                    </Button>
                  </div>

                </div>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* 👈 NOUVEAU TIROIR : DOSSIER CLIENT 360° */}
      <Drawer open={selectedClient360 !== null} onOpenChange={(open) => !open && setSelectedClient360(null)}>
        <DrawerContent className="h-[96vh] flex flex-col bg-[#F8F9FB] border-none font-sans rounded-t-[32px] outline-none">
          {selectedClient360 && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header 360 */}
              <div className="w-full max-w-7xl mx-auto px-8 py-6 flex justify-between items-center shrink-0 border-b border-slate-200/50 bg-white z-10">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">
                    {selectedClient360.firstName?.[0]}{selectedClient360.lastName?.[0]}
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Dossier Client 360°</span>
                      <DrawerTitle className="text-3xl font-black tracking-tighter text-slate-900 mt-0.5">
                        {selectedClient360.firstName} {selectedClient360.lastName}
                      </DrawerTitle>
                    </div>
                    {/* 👈 LES BOUTONS D'ACTION RAPIDE */}
                    <div className="flex items-center gap-2 mt-1">
                      <button 
                        onClick={() => window.open(`/admin/conseil/${selectedClient360.uid}`, '_blank')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Users size={12} /> Nouveau conseil
                      </button>
                      <button 
                        onClick={() => {
                          setProactiveClientUid(selectedClient360.uid);
                          setIsPlanGeneratorOpen(true);
                        }}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Sparkles size={12} /> Offre Proactive
                      </button>
                      <button 
                        onClick={() => window.open(`/admin/client/${selectedClient360.uid}/prevoyance`, '_blank')}
                        className="px-4 py-2 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors"
                      >
                        Dossier
                      </button>
                      <button 
                        onClick={() => window.open(`/admin/clients/${selectedClient360.uid}/documents`, '_blank')}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                      >
                        <FolderLock size={12} />
                      </button>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedClient360(null)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center shadow-sm hover:bg-slate-200 transition-colors"><X size={24} /></button>
              </div>

              {/* Contenu 360 */}
              <div className="flex-1 overflow-y-auto w-full p-8 pb-32">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
                  
                  {/* Colonne Gauche : Contacts & Historique */}
                  <div className="space-y-6">
                    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 space-y-4">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <User size={14}/> Coordonnées
                      </h3>
                      <div className="space-y-2">
                        <DetailRow icon={<Mail size={14}/>} label="Email" value={selectedClient360.email} />
                        <DetailRow icon={<Phone size={14}/>} label="Téléphone" value={selectedClient360.phone} last />
                      </div>
                    </div>
                    {/* NOUVEAU : Encadré Assistant IA */}
                    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 space-y-4">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Sparkles size={14} className="text-blue-500" /> Assistant IA
                      </h3>
                      <div className="space-y-3">
                        {/* AGENT 1 : PROFIL */}
                        {selectedClient360.aiEmails?.missingProfileSent ? (
                          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3">
                            <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-black text-emerald-900">Rappel profil</p>
                              <p className="text-[10px] font-bold text-emerald-600 mt-0.5">
                                Envoyé le {selectedClient360.aiEmails?.lastSentAt ? formatDate(selectedClient360.aiEmails.lastSentAt) : "Date inconnue"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                            <Clock size={16} className="text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-black text-slate-600">Rappel profil</p>
                              <p className="text-[10px] font-bold text-slate-400 mt-0.5 leading-snug">
                                Profil complet ou non déclenché.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* AGENT 2 : OFFRE */}
                        {selectedClient360.aiEmails?.lastOfferReminderSentAt ? (
                          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-3">
                            <Mail size={16} className="text-blue-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-black text-blue-900">Relance création offre</p>
                              <p className="text-[10px] font-bold text-blue-600 mt-0.5">
                                Envoyé le {formatDate(selectedClient360.aiEmails.lastOfferReminderSentAt)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                            <Clock size={16} className="text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-black text-slate-600">Relance création offre</p>
                              <p className="text-[10px] font-bold text-slate-400 mt-0.5 leading-snug">
                                Conditions non remplies ou en attente.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Colonne Droite (plus large) : Portefeuille & Offres */}
                  <div className="lg:col-span-2 space-y-8">
                    
                    {/* CONTRATS ACTIFS */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                        <ShieldCheck size={18} className="text-emerald-500"/> Contrats Actifs en Portefeuille
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {client360Plans.filter(p => p.status === "ACTIVE" || !p.status).length === 0 && (
                          <div className="col-span-full p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 font-bold text-sm">
                            Aucun contrat actif trouvé pour ce client.
                          </div>
                        )}
                        {client360Plans.filter(p => p.status === "ACTIVE" || !p.status).map(p => (
                          <div key={p.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                              {p.type === "PILIER_3A_BANK" ? <Landmark size={20} /> : <ShieldCheck size={20} />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-black text-slate-900 truncate">{p.institutionName}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.type === "LPP_BASE" ? "Professionnel" : "Privé"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* OFFRES EN COURS */}
                    <div className="space-y-4 pt-4">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                        <Clock size={18} className="text-orange-500"/> Offres en cours
                      </h3>
                      <div className="grid grid-cols-1 gap-3">
                        {client360Plans.filter(p => p.status === "PENDING_CLIENT" || p.status === "PENDING_INSURANCE").length === 0 && (
                          <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 font-bold text-sm">
                            Aucune offre en cours.
                          </div>
                        )}
                        {client360Plans.filter(p => p.status === "PENDING_CLIENT" || p.status === "PENDING_INSURANCE").map(p => (
                          <div key={p.id} className="bg-white p-4 rounded-xl border border-orange-100 flex justify-between items-center flex-wrap gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shrink-0"><Clock size={16}/></div>
                              <p className="font-black text-slate-900">{p.institutionName}</p>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {/* Conseil fait en direct + signature papier : on finalise nous-mêmes
                                  (upload police/documents + n° de police + activation) sans passer
                                  par l'e-signature du client. */}
                              <button
                                onClick={() => { setSelectedSignedPlan({ ...p, clientUid: selectedClient360.uid }); setSelectedClient360(null); }}
                                title="Le client a signé en direct (papier) : ajouter la police et les documents, puis activer le contrat"
                                className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-full transition-colors shrink-0"
                              >
                                <FileSignature size={12} /> Signé en direct
                              </button>

                              {/* Le bouton de relance n'apparaît que si l'offre est en attente du client */}
                              {p.status === "PENDING_CLIENT" && (
                                <SendReminderButton clientUid={selectedClient360.uid} planId={p.id} hasBeenReminded={p.reminderSent} />
                              )}

                              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 text-center shrink-0">
                                {p.status === "PENDING_CLIENT" ? "En attente Client" : "En traitement Cie"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* REFUSÉES */}
                    <div className="space-y-4 pt-4">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                        <X size={18} className="text-red-500"/> Offres Refusées
                      </h3>
                      <div className="grid grid-cols-1 gap-3">
                        {client360Plans.filter(p => p.status === "REJECTED_CLIENT").length === 0 && (
                          <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 font-bold text-sm">
                            Aucun refus dans l'historique.
                          </div>
                        )}
                        {client360Plans.filter(p => p.status === "REJECTED_CLIENT").map(p => (
                          <div key={p.id} className="bg-red-50 p-4 rounded-xl border border-red-100">
                            <div className="flex justify-between items-center mb-2">
                              <p className="font-black text-slate-900">{p.institutionName}</p>
                              <p className="text-[10px] font-bold text-red-400">{formatDate(p.metadata?.rejectedAt)}</p>
                            </div>
                            <p className="text-xs font-black text-red-600 mb-1">Raison: {p.metadata?.rejectReason}</p>
                            {p.metadata?.rejectDetails && <p className="text-xs text-red-900 italic">"{p.metadata.rejectDetails}"</p>}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* 👈 NOUVEAU : Modal de création de client */}
      {isAddClientOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl relative"
          >
            <button onClick={() => setIsAddClientOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 bg-slate-100 p-2 rounded-full transition-colors">
              <X size={18} />
            </button>
            
            <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                <User size={20} />
              </div>
              Nouveau Client
            </h2>

            <form onSubmit={handleCreateManualClient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Prénom *</label>
                  <input required type="text" value={newClient.firstName} onChange={e => setNewClient({...newClient, firstName: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-slate-900" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Nom *</label>
                  <input required type="text" value={newClient.lastName} onChange={e => setNewClient({...newClient, lastName: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-slate-900" />
                </div>
              </div>

               <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Email *</label>
                <input required type="email" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-slate-900" placeholder="client@email.com" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Téléphone (Optionnel)</label>
                <input type="tel" value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-slate-900" placeholder="+41 7X XXX XX XX" />
              </div>

              <div className="pt-4">
                <button disabled={isCreatingClient} type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-md shadow-blue-500/20">
                  {isCreatingClient ? "Création en cours..." : "Créer le dossier"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* TIROIR DU GÉNÉRATEUR PAR DESSUS */}
      {(isPlanGeneratorOpen && (selectedReq || planToEdit || proactiveClientUid)) && (
        <AdminPlanGenerator 
          isOpen={isPlanGeneratorOpen} 
          onClose={() => {
            setIsPlanGeneratorOpen(false);
            setPlanToEdit(null);
            setProactiveClientUid(null); // On réinitialise l'état proactif
          }} 
          clientUid={selectedReq?.clientUid || planToEdit?.clientUid || proactiveClientUid} 
          requestId={selectedReq?.id || planToEdit?.linkedRequestId || "PROACTIVE"} 
          editingPlan={planToEdit} 
        />
      )}

      {/* 👈 TUNNEL DE CONSEIL PHYSIQUE EN DIRECT */}
      <AdminConseilWizard 
        isOpen={isConseilWizardOpen}
        onClose={() => setIsConseilWizardOpen(false)}
        client={selectedClient360}
      />

      {/* TIROIR : TRAITEMENT DES OFFRES SIGNÉES */}
      <AdminSignedPlanProcessor 
        isOpen={selectedSignedPlan !== null}
        onClose={() => setSelectedSignedPlan(null)}
        plan={selectedSignedPlan}
        clientUid={selectedSignedPlan?.clientUid}
        onEditPlan={(freshPlan) => {
          setSelectedSignedPlan(null);
          setPlanToEdit(freshPlan);
          setIsPlanGeneratorOpen(true);
        }}
      />
    </div>
  );
}

function DetailRow({ icon, label, value, last = false }: any) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value || value === "Non renseigné" || value === "-") return;
    navigator.clipboard.writeText(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex items-start gap-3 py-2 group ${!last ? 'border-b border-slate-50' : ''}`}>
      <div className="text-slate-300 shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-slate-900 whitespace-normal break-words leading-snug">
            {value || "Non renseigné"}
          </p>
          
          {/* 👈 NOUVEAU : Bouton Copier dynamique au survol */}
          {value && value !== "Non renseigné" && value !== "-" && (
            <button 
              onClick={handleCopy}
              className="text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all p-1 shrink-0"
              title="Copier"
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// ============= COMPOSANT : BOUTON DE RELANCE DEMANDE (LISTE) =============
// =========================================================================
function SendRequestReminderButton({ clientUid, requestId, hasBeenReminded }: { clientUid: string, requestId: string, hasBeenReminded?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(hasBeenReminded);

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 👈 Très important : empêche l'ouverture du tiroir quand on clique sur le bouton
    setLoading(true);
    try {
      const res = await fetch("/api/admin/remind-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientUid, requestId }),
      });

      if (!res.ok) throw new Error("Erreur lors de l'envoi");
      
      toast.success("Email de relance envoyé au client !");
      setSent(true);
    } catch (error) {
      toast.error("Impossible d'envoyer la relance.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 rounded-full shrink-0">
        <CheckCircle2 size={12} /> Relancé
      </span>
    );
  }

  return (
    <button
      onClick={handleSend}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white bg-slate-900 border border-slate-700 hover:bg-blue-600 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 shrink-0"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
      {loading ? "Envoi..." : "Relancer"}
    </button>
  );
}

// =========================================================================
// ================= COMPOSANT : BOUTON DE RELANCE MANUELLE ================
// =========================================================================
function SendReminderButton({ clientUid, planId, hasBeenReminded }: { clientUid: string, planId: string, hasBeenReminded?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(hasBeenReminded);

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Évite de cliquer sur la carte en même temps
    setLoading(true);
    try {
      const res = await fetch("/api/admin/remind-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientUid, planId }),
      });

      if (!res.ok) throw new Error("Erreur lors de l'envoi");
      
      toast.success("Email de relance envoyé au client !");
      setSent(true);
    } catch (error) {
      toast.error("Impossible d'envoyer la relance.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 rounded-full shrink-0">
        <CheckCircle2 size={12} /> Relancé
      </span>
    );
  }

  return (
    <button
      onClick={handleSend}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white bg-slate-900 border border-slate-700 hover:bg-black px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 shrink-0"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
      {loading ? "Envoi..." : "Relancer"}
    </button>
  );
}