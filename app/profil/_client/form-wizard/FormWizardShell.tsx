//app/profil/_client/form-wizard/FormWizardShell.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, cubicBezier } from "framer-motion";
import type { Variants } from "framer-motion";
import type { UseFormReturn } from "react-hook-form";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  SquareUserRound,
  FileScan,
  ClipboardList,
  Sparkles,
  CircleCheck
} from "lucide-react";
import {
  SECTIONS,
  type SectionId,
  type MinimalForm,
  getMountedSectionIds,
  getNextSectionId,
} from "./sections.registry";

import SpinCardLoader from "../../../components/SpinCardLoader";



const SECTION_COMPONENTS = {
  intro: IntroConsentSection,
  "prenom": PrenomSection,
  "nom": NomSection,
  "birthdate": BirthdateSection,
  "sex": SexSection,
  "etat-civil": EtatCivilSection,
  "concubinage-menage": ConcubinageMenageSection,
  "concubinage-partenaire-designe": ConcubinagePartenaireSection,
  "mariage-duree": MariageDureeSection,
  "spouse-sex": SpouseSexSection,
  "spouse-birthdate": SpouseBirthdateSection,
  "has-kids": HasKidsSection,
  "kids-dates": KidsDatesSection,
  "statut-pro": StatutProSection,
  "salaire-annuel": SalaireAnnuelSection,
  "travaille-8h": Travaille8hSection,
  "ij-maladie": IjMaladieSection,
  "ij-accident": IjAccidentSection,
  "affilie-lpp": AffilieLPPSection,
  "scan-lpp": ScanLPPSection,
  "lpp-basics": LppBasicsSection,
  "lpp-split-risque": LppBasicsSplitRiskSection,
  "lpp-split-epargne": LppBasicsSplitSaveSection,
  "lpp-rentes-invalidite": LppRentesInvaliditeSection,
  "lpp-rentes-deces": LppRentesDecesSection,
  "lpp-avoirs": LppAvoirsSection,
  "lpp-options": LppOptionsSection,
  "lpp-caps-deces": LppCapitauxDecesSection,
  "avs-age": AvsAgeDebutSection,
  "avs-lacunes-toggle": AvsLacunesToggleSection,
  "avs-lacunes-years": AvsLacunesYearsSection,
  "review": ReviewSection,
} as const;

import IntroConsentSection from "./sections/IntroConsentSection";
import PrenomSection from "./sections/PrenomSection";
import NomSection from "./sections/NomSection";
import BirthdateSection from "./sections/BirthdateSection";
import SexSection from "./sections/SexSection";
import EtatCivilSection from "./sections/EtatCivilSection";
import MariageDureeSection from "./sections/MariageDureeSection";
import HasKidsSection from "./sections/HasKidsSection";
import KidsDatesSection from "./sections/KidsDatesSection";
import StatutProSection from "./sections/StatutProSection";
import SalaireAnnuelSection from "./sections/SalaireAnnuelSection";
import Travaille8hSection from "./sections/Travaille8hSection";
import IjMaladieSection from "./sections/IjMaladieSection";
import IjAccidentSection from "./sections/IjAccidentSection";
import LppBasicsSection from "./sections/LppBasicsSection";
import LppBasicsSplitRiskSection from "./sections/LppBasicsSplitRiskSection";
import LppBasicsSplitSaveSection from "./sections/LppBasicsSplitSaveSection";
import LppRentesInvaliditeSection from "./sections/LppRentesInvaliditeSection";
import LppRentesDecesSection from "./sections/LppRentesDecesSection";
import LppAvoirsSection from "./sections/LppAvoirsSection";
import LppOptionsSection from "./sections/LppOptionsSection";
import LppCapitauxDecesSection from "./sections/LppCapitauxDecesSection";
import AvsAgeDebutSection from "./sections/AvsAgeDebutSection";
import AvsLacunesToggleSection from "./sections/AvsLacunesToggleSection";
import AvsLacunesYearsSection from "./sections/AvsLacunesYearsSection";
import ReviewSection from "./sections/ReviewSection";
import SpouseSexSection from "./sections/SpouseSexSection";
import SpouseBirthdateSection from "./sections/SpouseBirthdateSection";
import ConcubinageMenageSection from "./sections/ConcubinageMenageSection";
import ConcubinagePartenaireSection from "./sections/ConcubinagePartenaireSection";
import ScanLPPSection from "./sections/ScanLPP";
import AffilieLPPSection from "./sections/AffilieLPP";

