# CLAUDE.md — Manuel de référence CreditX / MoneyLife

> Document de référence pour le projet. À tenir à jour quand une décision d'architecture
> ou une règle métier change. Lu automatiquement par Claude Code à chaque session.

---

## 1. Présentation

**CreditX** est l'entreprise. **MoneyLife** est son application fintech : une plateforme suisse
de **prévoyance** (2e et 3e pilier) qui aide un client à analyser ses lacunes (retraite, décès,
invalidité) et à souscrire des solutions 3a/3b.

Parcours produit principal :

1. **Scan LPP (2e pilier)** — OCR (Google Vision) + extraction IA d'un certificat de caisse de pension → Firestore.
2. **Audit & offres 3e pilier** — parsing PDF des offres par assureur (AXA, Swiss Life, Baloise, PAX) → scoring / underwriting.
3. **Moteur de calcul prévoyance** — AVS/AI, LPP, LAA, 3a/3b : projections retraite, rentes & capitaux décès/invalidité (maladie & accident).
4. **Espace client + back-office admin** — dashboard, signatures électroniques, e-mails transactionnels, prise de RDV (Google Calendar).

### Stack technique

| Domaine | Choix |
|---|---|
| Framework | **Next.js 16** (App Router, React 19), **TypeScript strict** |
| UI | Tailwind v4, shadcn/ui (Radix), Recharts, Framer Motion |
| Backend / données | **Firebase** : Firestore, Storage, Auth, Admin SDK |
| IA | OpenAI + Google Gemini (`gemini-2.5-flash`) + Vision API (OCR) |
| Paiement / mail / agenda | Stripe · SendGrid + Nodemailer · googleapis (Calendar) |
| i18n | `next-intl` — **fr** (défaut) + **de**, messages dans `messages/{fr,de}.json` |
| Package manager | **pnpm** · dev sur le **port 3020** (`pnpm dev`) |

> ⚠️ **Migration en cours** : tout `app/*` est déplacé sous `app/[locale]/` (i18n). L'ancienne et
> la nouvelle arborescence peuvent coexister temporairement — vérifier les chemins d'import.

### Secrets

`.env.local`, `env.prod.yaml`, `secrets/`, `*service-account*.json` sont **gitignorés** et ne doivent
jamais être commités. Le futur `GoogleService-Info.plist` (Firebase iOS) suivra la même règle.

---

## 2. Moteur de calcul — règles métier

### 2.1 Source canonique (⚠️ critique)

Le moteur vit dans **`app/lib/calculs/`**. C'est **LA source de vérité**.

> Il existe encore des copies divergentes dans `lib/shared/calculs/` et la racine `lib/`.
> **Ne jamais dupliquer la logique de calcul.** Toute évolution se fait dans `app/lib/calculs/`,
> et l'unification des doublons est une priorité (cf. §5). Une divergence sur un calcul financier
> = des montants de prévoyance faux pour le client.

Fichiers clés : `lpp.ts` (2e pilier), `3epilier.ts` (3a/3b), `avsAi.ts`, `avsDeces.ts`, `laa.ts`.

### 2.2 `lpp.ts` (2e pilier) — règles validées

- **`computeLPPProjectionRetraite(client, age)`** : projette le capital vieillesse à 65 ans.
  Priorité au **capital certificat** (`capitalRetraiteGlobal` / `Enter_lppCapitalProjete65`),
  sinon projection à **intérêt composé** (`r = 0.01`).
  > Cette fonction utilise volontairement `||` (et non `??`) : ce sont des **gardes anti-`NaN`**
  > sur des `Number(...)`. `NaN ?? x` renverrait `NaN` (cassé) ; `NaN || x` bascule sur le fallback.

- **Règle accident → fallback maladie** : pour invalidité / enfant / conjoint / orphelin, si la valeur
  *accident* est **absente** (`null`/`undefined`), on retombe sur la valeur **maladie** correspondante
  (hypothèse : la caisse peut compléter la LAA). Un **`0` accident explicite reste un 0 assumé**.

