// app/scan/_client/PreQuestionsStepper.tsx
"use client";

import * as React from "react";

/* shadcn/ui */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

/* hooks réutilisés (analyse) */
import { useQuickParamsLoad } from "@/app/analyse/_hooks/useQuickParamsLoad";
import { useQuickParamsSync } from "@/app/analyse/_hooks/useQuickParamsSync";

/* utils */
import { cn } from "@/lib/utils";

/* ------------ Types & helpers ------------ */

const MARITAL_VALUES = [
  "celibataire",
  "marie",
  "mariee",
  "divorce",
  "divorcee",
  "partenariat_enregistre",
  "concubinage",
] as const;
type MaritalStatus = (typeof MARITAL_VALUES)[number];
function isMaritalStatus(x: unknown): x is MaritalStatus {
  return typeof x === "string" && (MARITAL_VALUES as readonly string[]).includes(x);
}

type Survivor = {
  maritalStatus?: MaritalStatus;
  marriedSince5y?: boolean;
  partnerDesignated?: boolean;
  cohabitationYears?: number;
  hasChild?: boolean;
  ageAtWidowhood?: number;
};

type Props = {
  clientDocPath: string;     // ex: clients/{uid}
  clientToken: string;       // token métier (parse pipeline)
  open: boolean;
  onExit?: () => void;       // fermer le stepper (croix / quitter)
  onComplete?: () => void;   // appelé quand tout est rempli (et/ou bouton Terminer)
};

const clamp = (n: any, min: number, max: number) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
};

// ISO simple pour valider le contrôle <input type="date" />
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------ Composant principal ------------ */