/** Props du shell
 * - form: l’instance RHF qui existe déjà (on ne recrée pas useForm ici)
 * - startId?: permet de forcer un départ sur une section (optionnel)
 * - onSubmitFinal?: appelé par le bouton final (nous l’accrocherons depuis ProfilUnifiedForm)
 */
export type FormWizardShellProps<TForm extends MinimalForm> = {
  form: UseFormReturn<TForm, any, any>;
  startId?: SectionId;
  onSubmitFinal?: (values: TForm) => Promise<void> | void;
};

/* --------- Animations verticales (ça monte) --------- */
const slideVariants: Variants = {
  initial: { y: 48, opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.28, ease: cubicBezier(0.22, 0.6, 0.35, 1) },
  },
  exit: {
    y: -48,
    opacity: 0,
    transition: { duration: 0.22, ease: cubicBezier(0.22, 0.6, 0.35, 1) },
  },
};

export default function FormWizardShell<TForm extends MinimalForm>({
  form,
  startId,
  onSubmitFinal,
}: FormWizardShellProps<TForm>) {
  const { getValues, trigger, setFocus } = form;

  const [isNavOpen, setIsNavOpen] = useState(false);

  const [isGlobalLoading, setIsGlobalLoading] = useState(false);

  // Liste des sections montées selon la logique (mountIf)
  const mountedIds = useMemo(
    () => getMountedSectionIds(getValues() as MinimalForm),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(getValues())] // simple invalidation; on affinera si besoin
  );

// Index/ID courant : en state (pour déclencher un re-render quand on change d’étape)
const [currentId, setCurrentId] = useState<SectionId>(startId ?? mountedIds[0] ?? "intro");

