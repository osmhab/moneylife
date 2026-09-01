"use client";

// Outil d'analyse prévoyance CONSEILLER (onglet CRM).
// Pré-remplit depuis la fiche client, laisse le conseiller ajuster, puis lance
// l'analyse SYNCHRONE (POST /api/admin/analyse) et affiche :
//  • une vue SIMPLE (score + cartes de risque, lisible d'un coup d'œil)
//  • un accordéon « Détail complet » (couches, 1er pilier) pour aller plus loin.

import * as React from "react";
import { usePathname } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { computeProjections3aAssurance, computeDeathBenefitAssurance } from "@/lib/calculs/3epilier";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import DossierImagesDialog from "./DossierImagesDialog";
import NotesConseillerSection from "./NotesConseillerSection";
import { Calculator, Loader2, Plus, Trash2, AlertTriangle, ShieldCheck, ScanLine, Printer, RotateCcw, SlidersHorizontal } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { usePublishAdminSubnav } from "@/[locale]/admin/_components/adminSubnav";

// Piliers de l'espace d'analyse conseiller (calqué sur le pager de l'app iOS).
type PillarId = "global" | "p1" | "p2" | "p3" | "epargne" | "analyse";
const PILLARS: { id: PillarId; label: string }[] = [
  { id: "global", label: "Vue globale" },
  { id: "p1", label: "1er pilier (AVS/AI)" },
  { id: "p2", label: "2e pilier (LPP)" },
  { id: "p3", label: "3e pilier (privé)" },
  { id: "epargne", label: "Épargne libre" },
  { id: "analyse", label: "Analyse" },
];
const PILLAR_LABELS: Record<PillarId, string> = Object.fromEntries(PILLARS.map((p) => [p.id, p.label])) as any;
const isEpargne = (t: any) => String(t) === "EPARGNE_LIBRE";
const chf = (n: any) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");

function extractUidFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("clients");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return "";
}

const fmt = (n: any) =>
  Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'");

type AnyObj = Record<string, any>;

// Libellés des sous-types 2e pilier (caisses + libre passage).
const PLAN2_LABELS: Record<string, string> = {
  LPP_BASE: "Caisse de pension (base)",
  LPP_COMPL: "Caisse complémentaire",
  LIBRE_PASSAGE_POLICE: "Libre passage (police)",
  LIBRE_PASSAGE_COMPTE: "Libre passage (compte)",
};
const PLAN2_OPTIONS = Object.entries(PLAN2_LABELS); // [type, label]

