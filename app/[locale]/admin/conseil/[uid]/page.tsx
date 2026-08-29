//app/admin/conseil/[uid]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { toast } from "sonner";
import { 
  Building2, UserCheck, ShieldCheck, Users, Target, 
  ChevronRight, ChevronLeft, Save, FileText, CheckCircle2, 
  AlertTriangle, Loader2, ShieldAlert, Heart,
  TrendingUp, Wallet, Coins, Sparkles, Smartphone, X, Plus, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

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

const optionsStatut = [
  { id: 0, label: "Salarié·e" },
  { id: 1, label: "Indépendant·e" },
  { id: 2, label: "Sans activité / Autre" }
];

const optionsPermis = [
  { id: "B", label: "Permis B" },
  { id: "C", label: "Permis C" },
  { id: "G", label: "Permis G (Frontalier)" },
  { id: "L", label: "Permis L" },
  { id: "Ci", label: "Permis Ci" },
  { id: "Autre", label: "Autre permis" }
];

const optionsPays = [
  { id: "Suisse", label: "🇨🇭 Suisse" },
  { id: "France", label: "🇫🇷 France" },
  { id: "Italie", label: "🇮🇹 Italie" },
  { id: "Allemagne", label: "🇩🇪 Allemagne" },
  { id: "Portugal", label: "🇵🇹 Portugal" },
  { id: "Espagne", label: "🇪🇸 Espagne" }
];

export default function AdminConseilPage() {
  const { uid } = useParams();
  const router = useRouter();

  // États globaux
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [isSaving, setIsSaving] = useState(false);
  const [sessionFinalized, setSessionFinalized] = useState(false);
  const [referralCode, setReferralCode] = useState("");

  // Notes rapides persistantes
  const [isQuickNotesOpen, setIsQuickNotesOpen] = useState(false);
  const [quickNotes, setQuickNotes] = useState("");

  // Auto-sauvegarde du brouillon d'entretien (survit à la fermeture avant finalisation).
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const draftDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedRef = React.useRef(false); // évite d'écraser le brouillon pendant sa restauration

  // Étape 4 : Formulaire CRUD réactif exhaustif
  const [clientForm, setClientForm] = useState<any>({
    Enter_prenom: "",
    Enter_nom: "",
    Enter_nationalite: "Suisse",
    Enter_permisSejour: "B",
    Enter_dateNaissance: "",
    Enter_telephone: "",
    Enter_sexe: 0,
    Enter_etatCivil: 0,
    Enter_adresse: "",
    Enter_npa: "",
    Enter_localite: "",
    Enter_statutProfessionnel: 0,
    Enter_profession: "",
    Enter_salaireAnnuel: 80000,
    Enter_Affilie_LPP: true,
    Enter_travaillePlusde8HSemaine: true,
    Enter_spousePrenom: "",
    Enter_spouseSexe: 1,
    Enter_spouseDateNaissance: "",
    Enter_enfants: [],
    Enter_ageDebutCotisationsAVS: 21,
    Enter_ijMaladieTaux: 80,
    Enter_ijAccidentTaux: 80,
    Enter_noteConseiller: "",
    // Étape 7 : Recommandations
    Enter_referralPaymentMethod: "",
    Enter_referralPhone: "",
    Enter_referralIban: ""
  });

  // Étape 6 : Fixer le prochain RDV
  const [nextRdv, setNextRdv] = useState({
    date: "",
    time: "",
    objectf: "Offres & Signatures"
  });

  // --- ÉTATS ORBITAUX DE L'ÉTAPE 5 (Toujours avant les returns conditionnels !) ---
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  // Parrainage : code GARANTI serveur (réutilisé, jamais réécrit) + qui a recommandé ce client.
  const [refInfo, setRefInfo] = useState<{ referralCode?: string; referredBy?: { name: string } | null } | null>(null);

  // Récupère le code de parrainage (garanti unique côté serveur) + le parrain éventuel.
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/admin/clients/referral?uid=${uid}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setRefInfo(await res.json());
      } catch { /* non bloquant */ }
    })();
  }, [uid]);

  // 1. Récupération initiale des données
  useEffect(() => {
    if (!uid) return;
    const fetchClientData = async () => {
      try {
        const pdSnap = await getDoc(doc(db, `clients/${uid}/DonneePersonnelles/current`));
        if (pdSnap.exists()) {
          const data = pdSnap.data();
          setClient({ uid, ...data });
          setClientForm({
            Enter_prenom: data.Enter_prenom || "",
            Enter_nom: data.Enter_nom || "",
            Enter_nationalite: data.Enter_nationalite || "Suisse",
            Enter_permisSejour: data.Enter_permisSejour || "B",
            Enter_dateNaissance: data.Enter_dateNaissance || "",
            Enter_telephone: data.Enter_telephone || "",
            Enter_sexe: Number(data.Enter_sexe) || 0,
            Enter_etatCivil: Number(data.Enter_etatCivil) || 0,
            Enter_adresse: data.Enter_adresse || "",
            Enter_npa: data.Enter_npa || "",
            Enter_localite: data.Enter_localite || "",
            Enter_statutProfessionnel: Number(data.Enter_statutProfessionnel) || 0,
            Enter_profession: data.Enter_profession || "",
            Enter_salaireAnnuel: Number(data.Enter_salaireAnnuel) || 80000,
            Enter_Affilie_LPP: data.Enter_Affilie_LPP !== false,
            Enter_travaillePlusde8HSemaine: data.Enter_travaillePlusde8HSemaine !== false,
            Enter_spousePrenom: data.Enter_spousePrenom || "",
            Enter_spouseSexe: Number(data.Enter_spouseSexe) || 1,
            Enter_spouseDateNaissance: data.Enter_spouseDateNaissance || "",
            Enter_enfants: data.Enter_enfants || [],
            Enter_ageDebutCotisationsAVS: Number(data.Enter_ageDebutCotisationsAVS) || 21,
            Enter_ijMaladieTaux: data.Enter_ijMaladieTaux ?? 80,
            Enter_ijAccidentTaux: data.Enter_ijAccidentTaux ?? 80,
            Enter_noteConseiller: data.Enter_noteConseiller || "",
            Enter_referralPaymentMethod: data.Enter_referralPaymentMethod || "",
            Enter_referralPhone: data.Enter_referralPhone || data.Enter_telephone || "",
            Enter_referralIban: data.Enter_referralIban || ""
          });
        } else {
          const clientSnap = await getDoc(doc(db, "clients", uid as string));
          if (clientSnap.exists()) {
            const data = clientSnap.data();
            setClient({ uid, ...data });
            setClientForm((prev: any) => ({
              ...prev,
              Enter_prenom: data.firstName || "",
              Enter_nom: data.lastName || ""
            }));
          }
        }
      } catch (err) {
        console.error(err);
        toast.error("Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    };
    fetchClientData();
  }, [uid]);

  // 1b. Restauration du brouillon d'entretien (localStorage puis Firestore) à l'ouverture.
  useEffect(() => {
    if (!uid) return;
    const id = uid as string;
    const lsKey = `conseil_draft_${id}`;
    draftLoadedRef.current = false;
    let cancelled = false;

    (async () => {
      let restored = false;
      // localStorage : filet instantané (offline / crash navigateur).
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw && !cancelled) {
          const d = JSON.parse(raw);
          if (typeof d.notes === "string") setQuickNotes(d.notes);
          if (d.nextRdv) setNextRdv((p) => ({ ...p, ...d.nextRdv }));
          restored = restored || !!d.notes?.trim();
        }
      } catch { /* ignore */ }
      // Firestore : source de vérité (multi-appareil / cache vidé).
      try {
        const snap = await getDoc(doc(db, "clients", id, "conseils_drafts", "current"));
        if (snap.exists() && !cancelled) {
          const d = snap.data() as any;
          if (typeof d.notes === "string") setQuickNotes(d.notes);
          if (d.nextRdv) setNextRdv((p) => ({ ...p, ...d.nextRdv }));
          restored = restored || !!d.notes?.trim();
        }
      } catch { /* ignore */ }
      if (!cancelled) {
        draftLoadedRef.current = true;
        if (restored) toast.info("Brouillon d'entretien restauré.");
      }
    })();

    return () => { cancelled = true; };
  }, [uid]);

  // 1c. Auto-sauvegarde du brouillon (localStorage immédiat + Firestore debouncé).
  useEffect(() => {
    if (!uid || !draftLoadedRef.current) return;
    if (quickNotes.trim().length === 0) return;
    const id = uid as string;
    const lsKey = `conseil_draft_${id}`;

    try { localStorage.setItem(lsKey, JSON.stringify({ notes: quickNotes, nextRdv, ts: Date.now() })); } catch { /* quota */ }

    setDraftState("saving");
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(async () => {
      try {
        await setDoc(
          doc(db, "clients", id, "conseils_drafts", "current"),
          {
            notes: quickNotes,
            nextRdv,
            status: "DRAFT",
            clientName: `${clientForm.Enter_prenom || ""} ${clientForm.Enter_nom || ""}`.trim(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        setDraftState("saved");
      } catch (e) {
        console.error("Auto-sauvegarde brouillon échouée :", e);
        setDraftState("error"); // le brouillon localStorage reste intact
      }
    }, 800);

    return () => { if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current); };
  }, [quickNotes, nextRdv, uid, clientForm.Enter_prenom, clientForm.Enter_nom]);

  // Boucle d'auto-rotation continue pour l'Étape 5 (Doit être un hook de premier niveau)
  useEffect(() => {
    if (currentStep !== 5 || activeNodeId !== null) return;
    const timer = setInterval(() => {
      setRotationAngle(prev => (prev + 0.3) % 360);
    }, 50);
    return () => clearInterval(timer);
  }, [currentStep, activeNodeId]);

  // 2. Auto-enregistrement au blur typé et sécurisé
  const handleFieldBlur = async (field: string, value: any) => {
    if (!uid) return;
    try {
      let finalValue = value;
      const numericFields = [
        "Enter_salaireAnnuel", 
        "Enter_sexe",
        "Enter_etatCivil",
        "Enter_statutProfessionnel",
        "Enter_ageDebutCotisationsAVS",
        "Enter_ijMaladieTaux",
        "Enter_ijAccidentTaux"
      ];

      if (numericFields.includes(field)) {
        finalValue = Number(value);
        if (isNaN(finalValue)) finalValue = value;
      }

      const docRef = doc(db, `clients/${uid}/DonneePersonnelles/current`);
      await setDoc(docRef, { [field]: finalValue }, { merge: true });
    } catch (err) {
      console.error("Erreur auto-save:", err);
    }
  };

  // 3. Clôture, Snapshot & Email
  const handleFinalizeSession = async () => {
    setIsSaving(true);
    const toastId = toast.loading("Scellement du dossier en cours...");
    try {
      // Code de parrainage : GARANTI UNIQUE côté serveur (réutilise l'existant, ne l'écrase
      // JAMAIS — sinon on casserait les liens invitedBy déjà posés). Repli local rare si offline.
      let newRefCode = refInfo?.referralCode || "";
      let ensuredByServer = !!newRefCode;
      if (!newRefCode) {
        try {
          const token = await auth.currentUser?.getIdToken();
          const r = await fetch(`/api/admin/clients/referral?uid=${uid}`, { headers: { Authorization: `Bearer ${token}` } });
          const j = await r.json();
          newRefCode = j?.referralCode || "";
          ensuredByServer = !!newRefCode;
        } catch { /* repli ci-dessous */ }
      }
      if (!newRefCode) {
        const baseName = clientForm.Enter_nom ? clientForm.Enter_nom.substring(0, 6).toUpperCase().replace(/[^A-Z]/g, '') : "CLIENT";
        newRefCode = `REF-${baseName}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      }
      setReferralCode(newRefCode);

      // 1. Sauvegarde du Snapshot Immuable (Historique du RDV)
      await addDoc(collection(db, "clients", uid as string, "conseils_sessions"), {
        createdAt: serverTimestamp(),
        status: "COMPLETED",
        clientSnapshot: clientForm,
        quickNotesSnapshot: quickNotes,
        nextRdvPlanifie: nextRdv,
        dateSession: new Date().toLocaleDateString('fr-CH'),
        referralCode: newRefCode
      });

      // 2. Mise à jour de la fiche client principale. On n'écrit `referralCode` QUE si le serveur
      // ne l'a pas déjà garanti (repli offline). Coordonnées de versement : IBAN uniquement.
      await setDoc(doc(db, "clients", uid as string), {
        ...(ensuredByServer ? {} : { referralCode: newRefCode }),
        referralIban: clientForm.Enter_referralIban || ""
      }, { merge: true });

      // 2b. Session figée : on purge le brouillon (Firestore + localStorage).
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
      await deleteDoc(doc(db, "clients", uid as string, "conseils_drafts", "current")).catch(() => {});
      try { localStorage.removeItem(`conseil_draft_${uid as string}`); } catch { /* ignore */ }
      setDraftState("idle");

      // 3. ENVOI SILENCIEUX DE L'E-MAIL DE CLÔTURE
      if (client?.email) {
        fetch("/api/send-conseil-closed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: client.email,
            firstName: clientForm.Enter_prenom || client.firstName || "",
            nextRdvDate: nextRdv.date ? new Date(nextRdv.date).toLocaleDateString('fr-CH') : undefined,
            nextRdvObjectif: nextRdv.objectf,
            referralCode: newRefCode,
            locale: "fr"
          })
        }).catch(err => console.error("Erreur email silencieux:", err));
      }

      toast.success("Dossier scellé et enregistré !", { id: toastId });
      
      // 4. Basculement sur l'écran de succès avec le QR Code
      setSessionFinalized(true);
      setIsSaving(false);
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde.", { id: toastId });
      setIsSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 size={32} className="animate-spin text-blue-600" />
      <p className="text-xs font-black uppercase tracking-widest mt-4 text-slate-400">Initialisation...</p>
    </div>
  );

  // --- ÉCRAN DE SUCCÈS (S'affiche par-dessus tout une fois le dossier scellé) ---
  if (sessionFinalized) {
    // On récupère le prénom proprement
    const safeFirstName = clientForm.Enter_prenom ? encodeURIComponent(clientForm.Enter_prenom.trim()) : "Un membre";
    
    // Création de l'URL WhatsApp avec le texte pré-rédigé ET le prénom en paramètre
    const whatsappMsg = `Bonjour ! J'ai sécurisé ma prévoyance avec CreditX. Fais ton audit gratuit et profite du Cercle Privilège via mon lien unique : https://creditx.ch/invite/${referralCode}?n=${safeFirstName}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`;
    // Génération instantanée du QR Code via API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(whatsappUrl)}&color=0f172a&bgcolor=ffffff&margin=10`;

    return (
      <div className="min-h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans relative overflow-hidden animate-in fade-in duration-1000">
        {/* Effet lumineux Premium d'arrière-plan */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-lg w-full text-center space-y-8">
          {/* Icône de succès */}
          <motion.div 
            initial={{ scale: 0, rotate: -180 }} 
            animate={{ scale: 1, rotate: 0 }} 
            transition={{ type: "spring", damping: 20, stiffness: 200 }}
            className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/40"
          >
            <CheckCircle2 size={48} className="text-white" />
          </motion.div>

          {/* Textes de confirmation */}
          <div className="space-y-3">
            <h1 className="text-4xl font-black tracking-tight text-white">Dossier scellé avec succès.</h1>
            <p className="text-slate-400 font-medium leading-relaxed">Vos données et notes sont archivées et sécurisées.<br/>Le lien du Cercle Privilège de votre client est prêt.</p>
          </div>

          {/* Carte QR Code Blanche */}
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="w-full bg-white text-slate-900 rounded-[40px] p-8 shadow-2xl flex flex-col items-center space-y-6"
          >
            <div className="space-y-1 text-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Offrez l'expertise CreditX</span>
              <p className="text-lg font-black text-slate-800 leading-tight">Scannez pour envoyer le lien</p>
            </div>
            
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-[28px] shadow-inner">
              <img src={qrUrl} alt="QR Code Parrainage" className="w-48 h-48 rounded-xl object-contain mix-blend-multiply" />
            </div>

            <div className="bg-slate-100 px-6 py-3 rounded-full flex items-center gap-3 border border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Code Filleul</span>
              <span className="text-sm font-mono font-black text-slate-800">{referralCode}</span>
            </div>
          </motion.div>

          {/* Bouton pour quitter (Remplace l'ancienne fermeture automatique) */}
          <motion.button 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            onClick={() => window.close()}
            className="mt-8 text-slate-400 hover:text-white text-xs font-black uppercase tracking-widest transition-colors border border-slate-800 hover:border-slate-600 hover:bg-slate-800/50 px-8 py-4 rounded-2xl backdrop-blur-md"
          >
            Fermer l'interface
          </motion.button>
        </div>
      </div>
    );
  }

  const currentSalary = Number(clientForm.Enter_salaireAnnuel || 80000);

  // Estimation dynamique de l'économie d'impôt (Taux marginal suisse estimé selon la tranche de revenu)
  const marginalTaxRate = currentSalary >= 150000 ? 0.35 : currentSalary >= 100000 ? 0.30 : currentSalary >= 70000 ? 0.25 : 0.20;
  const estimatedTaxSavings = Math.round(7258 * marginalTaxRate);

  const orbitalAxes = [
    { id: 1, title: "1. Avenir & Retraite", content: "En Suisse, les 1er et 2e piliers ne couvrent en moyenne que 60% de l'ancien revenu. L'objectif de cet audit est de chiffrer votre lacune prévisionnelle pour planifier le maintien de votre niveau de vie.", icon: TrendingUp, status: "completed", energy: 60, sub: "Analyse de la lacune", barLabel: "Couverture légale moyenne" },
    { id: 2, title: "2. Risque Incapacité", content: "Une maladie de longue durée provoque souvent une chute sévère des revenus. Nous allons vérifier si vos couvertures légales suffisent à atteindre la cible de sécurité recommandée (90%).", icon: Wallet, status: "in-progress", energy: 70, sub: "Protection des revenus", barLabel: "Rentes légales (Maladie)" },
    { id: 3, title: "3. Protection Familiale", content: "En cas de décès, les rentes de survivants de l'État sont insuffisantes pour assumer le quotidien et les dettes. L'audit définira le capital nécessaire pour protéger votre famille et votre hypothèque.", icon: Heart, status: "pending", energy: 50, sub: "Sécurité des proches", barLabel: "Rentes de survie de base" },
    { id: 4, title: "4. Optimisation Fiscale", content: "La fiscalité helvétique vous récompense lorsque vous épargnez. En investissant le plafond légal dans un 3ème pilier privé, vous réduisez immédiatement votre revenu imposable.", icon: Coins, status: "completed", energy: null, sub: "Levier 3ème Pilier", barLabel: null, customMode: "fiscalite" },
    { id: 5, title: "5. Suivi Proactif", content: "Les lois (réformes LPP/AVS) et votre vie évoluent. Notre méthodologie inclut un accompagnement dans le temps pour que votre stratégie reste performante année après année.", icon: Sparkles, status: "in-progress", energy: null, sub: "Accompagnement", barLabel: null, customMode: "suivi" }
  ];

  return (


    <div className="min-h-screen w-screen bg-white flex flex-col text-slate-900 font-sans overflow-hidden relative">
      
      {/* BLOC TIROIR NOTES RAPIDES */}
      {isQuickNotesOpen && (
        <div className="fixed top-24 right-8 z-[100] w-80 md:w-96 bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 animate-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Notes rapides</p>
              {draftState !== "idle" && (
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider ${
                    draftState === "error" ? "text-rose-500" : draftState === "saving" ? "text-slate-400" : "text-emerald-600"
                  }`}
                  title="Vos notes sont sauvegardées automatiquement en brouillon."
                >
                  {draftState === "saving" ? "· enregistrement…" : draftState === "error" ? "· hors-ligne (local)" : "· enregistré"}
                </span>
              )}
            </div>
            <button onClick={() => setIsQuickNotesOpen(false)}><X size={14} className="text-slate-400" /></button>
          </div>
          <textarea
            value={quickNotes}
            onChange={(e) => setQuickNotes(e.target.value)}
            placeholder="Prenez vos notes ici..."
            className="w-full h-40 border border-slate-100 bg-slate-50 rounded-2xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 resize-none text-slate-800"
          />
        </div>
      )}

      {/* HEADER */}
      <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <img 
              src="/images/Logo X Black.png" 
              alt="Logo X" 
              className="w-full h-full object-contain" 
            />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tighter text-slate-900">
              Conseil : {clientForm.Enter_prenom} {clientForm.Enter_nom}
            </h2>
            {refInfo?.referredBy && (
              <span className="inline-block mt-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold px-2.5 py-0.5">
                🎁 Client venu par recommandation de {refInfo.referredBy.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsQuickNotesOpen(!isQuickNotesOpen)}
            className={`px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all ${isQuickNotesOpen ? 'bg-blue-600 text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            <FileText size={14} /> {isQuickNotesOpen ? "Fermer notes" : "Notes rapides"}
          </button>
          <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">Step {currentStep}/7</span>
          <button onClick={() => window.close()} className="text-slate-400 hover:text-red-500 text-xs font-black uppercase tracking-widest transition-colors px-2">Quitter</button>
        </div>
      </div>

      {/* CONTENU ANIMÉ */}
      <div className="flex-1 overflow-hidden relative bg-white">
        <div className="w-full h-full">
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={{
                initial: (dir) => ({ y: dir === "up" ? 100 : -100, opacity: 0 }),
                animate: { y: 0, opacity: 1 },
                exit: (dir) => ({ y: dir === "up" ? -100 : 100, opacity: 0 })
              }}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="w-full h-full overflow-y-auto"
            >
              
              {/* ÉTAPE 1 : HERO INTERNET IMMERSIF NATIVE */}
              {currentStep === 1 && (
                <div className="relative w-full h-full min-h-[calc(100vh-160px)] flex items-center justify-start overflow-hidden bg-slate-950">
                  {/* Image de fond pure sans altération de couleur, avec assombrissement directionnel pour la lisibilité */}
                  <div 
                    className="absolute inset-0 z-0"
                    style={{ 
                      backgroundImage: "url('/images/hero.jpg')", 
                      backgroundSize: 'cover', 
                      backgroundPosition: 'center' 
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/10" />
                  </div>

                  {/* BRANDING LOGO COMPAGNIE - Calé en haut à gauche */}
                  <div className="absolute top-8 left-12 z-20">
                    <motion.img 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2, duration: 0.5 }}
                      src="https://firebasestorage.googleapis.com/v0/b/moneylife-c3b0b.firebasestorage.app/o/Logo%20Black.png?alt=media&token=490c0a26-6d62-4a9b-a7b9-1f1d439aedbd" 
                      alt="CreditX Logo" 
                      className="h-8 md:h-10 object-contain invert brightness-200" // Inversion pour rendu blanc éclatant sur fond sombre
                    />
                  </div>

                  {/* CONTENU HERO TEXTUEL - Aligné à gauche style Web de pointe */}
                  <div className="relative z-10 max-w-3xl text-left px-12 md:px-20 space-y-6">
                    <span className="text-blue-400 text-xs font-black uppercase tracking-[0.3em] bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-full backdrop-blur-md inline-block">
                      Plateforme de conseil
                    </span>
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-white leading-[1.05] uppercase">
                      La prévoyance <br /> 
        
                      intelligente.
                    </h1>
                    <div className="h-1 w-20 bg-blue-500 rounded-full" />
                    <p className="text-sm md:text-base font-bold text-slate-300 uppercase tracking-[0.2em] pt-2">
                      FINMA F01536084 • Expertise Prévoyance • Sécurité financière
                    </p>
                  </div>
                </div>
              )}

              {/* ÉTAPE 2 : CONSEILLER INTERACTIF */}
              {currentStep === 2 && (
                <div className="w-full max-w-3xl mx-auto space-y-10 py-4">
                  <div className="space-y-2 text-center md:text-left">
                    <span className="text-blue-600 text-xs font-black uppercase tracking-widest">Expertise Humaine</span>
                    <h3 className="text-5xl font-black tracking-tight text-slate-900">Accompagnement Certifié</h3>
                    <p className="text-base font-bold text-slate-400 mt-1">Une expertise humaine claire pour valider vos objectifs en toute transparence.</p>
                  </div>
                  <div className="p-8 md:p-12 border border-slate-100 bg-slate-50/50 rounded-[32px] flex flex-col md:flex-row items-center gap-8 shadow-inner">
                    <div className="w-24 h-24 bg-slate-900 rounded-[30%] flex items-center justify-center text-white shadow-2xl shrink-0">
                      <UserCheck size={44} />
                    </div>
                    <div className="flex-1 text-center md:text-left space-y-3">
                      <h4 className="text-2xl font-black text-slate-900">Votre Conseiller CreditX</h4>
                      <p className="text-sm font-black text-blue-600 uppercase tracking-widest">Intermédiaire d'assurance enregistré FINMA</p>
                      <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2">
                        <span className="px-4 py-2 bg-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-100 shadow-sm text-slate-500">Loi LSA Art. 45</span>
                        <span className="px-4 py-2 bg-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-100 shadow-sm text-slate-500">Conformité LPD</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ÉTAPE 3 : PROTECTION DES DONNÉES & PARTENAIRES */}
              {currentStep === 3 && (
                <div className="w-full max-w-3xl mx-auto space-y-10 py-4">
                  <div className="space-y-2 text-center md:text-left">
                    <span className="text-blue-600 text-xs font-black uppercase tracking-widest">Confiance Institutionnelle</span>
                    <h3 className="text-5xl font-black tracking-tight text-slate-900">Sécurité &amp; Partenaires</h3>
                    <p className="text-base font-bold text-slate-400 mt-1">Vos données sont hautement protégées, avec une flexibilité totale d'allocation du marché.</p>
                  </div>

                  <div className="bg-slate-900 rounded-[32px] p-8 text-white space-y-4 shadow-xl">
                    <div className="flex items-center gap-3 text-blue-400">
                      <ShieldCheck size={22} />
                      <p className="text-xs font-black uppercase tracking-[0.2em]">Serveurs d'infrastructure à Zurich (Suisse)</p>
                    </div>
                    <p className="text-sm font-medium text-slate-300 leading-relaxed">
                      En conformité stricte avec l'article 45 LSA et la nouvelle LPD, votre coffre-fort numérique crypte vos données. Aucun transfert n'est fait sans votre accord explicite.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Grandes compagnies partenaires de prévoyance :</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {["AXA", "SwissLife", "PAX", "Helvetia"].map(part => (
                        <div key={part} className="flex items-center justify-center p-5 bg-slate-50 border border-slate-100 rounded-2xl shadow-sm hover:border-slate-200 transition-colors">
                          <span className="font-black text-slate-800 text-xs uppercase tracking-tight">{part}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs font-medium text-slate-400 italic leading-snug">
                      * CreditX collabore en toute neutralité avec les acteurs phares de Suisse. Nous ajustons et complétons continuellement notre réseau afin de soumettre les meilleures stratégies du marché à nos clients.
                    </p>
                  </div>
                </div>
              )}

              {/* ÉTAPE 4 : DONNÉES COMPLÈTES DU CLIENT (FLAT VIEW SYNCHRONISÉE) */}
              {currentStep === 4 && (
                <div className="w-full max-w-3xl mx-auto space-y-10 py-12 animate-in fade-in duration-500 text-slate-900">
                  <div className="space-y-2 text-center md:text-left">
                    <span className="text-blue-600 text-xs font-black uppercase tracking-widest">Registre Actuariel</span>
                    <h3 className="text-5xl font-black tracking-tight">Fiche de Prévoyance Client</h3>
                    <p className="text-base font-bold text-slate-400 mt-1">Saisie complète et synchronisée des critères de risque. Chaque modification applique un auto-save immédiat.</p>
                  </div>

                  {/* BLOCK 1 : IDENTITÉ & CIVIL */}
                  <div className="space-y-4 pt-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">1. Identité &amp; État Civil</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Prénom</label>
                        <input type="text" value={clientForm.Enter_prenom} onChange={e => setClientForm({...clientForm, Enter_prenom: e.target.value})} onBlur={e => handleFieldBlur("Enter_prenom", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nom de famille</label>
                        <input type="text" value={clientForm.Enter_nom} onChange={e => setClientForm({...clientForm, Enter_nom: e.target.value})} onBlur={e => handleFieldBlur("Enter_nom", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nationalité</label>
                        <select value={clientForm.Enter_nationalite} onChange={e => setClientForm({...clientForm, Enter_nationalite: e.target.value})} onBlur={e => handleFieldBlur("Enter_nationalite", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none">
                          {optionsPays.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                      {clientForm.Enter_nationalite !== "Suisse" && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Permis de séjour</label>
                          <select value={clientForm.Enter_permisSejour} onChange={e => setClientForm({...clientForm, Enter_permisSejour: e.target.value})} onBlur={e => handleFieldBlur("Enter_permisSejour", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none">
                            {optionsPermis.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date de naissance</label>
                        <input type="text" placeholder="JJ.MM.AAAA" value={clientForm.Enter_dateNaissance} onChange={e => setClientForm({...clientForm, Enter_dateNaissance: e.target.value})} onBlur={e => handleFieldBlur("Enter_dateNaissance", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Téléphone mobile</label>
                        <input type="text" value={clientForm.Enter_telephone} onChange={e => setClientForm({...clientForm, Enter_telephone: e.target.value})} onBlur={e => handleFieldBlur("Enter_telephone", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Sexe</label>
                        <select value={clientForm.Enter_sexe} onChange={e => setClientForm({...clientForm, Enter_sexe: Number(e.target.value)})} onBlur={e => handleFieldBlur("Enter_sexe", Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none">
                          {optionsSexe.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">État Civil</label>
                        <select value={clientForm.Enter_etatCivil} onChange={e => setClientForm({...clientForm, Enter_etatCivil: Number(e.target.value)})} onBlur={e => handleFieldBlur("Enter_etatCivil", Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none">
                          {optionsEtatCivil.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* BLOCK 2 : COORDONNÉES POSTALES */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">2. Adresse domiciliaire</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Rue et numéro de maison</label>
                        <input type="text" value={clientForm.Enter_adresse} onChange={e => setClientForm({...clientForm, Enter_adresse: e.target.value})} onBlur={e => handleFieldBlur("Enter_adresse", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none transition-all" />
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:col-span-1">
                        <div className="col-span-1 space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">NPA</label>
                          <input type="text" value={clientForm.Enter_npa} onChange={e => setClientForm({...clientForm, Enter_npa: e.target.value})} onBlur={e => handleFieldBlur("Enter_npa", e.target.value)} className="w-full px-2 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 text-center outline-none" />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Localité</label>
                          <input type="text" value={clientForm.Enter_localite} onChange={e => setClientForm({...clientForm, Enter_localite: e.target.value})} onBlur={e => handleFieldBlur("Enter_localite", e.target.value)} className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BLOCK 3 : SPHÈRE PROFESSIONNELLE */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">3. Activité Professionnelle &amp; LPP</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Statut Professionnel</label>
                        <select value={clientForm.Enter_statutProfessionnel} onChange={e => setClientForm({...clientForm, Enter_statutProfessionnel: Number(e.target.value)})} onBlur={e => handleFieldBlur("Enter_statutProfessionnel", Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none">
                          {optionsStatut.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Profession / Métier</label>
                        <input type="text" value={clientForm.Enter_profession} onChange={e => setClientForm({...clientForm, Enter_profession: e.target.value})} onBlur={e => handleFieldBlur("Enter_profession", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Salaire Annuel Brut (CHF)</label>
                        <input type="number" value={clientForm.Enter_salaireAnnuel} onChange={e => setClientForm({...clientForm, Enter_salaireAnnuel: Number(e.target.value)})} onBlur={e => handleFieldBlur("Enter_salaireAnnuel", Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-sm focus:bg-white text-slate-800 outline-none transition-all" />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 pt-2">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" checked={clientForm.Enter_Affilie_LPP} onChange={e => {
                          setClientForm({...clientForm, Enter_Affilie_LPP: e.target.checked});
                          handleFieldBlur("Enter_Affilie_LPP", e.target.checked);
                        }} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/10" />
                        <div className="text-left">
                          <p className="text-sm font-black text-slate-900">Affilié LPP (2e pilier)</p>
                          <p className="text-xs text-slate-400 font-bold">Cochez si soumis à une caisse de pension active.</p>
                        </div>
                      </label>

                      {clientForm.Enter_statutProfessionnel === 0 && (
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input type="checkbox" checked={clientForm.Enter_travaillePlusde8HSemaine} onChange={e => {
                            setClientForm({...clientForm, Enter_travaillePlusde8HSemaine: e.target.checked});
                            handleFieldBlur("Enter_travaillePlusde8HSemaine", e.target.checked);
                          }} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/10" />
                          <div className="text-left">
                            <p className="text-sm font-black text-slate-900">Plus de 8h / semaine chez le même employeur</p>
                            <p className="text-xs text-slate-400 font-bold">Active la couverture obligatoire contre les accidents non professionnels (LAA).</p>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* BLOCK 4 : COUVERTURE CONJOINT */}
                  {[1, 3].includes(clientForm.Enter_etatCivil) && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">4. Analyse du Conjoint</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Prénom du conjoint</label>
                          <input type="text" value={clientForm.Enter_spousePrenom} onChange={e => setClientForm({...clientForm, Enter_spousePrenom: e.target.value})} onBlur={e => handleFieldBlur("Enter_spousePrenom", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none transition-all" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Sexe du conjoint</label>
                          <select value={clientForm.Enter_spouseSexe} onChange={e => setClientForm({...clientForm, Enter_spouseSexe: Number(e.target.value)})} onBlur={e => handleFieldBlur("Enter_spouseSexe", Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none">
                            {optionsSexe.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date de naissance du conjoint</label>
                          <input type="text" placeholder="JJ.MM.AAAA" value={clientForm.Enter_spouseDateNaissance} onChange={e => setClientForm({...clientForm, Enter_spouseDateNaissance: e.target.value})} onBlur={e => handleFieldBlur("Enter_spouseDateNaissance", e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none transition-all" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BLOCK 5 : ENFANTS & CHARGES */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">5. Enfants &amp; Rentes Orphelins</h4>
                      <button 
                        onClick={() => {
                          const updatedKids = [...(clientForm.Enter_enfants || []), { Enter_prenom: "", Enter_dateNaissance: "" }];
                          setClientForm({...clientForm, Enter_enfants: updatedKids});
                          handleFieldBlur("Enter_enfants", updatedKids);
                        }}
                        className="flex items-center gap-1 text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-colors"
                      >
                        <Plus size={14} /> Ajouter un enfant
                      </button>
                    </div>

                    {clientForm.Enter_enfants?.length === 0 ? (
                      <p className="text-xs font-bold text-slate-400 italic pl-1">Aucun enfant enregistré dans le dossier d'analyse.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {clientForm.Enter_enfants.map((kid: any, idx: number) => (
                          <div key={idx} className="p-4 border border-slate-200 bg-slate-50/50 rounded-xl flex items-center gap-4 relative animate-in slide-in-from-bottom-2 duration-200">
                            <span className="w-7 h-7 rounded-lg bg-white border border-slate-100 flex items-center justify-center font-black text-xs text-slate-400">{idx + 1}</span>
                            <div className="grid grid-cols-2 gap-3 flex-1">
                              <input 
                                type="text" placeholder="Prénom de l'enfant" value={kid.Enter_prenom || ""} 
                                onChange={e => {
                                  const kids = [...clientForm.Enter_enfants];
                                  kids[idx].Enter_prenom = e.target.value;
                                  setClientForm({...clientForm, Enter_enfants: kids});
                                }} 
                                onBlur={() => handleFieldBlur("Enter_enfants", clientForm.Enter_enfants)}
                                className="px-3 py-2 rounded-lg border bg-white font-bold text-xs outline-none focus:border-blue-500" 
                              />
                              <input 
                                type="text" placeholder="Date de naissance (JJ.MM.AAAA)" value={kid.Enter_dateNaissance || ""} 
                                onChange={e => {
                                  const kids = [...clientForm.Enter_enfants];
                                  kids[idx].Enter_dateNaissance = e.target.value;
                                  setClientForm({...clientForm, Enter_enfants: kids});
                                }} 
                                onBlur={() => handleFieldBlur("Enter_enfants", clientForm.Enter_enfants)}
                                className="px-3 py-2 rounded-lg border bg-white font-bold text-xs outline-none focus:border-blue-500" 
                              />
                            </div>
                            <button 
                              onClick={() => {
                                const kids = clientForm.Enter_enfants.filter((_: any, i: number) => i !== idx);
                                setClientForm({...clientForm, Enter_enfants: kids});
                                handleFieldBlur("Enter_enfants", kids);
                              }}
                              className="text-slate-300 hover:text-red-500 transition-colors p-1"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* BLOCK 6 : HISTORIQUE AVS & REVENUS IJ */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">6. Début historique AVS</h4>
                      <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-slate-500">Âge de début de cotisation</span>
                          <span className="text-blue-600 font-black">{clientForm.Enter_ageDebutCotisationsAVS} ans</span>
                        </div>
                        <input type="range" min={18} max={30} step={1} value={clientForm.Enter_ageDebutCotisationsAVS} onChange={e => setClientForm({...clientForm, Enter_ageDebutCotisationsAVS: Number(e.target.value)})} onMouseUp={() => handleFieldBlur("Enter_ageDebutCotisationsAVS", clientForm.Enter_ageDebutCotisationsAVS)} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">7. Indemnités Journalières (IJ)</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase">IJ Maladie</p>
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-black text-sm">{clientForm.Enter_ijMaladieTaux}%</span>
                            <input type="range" min={0} max={100} step={10} value={clientForm.Enter_ijMaladieTaux} onChange={e => setClientForm({...clientForm, Enter_ijMaladieTaux: Number(e.target.value)})} onMouseUp={() => handleFieldBlur("Enter_ijMaladieTaux", clientForm.Enter_ijMaladieTaux)} className="w-16 h-1 bg-slate-200" />
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase">IJ Accident</p>
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-black text-sm">{clientForm.Enter_ijAccidentTaux}%</span>
                            <input type="range" min={80} max={100} step={10} value={clientForm.Enter_ijAccidentTaux} onChange={e => setClientForm({...clientForm, Enter_ijAccidentTaux: Number(e.target.value)})} onMouseUp={() => handleFieldBlur("Enter_ijAccidentTaux", clientForm.Enter_ijAccidentTaux)} className="w-16 h-1 bg-slate-200" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* OBSERVATIONS */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Notes complémentaires de l'entretien (Facultatif)</label>
                    <textarea 
                      value={clientForm.Enter_noteConseiller} 
                      onChange={e => setClientForm({...clientForm, Enter_noteConseiller: e.target.value})}
                      onBlur={e => handleFieldBlur("Enter_noteConseiller", e.target.value)}
                      placeholder="Ajoutez vos observations de rendez-vous (objectifs de vie, budget maximum évoqué, demandes de rachat LPP spécifiques...)"
                      className="w-full h-24 px-5 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white text-slate-800 outline-none transition-all resize-none leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* ÉTAPE 5 : TRUE RADIAL ORBITAL TIMELINE (CLEAN VERSION) */}
              {currentStep === 5 && (
                <div className="w-full max-w-4xl mx-auto space-y-8 py-8 animate-in fade-in duration-500 text-slate-900">
                  
                  {/* EN-TÊTE DE SECTION */}
                  <div className="space-y-2 text-center">
                    <span className="text-blue-600 text-xs font-black uppercase tracking-[0.2em] bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100/60 inline-block">Audit 360°</span>
                    <h3 className="text-5xl font-black tracking-tighter">Votre Écosystème Financier</h3>
                    <p className="text-base font-bold text-slate-400 max-w-xl mx-auto">
                      Une modélisation claire et interconnectée de vos couvertures actuelles et de nos leviers d'optimisation.
                    </p>
                  </div>

                  {/* SCÈNE ORBITALE TRIDIMENSIONNELLE */}
                  <div 
                    onClick={() => setActiveNodeId(null)}
                    className="relative w-full h-[580px] flex items-center justify-center overflow-hidden bg-slate-50/50 border border-slate-100 rounded-[48px] cursor-pointer"
                  >
                    {/* Espace de projection perspective */}
                    <div 
                      className="absolute w-full h-full flex items-center justify-center"
                      style={{ perspective: "1000px" }}
                    >
                      {/* Orbite géométrique centrale */}
                      <div className="absolute w-[400px] h-[400px] rounded-full border border-slate-200/80 pointer-events-none" />

                      {/* NŒUD CENTRAL : SALAIRE CLIENT (Disparaît si un axe est cliqué) */}
                      <div 
                        onClick={(e) => { e.stopPropagation(); setActiveNodeId(null); }}
                        className={`absolute z-30 w-44 h-44 bg-slate-900 rounded-full flex flex-col items-center justify-center text-center p-4 shadow-2xl shadow-slate-900/40 border-4 border-white cursor-default transition-all duration-500 ${activeNodeId !== null ? 'opacity-0 scale-50 pointer-events-none' : 'opacity-100 scale-100'}`}
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Salaire Brut</span>
                        <span className="text-xl font-black text-white font-mono mt-1">{new Intl.NumberFormat('fr-CH').format(currentSalary)} CHF</span>
                        <span className="text-[10px] font-bold text-blue-400 uppercase mt-1 tracking-wider">Niveau de vie</span>
                      </div>

                      {/* PROJECTION TRIGONOMÉTRIQUE DES AXES */}
                      {orbitalAxes.map((item, index) => {
                        const total = orbitalAxes.length;
                        const angle = ((index / total) * 360 + rotationAngle) % 360;
                        const radius = 200;
                        const radian = (angle * Math.PI) / 180;

                        const x = radius * Math.cos(radian);
                        const y = radius * Math.sin(radian);

                        const zIndex = Math.round(100 + 50 * Math.cos(radian));
                        // Assombrissement fort (0.1) des autres nœuds quand un nœud est actif
                        const opacity = activeNodeId === item.id ? 1 : activeNodeId !== null ? 0.1 : Math.max(0.5, Math.min(1, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2)));
                        const isSelected = activeNodeId === item.id;
                        const NodeIcon = item.icon;

                        return (
                          <div
                            key={item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveNodeId(isSelected ? null : item.id);
                            }}
                            className="absolute flex flex-col items-center justify-center cursor-pointer transition-all duration-300"
                            style={{
                              transform: `translate(${x}px, ${y}px)`,
                              zIndex: isSelected ? 300 : zIndex,
                              opacity: opacity,
                            }}
                          >
                            {/* Halo énergétique de l'axe */}
                            <div 
                              className="absolute rounded-full -inset-4 animate-pulse pointer-events-none"
                              style={{
                                background: `radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0) 70%)`,
                                width: `${(item.energy || 60) * 0.4 + 50}px`,
                                height: `${(item.energy || 60) * 0.4 + 50}px`,
                              }}
                            />

                            {/* Pastille circulaire de l'icône */}
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-md ${isSelected ? 'bg-blue-600 text-white border-transparent scale-125 shadow-blue-500/20' : 'bg-white text-slate-800 border-slate-200'}`}>
                              <NodeIcon size={18} />
                            </div>

                            {/* Libellé textuel volant */}
                            <span className={`text-[11px] font-black tracking-tight mt-2 px-2 py-0.5 rounded-md ${isSelected ? 'bg-slate-900 text-white' : 'text-slate-600 bg-white/60 backdrop-blur-sm'}`}>
                              {item.title.split(". ")[1]}
                            </span>
                          </div>
                        );
                      })}

                      {/* NOUVEAU RENDU CENTRAL AGRANDI (MODAL) */}
                      <AnimatePresence>
                        {activeNodeId !== null && (() => {
                          const activeItem = orbitalAxes.find(a => a.id === activeNodeId);
                          if (!activeItem) return null;
                          const ActiveIcon = activeItem.icon;
                          
                          return (
                            <motion.div
                              key="central-modal"
                              initial={{ opacity: 0, scale: 0.5, y: 20 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.5, y: 20 }}
                              transition={{ type: "spring", damping: 25, stiffness: 300 }}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute z-[500] w-[90%] max-w-md bg-slate-900 text-white rounded-[40px] p-8 shadow-2xl shadow-blue-900/20 border border-slate-800 flex flex-col items-center text-center"
                            >
                              {/* Icône Centrale Grosse */}
                              <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/30">
                                <ActiveIcon size={32} />
                              </div>
                              
                              <span className="text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full mb-3">
                                {activeItem.sub}
                              </span>
                              
                              <h4 className="text-3xl font-black mb-4 tracking-tight">{activeItem.title}</h4>
                              <p className="text-sm font-medium text-slate-300 leading-relaxed mb-8 px-2">
                                {activeItem.content}
                              </p>

                              {/* Jauge éducative (Moyenne Suisse / Légale) - Invisible si customMode ou null */}
                              {activeItem.energy !== null && !activeItem.customMode && (
                                <div className="w-full space-y-2 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                                  <div className="flex justify-between text-xs font-mono font-bold text-slate-400">
                                    <span>{activeItem.barLabel}</span>
                                    <span className="text-blue-400">~{activeItem.energy}%</span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full relative" style={{ width: `${activeItem.energy}%` }}>
                                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Affichage Spécifique : Potentiel d'économie d'impôts (Axe 4) */}
                              {activeItem.customMode === "fiscalite" && (
                                <div className="w-full space-y-3 bg-slate-950/80 p-4 rounded-2xl border border-emerald-900/40">
                                  <div className="flex justify-between items-end border-b border-slate-800/50 pb-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Plafond 3A Légal</span>
                                    <span className="text-white font-mono font-black tracking-tight">7'258 CHF</span>
                                  </div>
                                  <div className="flex justify-between items-center pt-1">
                                    <span className="text-[10px] font-mono font-bold text-slate-500 text-left leading-snug">
                                      Économie d'impôt potentielle<br/>
                                      <span className="text-[9px] font-medium opacity-70 italic">Basée sur un revenu de {new Intl.NumberFormat('fr-CH').format(currentSalary)} CHF</span>
                                    </span>
                                    <span className="text-emerald-400 font-black text-lg tracking-tight bg-emerald-400/10 px-3 py-1 rounded-xl border border-emerald-400/20">
                                      + {new Intl.NumberFormat('fr-CH').format(estimatedTaxSavings)} CHF
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Affichage Spécifique : Simulation Notification (Axe 5) */}
                              {activeItem.customMode === "suivi" && (
                                <div className="w-full flex justify-center mt-2">
                                  <motion.div
                                    initial={{ y: 20, opacity: 0, scale: 0.95 }}
                                    animate={{ y: 0, opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 20 }}
                                    className="w-full max-w-[320px] bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-3 shadow-2xl flex items-start gap-3 text-left relative overflow-hidden"
                                  >
                                    {/* Petit reflet lumineux sur la notif */}
                                    <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                                    
                                    {/* Icône App (Utilise ton logo noir sur fond blanc pour ressortir) */}
                                    <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-inner">
                                      <img src="/images/Logo X Black.png" alt="CreditX" className="w-5 h-5 object-contain" />
                                    </div>
                                    
                                    <div className="flex-1 pt-0.5">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">CreditX</span>
                                        <span className="text-[9px] font-bold text-white/40">À l'instant</span>
                                      </div>
                                      <p className="text-xs font-black text-white leading-tight">Prévoyance : mise à jour requise</p>
                                      <p className="text-[10px] font-medium text-slate-300 mt-1 leading-snug">
                                        La nouvelle loi LPP est entrée en vigueur. Ouvrez l'app pour simuler l'impact sur votre retraite.
                                      </p>
                                    </div>
                                  </motion.div>
                                </div>
                              )}

                              <button 
                                onClick={() => setActiveNodeId(null)}
                                className="mt-8 px-8 py-3 bg-white text-slate-900 hover:bg-blue-50 text-xs font-black uppercase tracking-widest rounded-xl transition-colors shadow-sm"
                              >
                                Fermer
                              </button>
                            </motion.div>
                          );
                        })()}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* FOOTER PUBLICITAIRE APP CLIENT SELFCARE */}
                  <div className="bg-blue-600 rounded-[28px] p-6 flex items-center justify-between text-white shadow-xl shadow-blue-500/10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center shrink-0"><Smartphone size={22}/></div>
                      <div>
                        <p className="font-black text-base">6. Application CreditX (Espace Client)</p>
                        <p className="text-xs font-bold text-white/80">Retrouvez ce rapport orbital, votre coffre-fort hautement crypté et vos indicateurs de rachat AVS/LPP en direct.</p>
                      </div>
                    </div>
                    <span className="px-4 py-1.5 bg-white text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm shrink-0">Selfcare</span>
                  </div>

                </div>
              )}

              {/* ÉTAPE 6 : PROGRAMMATION DU PROCHAIN SUIVI */}
              {currentStep === 6 && (
                <div className="w-full max-w-3xl mx-auto space-y-10 py-12 animate-in fade-in duration-500 text-slate-900">
                  <div className="space-y-2 text-center md:text-left">
                    <span className="text-blue-600 text-xs font-black uppercase tracking-widest">Planification</span>
                    <h3 className="text-5xl font-black tracking-tight text-slate-900">Prochain Rendez-vous</h3>
                    <p className="text-base font-bold text-slate-400 mt-1">Sélectionnez la date de remise de vos offres et propositions sur-mesure.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Date du rendez-vous</label>
                      <input 
                        type="date" 
                        value={nextRdv.date} 
                        onChange={e => setNextRdv({...nextRdv, date: e.target.value})}
                        className="w-full px-5 py-4 rounded-xl border border-slate-200 bg-slate-50 font-black text-sm outline-none focus:bg-white text-slate-800"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Objectif de l'entretien</label>
                      <select 
                        value={nextRdv.objectf} 
                        onChange={e => setNextRdv({...nextRdv, objectf: e.target.value})}
                        className="w-full px-5 py-4 rounded-xl border border-slate-200 bg-slate-50 font-black text-sm outline-none focus:bg-white text-slate-800"
                      >
                        <option value="Offres &amp; Signatures">Présentation des Offres &amp; Signatures</option>
                        <option value="Analyse Approfondie">Complément d'audit de situation</option>
                        <option value="Suivi Stratégique">Vérification annuelle récursive</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ÉTAPE 7 : LE CERCLE PRIVILÈGE (RECOMMANDATIONS) & CLÔTURE */}
              {currentStep === 7 && (
                <div className="w-full max-w-3xl mx-auto space-y-10 py-12 animate-in fade-in duration-500 text-slate-900">
                  <div className="space-y-2 text-center md:text-left">
                    <span className="text-blue-600 text-xs font-black uppercase tracking-widest">Le Cercle Privilège</span>
                    <h3 className="text-5xl font-black tracking-tight text-slate-900">Recommandez CreditX</h3>
                    <p className="text-base font-bold text-slate-400 mt-1">Nous ne faisons aucun démarchage à froid. Notre développement repose exclusivement sur la satisfaction de nos clients.</p>
                  </div>

                  {/* LA CARTE AVEC IMAGE INTÉGRÉE (SPLIT CARD) */}
                  <div className="bg-white border border-blue-100 rounded-[32px] overflow-hidden flex flex-col md:flex-row shadow-sm">
                    
                    {/* COLONNE GAUCHE : L'IMAGE LIFESTYLE */}
                    <div className="w-full md:w-2/5 h-56 md:h-auto relative shrink-0 bg-slate-100">
                      {/* 
                        Remplace "recommandation.jpg" par le nom de ta photo. 
                        Place la photo dans le dossier public/images/ de ton projet Next.js 
                      */}
                      <img 
                        src="/images/documents.jpg" 
                        alt="Recommandez CreditX" 
                        className="w-full h-full object-cover"
                      />
                      {/* Dégradé subtil pour donner de la profondeur */}
                      <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/20 md:from-black/10 to-transparent mix-blend-overlay" />
                    </div>

                    {/* COLONNE DROITE : LE CONTENU ET LE FORMULAIRE */}
                    <div className="w-full md:w-3/5 p-6 sm:p-8 space-y-8 bg-blue-50/30">
                      <div>
                        <h4 className="text-2xl font-black text-slate-900 tracking-tight">80 CHF par recommandation</h4>
                        <p className="text-sm font-medium text-slate-600 leading-relaxed mt-2">
                          Si votre entourage peut également bénéficier de notre expertise, partagez-leur votre lien unique. 
                          <span className="font-bold text-slate-900"> Pour toute personne créant un compte dans les 72h suivant l'envoi du lien</span>, nous vous versons une prime de remerciement.
                        </p>
                      </div>

                      <div className="pt-6 border-t border-blue-100/80 space-y-3">
                        <h5 className="text-xs font-black text-blue-600 uppercase tracking-widest">Coordonnées bancaires (IBAN) pour vos récompenses</h5>
                        <input type="text" value={clientForm.Enter_referralIban} onChange={e => setClientForm({...clientForm, Enter_referralIban: e.target.value})} onBlur={e => handleFieldBlur("Enter_referralIban", e.target.value)} placeholder="Ex: CH93 0000 0000 0000 0000 0" className="w-full px-5 py-3 rounded-xl border border-blue-200 bg-white font-black text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 text-slate-800 uppercase transition-all" />
                      </div>
                    </div>
                  </div>

                  {/* LA CLÔTURE DÉPLACÉE ICI */}
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-[32px] p-8 text-center space-y-4 max-w-lg mx-auto mt-12 shadow-sm">
                    <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                      <CheckCircle2 size={32} />
                    </div>
                    <h4 className="font-black text-slate-900 text-2xl tracking-tight">Prêt à figer le protocole ?</h4>
                    <p className="text-sm font-bold text-slate-500 leading-relaxed px-4">
                      En cliquant ci-dessous, la session de conseil sera fermée. Vos notes, données et objectifs d'optimisation seront archivés et synchronisés sur l'interface de votre client.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* FOOTER DYNAMIQUE DIRECTIONNEL */}
      <div className="px-8 py-5 border-t border-slate-100 bg-white shrink-0 flex justify-between items-center z-50">
        <Button 
          disabled={currentStep === 1}
          onClick={() => {
            setDirection("down");
            setTimeout(() => setCurrentStep((old) => (old - 1) as Step), 0);
          }}
          className="bg-white text-slate-400 hover:text-slate-900 hover:bg-slate-50 border-none shadow-none font-black text-xs uppercase tracking-widest h-14 px-8"
        >
          <ChevronLeft size={18} className="mr-2" /> Retour
        </Button>

        {currentStep < 7 ? (
          <Button 
            onClick={() => {
              setDirection("up");
              setTimeout(() => setCurrentStep((old) => (old + 1) as Step), 0);
            }}
            className="bg-slate-900 text-white hover:bg-blue-600 rounded-2xl font-black text-xs uppercase tracking-widest h-14 px-10 shadow-xl transition-all active:scale-95"
          >
            Suivant <ChevronRight size={18} className="ml-2" />
          </Button>
        ) : (
          <Button 
            onClick={handleFinalizeSession}
            disabled={isSaving}
            className="bg-emerald-500 text-white hover:bg-emerald-600 rounded-2xl font-black text-xs uppercase tracking-widest h-14 px-10 shadow-xl transition-all"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} className="mr-2" />} 
            Clôturer la session
          </Button>
        )}
      </div>

    </div>
  );
}