export default function PreQuestionsStepper({
  clientDocPath,
  clientToken,
  open,
  onExit,
  onComplete,
}: Props) {
  /* état local mappé sur quickParams */
  const [sex, setSex] = React.useState<"F" | "M" | "">("");
  const [survivor, setSurvivor] = React.useState<Survivor>({});
  const [childrenCount, setChildrenCount] = React.useState<number>(0);
  const [childrenBirthdates, setChildrenBirthdates] = React.useState<string[]>([]); // NEW
  const [weeklyHours, setWeeklyHours] = React.useState<number | undefined>(0);

  const [targets, setTargets] = React.useState({
    invalidityPctTarget: 90,
    deathPctTarget: 80,
    retirementPctTarget: 80,
  });

  // Carrière AVS
  const [startWorkYearCH, setStartWorkYearCH] = React.useState<number | undefined>(undefined);
  const [missingYearsMode, setMissingYearsMode] = React.useState<"none" | "some">("none");
  const [caregiving, setCaregiving] = React.useState<{ hasCare: boolean; years: number[] }>({ hasCare: false, years: [] });

  // stepper
  const steps = [
    { key: "identite", label: "Identité" },
    { key: "famille_travail", label: "Famille & travail" },
    { key: "objectifs", label: "Objectifs" },
    { key: "carriere", label: "Carrière AVS" },
    { key: "termine", label: "Terminé" },
  ] as const;
  const [stepIndex, setStepIndex] = React.useState(0);

  const [qpReady, setQpReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* ---------- Hydratation depuis Firestore (1x) ---------- */
  useQuickParamsLoad({
    clientDocPath,
    apply: (qp) => {
      try {
        if (qp?.sex === "F" || qp?.sex === "M") setSex(qp.sex);

        if (typeof qp?.childrenCount === "number") setChildrenCount(Math.max(0, qp.childrenCount));

        // Hydrate dates enfants (limit 20 par sécurité)
        if (Array.isArray(qp?.childrenBirthdates)) {
          setChildrenBirthdates(
            qp.childrenBirthdates.filter((s) => typeof s === "string" && ISO_DATE_RE.test(s)).slice(0, 20)
          );
        }

        if (typeof qp?.weeklyHours === "number") setWeeklyHours(qp.weeklyHours);

        const t: any = qp?.targets ?? {};
        setTargets({
          invalidityPctTarget: clamp(t.invalidityPctTarget ?? t.invalidity ?? 90, 50, 90),
          deathPctTarget: clamp(t.deathPctTarget ?? t.death ?? 80, 50, 100),
          retirementPctTarget: clamp(t.retirementPctTarget ?? t.retirement ?? 80, 50, 100),
        });

        if (qp?.survivor) {
          setSurvivor((prev) => ({
            ...prev,
            maritalStatus: isMaritalStatus(qp.survivor?.maritalStatus)
              ? (qp.survivor!.maritalStatus as MaritalStatus)
              : prev.maritalStatus,
            marriedSince5y:
              typeof qp.survivor?.marriedSince5y === "boolean"
                ? qp.survivor.marriedSince5y
                : prev.marriedSince5y,
            partnerDesignated:
              typeof qp.survivor?.partnerDesignated === "boolean"
                ? qp.survivor.partnerDesignated
                : prev.partnerDesignated,
            cohabitationYears:
              typeof qp.survivor?.cohabitationYears === "number"
                ? qp.survivor.cohabitationYears
                : prev.cohabitationYears,
          }));
        }

        if (typeof qp?.startWorkYearCH === "number") setStartWorkYearCH(qp.startWorkYearCH);
        if (qp?.missingYearsMode === "some") setMissingYearsMode("some");
        if (qp?.caregiving) {
          setCaregiving({
            hasCare: Boolean(qp.caregiving.hasCare),
            years: Array.isArray(qp.caregiving.years)
              ? qp.caregiving.years.filter((y: any) => Number.isFinite(y))
              : [],
          });
        }
      } catch (e: any) {
        setError(e?.message ?? "Impossible de charger les réponses.");
      } finally {
        setQpReady(true);
      }
    },
  });

  // 🔧 Normalisation post-hydratation : pose des défauts sûrs selon l'état civil
  const isMarriedOrReg =
    survivor.maritalStatus === "marie" ||
    survivor.maritalStatus === "mariee" ||
    survivor.maritalStatus === "partenariat_enregistre";

  const isConcubin = survivor.maritalStatus === "concubinage";

  React.useEffect(() => {
    if (!qpReady) return;
    setSurvivor((s) => {
      const ms = s.maritalStatus;
      if (!ms) return s;
      const married =
        ms === "marie" || ms === "mariee" || ms === "partenariat_enregistre";
      const concubin = ms === "concubinage";
      return {
        ...s,
        marriedSince5y: married
          ? (typeof s.marriedSince5y === "boolean" ? s.marriedSince5y : false)
          : undefined,
        partnerDesignated: concubin
          ? (typeof s.partnerDesignated === "boolean" ? s.partnerDesignated : false)
          : undefined,
        cohabitationYears: concubin
          ? (Number.isFinite(s.cohabitationYears) ? s.cohabitationYears : 0)
          : undefined,
      };
    });
  }, [qpReady, survivor.maritalStatus]);

  // Aligner le tableau des dates sur le nombre d'enfants
  React.useEffect(() => {
    setChildrenBirthdates((arr) => {
      if (childrenCount < 0) return [];
      if (arr.length === childrenCount) return arr;
      if (arr.length < childrenCount) {
        return [...arr, ...Array(childrenCount - arr.length).fill("")];
      }
      return arr.slice(0, childrenCount);
    });
  }, [childrenCount]);

  /* ---------- Autosave : même payload que sur Analyse ---------- */
  const savePayload = React.useMemo(
    () => {
      const cleanBirthdates = childrenBirthdates
        .slice(0, Math.max(0, childrenCount))
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .map((s) => (ISO_DATE_RE.test(s) ? s : "")); // garde la forme, on valide en UI

      return {
        sex: (sex || undefined) as "F" | "M" | undefined,
        weeklyHours,
        childrenCount,
        childrenBirthdates: cleanBirthdates, // NEW
        survivor: {
          maritalStatus: survivor.maritalStatus,
          marriedSince5y: survivor.marriedSince5y,
          partnerDesignated: survivor.partnerDesignated,
          cohabitationYears: survivor.cohabitationYears,
          hasChild: (childrenCount ?? 0) > 0,
        },
        targets: {
          invalidityPctTarget: clamp(targets.invalidityPctTarget, 50, 90),
          deathPctTarget: clamp(targets.deathPctTarget, 50, 100),
          retirementPctTarget: clamp(targets.retirementPctTarget, 50, 100),
        },
        startWorkYearCH: typeof startWorkYearCH === "number" ? startWorkYearCH : undefined,
        missingYearsMode,
        missingYears: missingYearsMode === "some" ? [] : [],
        caregiving: {
          hasCare: caregiving.hasCare,
          years: caregiving.hasCare ? caregiving.years : [],
        },
        schemaVersion: 1,
      };
    },
    [
      sex,
      weeklyHours,
      childrenCount,
      childrenBirthdates,
      survivor.maritalStatus,
      survivor.marriedSince5y,
      survivor.partnerDesignated,
      survivor.cohabitationYears,
      targets.invalidityPctTarget,
      targets.deathPctTarget,
      targets.retirementPctTarget,
      startWorkYearCH,
      missingYearsMode,
      caregiving.hasCare,
      caregiving.years,
    ]
  );

  const { isSaving, lastSavedAt } = useQuickParamsSync({
    clientDocPath,
    token: clientToken,
    payload: savePayload,
    debounceMs: 700,
    enabled: qpReady,
  });

  /* ---------- Validations par étape ---------- */
  const validStep = (idx: number) => {
    switch (idx) {
      case 0: { // Identité
        if (!sex) return false;
        if (!survivor.maritalStatus) return false;

        // Marié/Partenariat : bool requis
        if (isMarriedOrReg && typeof survivor.marriedSince5y !== "boolean") return false;
        // Concubinage : bool requis
        if (isConcubin && typeof survivor.partnerDesignated !== "boolean") return false;
        // Si partenaire désigné → années requises (≥0 accepté)
        if (isConcubin && survivor.partnerDesignated && !Number.isFinite(survivor.cohabitationYears)) return false;
        return true;
      }
      case 1: { // Famille & travail
        if (typeof childrenCount !== "number" || childrenCount < 0) return false;
        if (typeof weeklyHours !== "number") return false;
        // Si enfants → chaque date doit être au format ISO
        if (childrenCount > 0) {
          const ok = childrenBirthdates.slice(0, childrenCount).every((d) => ISO_DATE_RE.test(d));
          if (!ok) return false;
        }
        return true;
      }
      case 2: // Objectifs
        return (
          Number.isFinite(targets.invalidityPctTarget) &&
          Number.isFinite(targets.deathPctTarget) &&
          Number.isFinite(targets.retirementPctTarget)
        );
      case 3: // Carrière
        return true; // champs optionnels
      case 4: // Terminé
        return true;
      default:
        return false;
    }
  };

  const step0Ok = validStep(0);
  const step1Ok = validStep(1);
  const step2Ok = validStep(2);
  const step3Ok = validStep(3);

  const isCompleteAll = step0Ok && step1Ok && step2Ok && step3Ok;

  // debug minimal des raisons de blocage
  const reasons: string[] = [];
  if (!step0Ok) {
    if (!sex) reasons.push("Quel est votre sexe ?");
    if (!survivor.maritalStatus) reasons.push("Quel est votre état civil ?");
    if (isMarriedOrReg && typeof survivor.marriedSince5y !== "boolean") reasons.push("Êtes-vous marié(e) depuis ≥ 5 ans ?");
    if (isConcubin && typeof survivor.partnerDesignated !== "boolean") reasons.push("Avez-vous désigné votre partenaire ?");
    if (isConcubin && survivor.partnerDesignated && !Number.isFinite(survivor.cohabitationYears)) reasons.push("Depuis combien d’années vivez-vous ensemble ?");
  }
  if (!step1Ok) {
    if (typeof weeklyHours !== "number") reasons.push("Travaillez-vous au moins 8h/sem ?");
    if (childrenCount > 0) {
      const idxMissing = childrenBirthdates
        .slice(0, childrenCount)
        .findIndex((d) => !ISO_DATE_RE.test(d));
      if (idxMissing >= 0) reasons.push(`Date de naissance de l’enfant #${idxMissing + 1} (YYYY-MM-DD)`);
    }
  }
  if (!step2Ok) {
    reasons.push("Définir les 3 objectifs (slider).");
  }

  /* ---------- Navigation ---------- */
  const goNext = () => {
    if (!validStep(stepIndex)) return;
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };
  const goPrev = () => setStepIndex((i) => Math.max(i - 1, 0));

  /* ---------- Rendu ---------- */
  const pct = Math.round(((stepIndex + 1) / steps.length) * 100);

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onExit?.() : null)}>
      <DialogContent className="sm:max-w-xl w-[min(100vw-1rem,860px)] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Paramètres rapides</DialogTitle>
          <DialogDescription>
            Répondez aux questions pendant l’upload/traitement — tout est enregistré automatiquement.
          </DialogDescription>
        </DialogHeader>

        {/* barre de progression + steps */}
        <div className="px-6">
          <Progress value={pct} />
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "rounded-full",
                    i < stepIndex ? "bg-[#4fd1c5] text-white" : i === stepIndex ? "bg-[#0030A8] text-white" : ""
                  )}
                >
                  {i + 1}
                </Badge>
                <span className={cn("text-xs", i === stepIndex ? "font-medium" : "text-muted-foreground")}>
                  {s.label}
                </span>
                {i < steps.length - 1 && <span className="mx-1 text-muted-foreground/60">›</span>}
              </div>
            ))}
          </div>
        </div>

        {/* contenu */}
        <div className="px-6 pb-2 max-h-[70vh] overflow-y-auto">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 0: Identité — questions */}
          {stepIndex === 0 && (
            <Card className="shadow-none border">
              <CardContent className="p-4 grid gap-5 sm:grid-cols-2">
                {/* Q1 */}
                <div>
                  <div className="mb-1 text-sm font-medium">Quel est votre sexe ?</div>
                  <Select value={sex} onValueChange={(v) => setSex((v as "F" | "M") ?? "")}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="F">Femme</SelectItem>
                      <SelectItem value="M">Homme</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Q2 */}
                <div>
                  <div className="mb-1 text-sm font-medium">Quel est votre état civil ?</div>
                  <Select
                    value={survivor.maritalStatus ?? ""}
                    onValueChange={(v) =>
                      setSurvivor((s) => {
                        const ms = v as MaritalStatus;
                        const married = ms === "marie" || ms === "mariee" || ms === "partenariat_enregistre";
                        const concubin = ms === "concubinage";
                        return {
                          ...s,
                          maritalStatus: ms,
                          marriedSince5y: married ? (s.marriedSince5y ?? false) : undefined,
                          partnerDesignated: concubin ? (s.partnerDesignated ?? false) : undefined,
                          cohabitationYears: concubin ? (s.cohabitationYears ?? 0) : undefined,
                        };
                      })
                    }
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="celibataire">Célibataire</SelectItem>
                      <SelectItem value="marie">Marié(e)</SelectItem>
                      <SelectItem value="divorce">Divorcé(e)</SelectItem>
                      <SelectItem value="partenariat_enregistre">Partenariat enregistré</SelectItem>
                      <SelectItem value="concubinage">Concubinage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Q3 conditionnelle */}
                {isMarriedOrReg && (
                  <div className="sm:col-span-2">
                    <div className="mb-1 text-sm font-medium">Êtes-vous marié(e) depuis au moins 5 ans ?</div>
                    <Switch
                      checked={Boolean(survivor.marriedSince5y)}
                      onCheckedChange={(checked) => setSurvivor((s) => ({ ...s, marriedSince5y: checked }))}
                    />
                  </div>
                )}

                {/* Q4 conditionnelle */}
                {isConcubin && (
                  <>
                    <div>
                      <div className="mb-1 text-sm font-medium">Avez-vous désigné officiellement votre partenaire ?</div>
                      <Switch
                        checked={Boolean(survivor.partnerDesignated)}
                        onCheckedChange={(checked) =>
                          setSurvivor((s) => ({
                            ...s,
                            partnerDesignated: checked,
                            cohabitationYears: checked ? s.cohabitationYears ?? 5 : 0,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-sm font-medium">Depuis combien d’années vivez-vous ensemble ?</div>
                      <Input
                        type="number"
                        min={0}
                        value={Number(survivor.cohabitationYears ?? 0)}
                        onChange={(e) =>
                          setSurvivor((s) => ({ ...s, cohabitationYears: Math.max(0, Number(e.target.value || 0)) }))
                        }
                        disabled={!survivor.partnerDesignated}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">Minimum 5 ans requis pour la rente partenaire LPP.</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 1: Famille & travail — questions */}
          {stepIndex === 1 && (
            <Card className="shadow-none border">
              <CardContent className="p-4 grid gap-6">
                {/* Q5 */}
                <div>
                  <div className="mb-2 text-sm font-medium">Avez-vous des enfants à charge ?</div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" onClick={() => setChildrenCount((n) => Math.max(0, n - 1))}>−</Button>
                    <Input
                      type="number"
                      min={0}
                      value={childrenCount}
                      onChange={(e) => setChildrenCount(Math.max(0, Number(e.target.value || 0)))}
                      className="w-20 text-center"
                    />
                    <Button size="icon" variant="outline" onClick={() => setChildrenCount((n) => n + 1)}>+</Button>
                  </div>
                </div>

                {/* Q6 — dates pour chaque enfant */}
                {childrenCount > 0 && (
                  <div>
                    <div className="mb-2 text-sm font-medium">Quelles sont les dates de naissance de vos enfants ?</div>
                    <div className="grid gap-2">
                      {Array.from({ length: childrenCount }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs w-24 text-muted-foreground">Enfant #{i + 1}</span>
                          <Input
                            type="date"
                            value={childrenBirthdates[i] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setChildrenBirthdates((arr) => {
                                const next = arr.slice();
                                next[i] = v;
                                return next;
                              });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Format attendu : YYYY-MM-DD.</p>
                  </div>
                )}

                {/* Q7 */}
                <div>
                  <div className="mb-2 text-sm font-medium">Travaillez-vous au moins 8 heures par semaine ?</div>
                  <Switch
                    checked={Number(weeklyHours ?? 0) >= 8}
                    onCheckedChange={(checked) => setWeeklyHours(checked ? 9 : 0)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Objectifs — questions courtes */}
          {stepIndex === 2 && (
            <Card className="shadow-none border">
              <CardContent className="p-4 grid gap-5">
                <PctSlider
                  label="Quel niveau de couverture visez-vous en cas d’invalidité ? (% du revenu)"
                  value={targets.invalidityPctTarget}
                  min={50}
                  max={90}
                  onChange={(v) => setTargets((t) => ({ ...t, invalidityPctTarget: v }))}
                />
                <PctSlider
                  label="Quel niveau de protection souhaitez-vous en cas de décès ? (% du revenu)"
                  value={targets.deathPctTarget}
                  min={50}
                  max={100}
                  onChange={(v) => setTargets((t) => ({ ...t, deathPctTarget: v }))}
                />
                <PctSlider
                  label="Quel niveau de revenu ciblez-vous à la retraite ? (% du revenu)"
                  value={targets.retirementPctTarget}
                  min={50}
                  max={100}
                  onChange={(v) => setTargets((t) => ({ ...t, retirementPctTarget: v }))}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 3: Carrière AVS — questions */}
          {stepIndex === 3 && (
            <Card className="shadow-none border">
              <CardContent className="p-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm font-medium">En quelle année avez-vous commencé à travailler en Suisse ?</div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="ex. 2010"
                    value={typeof startWorkYearCH === "number" ? startWorkYearCH : ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setStartWorkYearCH(Number.isFinite(n) ? n : undefined);
                    }}
                  />
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium">Avez-vous des années sans cotisations AVS ?</div>
                  <Select
                    value={missingYearsMode}
                    onValueChange={(v) => setMissingYearsMode((v as "none" | "some") ?? "none")}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      <SelectItem value="some">Oui (à préciser plus tard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-2">
                  <div className="mb-1 text-sm font-medium">Avez-vous assuré des tâches d’assistance (soins à un proche) ?</div>
                  <Switch
                    checked={caregiving.hasCare}
                    onCheckedChange={(checked) => setCaregiving((c) => ({ ...c, hasCare: Boolean(checked) }))}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Terminé */}
          {stepIndex === 4 && (
            <Card className="shadow-none border">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-1">Merci !</h3>
                <p className="text-sm text-muted-foreground">
                  Tes réponses ont été enregistrées {isSaving ? "(enregistrement…)" : lastSavedAt ? "✔︎" : ""}. Tu peux laisser le scan se terminer tranquillement.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-4 flex items-center justify-between gap-2 border-t bg-background">
          <div className="text-xs text-muted-foreground">
            {isSaving ? "Enregistrement…" : lastSavedAt ? "Enregistré" : "—"}
            {!isCompleteAll && reasons.length ? (
              <div className="mt-1 text-[11px] text-amber-700">
                À compléter : {reasons.join(" · ")}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onExit?.()}>Quitter</Button>
            <Button variant="outline" onClick={goPrev} disabled={stepIndex === 0}>Précédent</Button>
            {stepIndex < steps.length - 1 ? (
              <Button onClick={goNext} disabled={!validStep(stepIndex)}>Suivant</Button>
            ) : (
              <Button onClick={() => onComplete?.()} disabled={!isCompleteAll}>Terminer</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------ Sous-composant slider % ------------ */
function PctSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const v = clamp(value, min, max);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{v}%</span>
      </div>
      <Slider
        value={[v]}
        min={min}
        max={max}
        step={1}
        onValueChange={([nv]) => onChange(clamp(Number(nv), min, max))}
        className="w-full"
      />
    </div>
  );
}
