# MoneyLife.ch

Next.js 15 + Tailwind + Firebase (Firestore/Storage/Auth) + Vision API + OpenAI (GPT-5).
- Scan LPP (2e pilier) → OCR Vision → extraction GPT-5 → Firestore
- Offres 3a → parsing GPT-5 → espace client /analyse
- Couleurs: primary #0030A8, success #4fd1c5, warning #F59E0B

## Dev
- Node 20+
- Copier `.env.local` (non commité) et lancer:

npm i
npm run dev

## Changelog — MoneyLife v4.2 (septembre 2025)

### 🔄 Analyse & UI
- **Toggles Maladie/Accident** déplacés dans les cartes de graphiques (`AnalysisGapsPanel`)  
  → un toggle dédié pour *Invalidité* et un pour *Décès*  
  → suppression des toggles dans LPP/LAA

- **Paramètres rapides** :
  - Ajout du champ **Sexe (F/M)** (sous État civil)
  - Renommage **“Enfants (ayant droit)” → “Enfant(s) à charge”**
  - Suppression du champ **“Double orphelins”**
  - Nouveau switch **“Travaille plus de 8h/sem ?”** (mappe vers `weeklyHours` 0 ↔︎ 9)

### ⚙️ Logique & calculs
- **Hook `useGaps`** :
  - suppression totale de `doubleOrphans`
  - décès accident calculé uniquement avec `nOrphans` (coordination 90%)

- **`lib/laa.ts`** :
  - `computeAccidentSurvivorsMonthly` n’accepte plus `nDoubleOrphans`
  - application stricte du cap **famille 70%** puis coordination **AVS/AI 90%**

### 🧩 Structure & code
- Nouveau composant **`GapsAndCardsClient`** :
  - regroupe cartes graphiques + cartes LPP/LAA
  - synchronise l’état des toggles Maladie/Accident avec les graphes
- **Page analyse** (`app/analyse/[id]/page.tsx`) :
  - rend désormais `GapsAndCardsClient` au lieu des 3 sections séparées (LPP / LAA / Lacunes)

---

✅ Cette version aligne l’UX avec la baseline définie (v4.2) et simplifie la logique accident (plus de double orphelin).