// Si la liste des sections montées change (conditions), réaligner l'étape courante
useEffect(() => {
  if (!mountedIds.includes(currentId)) {
    const fallback = mountedIds[0] ?? currentId;
    if (fallback !== currentId) setCurrentId(fallback);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [mountedIds.join("|")]);

const currentSection = SECTIONS.find((s) => s.id === currentId)!;

// Position dans le flow
const currentIndex = mountedIds.findIndex((id) => id === currentId);
const totalSteps = mountedIds.length;
const isFirst = currentIndex <= 0;

  // Index maximum atteint dans le flow (pour bloquer la navigation vers le futur)
  const [maxVisitedIndex, setMaxVisitedIndex] = useState(0);

  useEffect(() => {
    if (currentIndex >= 0) {
      setMaxVisitedIndex((prev) => Math.max(prev, currentIndex));
    }
  }, [currentIndex]);

// Verrouillage du scroll page : one-screen wizard
useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Focus automatique sur le premier champ logique de la section (si connu)
  useEffect(() => {
    // On laisse les sections concrètes gérer le focus finement plus tard.
    // Ici, on tente simplement de focus par id conventionnel (#field-<firstField>)
    const first = (currentSection.fields?.[0] as string) || "";
    if (first) {
      const el = document.getElementById(`field-${first}`);
      if (el instanceof HTMLElement) {
        setTimeout(() => el.focus(), 80);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // Est-ce que la section courante est valide (gating du bouton Suivant) ?
  const isCurrentValid = useMemo(
    () => currentSection.isValid(getValues() as MinimalForm),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(getValues()), currentId]
  );

  // Aller à l’étape suivante (respecte mountIf)
const goNext = async () => {
  if (currentSection.fields?.length) {
    const ok = await trigger(currentSection.fields as any, { shouldFocus: true });
    if (!ok) return;
  }
  if (!currentSection.isValid(getValues() as MinimalForm)) return;

  const nextId = getNextSectionId(getValues() as MinimalForm, currentId);
  if (nextId) setCurrentId(nextId);
};

const goPrev = () => {
  const idx = mountedIds.findIndex((id) => id === currentId);
  if (idx > 0) setCurrentId(mountedIds[idx - 1]);
};

  // Sommes-nous sur la dernière section montée ?
  const isLast = useMemo(() => {
    if (!mountedIds.length) return true;
    return mountedIds[mountedIds.length - 1] === currentId;
  }, [mountedIds, currentId]);

  // Bouton principal : "Suivant" ou "Enregistrer"
  const primaryLabel = isLast ? "Enregistrer" : "Suivant";
  const onPrimary = async () => {
    if (!isLast) {
      await goNext();
      return;
    }

    if (!onSubmitFinal) return;

    // On laisse RHF faire la validation complète ici
    const submit = form.handleSubmit(
      async (values) => {
        try {
          await onSubmitFinal(values as TForm);
        } catch (e) {
          console.error("[FormWizardShell] Erreur dans onSubmitFinal:", e);
          // Tu peux ajouter ici un toast / alert si tu veux
        }
      },
      (errors) => {
        console.error("[FormWizardShell] Erreurs de validation:", errors);
        // Optionnel : afficher un toast / message global
        alert("Merci de corriger les champs invalides avant d’enregistrer.");
      }
    );

    await submit(); // exécute la validation + onSubmitFinal si ok
  };

  /* ---------- Placeholder d’affichage pour les 6 premières sections ----------
   * On ne code PAS encore leurs contenus.
   * Ceci affiche le header / titre / sous-titre et un espace de rendu.
   */
  const ActiveSectionRenderer = () => {
    const id = currentSection.id as SectionId;

    // 🔹 Cas spécial : écran d'intro plein écran
    if (id === "intro") {
      return (
        <div className="w-full h-full">
          <IntroConsentSection form={form as any} />
        </div>
      );
    }

    // 🔹 Cas spécial : Scan LPP → on injecte onNext pour avancer directement
    if (id === "scan-lpp") {
      return (
        <div className="w-full max-w-screen-sm mx-auto">
          <header className="pt-2 pb-6">
            <div className="text-xs text-muted-foreground">Questionnaire</div>
            <h1 className="text-2xl font-semibold mt-1">
              {currentSection.title}
            </h1>
            {currentSection.subtitle && (
              <p className="text-sm text-muted-foreground mt-1">
                {currentSection.subtitle}
              </p>
            )}
          </header>

          <div
            className="rounded-xl border px-4 py-5 bg-background"
            aria-current="step"
            aria-live="polite"
          >
            {/* on passe ici onNext = goNext */}
            <ScanLPPSection
              form={form as any}
              onNext={goNext}
              onGlobalLoading={setIsGlobalLoading}
            />
          </div>
        </div>
      );
    }

    // 🔹 Cas général pour toutes les autres sections
    const Comp =
      SECTION_COMPONENTS[id as keyof typeof SECTION_COMPONENTS];

    return (
      <div className="w-full max-w-screen-sm mx-auto">
        <header className="pt-2 pb-6">
          <div className="text-xs text-muted-foreground">Questionnaire</div>
          <h1 className="text-2xl font-semibold mt-1">
            {currentSection.title}
          </h1>
          {currentSection.subtitle && (
            <p className="text-sm text-muted-foreground mt-1">
              {currentSection.subtitle}
            </p>
          )}
        </header>

        <div
          className="rounded-xl border px-4 py-5 bg-background"
          aria-current="step"
          aria-live="polite"
        >
          {Comp ? <Comp form={form as any} /> : null}
        </div>
      </div>
    );
  };

  /* ---------- Progress bar gradient ---------- */
  const ProgressBar = () => {
    const progress =
      totalSteps > 0 ? Math.max(0, Math.min(1, (currentIndex + 1) / totalSteps)) : 0;

    return (
      <div className="px-4 pb-2">
        <div className="h-[3px] w-full rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full"
            initial={{ width: "0%" }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.3, ease: cubicBezier(0.22, 0.6, 0.35, 1) }}
            style={{
              background:
                "linear-gradient(90deg, #001D38 0%, #4FD1C5 20%, #B9B9B9 40%, #F0AB00 60%, #FF5858 80%, #FF5EA9 100%)",
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="relative h-[100dvh] w-full bg-background">
      {/* Header compact (chevron + titre flow) */}
            <div className="absolute top-0 left-0 right-0 z-20">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Bouton retour */}
          <button
            type="button"
            onClick={isFirst ? undefined : goPrev}
            aria-label="Retour"
            disabled={isFirst}
            className={`rounded-md px-2 py-1 text-sm transition ${
              isFirst
                ? "text-muted-foreground cursor-default"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            ←
          </button>

          {/* Bouton / lien d'ouverture du drawer de navigation */}
          <Sheet open={isNavOpen} onOpenChange={setIsNavOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="rounded-full px-3 py-1 text-xs bg-muted text-foreground/80 hover:bg-muted/80 transition max-w-[220px] truncate"
              >
                {currentSection.title || "Navigation du questionnaire"}
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
  <SheetHeader className="px-4 pt-4 pb-2">
    <SheetTitle className="text-sm">Navigation du questionnaire</SheetTitle>
  </SheetHeader>

  <div className="px-2 pb-4 overflow-y-auto max-h-[calc(100vh-80px)] space-y-4">

    {/* ---------- INTRO ---------- */}
    <div>
      <h3 className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        Intro
      </h3>
      <ul className="space-y-1">
  {mountedIds
    .filter((id) => id === "intro")
    .map((id) => {
      const sec = SECTIONS.find((s) => s.id === id);
      const isActive = id === currentId;
      const stepIdx = mountedIds.findIndex((mid) => mid === id);
      const isLocked = stepIdx > maxVisitedIndex;
      const showCheck = stepIdx < maxVisitedIndex;

      return (
        <li key={id}>
          <button
            type="button"
            onClick={() => {
            if (isLocked) return;
            setCurrentId(id);
            setIsNavOpen(false);
            }}
            className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
            isActive
                ? "bg-[#001D38] text-white"
                : isLocked
                ? "opacity-40 cursor-not-allowed"
                : "hover:bg-muted"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {showCheck && (
                  <CircleCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                )}
                <span className="truncate">{sec?.title ?? id}</span>
              </div>
            </div>
          </button>
        </li>
      );
    })}
</ul>
    </div>

    {/* ---------- DONNÉES PERSONNELLES ---------- */}
    <div>
      <h3 className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <SquareUserRound className="h-4 w-4 text-muted-foreground" />
        Données personnelles
      </h3>
      <ul className="space-y-1">
        {mountedIds
          .filter((id) =>
            [
              "prenom",
              "nom",
              "birthdate",
              "sex",
              "etat-civil",
              "concubinage-menage",
              "concubinage-partenaire-designe",
              "mariage-duree",
              "spouse-sex",
              "spouse-birthdate",
              "has-kids",
              "kids-dates",
              "statut-pro",
              "salaire-annuel",
              "travaille-8h",
              "ij-maladie",
              "ij-accident",
            ].includes(id)
          )
            .map((id) => {
    const sec = SECTIONS.find((s) => s.id === id);
    const isActive = id === currentId;
    const stepIdx = mountedIds.findIndex((mid) => mid === id);
    const isLocked = stepIdx > maxVisitedIndex;
    const showCheck = stepIdx < maxVisitedIndex;

    return (
      <li key={id}>
        <button
          type="button"
          onClick={() => {
            if (isLocked) return;
            setCurrentId(id);
            setIsNavOpen(false);
          }}
          className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
            isActive
              ? "bg-[#001D38] text-white"
              : isLocked
                ? "opacity-40 cursor-not-allowed"
                : "hover:bg-muted"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {showCheck && (
                <CircleCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              )}
              <span className="truncate">{sec?.title ?? id}</span>
            </div>
          </div>
        </button>
      </li>
    );
  })}
      </ul>
    </div>

        {/* ---------- DONNÉES LPP ---------- */}
    <div>
      <h3 className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <FileScan className="h-4 w-4 text-muted-foreground" />
        Données LPP
      </h3>
      <ul className="space-y-1">
        {mountedIds
          .filter((id) =>
            [
              "lpp-basics",
              "lpp-split-risque",
              "lpp-split-epargne",
              "lpp-rentes-invalidite",
              "lpp-rentes-deces",
              "lpp-avoirs",
              "lpp-options",
              "lpp-caps-deces",
            ].includes(id)
          )
          .map((id) => {
            const sec = SECTIONS.find((s) => s.id === id);
            const isActive = id === currentId;
            const stepIdx = mountedIds.findIndex((mid) => mid === id);
            const isLocked = stepIdx > maxVisitedIndex;
            const showCheck = stepIdx < maxVisitedIndex;

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked) return;
                    setCurrentId(id);
                    setIsNavOpen(false);
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-[#001D38] text-white"
                      : isLocked
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {showCheck && (
                      <CircleCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    )}
                    <span className="truncate">{sec?.title ?? id}</span>
                  </div>
                </button>
              </li>
            );
          })}
      </ul>
    </div>

        {/* ---------- RÉCAPITULATIF ---------- */}
    <div>
      <h3 className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        Récapitulatif
      </h3>
      <ul className="space-y-1">
        {mountedIds
          .filter((id) => id === "review")
          .map((id) => {
            const sec = SECTIONS.find((s) => s.id === id);
            const isActive = id === currentId;
            const stepIdx = mountedIds.findIndex((mid) => mid === id);
            const isLocked = stepIdx > maxVisitedIndex;
            const showCheck = stepIdx < maxVisitedIndex;

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked) return;
                    setCurrentId(id);
                    setIsNavOpen(false);
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-[#001D38] text-white"
                      : isLocked
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {showCheck && (
                      <CircleCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    )}
                    <span className="truncate">{sec?.title ?? id}</span>
                  </div>
                </button>
              </li>
            );
          })}
      </ul>
    </div>

  </div>
</SheetContent>
          </Sheet>
        </div>

        <ProgressBar />
      </div>

      {/* Viewport : une seule section visible, animée verticalement */}
      <div
  className="absolute inset-0 pt-14 pb-[112px] overflow-hidden" // un peu plus d'espace pour le bouton bas
  role="region"
  aria-live="polite"
>
        <div className="h-full w-full relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
  key={currentId}
  variants={slideVariants}
  initial="initial"
  animate="animate"
  exit="exit"
  className="absolute inset-0 overflow-auto"
>
  <div className={currentId === "intro" ? "h-full" : "px-4"}>
    <ActiveSectionRenderer />
  </div>
</motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky action bar (respecte le safe-area) */}
      <div className="absolute left-0 right-0 bottom-0 z-30 px-4 pb-[env(safe-area-inset-bottom)] pt-2 bg-gradient-to-t from-background via-background/95 to-transparent">
        <div className="max-w-screen-sm mx-auto w-full space-y-1 mb-8">
          <button
            type="button"
            onClick={onPrimary}
            disabled={(!isLast && !isCurrentValid) || isGlobalLoading}
            className={`w-full h-12 rounded-xl text-white text-base font-medium transition
            ${
                (!isLast && !isCurrentValid) || isGlobalLoading
                ? "bg-gray-400"
                : "bg-[#001D38] hover:brightness-110"
            }`}
          >
            {primaryLabel}
          </button>

          {!isLast && !isCurrentValid && (
            <p className="text-xs text-muted-foreground text-center">
              Répondez à la question pour continuer.
            </p>
          )}
        </div>
      </div>

      {isGlobalLoading && (
  <div className="absolute inset-0 z-[999] bg-black/40 backdrop-blur-sm flex items-center justify-center">
    <div className="flex flex-col items-center gap-3 px-6">
      <SpinCardLoader />
      <p className="text-sm text-muted-foreground text-center">
        Analyse de votre certificat LPP en cours… Cela prend jusqu'à 3 min. Merci de ne pas fermer cette page
      </p>
    </div>
  </div>
)}
    </div>
  );
}