export default function AdminClientAnalysePrevoyanceClient() {
  const pathname = usePathname();
  const uid = extractUidFromPath(pathname);

  const [client, setClient] = React.useState<AnyObj>({});
  const [plans, setPlans] = React.useState<AnyObj[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [analysis, setAnalysis] = React.useState<AnyObj | null>(null);
  const [lppEstimation, setLppEstimation] = React.useState<AnyObj | null>(null);
  const [detailRentes, setDetailRentes] = React.useState<AnyObj | null>(null);
  const [projections, setProjections] = React.useState<AnyObj | null>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  // Le bouton « Dossier PDF » ouvre d'abord le choix des images ; la génération
  // n'a lieu qu'une fois les emplacements validés.
  const [imagesOpen, setImagesOpen] = React.useState(false);
  const [lppMinimum, setLppMinimum] = React.useState(false);
  // Besoins forcés par le conseiller (persistés sur la fiche client).
  const [besoinOverrides, setBesoinOverrides] = React.useState<AnyObj>({});
  const [besoinSaved, setBesoinSaved] = React.useState<"idle" | "saving" | "saved">("idle");
  const [scanNote, setScanNote] = React.useState<string | null>(null);
  const [debutMode, setDebutMode] = React.useState<"annee" | "age">("annee");
  const [pillar, setPillar] = React.useState<PillarId>("global");

  const setField = (k: string, v: any) => setClient((c) => ({ ...c, [k]: v }));

  // Âge du client (pour la projection 3a à l'enregistrement).
  const clientAge = React.useMemo(() => {
    const dn = String(client.Enter_dateNaissance || "");
    const parts = dn.split(".");
    const by = parts.length === 3 ? parseInt(parts[2]) : new Date(dn).getFullYear();
    return by && !Number.isNaN(by) ? new Date().getFullYear() - by : 35;
  }, [client.Enter_dateNaissance]);

  // ── 2e pilier (caisses + libre passage) ───────────────────────────────────
  const is2ndPillar = (t: any) =>
    ["LPP_BASE", "LPP_COMPL", "LPP", "LIBRE_PASSAGE_POLICE", "LIBRE_PASSAGE_COMPTE"].includes(String(t));
  const norm2 = (t: any) => (String(t) === "LPP" ? "LPP_BASE" : String(t)); // alias legacy

  // ── 3e pilier (plans privés 3a/3b) ────────────────────────────────────────
  const is3rdPillar = (t: any) =>
    typeof t === "string" && (t.startsWith("PILIER_3") || t.startsWith("3A") || t === "3B" || t === "3A_BANQUE");
  // ── Persistance Firestore ─────────────────────────────────────────────────
  // Décision validée : les plans saisis/scannés par le conseiller sont RÉELS —
  // écrits dans clients/{uid}/plans → synchronisés sur l'app du client ET lus par
  // les graphiques. Édition inline sauvegardée en débounce (comme iOS).
  const saveTimers = React.useRef<Record<string, any>>({});
  const enrichData = React.useCallback(
    (p: AnyObj) => {
      const data = { ...(p.data || {}) };
      if (p.type === "PILIER_3A_POLICE" || p.type === "PILIER_3B") {
        try {
          data.capitalRetraiteProjete = computeProjections3aAssurance(data as any, clientAge);
          data.capitalDecesCalcule = computeDeathBenefitAssurance(data as any);
          data.projectionCalculatedAt = new Date().toISOString();
        } catch {
          /* garde les valeurs saisies si le calcul échoue */
        }
      }
      return data;
    },
    [clientAge],
  );
  const planPayload = React.useCallback(
    (p: AnyObj) => ({
      type: p.type,
      institutionName: p.institutionName ?? p.label ?? "",
      label: p.label ?? "",
      origin: p.origin ?? "external",
      status: p.status ?? "ACTIVE",
      data: enrichData(p),
    }),
    [enrichData],
  );
  // Projection retraite serveur pour 3a banque / épargne libre (l'assurance est calculée
  // en local dans enrichData). Renvoie null si le type n'a pas de projection API.
  const apiProjection = React.useCallback(
    async (type: string, data: AnyObj): Promise<number | null> => {
      const kind = type === "PILIER_3A_BANK" ? "3a-banque" : type === "EPARGNE_LIBRE" ? "epargne-libre" : null;
      if (!kind) return null;
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/calculs/projection-retraite", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ kind, clientAge, data }),
        });
        const j = await res.json().catch(() => ({}));
        return res.ok ? Number(j.capital) || 0 : null;
      } catch {
        return null;
      }
    },
    [clientAge],
  );
  const withProjection = React.useCallback(
    async (p: AnyObj): Promise<AnyObj> => {
      const cap = await apiProjection(p.type, p.data || {});
      if (cap == null) return p;
      return {
        ...p,
        data: { ...(p.data || {}), capitalRetraiteProjete: cap, projectionCalculatedAt: new Date().toISOString() },
      };
    },
    [apiProjection],
  );

  const persistPlan = React.useCallback(
    (p: AnyObj) => {
      if (!uid || !p?.id) return;
      clearTimeout(saveTimers.current[p.id]);
      saveTimers.current[p.id] = setTimeout(async () => {
        const pp = await withProjection(p);
        updateDoc(doc(db, "clients", uid, "plans", p.id), {
          ...planPayload(pp),
          "metadata.updatedAt": new Date(),
        } as any).catch(() => {});
      }, 600);
    },
    [uid, planPayload, withProjection],
  );
  async function createPlan(p: AnyObj): Promise<string | null> {
    if (!uid) return null;
    const pp = await withProjection(p);
    const refDoc = await addDoc(collection(db, "clients", uid, "plans"), {
      ...planPayload(pp),
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        isManualEntry: !p._scanned,
        sourceFile: p._sourceFile ?? null,
        sourceFileUrl: p._sourceFileUrl ?? null,
      },
    } as any);
    setPlans((ps) => [...ps, { ...pp, id: refDoc.id }]);
    return refDoc.id;
  }

  const updatePlanTop = (idx: number, key: string, val: any) =>
    setPlans((ps) => {
      const next = ps.map((p, i) =>
        i === idx ? { ...p, [key]: val, ...(key === "label" ? { institutionName: val } : {}) } : p,
      );
      persistPlan(next[idx]);
      return next;
    });
  const updatePlanData = (idx: number, key: string, val: any) =>
    setPlans((ps) => {
      const next = ps.map((p, i) => (i === idx ? { ...p, data: { ...(p.data || {}), [key]: val } } : p));
      persistPlan(next[idx]);
      return next;
    });
  const removePlan = (idx: number) =>
    setPlans((ps) => {
      const p = ps[idx];
      if (uid && p?.id) deleteDoc(doc(db, "clients", uid, "plans", p.id)).catch(() => {});
      return ps.filter((_, i) => i !== idx);
    });
  const addPilier3 = () =>
    createPlan({ type: "PILIER_3A_POLICE", status: "ACTIVE", label: "", data: { typeContrat: "3a", occurrence: "mois", isRegulier: true } });
  const addEpargne = () =>
    createPlan({
      type: "EPARGNE_LIBRE",
      status: "ACTIVE",
      label: "",
      data: { epargneKind: "compte", epargneHorizon: "retraite", occurrence: "mois", isInvesti: false },
    });
  // Ajout manuel d'un 2e pilier. Par défaut LPP_BASE ; si une base existe déjà → LPP_COMPL
  // (même logique de contexte que le scan). Le type reste modifiable dans la carte.
  const addLpp = () => {
    const hasBase = plans.some((p) => norm2(p?.type) === "LPP_BASE");
    return createPlan({ type: hasBase ? "LPP_COMPL" : "LPP_BASE", status: "ACTIVE", label: "", data: {} });
  };

  // ── Chargement du contexte (données perso + plans) ────────────────────────
  React.useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/admin/analyse/context?uid=${uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Chargement impossible");
        setClient(data.client || {});
        setPlans(Array.isArray(data.plans) ? data.plans : []);
        setBesoinOverrides(data.besoinOverrides || {});
      } catch (e: any) {
        setError(e?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  // ── Lancement de l'analyse ────────────────────────────────────────────────
  async function runAnalyse() {
    return runAnalyseWith(besoinOverrides);
  }

  async function runAnalyseWith(overrides: AnyObj) {
    setRunning(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/analyse", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ client, plans, lppMinimum, besoinOverrides: overrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Analyse impossible");
      setAnalysis(data.analysis);
      setLppEstimation(data.lppEstimation || null);
      setDetailRentes(data.detailRentes || null);
      setProjections(data.projections || null);
    } catch (e: any) {
      setError(e?.message || "Erreur d'analyse");
      setAnalysis(null);
    } finally {
      setRunning(false);
    }
  }

  // Un besoin modifié doit se répercuter sur l'analyse ET être enregistré, mais un
  // glissement de curseur produit des dizaines d'événements : on diffère de 500 ms.
  const besoinTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisRef = React.useRef(analysis);
  analysisRef.current = analysis;

  function updateBesoin(key: string, patch: AnyObj) {
    setBesoinOverrides((prev) => {
      const next = { ...prev, [key]: { ...(prev[key] || {}), ...patch } };
      // Un thème sans montant ni libellé n'a plus lieu d'être stocké.
      const e = next[key];
      if (!Number(e?.valeur) && !String(e?.libelle || "").trim()) delete next[key];

      if (besoinTimer.current) clearTimeout(besoinTimer.current);
      besoinTimer.current = setTimeout(() => {
        void persistBesoins(next);
        // On ne relance l'analyse que si elle a déjà tourné une fois.
        if (analysisRef.current) void runAnalyseWith(next);
      }, 500);
      return next;
    });
  }

  async function persistBesoins(besoins: AnyObj) {
    if (!uid) return;
    setBesoinSaved("saving");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/analyse/context?uid=${uid}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ besoins }),
      });
      setBesoinSaved(res.ok ? "saved" : "idle");
    } catch {
      setBesoinSaved("idle");
    }
  }

  // Génère le dossier en VRAI PDF (react-pdf, importé à la volée) et l'ouvre dans un nouvel onglet.
  async function openPdf(images: Record<string, any> = {}, notes = "", advisor: any = null) {
    if (!analysis) return;
    setPdfBusy(true);
    setError(null);
    try {
      const [{ pdf }, { default: DossierPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./DossierPDF"),
      ]);
      // Signature saisie dans l'écran de préparation ; à défaut, le profil Firebase.
      const advisorName = advisor?.nom
        ? advisor
        : (auth.currentUser?.displayName || auth.currentUser?.email || "");
      const today = new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" });
      const blob = await pdf(
        <DossierPDF client={client} plans={plans} analysis={analysis} advisor={advisorName} today={today} images={images} notes={notes} />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      setError("Génération du PDF impossible : " + (e?.message || "erreur"));
    } finally {
      setPdfBusy(false);
    }
  }

  // ── Scan de documents (réutilise les routes de parsing Gemini existantes) ──
  const [scanning, setScanning] = React.useState<string | null>(null);

  // Renvoie le JSON COMPLET de la route (data + éventuel `subtype` pour la LPP).
  async function scanFiles(endpoint: string, files: File[]): Promise<AnyObj> {
    const token = await auth.currentUser?.getIdToken();
    const fd = new FormData();
    for (const f of files) fd.append("file", f);
    const res = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Scan échoué");
    return json;
  }

  // Archive le document scanné dans le coffre-fort (Storage) → conservé + consultable, comme l'app.
  // (Multi-pages : on archive la 1re page/fichier ; l'assemblage PDF reste une amélioration future.)
  async function archiveScan(files: File[], kind: string): Promise<string | null> {
    if (!uid || !files.length) return null;
    try {
      const f = files[0];
      const safe = (f.name || `${kind}.pdf`).replace(/[^\w.\-]+/g, "_");
      const r = storageRef(storage, `clients/${uid}/documents/scans/${Date.now()}_${safe}`);
      await uploadBytes(r, f);
      return await getDownloadURL(r);
    } catch {
      return null;
    }
  }

  // Document 2e pilier → crée un PLAN (base / complémentaire / libre passage). L'IA détecte
  // la FAMILLE (caisse vs libre passage) ; base vs complémentaire est décidé par CONTEXTE
  // (1re caisse = base, 2e = complémentaire), bascule possible sur la carte.
  async function scanLpp(files: File[]) {
    setScanning("lpp");
    setError(null);
    setScanNote(null);
    try {
      const json = await scanFiles("/api/lpp/parse-image", files);
      const data = json.data ?? {};
      const sub = json.subtype ?? { kind: "CAISSE", planType: "LPP_BASE", confidence: "LOW" };
      let planType: string = sub.planType || "LPP_BASE";
      let byContext = false;
      if (sub.kind === "CAISSE") {
        const hasBase = plans.some((p) => norm2(p?.type) === "LPP_BASE");
        planType = hasBase ? "LPP_COMPL" : "LPP_BASE";
        byContext = hasBase; // complémentaire déduit du contexte
      }
      const label =
        data.institutionName && data.institutionName !== "AUTRE" ? String(data.institutionName) : "";
      const lppUrl = await archiveScan(files, "lpp");
      await createPlan({ type: planType, status: "ACTIVE", label, _scanned: true, _sourceFile: "LPP_SCAN", _sourceFileUrl: lppUrl, data });
      const tl = PLAN2_LABELS[planType] || "2e pilier";
      setScanNote(
        sub.confidence === "HIGH" && !byContext
          ? `✓ Détecté : ${tl}${label ? ` — ${label}` : ""}`
          : `Ajouté : ${tl}${label ? ` — ${label}` : ""} — vérifiez le type ci-dessous si besoin.`
      );
    } catch (e: any) {
      setError(e?.message || "Scan LPP échoué");
    } finally {
      setScanning(null);
    }
  }

  // Police 3a/3b (assurance) → crée un plan 3e pilier prérempli.
  async function scanInsurance(files: File[]) {
    setScanning("ins");
    setError(null);
    try {
      const json = await scanFiles("/api/insurance/parse", files);
      const d = json.data ?? json;
      const type = d.typeContrat === "3b" ? "PILIER_3B" : "PILIER_3A_POLICE";
      const insUrl = await archiveScan(files, "police");
      await createPlan({
        type,
        status: "ACTIVE",
        label: d.compagnie || "",
        _scanned: true,
        _sourceFile: "INSURANCE_SCAN",
        _sourceFileUrl: insUrl,
        data: {
          typeContrat: d.typeContrat === "3b" ? "3b" : "3a",
          valeurRachatActuelle: d.valeurRachatActuelle,
          projectionAssureur: d.projectionAssureur,
          capitalDecesFixe: d.capitalDecesFixe,
          renteInvalidite: d.renteInvalidite,
          primeTotale: d.primeTotale,
          primeEpargne: d.primeEpargne,
          occurrence: d.occurrence || "mois",
          isInvesti: d.isInvesti,
          profil: d.profil,
          dateDebut: d.dateDebut,
          dateEcheance: d.dateEcheance,
        },
      });
    } catch (e: any) {
      setError(e?.message || "Scan police échoué");
    } finally {
      setScanning(null);
    }
  }

  // Relevé de compte 3a bancaire → crée un plan 3e pilier bancaire prérempli.
  async function scanBank(files: File[]) {
    setScanning("bank");
    setError(null);
    try {
      const json = await scanFiles("/api/bank/parse", files);
      const d = json.data ?? json;
      const bankUrl = await archiveScan(files, "releve");
      await createPlan({
        type: "PILIER_3A_BANK",
        status: "ACTIVE",
        label: d.institution || "",
        _scanned: true,
        _sourceFile: "BANK_SCAN",
        _sourceFileUrl: bankUrl,
        data: {
          soldeActuel: d.soldeActuel,
          montantRegulier: d.versementAnnuel,
          occurrence: "annee",
          isRegulier: Number(d.versementAnnuel) > 0,
          isInvesti: d.isInvesti,
        },
      });
    } catch (e: any) {
      setError(e?.message || "Scan relevé échoué");
    } finally {
      setScanning(null);
    }
  }

  // ── Édition des enfants ───────────────────────────────────────────────────
  // Sous-menu piliers publié dans la sidebar admin (switcher). Arborescence : Nom › Analyse conseiller › piliers.
  const clientName = `${client.Enter_prenom || ""} ${client.Enter_nom || ""}`.trim();
  usePublishAdminSubnav(
    {
      crumbs: [clientName || "Client", "Analyse conseiller"],
      onSelect: (id) => setPillar(id as PillarId),
      activeId: pillar,
      items: PILLARS.map((p) => ({ id: p.id, label: p.label })),
    },
    [pillar, clientName],
  );

  // Auto-analyse : au chargement puis à chaque changement de plans / mode minimum (débounce).
  React.useEffect(() => {
    if (loading || !uid) return;
    const t = setTimeout(() => { runAnalyse(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, plans, lppMinimum]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du dossier…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DossierImagesDialog
        open={imagesOpen}
        onOpenChange={setImagesOpen}
        uid={uid}
        onGenerate={(images, notes, advisor) => openPdf(images as Record<string, any>, notes, advisor)}
      />

      {/* En-tête pilier + action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold">{PILLAR_LABELS[pillar]}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => setImagesOpen(true)}
            disabled={!analysis || pdfBusy}
            title={analysis ? "Générer le dossier PDF (nouvel onglet)" : "Lancez l'analyse d'abord"}
          >
            {pdfBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
            {pdfBusy ? "Génération…" : "Dossier PDF"}
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={runAnalyse} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
            Actualiser l'analyse
          </Button>
        </div>
      </div>

      {/* Nav piliers (repli si la sidebar est fermée / petit écran) */}
      <div className="flex flex-wrap gap-1.5">
        {PILLARS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPillar(p.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              pillar === p.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ─────────── Vue globale ─────────── */}
      {pillar === "global" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Score de prévoyance</CardTitle></CardHeader>
            <CardContent>
              {analysis ? (
                <div className="text-4xl font-bold">
                  {Math.round(Number(analysis.totalScore) || 0)}
                  <span className="text-lg text-muted-foreground">/100</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">{running ? "Analyse en cours…" : "—"}</div>
              )}
              <Button variant="link" className="mt-1 px-0" onClick={() => setPillar("analyse")}>
                Ouvrir l'analyse complète →
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Plans du dossier</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">2e pilier</span><span className="font-semibold">{plans.filter((p) => is2ndPillar(p?.type)).length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">3e pilier</span><span className="font-semibold">{plans.filter((p) => is3rdPillar(p?.type)).length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Épargne libre</span><span className="font-semibold">{plans.filter((p) => isEpargne(p?.type)).length}</span></div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─────────── 1er pilier — dérivé des données perso ─────────── */}
      {pillar === "p1" && <PremierPilierPane pp={analysis?.premierPilier} running={running} />}

      {/* ─────────── 2e pilier ─────────── */}
      {pillar === "p2" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            {/* LPP */}
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm font-medium">Affilié LPP (2e pilier)</span>
              <Switch
                checked={!!client.Enter_Affilie_LPP}
                onCheckedChange={(v) => setField("Enter_Affilie_LPP", v)}
              />
            </div>

            {client.Enter_Affilie_LPP && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">2e pilier — caisses &amp; libre passage</span>
                  <div className="flex items-center gap-1.5">
                    <ScanButton label="Scanner" busy={scanning === "lpp"} onFiles={scanLpp} />
                    <Button variant="outline" size="sm" onClick={addLpp}>
                      <Plus className="h-4 w-4 mr-1" /> Ajouter
                    </Button>
                  </div>
                </div>

                {scanNote && (
                  <div className="rounded-md bg-blue-50 p-2 text-[11px] text-blue-800">{scanNote}</div>
                )}

                {/* Plans 2e pilier (base, complémentaire, libre passage) — en accordéon */}
                <PlanAccordionList
                  plans={plans}
                  filter={(p) => is2ndPillar(p?.type)}
                  title={(p) => `${PLAN2_LABELS[norm2(p.type)] || "2e pilier"}${p.label ? ` · ${p.label}` : ""}`}
                  value={(p) => `${chf(planCapital65(p))} CHF`}
                  card={(p, i) => (
                    <>
                      <Pilier2Card plan={p} onTop={(k, v) => updatePlanTop(i, k, v)} onData={(k, v) => updatePlanData(i, k, v)} onRemove={() => removePlan(i)} />
                      <Pilier2Detail plan={p} />
                    </>
                  )}
                />

                {/* Saisie manuelle / minimum légal : uniquement si AUCUN plan 2e pilier n'est présent. */}
                {!plans.some((p) => is2ndPillar(p?.type)) && (
                  <>
                    {/* Choix : certificat réel vs estimation au minimum légal */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Estimer au minimum légal (pas de certificat)</span>
                      <Switch checked={lppMinimum} onCheckedChange={setLppMinimum} />
                    </div>

                {lppMinimum ? (
                  <div className="space-y-3">
                    {/* Choix : renseigner par année OU par âge de début d'activité */}
                    <div className="inline-flex rounded-md border p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setDebutMode("annee");
                          setField("Enter_ageDebutActivite", 0);
                        }}
                        className={`px-3 py-1 rounded ${debutMode === "annee" ? "bg-indigo-600 text-white" : "text-muted-foreground"}`}
                      >
                        Année
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDebutMode("age");
                          setField("Enter_anneeDebutActivite", 0);
                        }}
                        className={`px-3 py-1 rounded ${debutMode === "age" ? "bg-indigo-600 text-white" : "text-muted-foreground"}`}
                      >
                        Âge
                      </button>
                    </div>

                    {debutMode === "annee" ? (
                      <Field label="Année de début d'activité">
                        <Input
                          type="number"
                          placeholder="2010"
                          value={client.Enter_anneeDebutActivite || ""}
                          onChange={(e) => setField("Enter_anneeDebutActivite", Number(e.target.value) || 0)}
                        />
                      </Field>
                    ) : (
                      <Field label="Âge au début d'activité">
                        <Input
                          type="number"
                          placeholder="22"
                          value={client.Enter_ageDebutActivite || ""}
                          onChange={(e) => setField("Enter_ageDebutActivite", Number(e.target.value) || 0)}
                        />
                      </Field>
                    )}

                    <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Estimation au strict minimum légal LPP (salaire supposé constant).
                      Les cotisations épargne LPP démarrent à 25 ans : un début avant 25 ans
                      (18, 19…) donne le même minimum. À remplacer par le certificat réel dès que possible.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      Certificat LPP (montants annuels)
                    </div>
                    <MoneyField label="Avoir de vieillesse (actuel)" k="Enter_avoirVieillesseTotal" client={client} setField={setField} />
                    <MoneyField label="Capital projeté à 65 ans" k="Enter_lppCapitalProjete65" client={client} setField={setField} />
                    <MoneyField label="Rente vieillesse à 65" k="Enter_rentevieillesseLPP65" client={client} setField={setField} />
                    <MoneyField label="Rente invalidité" k="Enter_renteInvaliditeMaladie" client={client} setField={setField} />
                    <MoneyField label="Rente conjoint" k="Enter_renteConjointLPP" client={client} setField={setField} />
                    <MoneyField label="Rente orphelin" k="Enter_renteOrphelinLPP" client={client} setField={setField} />
                  </div>
                )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────── 3e pilier (contrats privés 3a/3b) ─────────── */}
      {pillar === "p3" && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">3e pilier (privé)</span>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <ScanButton label="Police" busy={scanning === "ins"} onFiles={scanInsurance} />
                <ScanButton label="Relevé" busy={scanning === "bank"} onFiles={scanBank} />
                <Button variant="outline" size="sm" onClick={addPilier3}>
                  <Plus className="h-4 w-4 mr-1" /> Ajouter
                </Button>
              </div>
            </div>
            <PlanAccordionList
              plans={plans}
              filter={(p) => is3rdPillar(p?.type)}
              title={(p) => `${PILIER3_TYPES.find((t) => t.value === p.type)?.label || "3e pilier"}${p.label ? ` · ${p.label}` : ""}`}
              value={(p) => `${chf(planCapital65(p))} CHF`}
              card={(p, i) => (
                <>
                  <Pilier3Card plan={p} onTop={(k, v) => updatePlanTop(i, k, v)} onData={(k, v) => updatePlanData(i, k, v)} onRemove={() => removePlan(i)} />
                  <Plan3aCalcSummary plan={p} />
                </>
              )}
            />
            {!plans.some((p) => is3rdPillar(p?.type)) && (
              <div className="text-xs text-muted-foreground">Aucun 3e pilier. « Ajouter » pour en intégrer un.</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────── Épargne libre ─────────── */}
      {pillar === "epargne" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Épargne libre (cash hors prévoyance)</span>
              <Button variant="outline" size="sm" onClick={addEpargne}>
                <Plus className="h-4 w-4 mr-1" /> Ajouter
              </Button>
            </div>
            <PlanAccordionList
              plans={plans}
              filter={(p) => isEpargne(p?.type)}
              title={(p) => p.label || p.institutionName || "Épargne libre"}
              value={(p) => `${chf(p.data?.soldeActuel)} CHF`}
              card={(p, i) => (
                <PilierEpargneCard plan={p} onTop={(k, v) => updatePlanTop(i, k, v)} onData={(k, v) => updatePlanData(i, k, v)} onRemove={() => removePlan(i)} />
              )}
            />
            {!plans.some((p) => isEpargne(p?.type)) && (
              <div className="text-xs text-muted-foreground">Aucune épargne libre. « Ajouter » pour en créer une.</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────── Analyse ─────────── */}
      {pillar === "analyse" &&
        (!analysis ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              {running ? "Analyse en cours…" : "Analyse indisponible — vérifiez les données du client puis « Actualiser »."}
            </CardContent>
          </Card>
        ) : (
          <ResultView
            analysis={analysis}
            lppEstimation={lppEstimation}
            detailRentes={detailRentes}
            projections={projections}
            plans={plans}
            uid={uid}
            besoinOverrides={besoinOverrides}
            onBesoin={updateBesoin}
            besoinSaved={besoinSaved}
          />
        ))}

      <NotesConseillerSection uid={uid} />
    </div>
  );
}

// 1er pilier — prestations de l'État dérivées des données perso (aucun plan à saisir).
function PremierPilierPane({ pp, running }: { pp?: AnyObj | null; running?: boolean }) {
  if (!pp) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          {running ? "Calcul en cours…" : "Complétez les données personnelles du client pour estimer les prestations AVS/AI."}
        </CardContent>
      </Card>
    );
  }
  const row = (label: string, montant: number, note?: string) => (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <div>
        <div className="text-sm">{label}</div>
        {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
      </div>
      <div className="text-sm font-semibold">{chf(montant)} CHF<span className="text-muted-foreground">/mois</span></div>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Retraite</CardTitle></CardHeader>
        <CardContent>{row("Rente AVS vieillesse", Number(pp.retraite?.avs) || 0)}</CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Invalidité</CardTitle></CardHeader>
        <CardContent>
          {row("AI — maladie", Number(pp.invaliditeMaladie?.avs) || 0)}
          {row("AI — accident", Number(pp.invaliditeAccident?.avs) || 0)}
          {row("Complément LAA (accident)", Number(pp.invaliditeAccident?.laa) || 0)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Décès (survivants)</CardTitle></CardHeader>
        <CardContent>
          {row("AVS — maladie", Number(pp.decesMaladie?.avs) || 0)}
          {row("AVS — accident", Number(pp.decesAccident?.avs) || 0)}
          {row("Complément LAA (accident)", Number(pp.decesAccident?.laa) || 0)}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────────

const PILIER3_TYPES: { value: string; label: string }[] = [
  { value: "PILIER_3A_POLICE", label: "3a assurance" },
  { value: "PILIER_3A_BANK", label: "3a banque" },
  { value: "PILIER_3B", label: "3b" },
];

const PROFILS = ["defensif", "equilibre", "growth", "dynamique"];
// Libellés + rendement affiché (taux réels du moteur, comme iOS).
const PROFIL_LABELS: Record<string, string> = {
  defensif: "Défensif ~2%",
  equilibre: "Équilibré ~3.5%",
  growth: "Croissance ~5%",
  dynamique: "Dynamique ~6.5%",
};
const EPARGNE_KINDS: [string, string][] = [
  ["compte", "Compte épargne"],
  ["fonds", "Fonds"],
  ["etf", "ETF"],
  ["actions", "Actions"],
];
const EPARGNE_HORIZONS: [string, string][] = [
  ["retraite", "Retraite (long terme)"],
  ["court", "Court terme"],
  ["autre", "Autre échéance"],
];

// Capital projeté à 65 (règle iOS capital65Display : priorité projectionAssureur).
const planCapital65 = (p: AnyObj) => {
  const d = p.data || {};
  return Number(d.projectionAssureur) > 0
    ? Number(d.projectionAssureur)
    : Number(d.capitalRetraiteProjete) ||
        Number(d.Enter_lppCapitalProjete65) ||
        Number(d.capitalRetraiteGlobal) ||
        Number(d.valeurRachatActuelle) ||
        Number(d.soldeActuel) ||
        0;
};

// Éditeur épargne libre (mêmes champs que l'app iOS).
function PilierEpargneCard({
  plan,
  onTop,
  onData,
  onRemove,
}: {
  plan: AnyObj;
  onTop: (k: string, v: any) => void;
  onData: (k: string, v: any) => void;
  onRemove: () => void;
}) {
  const d = plan.data || {};
  const kind = d.epargneKind || "compte";
  const num = (k: string, label: string) => (
    <Field label={label}>
      <Input type="number" value={d[k] ?? ""} onChange={(e) => onData(k, Number(e.target.value) || 0)} />
    </Field>
  );
  return (
    <div className="space-y-2 rounded-md border border-teal-200 bg-teal-50/40 p-3">
      <div className="flex items-center gap-2">
        <Input
          className="h-8 flex-1"
          placeholder="Nom (banque / produit)"
          value={plan.label || ""}
          onChange={(e) => onTop("label", e.target.value)}
        />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type de placement">
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={kind}
            onChange={(e) => {
              const k = e.target.value;
              onData("epargneKind", k);
              onData("isInvesti", k !== "compte");
            }}
          >
            {EPARGNE_KINDS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Horizon">
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={d.epargneHorizon || "retraite"}
            onChange={(e) => onData("epargneHorizon", e.target.value)}
          >
            {EPARGNE_HORIZONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
      </div>
      {d.epargneHorizon === "autre" && num("epargneHorizonAnnee", "Année d'échéance")}
      <div className="grid grid-cols-2 gap-2">
        {num("soldeActuel", "Solde actuel")}
        {num("montantRegulier", "Versement / période")}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          <span>Périodicité</span>
          <select
            className="h-7 rounded-md border border-input bg-transparent px-1"
            value={d.occurrence || "mois"}
            onChange={(e) => onData("occurrence", e.target.value)}
          >
            <option value="mois">/ mois</option>
            <option value="annee">/ an</option>
          </select>
        </div>
        {kind !== "compte" && (
          <select
            className="h-7 rounded-md border border-input bg-transparent px-1 text-xs"
            value={d.profil || "equilibre"}
            onChange={(e) => onData("profil", e.target.value)}
          >
            {PROFILS.map((p) => (
              <option key={p} value={p}>{PROFIL_LABELS[p] || p}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// Liste de plans en accordéon (remplace le details view iOS) : titre + valeur repliés, config déployée.
function PlanAccordionList({
  plans,
  filter,
  title,
  value,
  card,
}: {
  plans: AnyObj[];
  filter: (p: AnyObj) => boolean;
  title: (p: AnyObj) => string;
  value: (p: AnyObj) => string;
  card: (p: AnyObj, i: number) => React.ReactNode;
}) {
  const items = plans.map((p, i) => ({ p, i })).filter(({ p }) => filter(p));
  if (!items.length) return null;
  return (
    <Accordion type="multiple" className="space-y-2">
      {items.map(({ p, i }) => (
        <AccordionItem key={p.id || i} value={String(p.id || i)} className="rounded-md border bg-white px-3">
          <AccordionTrigger className="py-2 text-sm hover:no-underline">
            <div className="flex flex-1 items-center justify-between pr-2">
              <span className="text-left font-medium">{title(p)}</span>
              <span className="ml-2 shrink-0 text-muted-foreground">{value(p)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>{card(p, i)}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function CalcRow({ label, v }: { label: string; v: any }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{chf(Number(v) || 0)} CHF</span>
    </div>
  );
}

// Résumé calculé d'un 3e pilier (dérivé du data, comme la carte « À quoi sert cette prime ? » iOS).
function Plan3aCalcSummary({ plan }: { plan: AnyObj }) {
  const d = plan.data || {};
  const rows: [string, number][] =
    plan.type === "PILIER_3A_BANK" || plan.type === "3A_BANQUE"
      ? [["Capital projeté 65", planCapital65(plan)], ["Capital décès (épargne)", Number(d.soldeActuel) || 0]]
      : [
          ["Capital projeté 65", planCapital65(plan)],
          ["Rente invalidité / an", Number(d.renteInvalidite) || 0],
          // Capital décès = moteur (fixe OU restitution des primes), aligné iOS — pas juste capitalDecesFixe.
          ["Capital décès", Number(computeDeathBenefitAssurance(d)) || 0],
        ];
  const note = [
    Number(d.projectionAssureur) > 0 ? "Projection assureur" : "Projection calculée",
    d.hasLDP ? "LDP incluse" : null,
    d.isInvesti
      ? `Investi · ${PROFIL_LABELS[d.profil] || d.profil}`
      : plan.type === "PILIER_3A_BANK" || plan.type === "3A_BANQUE"
        ? "Compte sécurisé"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="mt-2 rounded-md border bg-slate-50/70 p-2.5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Détails calculés</div>
      <div className="space-y-1 text-sm">{rows.map(([l, v]) => <CalcRow key={l} label={l} v={v} />)}</div>
      {note && <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

// Détail calculé d'un plan LPP : rentes (invalidité/enfant/conjoint/orphelin/vieillesse) + capitaux
// décès, via /api/calculs/lpp-rentes & lpp-capitaux, avec sélecteur maladie/accident (comme iOS).
function Pilier2Detail({ plan }: { plan: AnyObj }) {
  const t = plan.type === "LPP" ? "LPP_BASE" : String(plan.type);
  const isLP = t.startsWith("LIBRE_PASSAGE");
  const [mode, setMode] = React.useState<"maladie" | "accident">("maladie");
  const [rentes, setRentes] = React.useState<AnyObj | null>(null);
  const [capitaux, setCapitaux] = React.useState<AnyObj | null>(null);
  const dataKey = JSON.stringify(plan.data || {});
  React.useEffect(() => {
    if (isLP) return;
    let alive = true;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const [r1, r2] = await Promise.all([
          fetch("/api/calculs/lpp-rentes", { method: "POST", headers: h, body: JSON.stringify({ mode, data: plan.data || {} }) }),
          fetch("/api/calculs/lpp-capitaux", { method: "POST", headers: h, body: JSON.stringify({ data: plan.data || {} }) }),
        ]);
        const j1 = await r1.json().catch(() => ({}));
        const j2 = await r2.json().catch(() => ({}));
        if (!alive) return;
        setRentes(r1.ok ? j1.rentes : null);
        setCapitaux(r2.ok ? j2.capitaux : null);
      } catch {
        /* profil incomplet → pas de détail */
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, isLP, dataKey]);
  if (isLP) return null;
  const r = rentes || {};
  const cap = capitaux || {};
  const capAucune = mode === "maladie" ? cap.maladieAucune : cap.accidentAucune;
  const capPlus = mode === "maladie" ? cap.maladiePlus : cap.accidentPlus;
  const capIndep = mode === "maladie" ? cap.independantMal : cap.independantAcc;
  return (
    <div className="mt-2 rounded-md border bg-slate-50/70 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prestations calculées / an</span>
        <div className="inline-flex rounded-md border p-0.5 text-[11px]">
          {(["maladie", "accident"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-2 py-0.5 ${mode === m ? "bg-indigo-600 text-white" : "text-muted-foreground"}`}
            >
              {m === "maladie" ? "Maladie" : "Accident"}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <CalcRow label="Rente vieillesse 65" v={r.vieillesse} />
        <CalcRow label="Rente invalidité" v={r.invalidite} />
        <CalcRow label="Rente enfant d'invalide" v={r.enfantInvalidite} />
        <CalcRow label="Rente conjoint" v={r.conjoint} />
        <CalcRow label="Rente orphelin" v={r.orphelin} />
        <div className="my-1 border-t" />
        <div className="flex justify-between font-semibold">
          <span>Capital décès total versé</span>
          <span>{chf((Number(capPlus) || 0) + (Number(capIndep) || 0))} CHF</span>
        </div>
        <div className="space-y-0.5 pl-3 text-[11px] text-muted-foreground">
          <div className="flex justify-between">
            <span>· capital complément (versé avec la rente)</span>
            <span>{chf(Number(capPlus) || 0)}</span>
          </div>
          {Number(capIndep) > 0 && (
            <div className="flex justify-between">
              <span>· capital indépendant (versé toujours)</span>
              <span>{chf(Number(capIndep) || 0)}</span>
            </div>
          )}
          {Number(capAucune) > 0 && (
            <div className="flex justify-between italic">
              <span>· variante « si aucune rente de survivant »</span>
              <span>{chf(Number(capAucune) || 0)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Champ montant STABLE (module-level → pas de remontage/perte de focus à la frappe).
function LppMoney({ label, k, d, onData }: { label: string; k: string; d: AnyObj; onData: (k: string, v: any) => void }) {
  return (
    <Field label={label}>
      <Input type="number" value={d[k] ?? ""} onChange={(e) => onData(k, Number(e.target.value) || 0)} />
    </Field>
  );
}
function LppSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function Pilier2Card({
  plan,
  onTop,
  onData,
  onRemove,
}: {
  plan: AnyObj;
  onTop: (k: string, v: any) => void;
  onData: (k: string, v: any) => void;
  onRemove: () => void;
}) {
  const d = plan.data || {};
  const t = plan.type === "LPP" ? "LPP_BASE" : String(plan.type);
  const isLP = t.startsWith("LIBRE_PASSAGE");
  const [showMore, setShowMore] = React.useState(false);
  const M = (label: string, k: string) => <LppMoney label={label} k={k} d={d} onData={onData} />;

  return (
    <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/30 p-3">
      <div className="flex items-center gap-2">
        <select
          value={t}
          onChange={(e) => onTop("type", e.target.value)}
          className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium"
        >
          {PLAN2_OPTIONS.map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Field label="Institution">
        <Input value={plan.label ?? ""} onChange={(e) => onTop("label", e.target.value)} placeholder="Nom de la caisse / fondation" />
      </Field>

      {isLP ? (
        // Libre passage : capital seul (solde + projection à 65). Pas de rentes.
        <div className="grid grid-cols-2 gap-2">
          {M(t === "LIBRE_PASSAGE_COMPTE" ? "Solde actuel" : "Valeur de rachat", t === "LIBRE_PASSAGE_COMPTE" ? "soldeActuel" : "valeurRachatActuelle")}
          {M("Capital projeté 65", "capitalRetraiteGlobal")}
        </div>
      ) : (
        <div className="space-y-2.5">
          <LppSection title="Retraite">
            {M("Avoir de vieillesse", "Enter_avoirVieillesseTotal")}
            {M("Capital projeté 65", "Enter_lppCapitalProjete65")}
            {M("Rente vieillesse 65", "Enter_rentevieillesseLPP65")}
          </LppSection>
          <LppSection title="Invalidité">
            {M("Rente invalidité (maladie)", "Enter_renteInvaliditeMaladie")}
            {M("Rente invalidité (accident)", "Enter_lppRenteInvaliditeAccident")}
            {M("Rente enfant inv. (maladie)", "Enter_renteEnfantInvalideMaladie")}
            {M("Rente enfant inv. (accident)", "Enter_renteEnfantInvalideAccident")}
          </LppSection>
          <LppSection title="Décès">
            {M("Rente conjoint (maladie)", "Enter_renteConjointLPP")}
            {M("Rente conjoint (accident)", "Enter_lppRenteConjointAccident")}
            {M("Rente orphelin (maladie)", "Enter_renteOrphelinLPP")}
            {M("Rente orphelin (accident)", "Enter_lppRenteOrphelinAccident")}
            {M("Capital + rente (maladie)", "Enter_CapitalPlusRenteMal")}
            {M("Capital + rente (accident)", "Enter_CapitalPlusRenteAcc")}
            {M("Capital indépendant (mal)", "Enter_CapitalDecesIndependantMal")}
            {M("Capital indépendant (acc)", "Enter_CapitalDecesIndependantAcc")}
          </LppSection>
          <button type="button" onClick={() => setShowMore((v) => !v)} className="text-[11px] font-medium text-indigo-600">
            {showMore ? "− Masquer salaire & options" : "+ Salaire, rachat, EPL"}
          </button>
          {showMore && (
            <LppSection title="Salaire & options">
              {M("Salaire annuel", "Enter_salaireAnnuel")}
              {M("Salaire assuré LPP", "Enter_salaireAssureLPP")}
              {M("Rachat possible", "Enter_lppRachatPossible")}
              {M("EPL possible (logement)", "Enter_lppEPLPossible")}
            </LppSection>
          )}
        </div>
      )}
    </div>
  );
}

function Pilier3Card({
  plan,
  onTop,
  onData,
  onRemove,
}: {
  plan: AnyObj;
  onTop: (k: string, v: any) => void;
  onData: (k: string, v: any) => void;
  onRemove: () => void;
}) {
  const d = plan.data || {};
  const isBank = plan.type === "PILIER_3A_BANK" || plan.type === "3A_BANQUE";
  const [showPrimes, setShowPrimes] = React.useState(false);
  const num = (k: string, label: string) => (
    <Field label={label}>
      <Input type="number" value={d[k] ?? ""} onChange={(e) => onData(k, Number(e.target.value) || 0)} />
    </Field>
  );

  return (
    <div className="space-y-2 rounded-md bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <select
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          value={plan.type}
          onChange={(e) => {
            const v = e.target.value;
            onTop("type", v);
            // Règle double champ : type canonique ⇄ data.typeContrat (sauf 3a banque).
            if (v !== "PILIER_3A_BANK") onData("typeContrat", v === "PILIER_3B" ? "3b" : "3a");
          }}
        >
          {PILIER3_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <Input
          className="h-8 flex-1"
          placeholder={isBank ? "Banque / fondation" : "Compagnie"}
          value={plan.label || ""}
          onChange={(e) => onTop("label", e.target.value)}
        />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isBank ? (
        <div className="grid grid-cols-2 gap-2">
          {num("soldeActuel", "Solde actuel")}
          {num("montantRegulier", "Versement / période")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {num("valeurRachatActuelle", "Valeur de rachat")}
            {num("projectionAssureur", "Capital projeté 65")}
          </div>

          {/* Capital décès (éventuellement croissant) */}
          <div className="grid grid-cols-2 gap-2">
            {num("capitalDecesFixe", "Capital décès actuel")}
            {num("capitalDecesAugmentation", "Augmentation annuelle")}
          </div>

          {/* Rente incapacité de gain + délai d'attente */}
          <div className="grid grid-cols-2 gap-2">
            {num("renteInvalidite", "Rente incapacité / an")}
            <Field label="Délai d'attente">
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={String(d.delaiAttente ?? 0)}
                onChange={(e) => onData("delaiAttente", Number(e.target.value))}
              >
                <option value="0">—</option>
                <option value="3">3 mois</option>
                <option value="12">12 mois</option>
                <option value="24">24 mois</option>
              </select>
            </Field>
          </div>

          {/* Primes : prime totale (toujours), détail par couverture (optionnel) */}
          <div className="grid grid-cols-2 gap-2">
            {num("primeTotale", "Prime TOTALE / période")}
          </div>
          <button
            type="button"
            onClick={() => setShowPrimes((v) => !v)}
            className="text-[11px] font-medium text-indigo-600"
          >
            {showPrimes ? "− Masquer le détail des primes" : "+ Détailler les primes par couverture"}
          </button>
          {showPrimes && (
            <div className="grid grid-cols-2 gap-2 rounded-md bg-white p-2">
              {num("primeEpargne", "Prime épargne")}
              {num("primeIncapacite", "Prime incapacité de gain")}
              {num("primeLiberation", "Prime libération des primes")}
              {num("primeDeces", "Prime capital décès")}
            </div>
          )}

          {/* Dates + libération du paiement des primes (LDP) — comme le détail iOS */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Début (JJ.MM.AAAA)">
              <Input value={d.dateDebut || ""} onChange={(e) => onData("dateDebut", e.target.value)} placeholder="01.01.2020" />
            </Field>
            <Field label="Échéance (JJ.MM.AAAA)">
              <Input value={d.dateEcheance || ""} onChange={(e) => onData("dateEcheance", e.target.value)} placeholder="01.01.2045" />
            </Field>
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={!!d.hasLDP} onCheckedChange={(v) => onData("hasLDP", !!v)} /> Libération du paiement des primes (LDP)
          </label>
        </>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          <span>Périodicité</span>
          <select
            className="h-7 rounded-md border border-input bg-transparent px-1"
            value={d.occurrence || "mois"}
            onChange={(e) => onData("occurrence", e.target.value)}
          >
            <option value="mois">/ mois</option>
            <option value="annee">/ an</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <Checkbox checked={!!d.isInvesti} onCheckedChange={(v) => onData("isInvesti", !!v)} /> Investi
        </label>
        {d.isInvesti && (
          <select
            className="h-7 rounded-md border border-input bg-transparent px-1 text-xs"
            value={d.profil || "equilibre"}
            onChange={(e) => onData("profil", e.target.value)}
          >
            {PROFILS.map((p) => (
              <option key={p} value={p}>
                {PROFIL_LABELS[p] || p}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function ScanButton({
  label,
  busy,
  multiple = true,
  onFiles,
}: {
  label: string;
  busy: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files || []);
          if (fs.length) onFiles(fs);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanLine className="h-4 w-4 mr-1" />}
        {label}
      </Button>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MoneyField({
  label,
  k,
  client,
  setField,
}: {
  label: string;
  k: string;
  client: AnyObj;
  setField: (k: string, v: any) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={client[k] ?? ""}
        onChange={(e) => setField(k, Number(e.target.value) || 0)}
      />
    </Field>
  );
}

// Couleurs des piliers (couches de couverture) — cohérentes avec le design app.
const LAYER_COLORS: Record<string, string> = { avs: "#00D084", lpp: "#0075FF", laa: "#FF7A00", "3a": "#C21DC7" };
const LAYER_LABEL: Record<string, string> = { avs: "AVS/AI", lpp: "LPP", laa: "LAA", "3a": "3e pilier" };

/**
 * Réglage du besoin d'un thème par le conseiller : curseur, saisie directe et
 * justification affichée au client (« dette hypothécaire de 600'000 »).
 *
 * Le curseur couvre 0 → 2× le besoin calculé, ce qui suffit à la grande majorité
 * des cas ; au-delà, la saisie directe n'est pas bornée. Le pas dépend de l'unité :
 * 50 CHF pour une rente mensuelle, 10'000 pour un capital décès.
 */
function BesoinAdjuster({
  besoinAuto, valeur, libelle, unit, onChange,
}: {
  besoinAuto: number;
  valeur?: number | null;
  libelle?: string;
  unit: string;
  onChange: (patch: AnyObj) => void;
}) {
  const force = !!Number(valeur);
  const [open, setOpen] = React.useState(force || !!libelle);
  const courant = force ? Number(valeur) : Math.round(besoinAuto);
  const max = Math.max(Math.round(besoinAuto * 2) || 1, courant);
  const step = unit === "/mois" ? 50 : 10000;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-1.5 text-xs text-muted-foreground transition hover:bg-muted/50"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Ajuster le besoin
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Besoin retenu</span>
        <div className="flex items-center gap-1">
          {force && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => onChange({ valeur: null })}
              title="Revenir au calcul automatique"
            >
              <RotateCcw className="h-3 w-3" />
              Auto
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>
            Fermer
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Slider
          value={[Math.min(courant, max)]}
          min={0}
          max={max}
          step={step}
          onValueChange={([v]) => onChange({ valeur: v })}
          className="flex-1"
        />
        <Input
          value={courant ? String(courant) : ""}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9]/g, ""));
            onChange({ valeur: n > 0 ? n : null });
          }}
          inputMode="numeric"
          className="h-8 w-28 text-right tabular-nums"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        Calculé automatiquement : {fmt(besoinAuto)}{unit}
      </p>

      <Input
        value={libelle || ""}
        onChange={(e) => onChange({ libelle: e.target.value })}
        placeholder="Pourquoi ce montant ? (ex. dette hypothécaire) — visible dans le PDF client"
        maxLength={200}
        className="h-8 text-xs"
      />
    </div>
  );
}

// Barre besoin vs couverture décomposée par pilier (façon LayeredCoverageChart iOS).
function LayerBar({ besoin, couverture, lacune, layers }: { besoin: number; couverture: number; lacune: number; layers: any[] }) {
  const total = Math.max(besoin, couverture + lacune, 1);
  const segs = (layers || []).filter((l) => Number(l.amount) > 0);
  const keysUsed = Array.from(new Set(segs.map((l) => l.key)));
  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Besoin</span>
        <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full border border-dashed border-slate-400 bg-slate-200/50" style={{ width: `${(besoin / total) * 100}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Couverture</span>
        <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
          {segs.map((l, i) => (
            <div
              key={i}
              title={`${LAYER_LABEL[l.key] || l.label}: ${fmt(Number(l.amount))}`}
              style={{ width: `${(Number(l.amount) / total) * 100}%`, background: LAYER_COLORS[l.key] || "#94a3b8" }}
            />
          ))}
          {lacune > 0 && (
            <div
              title={`Lacune: ${fmt(lacune)}`}
              style={{
                width: `${(lacune / total) * 100}%`,
                backgroundImage:
                  "repeating-linear-gradient(45deg,rgba(239,68,68,.6),rgba(239,68,68,.6) 3px,transparent 3px,transparent 6px)",
              }}
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-[88px]">
        {keysUsed.map((k) => (
          <span key={String(k)} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: LAYER_COLORS[String(k)] || "#94a3b8" }} />
            {LAYER_LABEL[String(k)] || String(k)}
          </span>
        ))}
        {lacune > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-red-500">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Lacune
          </span>
        )}
      </div>
    </div>
  );
}

// Carte d'optimisation fiscale 3a (jauge % plafond + économie d'impôt).
function FiscalCard({ fiscal }: { fiscal: any }) {
  const pct = Math.min(100, Math.round(Number(fiscal.pourcentUtilise) || 0));
  const tm = Number(fiscal.tauxMarginal) || 0;
  const tmPct = Math.round(tm <= 1 ? tm * 100 : tm);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Optimisation fiscale 3a</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Versé / plafond annuel</div>
            <div className="text-lg font-semibold">
              {fmt(Number(fiscal.investi3aAnnuel) || 0)} / {fmt(Number(fiscal.plafond3a) || 0)} CHF
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Économie d'impôt / an</div>
            <div className="text-lg font-semibold text-emerald-600">{fmt(Number(fiscal.gainFiscalAnnuel) || 0)} CHF</div>
          </div>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pct}% du plafond utilisé</span>
          <span>Taux marginal ~{tmPct}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

// Graphique d'évolution par paliers (couverture + lacune empilées, par année de départ des enfants).
function StepsAreaChart({ steps, title, color }: { steps?: any[]; title: string; color: string }) {
  const data = (steps || []).map((s) => ({
    year: s.fromYear,
    Couverture: Math.round(Number(s.couverture) || 0),
    Lacune: Math.round(Number(s.lacune) || 0),
  }));
  if (data.length < 2) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(Number(v))} width={44} />
          <Tooltip formatter={(v: any) => `${fmt(Number(v))} CHF`} labelFormatter={(l) => `Dès ${l}`} />
          <Area dataKey="Couverture" stackId="1" stroke={color} fill={color} fillOpacity={0.5} />
          <Area dataKey="Lacune" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.25} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Graphiques pilotés par les matrices projections (tous piliers, live) ─────
const cellNum = (v: any) => Number(String(v ?? "").replace(/[^0-9.\-]/g, "")) || 0;
// Facteur de dilution capital → rente annuelle équivalente (convention moteur : ~25 ans de consommation).
const DILUTION_YEARS = 25;

// Regroupement par pilier (1er = assurances sociales AVS/AI + LAA + IJ ; 2e = LPP ; 3e = privé + épargne).
type PillarKey = "3e" | "2e" | "1er";
const PILLAR_ORDER: PillarKey[] = ["3e", "2e", "1er"]; // ordre d'affichage demandé (haut → bas)
const PILLAR_META: Record<PillarKey, { label: string; color: string }> = {
  "1er": { label: "1er pilier", color: "#E0A82E" },
  "2e": { label: "2e pilier", color: "#0075FF" },
  "3e": { label: "3e pilier", color: "#C21DC7" },
};
// Ligne de matrice (rente) → pilier. null = ligne ignorée (agrégats, capitaux one-shot).
function rentePillarOf(label: string): PillarKey | null {
  const l = label.trim();
  if (l === "LPP") return "2e";
  if (l === "Prévoyance privée (3e pilier)") return "3e";
  if (l === "AVS/AI" || l === "LAA" || l.startsWith("Indemnités journalières")) return "1er";
  return null;
}
const isDeuxieme = (t: any) =>
  ["LPP_BASE", "LPP_COMPL", "LPP", "LIBRE_PASSAGE_POLICE", "LIBRE_PASSAGE_COMPTE"].includes(String(t));
const planPillarOf = (p: AnyObj): PillarKey => (isDeuxieme(p?.type) ? "2e" : "3e"); // 3a/3b/épargne → 3e
// Capital d'un plan pertinent pour la matrice affichée (retraite = capital projeté ; décès = capital décès).
function planCapitalForMatrix(p: AnyObj, matrixKey: string): number {
  const d = p.data || {};
  if (matrixKey === "retraite") return planCapital65(p);
  if (matrixKey.startsWith("deces")) {
    const s = matrixKey === "deces_accident" ? "Acc" : "Mal";
    if (isDeuxieme(p.type)) {
      // Libre passage : le solde est versé au décès (capital seul, pas de rente de survivant).
      if (String(p.type).startsWith("LIBRE_PASSAGE"))
        return Number(d.valeurRachatActuelle) || Number(d.soldeActuel) || 0;
      // LPP : capital « + rente » + capital INDÉPENDANT (toujours versé, en plus) — EXACTEMENT
      // comme le moteur (matrices.ts) et l'app iOS. Ne PAS prendre une seule composante.
      return (Number(d[`Enter_CapitalPlusRente${s}`]) || 0) + (Number(d[`Enter_CapitalDecesIndependant${s}`]) || 0);
    }
    // 3a banque / cash : solde restitué au décès. 3a/3b assurance : capital décès GARANTI saisi
    // (`capitalDecesFixe`) — MÊME source que la carte de risque (`situation.ts`) et l'app iOS.
    // La restitution des primes (computeDeathBenefitAssurance) n'entre PAS dans la couverture
    // garantie qui pilote la lacune → on ne la met pas dans le graphique non plus (cohérence).
    if (p.type === "PILIER_3A_BANK" || p.type === "3A_BANQUE") return Number(d.soldeActuel) || 0;
    return Number(d.capitalDecesFixe) || Number(d.capitalDeces) || 0;
  }
  return 0; // invalidité : pas de capital one-shot par plan
}
const MATRIX_TABS = [
  { key: "retraite", label: "Retraite" },
  { key: "invalidite_maladie", label: "Invalidité · maladie" },
  { key: "invalidite_accident", label: "Invalidité · accident" },
  { key: "deces_maladie", label: "Décès · maladie" },
  { key: "deces_accident", label: "Décès · accident" },
];

// Tooltip hiérarchisé : pilule année, Rentes (3e→2e→1er + Total), Capitaux (idem), Total général, Besoin.
function ChartTooltip({ active, payload, label, period }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload || {};
  const unit = period === "mois" ? "mois" : "an";
  const rTot = PILLAR_ORDER.reduce((s, k) => s + (Number(row[`r_${k}`]) || 0), 0);
  const cTot = PILLAR_ORDER.reduce((s, k) => s + (Number(row[`c_${k}`]) || 0), 0);
  const Group = ({ title, prefix, total }: { title: string; prefix: string; total: number }) => (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      {PILLAR_ORDER.filter((k) => (Number(row[`${prefix}${k}`]) || 0) > 0).map((k) => (
        <div key={k} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: PILLAR_META[k].color }} />
            {PILLAR_META[k].label}
          </span>
          <span className="font-medium tabular-nums">{fmt(Number(row[`${prefix}${k}`]) || 0)}</span>
        </div>
      ))}
      <div className="mt-0.5 flex justify-between border-t border-slate-200 pt-0.5 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  );
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg">
      <span className="inline-block rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold text-white">{label}</span>
      {rTot > 0 && <Group title={`Rentes / ${unit}`} prefix="r_" total={rTot} />}
      {cTot > 0 && <Group title={`Capitaux / ${unit} (dilués)`} prefix="c_" total={cTot} />}
      {cTot > 0 && (
        <div className="flex justify-between rounded-md bg-slate-900 px-2 py-1 font-bold text-white">
          <span>Total général</span>
          <span className="tabular-nums">{fmt(rTot + cTot)}</span>
        </div>
      )}
      {Number(row.besoin) > 0 && (
        <div className="flex justify-between border-t border-slate-200 pt-1 text-slate-500">
          <span>Besoin / {unit}</span>
          <span className="tabular-nums">{fmt(Number(row.besoin))}</span>
        </div>
      )}
    </div>
  );
}

function MatrixAreaChart({ matrix, matrixKey, plans }: { matrix: any; matrixKey: string; plans: AnyObj[] }) {
  // Capitaux intégrés (par PLAN) : aucun par défaut → le graphe montre les rentes récurrentes.
  const [onCaps, setOnCaps] = React.useState<Set<string>>(new Set());
  const [period, setPeriod] = React.useState<"an" | "mois">("an");
  if (!matrix?.headerYears?.length) return null;
  const div = period === "mois" ? 12 : 1;

  // Rentes récurrentes de la matrice, regroupées par pilier.
  const nonZero = (cells: any[]) => cells.filter((c) => cellNum(c) > 0).length;
  const renteRows = (matrix.rows || [])
    .map((r: any) => ({ pillar: rentePillarOf(String(r.label)), cells: r.cells || [] }))
    .filter((r: any) => r.pillar && nonZero(r.cells) > 1);
  const besoinRow = (matrix.rows || []).find((r: any) => String(r.label).trim().startsWith("Besoin"));

  // À la RETRAITE, rente et capital sont deux formes ALTERNATIVES du même avoir : activer le capital d'un
  // plan QUI A UNE RENTE (LPP base/compl) REMPLACE cette rente (sinon doublon). Un libre passage / 3a
  // (sans rente dans la matrice), ou le décès / invalidité → le capital s'AJOUTE simplement.
  const replaceMode = matrixKey === "retraite";

  // Capitaux PAR PLAN pertinents pour cette matrice.
  const planCaps = (plans || [])
    .map((p, i) => ({
      id: String(p.id ?? `idx-${i}`),
      pillar: planPillarOf(p),
      amount: planCapitalForMatrix(p, matrixKey),
      name: p.label || p.institutionName || "",
      // Seul le LPP (base/compl) alimente une rente dans la matrice → seul lui « remplace » à la retraite.
      hasRente: ["LPP_BASE", "LPP_COMPL", "LPP"].includes(String(p.type)),
    }))
    .filter((pc) => pc.amount > 0);

  const capByPillar = (pillar: PillarKey) =>
    planCaps.filter((pc) => pc.pillar === pillar && onCaps.has(pc.id)).reduce((s, pc) => s + pc.amount, 0);
  // La rente d'un pilier n'est remplacée que si un capital ACTIF de ce pilier vient d'un plan à rente (LPP).
  const pillarRenteReplaced = (pillar: PillarKey) =>
    replaceMode && planCaps.some((pc) => pc.pillar === pillar && onCaps.has(pc.id) && pc.hasRente);

  const data = matrix.headerYears.map((year: number, i: number) => {
    const p: any = { year };
    PILLAR_ORDER.forEach((k) => {
      const renteAnnual = renteRows.filter((r: any) => r.pillar === k).reduce((s: number, r: any) => s + cellNum(r.cells[i]), 0);
      const replaced = pillarRenteReplaced(k);
      p[`r_${k}`] = Math.round((replaced ? 0 : renteAnnual) / div);
      p[`c_${k}`] = Math.round(capByPillar(k) / DILUTION_YEARS / div); // bande plate = capital dilué (mensualisé si besoin)
    });
    if (besoinRow) p.besoin = Math.round(cellNum(besoinRow.cells[i]) / div);
    return p;
  });

  // Séries à empiler (bas → haut) : rentes 1er→2e→3e, puis capitaux 1er→2e→3e. On ne garde que les non nulles.
  const series: { key: string; pillar: PillarKey; kind: "rente" | "cap" }[] = [];
  (["1er", "2e", "3e"] as PillarKey[]).forEach((k) => series.push({ key: `r_${k}`, pillar: k, kind: "rente" }));
  (["1er", "2e", "3e"] as PillarKey[]).forEach((k) => series.push({ key: `c_${k}`, pillar: k, kind: "cap" }));
  const activeSeries = series.filter((s) => data.some((p: any) => p[s.key] > 0));

  const toggle = (id: string) =>
    setOnCaps((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="space-y-2">
      {/* Bascule Annuel / Mensuel (les montants sont divisés par 12 en mode mensuel). */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-md border p-0.5 text-[11px]">
          {(["an", "mois"] as const).map((pr) => (
            <button
              key={pr}
              type="button"
              onClick={() => setPeriod(pr)}
              className={`rounded px-2.5 py-0.5 font-medium ${period === pr ? "bg-indigo-600 text-white" : "text-muted-foreground"}`}
            >
              {pr === "an" ? "Annuel" : "Mensuel"}
            </button>
          ))}
        </div>
      </div>
      {activeSeries.length ? (
        <ResponsiveContainer width="100%" height={270}>
          <AreaChart data={data} margin={{ top: 6, right: 10, left: -4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(Number(v))} width={50} />
            <Tooltip content={(props: any) => <ChartTooltip {...props} period={period} />} />
            {activeSeries.map((s) => (
              <Area
                key={s.key}
                dataKey={s.key}
                stackId="a"
                stroke={PILLAR_META[s.pillar].color}
                fill={PILLAR_META[s.pillar].color}
                fillOpacity={s.kind === "rente" ? 0.6 : 0.28}
                strokeDasharray={s.kind === "cap" ? "3 2" : undefined}
              />
            ))}
            {data.some((p: any) => p.besoin > 0) && (
              <Area dataKey="besoin" stackId="besoin" stroke="#64748b" strokeWidth={2} strokeDasharray="4 3" fill="none" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="py-10 text-center text-xs text-muted-foreground">Aucune rente projetée.</div>
      )}

      {/* Un switch PAR PLAN (capital), étiqueté par pilier + montant. Défaut : exclu. */}
      {planCaps.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground">
            {replaceMode
              ? `Prendre un pilier en capital plutôt qu'en rente (dilué ~${DILUTION_YEARS} ans) :`
              : `Intégrer un capital (dilué ~${DILUTION_YEARS} ans) :`}
          </span>
          {planCaps.map((pc) => {
            const on = onCaps.has(pc.id);
            // « choisir capital » (remplacement) UNIQUEMENT pour un plan LPP à rente à la retraite ;
            // sinon (3e pilier, libre passage, décès/invalidité) → libellé additif « + / ✓ » comme avant.
            const useReplace = replaceMode && pc.hasRente;
            const suffix = `${chf(pc.amount)}${pc.name ? ` (${pc.name})` : ""}`;
            const label = useReplace
              ? `${PILLAR_META[pc.pillar].label} — ${on ? "en capital" : "choisir capital"} · ${suffix}`
              : `${on ? "✓ " : "+ "}${PILLAR_META[pc.pillar].label} · ${suffix}`;
            return (
              <button
                key={pc.id}
                type="button"
                onClick={() => toggle(pc.id)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${on ? "border-transparent text-white" : "border-slate-200 text-muted-foreground hover:bg-slate-50"}`}
                style={on ? { background: PILLAR_META[pc.pillar].color } : {}}
              >
                {useReplace && on ? "✓ " : ""}
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatrixCharts({ projections, plans }: { projections: any; plans: AnyObj[] }) {
  const available = MATRIX_TABS.filter((t) => projections?.[t.key]?.headerYears?.length);
  const [tab, setTab] = React.useState(available[0]?.key || "retraite");
  if (!available.length) return null;
  const active = available.some((t) => t.key === tab) ? tab : available[0].key;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Projections détaillées (tous piliers)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {available.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active === t.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <MatrixAreaChart matrix={projections[active]} matrixKey={active} plans={plans} />
        <p className="text-[11px] text-muted-foreground">
          Rentes récurrentes empilées par pilier (1er = AVS/AI + LAA + IJ · 2e = LPP · 3e = privé). Ligne pointillée =
          besoin. Capitaux dilués sur ~{DILUTION_YEARS} ans, <strong>exclus par défaut</strong>. À la{" "}
          <strong>retraite</strong>, activer le capital d'un pilier le fait passer de rente à capital (formes
          alternatives du même avoir, pas de doublon) ; au <strong>décès / invalidité</strong>, le capital s'ajoute
          aux rentes (prestations distinctes).
        </p>
      </CardContent>
    </Card>
  );
}

function ResultView({
  analysis,
  lppEstimation,
  detailRentes,
  projections,
  plans,
  uid,
  besoinOverrides,
  onBesoin,
  besoinSaved,
}: {
  analysis: AnyObj;
  lppEstimation?: AnyObj | null;
  detailRentes?: AnyObj | null;
  projections?: AnyObj | null;
  plans: AnyObj[];
  uid?: string;
  besoinOverrides: AnyObj;
  onBesoin: (key: string, patch: AnyObj) => void;
  besoinSaved: "idle" | "saving" | "saved";
}) {
  const score = Math.round(Number(analysis.totalScore) || 0);
  const scoreColor = score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-600" : "text-red-600";

  const cards = [
    { key: "retraite", label: "Retraite", card: analysis.retraite, unit: "/mois" },
    { key: "invaliditeMaladie", label: "Invalidité (maladie)", card: analysis.invaliditeMaladie, unit: "/mois" },
    { key: "invaliditeAccident", label: "Invalidité (accident)", card: analysis.invaliditeAccident, unit: "/mois" },
    { key: "deces", label: "Décès", card: analysis.deces, unit: "" },
  ].filter((c) => c.card);

  return (
    <div className="space-y-4">
      {/* Score global */}
      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <div className="text-sm text-muted-foreground">Score de prévoyance global</div>
            <div className={`text-4xl font-bold ${scoreColor}`}>{score}<span className="text-lg text-muted-foreground">/100</span></div>
            {besoinSaved !== "idle" && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                {besoinSaved === "saving" ? "Enregistrement des besoins…" : "Besoins enregistrés"}
              </div>
            )}
          </div>
          <ShieldCheck className={`h-10 w-10 ${scoreColor}`} />
        </CardContent>
      </Card>

      {/* Estimation LPP minimum légal (si utilisée) — transparence sur les hypothèses */}
      {lppEstimation?.assujetti && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <CardTitle className="text-sm text-amber-800">
                2e pilier estimé au minimum légal (pas le certificat réel)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <EstLine label="Salaire coordonné" v={lppEstimation.salaireCoordonne} />
            <EstLine label="Avoir actuel" v={lppEstimation.avoirActuel} />
            <EstLine label="Capital à 65" v={lppEstimation.capitalProjete65} />
            <EstLine label="Rente vieillesse/an" v={lppEstimation.renteVieillesse65} />
            <EstLine label="Rente invalidité/an" v={lppEstimation.renteInvalidite} />
            <EstLine label="Rente conjoint/an" v={lppEstimation.renteConjoint} />
          </CardContent>
        </Card>
      )}

      {/* Cartes de risque — vue simple */}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ key, label, card, unit }) => {
          const besoin = Number(card.besoin) || 0;
          const couv = Number(card.couverture) || 0;
          const lacune = Number(card.lacune) || 0;
          const pct = besoin > 0 ? Math.min(100, Math.round((couv / besoin) * 100)) : 0;
          const ok = lacune < Math.max(1, besoin * 0.02);
          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{label}</CardTitle>
                  <Badge variant={ok ? "default" : "destructive"} className={ok ? "bg-emerald-600" : ""}>
                    {ok ? "Couvert" : "Lacune"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={pct} className="h-2" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Metric label="Besoin" value={fmt(besoin) + unit} />
                  <Metric label="Couverture" value={fmt(couv) + unit} />
                  <Metric label="Lacune" value={fmt(lacune) + unit} danger={!ok} />
                </div>
                {card.besoinForce && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                    <span>
                      Besoin fixé par le conseiller{card.besoinLibelle ? ` — ${card.besoinLibelle}` : ""}
                      {" "}(calculé : {fmt(Number(card.besoinAuto) || 0)}{unit})
                    </span>
                  </p>
                )}
                {Array.isArray(card.layers) && card.layers.some((l: any) => Number(l.amount) > 0) && (
                  <LayerBar besoin={besoin} couverture={couv} lacune={lacune} layers={card.layers} />
                )}
                <BesoinAdjuster
                  besoinAuto={Number(card.besoinAuto) || besoin}
                  valeur={besoinOverrides?.[key]?.valeur}
                  libelle={besoinOverrides?.[key]?.libelle}
                  unit={unit}
                  onChange={(patch) => onBesoin(key, patch)}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Optimisation fiscale 3a (données déjà calculées, jamais affichées jusqu'ici) */}
      {analysis.fiscal && <FiscalCard fiscal={analysis.fiscal} />}

      {/* Évolution dans le temps : la couverture baisse quand les enfants sortent de charge (18/25 ans). */}
      {Boolean(
        analysis.invaliditeMaladie?.igSteps?.length ||
          analysis.invaliditeAccident?.igSteps?.length ||
          analysis.deces?.renteSteps?.length,
      ) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Évolution dans le temps</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              La couverture invalidité et les rentes de survivants baissent par paliers quand les enfants cessent
              d'ouvrir droit à une rente (18 ans, ou 25 ans en formation).
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <StepsAreaChart steps={analysis.invaliditeMaladie?.igSteps} title="Invalidité (maladie) — couverture / mois" color="#0075FF" />
              <StepsAreaChart steps={analysis.invaliditeAccident?.igSteps} title="Invalidité (accident) — couverture / mois" color="#FF7A00" />
              <StepsAreaChart steps={analysis.deces?.renteSteps} title="Décès — rentes de survivants / mois" color="#C21DC7" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Projections tous-piliers, année par année — pilotées par les matrices LIVE de
          /api/admin/analyse (AVS/LPP/LAA/3e pilier/capital, calculées from plans édités).
          Remplace les AreaCharts client qui ignoraient plans + 3a. */}
      {projections && <MatrixCharts projections={projections} plans={plans} />}

      {/* Accordéon — détail complet */}
      <Accordion type="single" collapsible>
        <AccordionItem value="detail">
          <AccordionTrigger className="text-sm">Détail complet</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-8 pt-2">
              {detailRentes ? (
                <>
                  <RenteBreakdown
                    title="En cas d'invalidité — rentes perçues (par mois)"
                    scenarios={detailRentes.invalidite}
                    detail={detailRentes}
                    avsLabel="AI"
                    adultLabel="Vous"
                    accent="#f97316"
                  />
                  <RenteBreakdown
                    title="En cas de décès — rentes des survivants (par mois)"
                    scenarios={detailRentes.deces}
                    detail={detailRentes}
                    avsLabel="AVS"
                    adultLabel="Conjoint (veuf/veuve)"
                    accent="#f43f5e"
                  />
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Détail des rentes indisponible.</div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// Détail des rentes d'un risque (invalidité ou décès) : tableau par pilier
// (AVS/AI + LPP) avec rente adulte + une ligne PAR ENFANT (décochable), total qui
// se recalcule, et un graphique temporel où le total baisse quand chaque enfant
// sort de charge (18 ans) jusqu'à la retraite.
function RenteBreakdown({
  title,
  scenarios,
  detail,
  avsLabel,
  adultLabel,
  accent,
}: {
  title: string;
  scenarios: AnyObj[];
  detail: AnyObj;
  avsLabel: string;
  adultLabel: string;
  accent: string;
}) {
  const maxEnfants: number = detail.maxEnfants || 0;
  const childrenEndYears: number[] = detail.childrenEndYears || [];
  const currentYear: number = detail.currentYear;
  const retirementYear: number = detail.retirementYear;

  // Cases décochées (what-if manuel).
  const [unchecked, setUnchecked] = React.useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setUnchecked((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const checkedCount = Math.max(0, maxEnfants - unchecked.size);
  const sc = scenarios[checkedCount] || scenarios[0] || { adulte: { avs: 0, lpp: 0 }, parEnfant: { avs: 0, lpp: 0 }, total: 0 };
  const avsTotal = sc.adulte.avs + checkedCount * sc.parEnfant.avs;
  const lppTotal = sc.adulte.lpp + checkedCount * sc.parEnfant.lpp;

  // Données du graphique : total mensuel par année (baisse quand un enfant sort de charge).
  const nbEligibleAt = (year: number) =>
    Math.min(maxEnfants, childrenEndYears.filter((y) => y > year).length);
  const chartData: AnyObj[] = [];
  for (let y = currentYear; y <= retirementYear; y++) {
    const s = scenarios[nbEligibleAt(y)] || scenarios[0];
    chartData.push({ year: y, total: s?.total || 0 });
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 text-sm font-semibold" style={{ color: accent }}>{title}</div>

      {/* Tableau par pilier */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left font-medium pb-1"></th>
            <th className="text-right font-medium pb-1">{avsLabel}</th>
            <th className="text-right font-medium pb-1">LPP</th>
            <th className="text-right font-medium pb-1">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="py-1.5">{adultLabel}</td>
            <td className="py-1.5 text-right">{fmt(sc.adulte.avs)}</td>
            <td className="py-1.5 text-right">{fmt(sc.adulte.lpp)}</td>
            <td className="py-1.5 text-right font-medium">{fmt(sc.adulte.avs + sc.adulte.lpp)}</td>
          </tr>
          {Array.from({ length: maxEnfants }).map((_, i) => {
            const on = !unchecked.has(i);
            return (
              <tr key={i} className={`border-t ${on ? "" : "opacity-40"}`}>
                <td className="py-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={on} onCheckedChange={() => toggle(i)} />
                    Enfant {i + 1}
                  </label>
                </td>
                <td className="py-1.5 text-right">{on ? fmt(sc.parEnfant.avs) : "—"}</td>
                <td className="py-1.5 text-right">{on ? fmt(sc.parEnfant.lpp) : "—"}</td>
                <td className="py-1.5 text-right font-medium">
                  {on ? fmt(sc.parEnfant.avs + sc.parEnfant.lpp) : "—"}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 font-semibold">
            <td className="py-1.5">Total</td>
            <td className="py-1.5 text-right">{fmt(avsTotal)}</td>
            <td className="py-1.5 text-right">{fmt(lppTotal)}</td>
            <td className="py-1.5 text-right" style={{ color: accent }}>{fmt(avsTotal + lppTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* Graphique temporel : le total baisse à mesure que les enfants sortent de charge (18 ans) */}
      {maxEnfants > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] text-muted-foreground">
            Évolution du total jusqu'à la retraite (les enfants sortent de charge à 18 ans)
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id={`g-${accent}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={Math.ceil(chartData.length / 8)} />
                <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => fmt(v)} />
                <Tooltip
                  formatter={(v: any) => [fmt(v) + " /mois", "Total"]}
                  labelFormatter={(l) => `Année ${l}`}
                />
                <Area type="stepAfter" dataKey="total" stroke={accent} strokeWidth={2} fill={`url(#g-${accent})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function EstLine({ label, v }: { label: string; v: any }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-amber-700/80">{label}</span>
      <span className="font-medium text-amber-900">{fmt(v)}</span>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${danger ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}