- **Salaire assuré** : cascade de priorité à 4 niveaux, incluant le mode certificat **`split`**
  (`Enter_typeSalaireAssure === 'split'`) — à ne pas perdre lors d'un refactor.

### 2.3 `3epilier.ts` (3a/3b) — projection assureur

- **`computeProjections3aAssurance(data, age)`** donne la **priorité à `data.projectionAssureur`**
  (« Projection affichée par l'assureur », saisie manuellement ou extraite au scan) si `> 0`,
  sinon calcul automatique.
- La priorité est **dans la fonction**, donc respectée par **tous** les points d'appel
  (création, total agrégé capital-65, édition inline et via drawer). Ne pas la réimplémenter ailleurs.
- Le champ est alimenté par 3 voies : saisie manuelle (add-insurance), **scan IA**
  (`/api/insurance/parse`), et édition a posteriori (`PlanDetailsView` / `EditAmountDrawer`).

### 2.4 Règle d'extraction des offres (IA)

Les offres d'assurance affichent souvent **3 projections** : pessimiste / moyen / optimiste.
**Toujours retenir le scénario MOYEN** (ni pessimiste, ni optimiste). Encodé dans le prompt Gemini
de `app/api/insurance/parse/route.ts`. À répliquer si on ajoute l'extraction de projection à
d'autres parsers (`lib/offers/parsers/*`).

---

## 3. Conventions de codage

- **TypeScript strict** partout. Le cœur métier (calculs) est **typé** (`ClientData`, `Legal_Settings`) ;
  **éviter `any`** dans les fonctions de calcul.
- **`??` (nullish) plutôt que `||` (falsy)** dans toute chaîne de priorité portant une valeur métier :
  un `0` légitime (rente/capital explicitement à zéro) ne doit **jamais** être écrasé par un fallback.
  - **Seule exception** : `||` comme garde anti-`NaN` autour d'un `Number(...)`. Toujours **commenter**
    ces `||` pour signaler qu'ils sont volontaires.
- **Source unique** pour les calculs : pas de copier-coller du moteur (cf. §2.1).
- **i18n** : aucune chaîne UI en dur. Toute chaîne passe par `useTranslations(...)` et doit exister
  dans **`messages/fr.json` ET `messages/de.json`** (sinon la clé brute s'affiche).
- **Imports** : alias tsconfig `@/*` → `app/*`, `@/lib/*` → `app/lib/*`, `@/components/*` → `components/*`,
  `@/app-components/*` → `app/components/*`. La racine `lib/` est importée en bare specifier
  (`from "lib/..."`) grâce à `baseUrl: "."`.

---

## 4. Migration Swift / iOS (en cours)

Objectif : une **app iOS native** (SwiftUI, Xcode), **iOS uniquement**.

### Stratégie

- **Réutiliser le backend** (Firebase + routes `/api/*`), **réécrire le client** en SwiftUI.
  ~60-70 % de la valeur (logique métier, IA, paiements) reste en place.
- **Décision structurante** : le **moteur de calcul N'EST PAS porté en Swift**. Il est **exposé en API**
  et consommé par le web **et** l'iOS → source unique, zéro 3e copie divergente.
- **VisionKit** remplacera le scan/cropper web (meilleur natif).

### État & paramètres

- Projet iOS : **`/Users/Habib/CreditX`** (repo séparé du web). Bundle ID **`ch.creditx.CreditX`**.
- **iOS 17.0 minimum** (volontairement, pas 26.5 — pour couvrir le parc iPhone).
- Partage **le même projet Firebase** que le web (Auth + Firestore communs).
- **V1 = tranche verticale** : login → dashboard prévoyance → 1 plan (dérisquer l'archi avant d'industrialiser).
- **Mode de travail** : pédagogique (Habib débute en Swift — expliquer les concepts au fil de l'eau).
- **Statut** : tranche verticale V1 **complète + analyse LPP complète**. L'app affiche, via l'API serveur,
  la **projection retraite, les rentes (invalidité/décès/vieillesse) et les capitaux décès** d'un plan LPP —
  aucune actuariat en Swift. Appels API **authentifiés** (jeton Firebase joint à chaque requête). Repo iOS
  propre, commits sur `main`. **Prochaines pistes** : App Check, toggle Maladie/Accident, scan VisionKit,
  URL d'API configurable dev/prod, tests UI.

---

## 5. Priorités actuelles

1. **Tests unitaires (Vitest)** — *en cours*. Harnais en place (`vitest.config.ts`, `pnpm test`).
   **57 tests verts** sur le moteur (`3epilier`, `lpp`, `laa`, `avsAi`, `avsDeces` `.test.ts`) couvrant :
   priorité override `projectionAssureur` (+ `0` non-override), règle accident → fallback maladie,
   préservation des `0` explicites (`??`), projection à intérêt composé, taux par profil,
   bornes du salaire assuré (clamp min/max), mode certificat `split`, rente vieillesse dynamique,
   `computeDeathBenefitAssurance`, LAA (IJ, rentes, capital unique, cap famille 70%),
   et AVS (années de cotisation, revenu moyen, supplément de carrière, sélecteur échelle 44).
   **Reste à couvrir** : `audit3a` (dépendant de données seedées).
2. **Unifier les doublons du moteur** (`app/lib/calculs` vs `lib/shared/calculs` vs racine `lib/`) → une seule source.
3. **Exposer le moteur en API** — *fait (1re vague)*. **3 endpoints** sous `app/api/calculs/` (validés zod,
   **sécurisés par jeton Firebase** via `app/lib/server/requireAuth.ts`), consommés par l'app iOS :
   `projection-retraite` (LPP/3a), `lpp-rentes`, `lpp-capitaux` (ces 2 derniers utilisent la source unique
   `app/lib/core/legal.ts` → `LEGAL_2025`, qui remplace l'ancienne constante `DEFAULT_LEGAL_2025` dupliquée).
   Reste : **App Check**, et étendre aux écrans de lacunes/AVS.
4. **Nettoyage du code mort** — un inventaire des fichiers orphelins / non importés a été établi (anciens
   résidus, doublons `lib/shared`, composants non câblés). À traiter par vagues, à faible risque.

---

## 6. Commandes utiles

```bash
pnpm dev            # serveur de dev (port 3020)
pnpm build          # build de production
pnpm lint           # ESLint
pnpm test           # tests Vitest (moteur de calcul) — une passe
pnpm test:watch     # tests Vitest en mode watch
npx tsc --noEmit    # typecheck (filtrer la sortie : migration en cours = bruit possible)
```

---

## 7. Système de design — app iOS (Revolut-like)

> **Politique UNIQUE.** Toute nouvelle vue iOS s'y conforme. Ne pas re-débattre écran par écran,
> et **ne jamais régresser un comportement déjà validé** en ajoutant une fonctionnalité
> (lister les acquis avant de restructurer une vue). Détails navigation : mémoire
> `ios-prevoyance-dashboard-model`.

### 7.1 Principes
- **Inspiration Revolut** : sombre, premium, **verre dépoli**, gros chiffres, **cartes blanches
  arrondies** flottant sur un **dégradé coloré**.
- **Translucide, jamais de bloc opaque** : les éléments flottants utilisent `.ultraThinMaterial`
  (pills, feuilles). Le contenu défile **DERRIÈRE** les éléments translucides (formes capsule),
  jamais coupé par un rectangle invisible (superposer en `ZStack` + `contentMargins(.top)`).
- **Jamais de noir pur** : un dégradé démarre sur une **teinte sombre de sa couleur**, pas `.black`
  (sinon « carré noir » derrière la barre de nav). Les dégradés **couvrent les safe areas**
  (`.ignoresSafeArea`) — aucune coupure haut/bas.

### 7.2 Dégradés par contexte (haut sombre → couleur)
LPP = **bleu** · Privé = **fuchsia** · Global = **vert** · Analyse = **indigo/violet**.

### 7.3 Palette
`blue (0, 0.48, 1)` · `fuchsia (0.85, 0.11, 0.78)` · `green (0.06, 0.72, 0.51)` ·
`indigo (0.42, 0.36, 0.90)`. Accents risque : `rose (0.96, 0.25, 0.45)` · `orange (0.96, 0.55, 0.10)`.

### 7.4 Composants
- **Typographie** : police **Inter** partout, via le helper `Font.inter(size, weight)` (police
  **variable** embarquée `Inter-Variable.ttf`, déclarée dans `Info.plist` → `UIAppFonts` ; famille
  `"Inter"`). Texte **noir** pour noms/valeurs ; **gris foncé** (`.black.opacity(0.5–0.55)`) pour le
  secondaire — **jamais** de gris pâle (`.secondary`/`.tertiary`) ni de **couleur de texte décorative**
  (les couleurs sont réservées aux **icônes/accents**). Gros montants : taille modérée + **semibold**
  (pas `.black`). Icônes d'action fines (ex. `+` en weight `.light`).
- **Cartes** : **verre dépoli** (`.ultraThinMaterial` + voile blanc ~0.5 pour la lisibilité sur
  dégradé sombre), coins ~26-32, ombre douce, `.environment(\.colorScheme, .light)` (texte sombre
  lisible quel que soit le thème système). Un material seul sur fond sombre = illisible → toujours le voile.
- **Feuilles (sheets)** — **STANDARD UNIQUE** : **verre dépoli CLAIR translucide façon Revolut** via
  **`.creditxSheet()`** (source unique : `CreditX/SheetGlass.swift`) = détent `.fraction(0.96)` (quasi-plein
  écran, petit espace en haut pour le drag) **+** `.ultraThinMaterial` clair + léger **dégradé teinté
  désaturé** → le fond transparaît en **teintes douces**. ⚠️ **Détent `< .large` obligatoire** (intégré
  dans `.creditxSheet()`) : à `.large`, iOS met la vue derrière en retrait/assombrie → rendu laiteux où
  **seul le dégradé reste** (faux translucide). Variante `.creditxSheetGlass()` = fond seul (détent custom). **Jamais de voile blanc** sur le fond (= laiteux quasi-opaque en thème clair)
  **ni de verre sombre** (tranché par Habib). Texte **sombre**, bouton **X flottant** (cercle clair +
  croix sombre), **cartes flottantes** via `.creditxSheetCard()` (voile ~0.6 → la teinte transparaît).
  `Form`/`List` dans une feuille → `.scrollContentBackground(.hidden)`. Feuilles profil/menu : en plus,
  **X flottant**, **avatar centré**, rangées à icônes (icône dans un carré arrondi teinté + titre + sous-titre).
  Détail : mémoire `ios-sheet-glass-standard`.
- **Pills / chips** : capsules **translucides indépendantes** (active teintée), jamais dans un conteneur.
- **Formulaires** (données perso, souscription) : **`Form` natif**, thème clair, claviers adaptés
  (`.decimalPad` montants/poids/taille, `.phonePad` tél), **majuscule auto** sur les noms,
  **sauvegarde à la perte de focus** (pas d'écriture à chaque frappe).
- **Montants** : `CHF`, séparateur de milliers **apostrophe** (`1'234`) ; primes au format **`0.00`**.

### 7.5 Navigation (dashboard prévoyance)
- **Pas de barre d'onglets** : navigation au **swipe horizontal** + **dots dynamiques**. Seul le **HAUT**
  (montant/titre, ou score Analyse) swipe ; la **zone du bas s'adapte** (ne glisse pas). Verticalement,
  **tout défile ensemble** dans un seul `ScrollView` + rebond (`scrollBounceBehavior(.always)`).
- **Profil** = avatar en haut à **gauche** · **brouillons** = tray en haut à **droite**.

### 7.6 Vérification
Builder + lancer sur simulateur et **regarder la capture** avant de valider. `idb` tape mal les boutons
de **barre de navigation** (limite connue) → vérifier autrement (ouvrir la vue temporairement, ou tester
sur device réel).
