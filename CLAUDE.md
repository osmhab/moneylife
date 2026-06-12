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
- **Statut** : tranche verticale V1 **complète** — auth Firebase, lecture Firestore des plans,
  navigation vers le détail, et **consommation de l'API de calcul serveur** (la projection LPP
  est affichée via `POST /api/calculs/projection-retraite`, pas recalculée en Swift). Repo iOS
  propre, commits sur `main`. **Prochaines pistes** : étendre l'API (rentes/capitaux), scan VisionKit,
  sécuriser l'endpoint (jeton Firebase + App Check), URL d'API configurable dev/prod.

---

## 5. Priorités actuelles

1. **Tests unitaires (Vitest)** — *en cours*. Harnais en place (`vitest.config.ts`, `pnpm test`).
   **39 tests verts** sur le moteur (`app/lib/calculs/3epilier.test.ts`, `lpp.test.ts`) couvrant :
   priorité override `projectionAssureur` (+ `0` non-override), règle accident → fallback maladie,
   préservation des `0` explicites (`??`), projection à intérêt composé, taux par profil,
   bornes du salaire assuré (clamp min/max), mode certificat `split` (risque + épargne),
   rente vieillesse dynamique, et `computeDeathBenefitAssurance`.
   **Reste à couvrir** : `avsAi`, `avsDeces`, `laa`, `audit3a` (souvent dépendants de données seedées).
2. **Unifier les doublons du moteur** (`app/lib/calculs` vs `lib/shared/calculs` vs racine `lib/`) → une seule source.
3. **Exposer le moteur en API** — *démarré*. `POST /api/calculs/projection-retraite` (LPP / 3a, validé
   par zod) en place et **consommé par l'app iOS** pour la projection LPP. Reste à étendre (projection
   complète : rentes + capitaux décès/invalidité, qui demandera `Legal_Settings`) et à sécuriser
   (vérif jeton Firebase + App Check).
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
