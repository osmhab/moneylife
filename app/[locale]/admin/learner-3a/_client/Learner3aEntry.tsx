//app/admin/learner-3a/_client/Learner3aEntry.tsx
"use client";

import React, { useEffect, useState } from "react";
import { db, auth, storage } from "@/lib/firebase";
import { 
  collection, addDoc, getDocs, deleteDoc, doc, 
  query, orderBy, serverTimestamp, updateDoc 
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Database, TrendingUp, ShieldCheck, History, 
  PiggyBank, Trash2, ListFilter, Scan, Loader2, RotateCcw, Pencil, User, AlertCircle, Plus
} from "lucide-react";

const PARTNERS = ["SwissLife", "AXA", "Helvetia", "PAX"];

// 1er du mois suivant (comme AXA : la rente démarre le 1er jour du mois suivant l'offre).
function firstOfNextMonthISO(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}
// Différé en années entre deux dates ISO (arrondi à l'année) — 0 si dates manquantes/incohérentes.
function deferralYearsBetween(startISO: string, levelISO: string): number {
  if (!startISO || !levelISO) return 0;
  const a = new Date(startISO).getTime();
  const b = new Date(levelISO).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / (365.25 * 24 * 3600 * 1000)));
}

export default function Learner3aEntry() {
  const [loading, setLoading] = useState(false);
  const [isScanningRachats, setIsScanningRachats] = useState(false);
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingBenchmark, setEditingBenchmark] = useState<any>(null);

  const [formData, setFormData] = useState({
    provider: "",
    productName: "",
    investmentProfile: "balanced",
    age: 30,
    retirementAge: 65,
    gender: "M",
    isSmoker: false,
    annualPremiumTotal: 0,
    initialCapitalTransfer: 0, // Nouveau : Capital apporté au début du benchmark
    isDeathIncludedInSavings: false, // Précis : Concerne uniquement le décès
    deathCapital: 0,
    deathPremium: 0,
    // Rente d'invalidité façon AXA : NIVEAUX (degrés) datés + croissants. Chaque niveau =
    // { date (début de la rente, ISO), amount (CHF/an) }. Le différé est calculé à partir de
    // disabilityContractStart (début du contrat). UNE seule prime totale (disabilityPremium).
    disabilityContractStart: firstOfNextMonthISO(),
    disabilityLevels: [{ date: firstOfNextMonthISO(), amount: 0 }] as { date: string; amount: number }[],
    disabilityPremium: 0,
    // Certains assureurs (ex. PAX) ne facturent pas la libération des primes à part : elle est
    // INCLUSE dans la prime de rente. Dans ce cas la prime totale contient déjà la libération
    // → le moteur ne devra PAS ajouter de ligne libération séparée (sinon double comptage).
    waiverIncludedInRentePremium: false,
    premiumWaiverValue: 0, 
    premiumWaiverPremium: 0,
    savingPremiumAnnual: 0,
    userYieldRate: 3.0,
    projectedCapitalAtRetirement: 0,
    surrenderValues: [] as number[]
  });

  // COUVERTURES MODULAIRES : on n'active que ce qu'on veut benchmarker (ex. uniquement
  // la rente, ou uniquement l'épargne). Évite de saisir des 0 parasites et garde des primes
  // RÉELLES attribuables à chaque couverture. Les champs des couvertures inactives sont
  // remis à 0 à la sauvegarde → exclus de l'entraînement (qui ne prend que les valeurs > 0).
  const COVERAGES = [
    { key: "disability", label: "Rente invalidité" },
    { key: "death", label: "Capital décès" },
    { key: "waiver", label: "Libération des primes" },
    { key: "savings", label: "Épargne" },
  ];
  // Champs (de formData) rattachés à chaque couverture — pour la remise à 0 des inactives.
  const COVERAGE_FIELDS: Record<string, string[]> = {
    disability: ["disabilityContractStart", "disabilityLevels", "disabilityPremium", "waiverIncludedInRentePremium"],
    death: ["deathCapital", "deathPremium"],
    waiver: ["premiumWaiverValue", "premiumWaiverPremium"],
    savings: ["annualPremiumTotal", "savingPremiumAnnual", "userYieldRate", "projectedCapitalAtRetirement", "initialCapitalTransfer", "surrenderValues"],
  };
  // Répéteur de niveaux de rente (degrés AXA) — chaque niveau porte une DATE de début.
  const addRenteLevel = () => setFormData(p => ({
    ...p,
    disabilityLevels: [...p.disabilityLevels, { date: "", amount: 0 }],
  }));
  const removeRenteLevel = (i: number) => setFormData(p => ({
    ...p,
    disabilityLevels: p.disabilityLevels.filter((_, idx) => idx !== i),
  }));
  const updateRenteLevel = (i: number, key: "date" | "amount", value: string | number) =>
    setFormData(p => ({
      ...p,
      disabilityLevels: p.disabilityLevels.map((lvl, idx) => idx === i ? { ...lvl, [key]: value } : lvl),
    }));
  const [active, setActive] = useState<Record<string, boolean>>({
    disability: true, death: false, waiver: false, savings: false,
  });
  const toggleCoverage = (k: string) => setActive(p => ({ ...p, [k]: !p[k] }));

  // formData avec les couvertures inactives neutralisées (0 / []), + la liste des couvertures.
  const buildPayload = () => {
    const out: Record<string, any> = { ...formData };
    for (const cov of COVERAGES) {
      if (active[cov.key]) continue;
      for (const f of COVERAGE_FIELDS[cov.key]) out[f] = (f === "surrenderValues" || f === "disabilityLevels") ? [] : 0;
    }
    // Niveaux de rente actifs : on calcule et fige le différé (années) de chaque niveau à
    // partir de la date de début du contrat → c'est cette valeur que le modèle consomme.
    if (active.disability) {
      out.disabilityLevels = (formData.disabilityLevels || []).map(lvl => ({
        date: lvl.date,
        amount: lvl.amount,
        deferralYears: deferralYearsBetween(formData.disabilityContractStart, lvl.date),
      }));
    }
    out.coverages = COVERAGES.filter(c => active[c.key]).map(c => c.key);
    return out;
  };

  const fetchBenchmarks = async () => {
    try {
      const q = query(collection(db, "learner-3a"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setBenchmarks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Erreur détaillée Firestore :", error);
      toast.error("Impossible de joindre la base de données.");
    }
  };

  useEffect(() => {
    // Force l'exécution uniquement dans le navigateur
    if (typeof window !== "undefined") {
      fetchBenchmarks(); 
    }
  }, []);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field: string, value: any) => {
    setEditingBenchmark((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleScanRachats = async (file: File) => {
    const u = auth.currentUser;
    if (!u) return toast.error("Session expirée");

    setIsScanningRachats(true);
    try {
      const storagePath = `admin/benchmarks_scans/${u.uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);

      const jwt = await u.getIdToken();
      const res = await fetch("/api/admin/scan-rachats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ filePath: storagePath }),
      });

      if (!res.ok) throw new Error("Erreur API Scan");
      
      const { values } = await res.json();
      if (values && Array.isArray(values)) {
        handleChange("surrenderValues", values);
        toast.success(`${values.length} valeurs extraites !`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Le scan a échoué.");
    } finally {
      setIsScanningRachats(false);
    }
  };

  const resetRachats = () => {
    setFormData(prev => ({ ...prev, surrenderValues: [] }));
    toast.info("Tableau des rachats réinitialisé");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.provider) return toast.error("Veuillez choisir une compagnie");
    if (!COVERAGES.some(c => active[c.key])) return toast.error("Ajoutez au moins une couverture");

    setLoading(true);
    try {
      await addDoc(collection(db, "learner-3a"), {
        ...buildPayload(),
        createdAt: serverTimestamp(),
      });
      toast.success("Benchmark mémorisé !");
      fetchBenchmarks();
      setFormData(prev => ({ ...prev, surrenderValues: [] }));
    } catch (e: any) {
      toast.error("Erreur de sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  const handleRetrainModels = async () => {
  const u = auth.currentUser;
  if (!u) return toast.error("Session expirée");

  try {
    const jwt = await u.getIdToken();
    const res = await fetch("/api/admin/learner-3a/retrain", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Erreur retrain");
    toast.success(`Modèles recalculés (${data.providers} compagnies)`);
  } catch (e: any) {
    console.error(e);
    toast.error(e?.message || "Erreur retrain");
  }
};

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBenchmark) return;

    setLoading(true);
    try {
      const { id, ...dataToUpdate } = editingBenchmark;
      const docRef = doc(db, "learner-3a", id);
      await updateDoc(docRef, {
        ...dataToUpdate,
        updatedAt: serverTimestamp(),
      });
      toast.success("Benchmark mis à jour !");
      setIsEditDialogOpen(false);
      fetchBenchmarks();
    } catch (e) {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce benchmark ?")) return;
    await deleteDoc(doc(db, "learner-3a", id));
    fetchBenchmarks();
  };

  const openEditModal = (benchmark: any) => {
    setEditingBenchmark(benchmark);
    setIsEditDialogOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="text-primary" /> Learner-3a Core
          </h1>
          <p className="text-sm text-muted-foreground">Calibration des courbes de rachat et coûts de risque</p>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleRetrainModels} className="h-11">
          Recalculer modèles
        </Button>
        <Button onClick={handleSave} disabled={loading} className="h-11 px-8 shadow-lg">
          {loading ? <Loader2 className="animate-spin mr-2" /> : null}
          Mémoriser l'offre
        </Button>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 text-emerald-800">
              <CardTitle className="text-xs uppercase flex items-center gap-2"><User size={14}/> Profil Test & Durée</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={formData.provider} onValueChange={(v) => handleChange("provider", v)}>
                <SelectTrigger><SelectValue placeholder="Compagnie" /></SelectTrigger>
                <SelectContent>
                  {PARTNERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Nom du produit" value={formData.productName} onChange={e => handleChange("productName", e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Âge Début</Label>
                  <Input type="number" value={formData.age} onChange={e => handleChange("age", parseInt(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Âge Fin</Label>
                  <Input type="number" value={formData.retirementAge} onChange={e => handleChange("retirementAge", parseInt(e.target.value))} />
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                <span className="text-[10px] text-emerald-700 font-bold uppercase italic text-muted-foreground italic">Durée :</span>
                <span className="text-sm font-black text-emerald-800 font-bold text-primary">{formData.retirementAge - formData.age} ans</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={formData.gender} onChange={e => handleChange("gender", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
                <div className="flex items-center justify-between border px-2 rounded-lg">
                  <Label className="text-[10px]">Fumeur</Label>
                  <Switch checked={formData.isSmoker} onCheckedChange={v => handleChange("isSmoker", v)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {active.savings && (
          <Card className="bg-blue-50/30 border-blue-100">
            <CardHeader className="pb-3"><CardTitle className="text-xs uppercase flex items-center gap-2"><TrendingUp size={14}/> Projection</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Label className="text-[10px]">Rendement offre (%)</Label>
              <Input type="number" step="0.1" value={formData.userYieldRate} onChange={e => handleChange("userYieldRate", parseFloat(e.target.value))} />
              <Label className="text-[10px]">Capital final CHF</Label>
              <Input type="number" value={formData.projectedCapitalAtRetirement} onChange={e => handleChange("projectedCapitalAtRetirement", parseFloat(e.target.value))} />
            </CardContent>
          </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="border-primary/20">
            <CardHeader className="pb-3"><CardTitle className="text-xs uppercase flex items-center gap-2"><ShieldCheck size={14}/> Couvertures à benchmarker</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Barre de sélection : on ajoute UNIQUEMENT les couvertures pertinentes. */}
              <div className="flex flex-wrap gap-2">
                {COVERAGES.map(c => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleCoverage(c.key)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors ${active[c.key] ? "bg-primary text-white border-primary" : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"}`}
                  >
                    {active[c.key] ? "✓ " : "+ "}{c.label}
                  </button>
                ))}
              </div>

              {!COVERAGES.some(c => active[c.key]) && (
                <p className="text-[11px] text-muted-foreground italic py-4 text-center">Ajoutez au moins une couverture ci-dessus.</p>
              )}

              {active.savings && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <Label className="text-[10px] font-bold uppercase text-amber-800">Capital initial transféré (Benchmark)</Label>
                <Input type="number" className="text-xl font-bold bg-transparent border-none p-0 h-auto focus-visible:ring-0 text-amber-900" value={formData.initialCapitalTransfer} onChange={e => handleChange("initialCapitalTransfer", parseFloat(e.target.value))} />
              </div>
              )}

              {active.savings && (
              <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
                <Label className="text-[10px] font-bold uppercase text-emerald-800">Prime Totale Annuelle</Label>
                <Input type="number" className="text-xl font-bold bg-transparent border-none p-0 h-auto focus-visible:ring-0" value={formData.annualPremiumTotal} onChange={e => handleChange("annualPremiumTotal", parseFloat(e.target.value))} />
              </div>
              )}

              {active.death && (<>
              {/* Toggle Décès Inclus (Helvetia) */}
              <div className="flex items-center justify-between p-2 bg-orange-50 rounded-lg border border-orange-100">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-orange-600" />
                  <Label className="text-[10px] text-orange-800 font-bold uppercase">Décès inclus dans l'épargne ?</Label>
                </div>
                <Switch 
                  checked={formData.isDeathIncludedInSavings} 
                  onCheckedChange={v => handleChange("isDeathIncludedInSavings", v)} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4 border-b pb-4">
                <div className="space-y-1"><Label className="text-[10px]">Cap. Décès</Label><Input type="number" value={formData.deathCapital} onChange={e => handleChange("deathCapital", parseFloat(e.target.value))} /></div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Prime Décès (an)</Label>
                  <Input 
                    type="number" 
                    className="border-blue-200" 
                    disabled={formData.isDeathIncludedInSavings}
                    value={formData.isDeathIncludedInSavings ? 0 : formData.deathPremium}
                    onChange={e => handleChange("deathPremium", parseFloat(e.target.value))} 
                  />
                </div>
              </div>
              </>)}

              {/* Rente d'invalidité façon AXA : niveaux (degrés) DATÉS + croissants, UNE prime
                  totale. Le différé de chaque niveau est calculé depuis « Début du contrat ». */}
              {active.disability && (
              <div className="space-y-3 border-b pb-4">
                <Label className="text-[10px] font-bold uppercase text-purple-800">Rente invalidité — niveaux</Label>
                <div className="space-y-1">
                  <Label className="text-[9px]">Début du contrat (référence du différé)</Label>
                  <Input type="date" value={formData.disabilityContractStart} onChange={e => handleChange("disabilityContractStart", e.target.value)} />
                </div>
                {formData.disabilityLevels.map((lvl, i) => {
                  const dY = deferralYearsBetween(formData.disabilityContractStart, lvl.date);
                  return (
                  <div key={i} className="flex items-end gap-2">
                    <div className="w-8 h-9 flex items-center justify-center rounded-md bg-purple-100 text-purple-800 text-[11px] font-bold shrink-0">{i + 1}</div>
                    <div className="space-y-1 flex-1">
                      <Label className="text-[9px]">Début de la rente{i === 0 ? "" : ` · +${dY} an`}</Label>
                      <Input type="date" value={lvl.date} onChange={e => updateRenteLevel(i, "date", e.target.value)} />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label className="text-[9px]">Montant (CHF/an)</Label>
                      <Input type="number" value={lvl.amount} onChange={e => updateRenteLevel(i, "amount", parseFloat(e.target.value))} />
                    </div>
                    {formData.disabilityLevels.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-600 shrink-0" onClick={() => removeRenteLevel(i)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" className="h-8 text-[11px] w-full border-dashed" onClick={addRenteLevel}>
                  <Plus className="h-3 w-3 mr-1" /> Ajouter un niveau
                </Button>
                {/* Libération incluse (ex. PAX) : la prime de rente contient déjà la libération. */}
                <div className="flex items-center justify-between p-2 bg-orange-50 rounded-lg border border-orange-100">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="text-orange-600" />
                    <Label className="text-[10px] text-orange-800 font-bold uppercase">Libération incluse dans la prime ?</Label>
                  </div>
                  <Switch
                    checked={formData.waiverIncludedInRentePremium}
                    onCheckedChange={v => handleChange("waiverIncludedInRentePremium", v)}
                  />
                </div>
                <div className="space-y-1 pt-1">
                  <Label className="text-[10px]">Prime Inval. TOTALE (an){formData.waiverIncludedInRentePremium ? " · libération incluse" : ""}</Label>
                  <Input
                    type="number"
                    className="border-purple-200 font-bold"
                    value={formData.disabilityPremium}
                    onChange={e => handleChange("disabilityPremium", parseFloat(e.target.value))}
                  />
                </div>
              </div>
              )}

              {active.waiver && (
              <div className="grid grid-cols-2 gap-4 border-b pb-4">
                <div className="space-y-1"><Label className="text-[10px]">Montant Libéré</Label><Input type="number" value={formData.premiumWaiverValue} onChange={e => handleChange("premiumWaiverValue", parseFloat(e.target.value))} /></div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Prime Libér. (an)</Label>
                  <Input 
                    type="number" 
                    className="border-orange-200" 
                    value={formData.premiumWaiverPremium}
                    onChange={e => handleChange("premiumWaiverPremium", parseFloat(e.target.value))} 
                  />
                </div>
              </div>
              )}

              {active.savings && (
              <div className="pt-2 flex items-center justify-between">
                <div>
                  <Label className="text-emerald-700 font-bold text-xs uppercase flex items-center gap-1"><PiggyBank size={14}/> Épargne Pure (Annuel)</Label>
                  <Input type="number" className="mt-1 border-emerald-200 bg-emerald-50/50 font-bold" value={formData.savingPremiumAnnual} onChange={e => handleChange("savingPremiumAnnual", parseFloat(e.target.value))} />
                </div>
                <div className="text-right italic text-emerald-600">
                  <span className="text-[10px] uppercase">Net Mensuel</span>
                  <p className="text-xl font-mono font-bold">{(formData.savingPremiumAnnual / 12).toFixed(2)}</p>
                </div>
              </div>
              )}
            </CardContent>
          </Card>
        </div>

        {active.savings && (
        <div className="space-y-6">
          <Card className="h-full">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xs uppercase flex items-center gap-2"><History size={14}/> Rachats</CardTitle>
                {formData.surrenderValues.length > 0 && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600" onClick={resetRachats}><RotateCcw className="h-3 w-3" /></Button>
                )}
              </div>
              <Input type="file" id="rachats-input" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleScanRachats(e.target.files[0])} />
              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => document.getElementById('rachats-input')?.click()} disabled={isScanningRachats}>
                {isScanningRachats ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scan className="h-3 w-3 mr-1" />} Scan
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 text-[11px]">
                {formData.surrenderValues.map((v, i) => (
                  <div key={i} className="flex justify-between border-b border-dotted py-1">
                    <span className="text-muted-foreground">Année {i + 1}</span>
                    <span className="font-mono font-bold">{v.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        )}
      </div>

      <div className="space-y-4 pt-10 border-t">
        <h2 className="text-xl font-bold flex items-center gap-2"><ListFilter /> Bibliothèque Benchmarks</h2>
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
                <TableRow>
                <TableHead className="text-[10px]">CIE</TableHead>
                <TableHead className="text-[10px]">PROFIL</TableHead>
                <TableHead className="text-[10px]">PRIME TOT.</TableHead>
                <TableHead className="text-[10px]">COÛT RISQUE</TableHead>
                <TableHead className="text-[10px]">ÉPARGNE NETTE</TableHead>
                {/* Modification : Remplacement de Rachats par Capital Final */}
                <TableHead className="text-[10px]">CAPITAL FINAL (PROJ.)</TableHead>
                <TableHead></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {benchmarks.map(b => (
                <TableRow key={b.id} className="text-xs hover:bg-muted/30 transition-colors">
                    <TableCell className="font-bold">
                      <div className="flex flex-col">
                        <span>{b.provider}</span>
                        {b.initialCapitalTransfer > 0 && (
                          <span className="text-[9px] text-amber-600 font-bold uppercase">Transfert: {b.initialCapitalTransfer.toLocaleString()}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{b.age} ans / {b.gender} {b.isSmoker ? "🚬" : ""}</TableCell>
                    <TableCell className="font-mono">{b.annualPremiumTotal} CHF</TableCell>
                    <TableCell className="text-red-600 font-medium">
                    {b.isDeathIncludedInSavings ? (
                        <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tight">Décès Inclus</span>
                    ) : (
                        ((b.deathPremium || 0) + (b.disabilityPremium || 0) + (b.premiumWaiverPremium || 0)).toFixed(2) + " CHF"
                    )}
                    </TableCell>
                    <TableCell className="text-emerald-600 font-bold">{b.savingPremiumAnnual} CHF</TableCell>
                    
                    {/* Affichage du Capital Final avec le taux de rendement associé */}
                    <TableCell className="font-bold">
                    <div className="flex flex-col">
                        <span>{Math.round(b.projectedCapitalAtRetirement || 0).toLocaleString()} CHF</span>
                        <span className="text-[9px] text-muted-foreground font-normal italic">
                        @{b.userYieldRate}% ({b.surrenderValues?.length || 0} pts)
                        </span>
                    </div>
                    </TableCell>

                    <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(b)}>
                        <Pencil size={14} className="text-blue-600"/>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(b.id)}>
                        <Trash2 size={14} className="text-muted-foreground hover:text-red-600"/>
                    </Button>
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" /> Modifier Benchmark : {editingBenchmark?.provider}
            </DialogTitle>
          </DialogHeader>
          
          {editingBenchmark && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4 text-sm">
              <div className="space-y-4 border-r pr-6">
                <div className="space-y-2">
                  <Label>Produit</Label>
                  <Input value={editingBenchmark.productName} onChange={e => handleEditChange("productName", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Âge Début</Label><Input type="number" value={editingBenchmark.age} onChange={e => handleEditChange("age", parseInt(e.target.value))} /></div>
                  <div className="space-y-1"><Label>Âge Fin</Label><Input type="number" value={editingBenchmark.retirementAge} onChange={e => handleEditChange("retirementAge", parseInt(e.target.value))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Sexe</Label>
                    <select value={editingBenchmark.gender ?? "M"} onChange={e => handleEditChange("gender", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Fumeur</Label>
                    <div className="flex items-center justify-between border px-3 rounded-md h-10">
                      <span className="text-xs text-muted-foreground">{editingBenchmark.isSmoker ? "Oui" : "Non"}</span>
                      <Switch checked={!!editingBenchmark.isSmoker} onCheckedChange={v => handleEditChange("isSmoker", v)} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Capital Transféré</Label>
                    <Input type="number" className="font-bold text-amber-600 bg-amber-50" value={editingBenchmark.initialCapitalTransfer} onChange={e => handleEditChange("initialCapitalTransfer", parseFloat(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Prime Totale</Label>
                    <Input type="number" className="font-bold text-blue-600" value={editingBenchmark.annualPremiumTotal} onChange={e => handleEditChange("annualPremiumTotal", parseFloat(e.target.value))} />
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 bg-orange-50 rounded-lg border border-orange-100">
                   <Label className="text-[10px] text-orange-800 font-bold uppercase italic">Décès inclus dans l'épargne ?</Label>
                   <Switch 
                    checked={editingBenchmark.isDeathIncludedInSavings} 
                    onCheckedChange={v => handleEditChange("isDeathIncludedInSavings", v)} 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <Label>Coût Décès</Label>
                    <Input 
                      type="number" 
                      disabled={editingBenchmark.isDeathIncludedInSavings} 
                      value={editingBenchmark.isDeathIncludedInSavings ? 0 : editingBenchmark.deathPremium} 
                      onChange={e => handleEditChange("deathPremium", parseFloat(e.target.value))} 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Coût Inval.</Label>
                    <Input
                      type="number"
                      value={editingBenchmark.disabilityPremium}
                      onChange={e => handleEditChange("disabilityPremium", parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Différé Inval. (an)</Label>
                    <Input
                      type="number"
                      value={editingBenchmark.disabilityDeferralYears ?? 0}
                      onChange={e => handleEditChange("disabilityDeferralYears", parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Coût Libér.</Label>
                    <Input 
                      type="number" 
                      value={editingBenchmark.premiumWaiverPremium} 
                      onChange={e => handleEditChange("premiumWaiverPremium", parseFloat(e.target.value))} 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-emerald-700 font-bold italic uppercase">Épargne Annuelle</Label>
                    <Input 
                      type="number" 
                      className="bg-emerald-50" 
                      value={editingBenchmark.savingPremiumAnnual} 
                      onChange={e => handleEditChange("savingPremiumAnnual", parseFloat(e.target.value))} 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Label className="flex items-center gap-2 italic text-muted-foreground"><History size={14}/> Valeurs de rachat</Label>
                <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-2 bg-muted/30 rounded-lg">
                  {editingBenchmark.surrenderValues?.map((v: number, i: number) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-[9px]">An {i+1}</Label>
                      <Input 
                        type="number" 
                        className="h-8 text-xs p-1 font-mono" 
                        value={v} 
                        onChange={e => {
                          const newVals = [...editingBenchmark.surrenderValues];
                          newVals[i] = parseFloat(e.target.value) || 0;
                          handleEditChange("surrenderValues", newVals);
                        }} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleUpdate} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null} Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}