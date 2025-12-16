// app/configurateur/3epilier/_client/health-wizard/HealthWizardShell.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, HeartPulse, Cigarette, Globe2 } from "lucide-react";

type HealthWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (data: {
    isSmoker: boolean;
    cigarettesPerDay: number | null;
    hasHypertension: boolean;
    hasHighCholesterol: boolean;
    heightCm: number | null;
    weightKg: number | null;
    healthBlockUs: boolean;
    rawAnswers: {
      hasHigherEducation: YesNo;
      degreeLabel: string;
      degreeSchool: string;
      doesPhysicalWork: YesNo;
      countryResidence: string;
      isUsCitizenOrResident: YesNo;
      isUsTaxableOther: YesNo;
      smokeStatus: "" | "no" | "occasionally" | "regularly";
      smokeCigarettes: YesNo;
      smokeCigars: YesNo;
      smokeOther: YesNo;
    };
  }) => void;
  // Valeurs déjà connues (si on veut pré-remplir)
  initialHeightCm?: number | null;
  initialWeightKg?: number | null;
  initialHasHypertension?: boolean;
  initialIsSmoker?: boolean;
  professionLabel?: string;
};

type YesNo = "yes" | "no" | "";

export const HealthWizardShell: React.FC<HealthWizardProps> = ({
  open,
  onOpenChange,
  onCompleted,
  initialHeightCm,
  initialWeightKg,
  initialHasHypertension,
  initialIsSmoker,
  professionLabel,
}) => {
  // --- État local du questionnaire ---

 
  const [hasHigherEducation, setHasHigherEducation] = useState<YesNo>("");
  const [degreeLabel, setDegreeLabel] = useState<string>("");
  const [degreeSchool, setDegreeSchool] = useState<string>("");

  const [doesPhysicalWork, setDoesPhysicalWork] = useState<YesNo>("no");

  const [countryResidence, setCountryResidence] = useState<string>("Suisse");
  const [isUsCitizenOrResident, setIsUsCitizenOrResident] = useState<YesNo>("");
  const [isUsTaxableOther, setIsUsTaxableOther] = useState<YesNo>("");

  const [smokeStatus, setSmokeStatus] = useState<"" | "no" | "occasionally" | "regularly">(
    initialIsSmoker ? "regularly" : ""
  );
  const [smokeCigarettes, setSmokeCigarettes] = useState<YesNo>("");
  const [cigarettesPerDay, setCigarettesPerDay] = useState<number | null>(null);
  const [smokeCigars, setSmokeCigars] = useState<YesNo>("no");
  const [smokeOther, setSmokeOther] = useState<YesNo>("no");

  const [heightCm, setHeightCm] = useState<number | null>(initialHeightCm ?? null);
  const [weightKg, setWeightKg] = useState<number | null>(initialWeightKg ?? null);
  const [hasHypertension, setHasHypertension] = useState<YesNo>(
    initialHasHypertension === true ? "yes" : initialHasHypertension === false ? "no" : ""
  );
  const [hasHighCholesterol, setHasHighCholesterol] = useState<YesNo>("no");

  const [submitting, setSubmitting] = useState(false);

  // --- Étapes du wizard (simple compteur) ---

  const steps = [
    "Profil",
    "Études",
    "Activité",
    "Pays & USA",
    "Tabac",
    "Santé",
  ] as const;

  const [stepIndex, setStepIndex] = useState(0);
  const currentStepLabel = steps[stepIndex];
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const healthBlockUs = useMemo(() => {
    return isUsCitizenOrResident === "yes" || isUsTaxableOther === "yes";
  }, [isUsCitizenOrResident, isUsTaxableOther]);

  const canGoNext = useMemo(() => {
    // Validation ultra simple par étape
    switch (stepIndex) {
      case 0:
          return true; // Étape informative, aucune saisie requise
      case 1:
        if (hasHigherEducation === "") return false;
        if (hasHigherEducation === "yes") {
          return degreeLabel.trim().length > 2 && degreeSchool.trim().length > 2;
        }
        return true;
      case 2:
        return doesPhysicalWork !== "";
      case 3:
        return countryResidence.trim().length > 0 && isUsCitizenOrResident !== "" && isUsTaxableOther !== "";
      case 4:
        if (smokeStatus === "") return false;
        if (smokeStatus === "regularly" && smokeCigarettes === "yes") {
          return cigarettesPerDay !== null && cigarettesPerDay >= 0;
        }
        return true;
      case 5:
        return (
          heightCm !== null &&
          heightCm > 100 &&
          weightKg !== null &&
          weightKg > 30 &&
          hasHypertension !== "" &&
          hasHighCholesterol !== ""
        );
      default:
        return true;
    }
  }, [
    stepIndex,
    hasHigherEducation,
    degreeLabel,
    degreeSchool,
    doesPhysicalWork,
    countryResidence,
    isUsCitizenOrResident,
    isUsTaxableOther,
    smokeStatus,
    smokeCigarettes,
    cigarettesPerDay,
    heightCm,
    weightKg,
    hasHypertension,
    hasHighCholesterol,
  ]);

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const handleNext = () => {
    if (!canGoNext) return;
    if (stepIndex < steps.length - 1) {
      setStepIndex((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (stepIndex === 0) return;
    setStepIndex((s) => s - 1);
  };

  const handleSubmit = () => {
    if (!canGoNext) return;
    setSubmitting(true);
    try {
      const isSmoker = smokeStatus === "regularly" || smokeStatus === "occasionally";

      onCompleted({
        isSmoker,
        cigarettesPerDay: cigarettesPerDay ?? null,
        hasHypertension: hasHypertension === "yes",
        hasHighCholesterol: hasHighCholesterol === "yes",
        heightCm,
        weightKg,
        healthBlockUs,
        rawAnswers: {
          hasHigherEducation,
          degreeLabel,
          degreeSchool,
          doesPhysicalWork,
          countryResidence,
          isUsCitizenOrResident,
          isUsTaxableOther,
          smokeStatus,
          smokeCigarettes,
          smokeCigars,
          smokeOther,
        },
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Rendu du contenu d'étape ---

  const renderStep = () => {
    switch (stepIndex) {
            case 0:
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <HeartPulse className="h-4 w-4 text-primary" />
        <span>Profil personnalisé</span>
      </div>

      {professionLabel && (
        <div className="space-y-1">
          <Label>Profession principale</Label>
          <Input
            value={professionLabel}
            disabled
            readOnly
            className="bg-muted text-xs"
          />
        </div>
      )}

      {!professionLabel && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Nous n'avons pas encore pu lire votre profession.
          Merci de vérifier vos données personnelles.
        </div>
      )}
    </div>
  );
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-sm font-medium">Études & diplôme</p>

            <div className="space-y-1 text-sm">
              <p>
                Êtes-vous en possession d’un diplôme d’études supérieures ou d’une
                certification professionnelle supérieure, ou suivez-vous
                actuellement une telle formation ?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={hasHigherEducation === "yes" ? "default" : "outline"}
                  onClick={() => setHasHigherEducation("yes")}
                >
                  Oui
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={hasHigherEducation === "no" ? "default" : "outline"}
                  onClick={() => setHasHigherEducation("no")}
                >
                  Non
                </Button>
              </div>
            </div>

            {hasHigherEducation === "yes" && (
              <>
                <div className="space-y-1">
                  <Label>
                    Quel diplôme avez-vous obtenu ? (p.ex. Bachelor économie, Master, diplôme fédéral, etc.)
                  </Label>
                  <Input
                    value={degreeLabel}
                    onChange={(e) => setDegreeLabel(e.target.value)}
                    placeholder="p.ex. Bachelor économie"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Auprès de quelle université ou haute école ?</Label>
                  <Input
                    value={degreeSchool}
                    onChange={(e) => setDegreeSchool(e.target.value)}
                    placeholder="p.ex. Université de Besançon"
                  />
                </div>
              </>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-3">
            <p className="text-sm font-medium">Activité physique au travail</p>
            <p className="text-xs text-muted-foreground">
              Dans l&apos;exercice de votre activité professionnelle, êtes-vous amené(e)
              à faire plus de 4 heures de travail manuel ou physique par semaine ?
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={doesPhysicalWork === "yes" ? "default" : "outline"}
                onClick={() => setDoesPhysicalWork("yes")}
              >
                Oui
              </Button>
              <Button
                type="button"
                size="sm"
                variant={doesPhysicalWork === "no" ? "default" : "outline"}
                onClick={() => setDoesPhysicalWork("no")}
              >
                Non
              </Button>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe2 className="h-4 w-4 text-primary" />
              <span>Pays de résidence & statut US</span>
            </div>

            <div className="space-y-1">
              <Label>Pays de résidence</Label>
              <Input
                value={countryResidence}
                onChange={(e) => setCountryResidence(e.target.value)}
                placeholder="p.ex. Suisse"
              />
            </div>

            <div className="space-y-1 text-sm">
              <p>Êtes-vous de nationalité américaine ou domicilié(e) aux États-Unis ?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={isUsCitizenOrResident === "yes" ? "default" : "outline"}
                  onClick={() => setIsUsCitizenOrResident("yes")}
                >
                  Oui
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={isUsCitizenOrResident === "no" ? "default" : "outline"}
                  onClick={() => setIsUsCitizenOrResident("no")}
                >
                  Non
                </Button>
              </div>
            </div>

            <div className="space-y-1 text-sm">
              <p>Êtes-vous imposable aux États-Unis pour d&apos;autres raisons ?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={isUsTaxableOther === "yes" ? "default" : "outline"}
                  onClick={() => setIsUsTaxableOther("yes")}
                >
                  Oui
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={isUsTaxableOther === "no" ? "default" : "outline"}
                  onClick={() => setIsUsTaxableOther("no")}
                >
                  Non
                </Button>
              </div>
            </div>

            {healthBlockUs && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                Vous ne pouvez pas souscrire à ce produit en raison de votre statut
                fiscal US (FATCA). Merci de contacter directement MoneyLife pour une
                analyse personnalisée.
              </div>
            )}
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Cigarette className="h-4 w-4 text-primary" />
              <span>Mode de vie – Tabac</span>
            </div>

            <div className="space-y-1 text-sm">
              <p>
                Fumez-vous ou avez-vous fumé / consommé des articles pour fumeurs au
                cours des trois dernières années ?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={smokeStatus === "no" ? "default" : "outline"}
                  onClick={() => setSmokeStatus("no")}
                >
                  Non
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={smokeStatus === "occasionally" ? "default" : "outline"}
                  onClick={() => setSmokeStatus("occasionally")}
                >
                  Oui, occasionnellement
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={smokeStatus === "regularly" ? "default" : "outline"}
                  onClick={() => setSmokeStatus("regularly")}
                >
                  Oui, régulièrement
                </Button>
              </div>
            </div>

            {smokeStatus === "regularly" && (
              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <p>Fumez-vous (ou avez-vous fumé) des cigarettes / cigarillos / e-cigarettes ?</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={smokeCigarettes === "yes" ? "default" : "outline"}
                      onClick={() => setSmokeCigarettes("yes")}
                    >
                      Oui
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={smokeCigarettes === "no" ? "default" : "outline"}
                      onClick={() => setSmokeCigarettes("no")}
                    >
                      Non
                    </Button>
                  </div>
                </div>

                {smokeCigarettes === "yes" && (
                  <div className="space-y-1">
                    <Label>Combien de cigarettes / e-cigarettes par jour ?</Label>
                    <Input
                      type="number"
                      min={0}
                      value={cigarettesPerDay ?? ""}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setCigarettesPerDay(Number.isFinite(v) ? v : null);
                      }}
                      placeholder="p.ex. 20"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <p>Fumez-vous (ou avez-vous fumé) des cigares et / ou des pipes ?</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={smokeCigars === "yes" ? "default" : "outline"}
                      onClick={() => setSmokeCigars("yes")}
                    >
                      Oui
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={smokeCigars === "no" ? "default" : "outline"}
                      onClick={() => setSmokeCigars("no")}
                    >
                      Non
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <p>Consommez-vous d&apos;autres articles pour fumeurs ?</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={smokeOther === "yes" ? "default" : "outline"}
                      onClick={() => setSmokeOther("yes")}
                    >
                      Oui
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={smokeOther === "no" ? "default" : "outline"}
                      onClick={() => setSmokeOther("no")}
                    >
                      Non
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <HeartPulse className="h-4 w-4 text-primary" />
              <span>État de santé (10 dernières années)</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Taille (cm)</Label>
                <Input
                  type="number"
                  min={120}
                  max={230}
                  value={heightCm ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setHeightCm(Number.isFinite(v) ? v : null);
                  }}
                  placeholder="p.ex. 180"
                />
              </div>
              <div className="space-y-1">
                <Label>Poids (kg)</Label>
                <Input
                  type="number"
                  min={35}
                  max={250}
                  value={weightKg ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setWeightKg(Number.isFinite(v) ? v : null);
                  }}
                  placeholder="p.ex. 85"
                />
              </div>
            </div>

            <div className="space-y-1 text-sm">
              <p>
                Avez-vous ou avez-vous eu de l&apos;hypertension, ou devez-vous / avez-vous
                dû prendre des médicaments pour cette affection ?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={hasHypertension === "yes" ? "default" : "outline"}
                  onClick={() => setHasHypertension("yes")}
                >
                  Oui
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={hasHypertension === "no" ? "default" : "outline"}
                  onClick={() => setHasHypertension("no")}
                >
                  Non
                </Button>
              </div>
            </div>

            <div className="space-y-1 text-sm">
              <p>
                Votre cholestérol est-il ou a-t-il été élevé, ou devez-vous /
                avez-vous dû prendre des médicaments en relation avec cette affection ?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={hasHighCholesterol === "yes" ? "default" : "outline"}
                  onClick={() => setHasHighCholesterol("yes")}
                >
                  Oui
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={hasHighCholesterol === "no" ? "default" : "outline"}
                  onClick={() => setHasHighCholesterol("no")}
                >
                  Non
                </Button>
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>Merci ! Vous avez presque terminé le questionnaire santé.</span>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[100vw] max-w-lg h-[100vh] sm:w-[90vw] sm:h-[90vh] max-h-[100vh] p-6 flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Questionnaire Santé &amp; Lifestyle</DialogTitle>
        </DialogHeader>

        <div className="mt-1 mb-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Étape {stepIndex + 1} sur {steps.length} · {currentStepLabel}</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 mt-1">
          {renderStep()}
        </div>

        <DialogFooter className="mt-3 flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground">
            Veuillez répondre de manière véridique et exhaustive.
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={stepIndex === 0 || submitting}
              onClick={handlePrev}
            >
              Précédent
            </Button>
            {stepIndex < steps.length - 1 ? (
              <Button
                type="button"
                size="sm"
                disabled={!canGoNext || submitting}
                onClick={handleNext}
              >
                Suivant
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={!canGoNext || submitting}
                onClick={handleSubmit}
              >
                Enregistrer
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};