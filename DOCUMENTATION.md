# TreePhoto IA — Documentation

> Assistant de tri photo pour photographes (orienté mariage), propulsé par l'IA.
> Trie, note et organise de grands volumes de photos en quelques minutes, en local
> ou en mode cloud collaboratif.

---

## 1. Vue d'ensemble

TreePhoto IA est une application web (React 19 + TypeScript + Vite) qui assiste le
photographe sur tout le flux de post-production amont :

1. **Importer** un lot de photos,
2. **Trier** rapidement (garder / rejeter / à revoir) avec l'aide de l'IA,
3. **Développer** (retouches de base, preview temps réel),
4. **Exporter** une sélection prête à livrer,
5. **Partager** un aperçu au client pour validation.

L'application fonctionne selon **deux modes complémentaires** :

| Mode | Stockage | Cible | Connexion requise |
| --- | --- | --- | --- |
| **Local** | Navigateur (IndexedDB / mémoire) | Tri rapide perso, hors-ligne | Non |
| **Cloud** | Supabase (Postgres + Storage) | Projets, collaboration, partage client | Oui (compte) |

> Le mode local reste pleinement fonctionnel sans aucune configuration Supabase.
> Le mode cloud s'active dès que les variables `VITE_SUPABASE_*` sont renseignées.

---

## 2. Le workflow en 3 étapes

L'interface est organisée autour de trois onglets numérotés, plus le mode AutoFlow.

### Étape 1 — Ingestion (`src/features/ingestion`)
- Glisser-déposer ou sélection de fichiers (JPEG, PNG, WebP, HEIC, RAW…).
- Lancement de l'analyse IA à l'import (file d'attente persistée).
- Aperçu de la progression et de la liste des photos importées.

### Étape 2 — Triage (`src/features/triage`)
- Notation **0–5 étoiles**, flags **Pick / Reject / Unreviewed** (style Lightroom).
- **Filtres intelligents** : 5 étoiles, Picks, Rejetées, Floues, Doublons, erreurs.
- **Mode plein écran** (visionneuse immersive, zoom, navigation clavier).
- **Comparaison A/B** côte à côte (idéal pour départager des doublons).
- **Panneau de détail** photo (métadonnées, histogramme RGB, scores IA).

### Étape 3 — Exportation (`src/features/export`)
- Sélection à exporter (picks, favoris, collection…).
- **Export ZIP** avec retouches appliquées (presets d'export).
- Organisation par **chapitres** / collections.

### Développement (`src/features/development`)
- Retouches de base avec **preview temps réel** (WebGL / GPU).
- Pipeline de retouche déportée dans un **Web Worker** (`retouchWorker`).

---

## 3. AutoFlow — le tri assisté ultra-rapide

AutoFlow (`src/components/autoflow`) est le cœur différenciant : l'IA pré-classe
chaque photo en **3 piles**, et le photographe ne révise que les cas incertains
en mode « Swipe ».

**File de révision (ordre imposé)** : `review` → `keep` → `reject`.

**Raccourcis clavier (mode Swipe)** :

| Touche | Action |
| --- | --- |
| `→` | Pick (garder) |
| `←` | Reject (rejeter) |
| `↑` | Favori + 5 étoiles |
| `1`–`5` | Note manuelle (sans avancer) |
| `Échap` | Retour au tableau de bord |

**Correspondance des décisions** :

| Décision | Effet |
| --- | --- |
| `pick` | pick=vrai, rejected=faux, favorite=faux, classe=`keep` |
| `reject` | rejected=vrai, pick=faux, favorite=faux, classe=`reject` |
| `favorite` | pick=vrai, favorite=vrai, note=5, classe=`keep` |
| `review` | tout faux, classe=`review` |

Écrans AutoFlow : tableau de bord, écran d'import, analyse, mode Swipe,
galerie, comparateur de doublons.

---

## 4. Intelligence artificielle & vision par ordinateur

### Analyse côté navigateur (`src/lib/computer-vision`, `src/services`)
Plusieurs services d'analyse coexistent (déterministe local, worker, Gemini) :
- **Détection de flou / score de netteté** (`blur-detection.ts`).
- **Score qualité** multi-critères : netteté, composition, exposition
  (`photo-scoring.ts`) → notation automatique (`auto-rating.ts`, presets dans
  `builtInPresets.ts` : Strict, Équilibré, Généreux, Qualité pure).
- **Détection de doublons** par hash perceptuel + LSH
  (`duplicate-detection.ts`, `lsh-duplicate-detector.ts`).
- **Suggestions de retouche automatique** (`auto-retouch.ts`).
- Analyse lourde déportée en **Web Workers** (`src/workers/imageAnalysisWorker.ts`).

### Fournisseur IA optionnel
- **Google Gemini** (`services/geminiService.ts`) pour une analyse enrichie
  (sélectionnable via `ApiSelector`).

---

## 5. Architecture cloud (Supabase)

Le mode cloud transforme TreePhoto en outil multi-projets et collaboratif.

### 5.1 Modèle de données (schéma `public`)

**Organisations & projets**
- `organizations`, `organization_members` (rôles owner/admin/member)
- `projects` (statut active/archived, opt-in `face_analysis_enabled`)

**Photos & analyse**
- `photos` (note, pick_status, classe AutoFlow, favori, soft-delete, statut d'analyse)
- `photo_analysis` (scores netteté/composition/exposition, flou, hash perceptuel, tags)
- `photo_embeddings` — vecteur **512 dims** (pgvector + index HNSW) pour la recherche sémantique
- `people`, `photo_faces` — visages, vecteur **128 dims** (strict opt-in, jamais nommés automatiquement)

**Organisation**
- `collections`, `collection_photos` (manuelles / smart / système)
- `jobs` — file de traitement asynchrone (thumbnail, qualité, hash, embedding, visages)

**Sync locale & partage client**
- `photo_metadata`, `cloud_collections`, `session_stats`
- `share_links` (lien partagé par token), `share_approvals` (validations client)

### 5.2 Stockage (buckets)
- `project-photos` — **privé**, 100 Mo/fichier, accès par appartenance au projet.
- `shared-photos` — **public**, 50 Mo/fichier, écriture réservée au propriétaire
  (lecture publique via URL non devinable pour le partage client).

### 5.3 Sécurité (RLS + RPC)
- **Row Level Security** activée sur toutes les tables.
- Accès aux données filtré par appartenance via `is_organization_member` /
  `is_project_member`.
- Mutations sensibles passées par des **RPC `SECURITY DEFINER`** (création de
  projet, renommage, archivage, suppression logique) — nécessaire sur les
  instances Supabase ES256/JWKS où PostgREST ne bascule pas vers le rôle
  authentifié pour les écritures directes.
- Partage client par **token** via RPC scopées (`get_shared_link`,
  `get_shared_photos`, `set_share_approval`…), sans exposer la table.
- Les RPC réservées aux utilisateurs connectés ont l'accès `anon` explicitement
  révoqué.

### 5.4 Worker de traitement (`worker/`)
Process serveur (jamais le navigateur) qui consomme la table `jobs` :
- Poll → claim (verrou par `worker_id`) → traite → réécrit le résultat.
- Types de jobs : `generate_thumbnail`, `quality_analysis`, `perceptual_hash`,
  `semantic_embedding`, `face_detection`.
- **Fournisseurs IA** : déterministe par défaut (aucun téléchargement, idéal
  dev/CI) ; extensibles vers **CLIP** (embeddings sémantiques réels) et **ONNX**
  (reconnaissance faciale SCRFD/ArcFace) sur un VPS.

```bash
pnpm worker   # boucle continue
# ou test one-shot :
node_modules/.bin/tsx --env-file=.env.local scripts/worker-e2e.mts
```

### 5.5 Recherche sémantique & visages
- **Recherche image→image et texte→image** via les embeddings CLIP et la RPC
  `match_photo_embeddings` (similarité cosinus, scope projet).
- **Visages** : détection anonyme uniquement, nommage toujours manuel, activable
  par projet (`face_analysis_enabled`).

---

## 6. Authentification & partage

- **Auth Supabase** (email/mot de passe) via `AuthModal` ; le mode « Continuer
  sans compte » bascule en local.
- **Partage client** : génération d'un lien par token donnant un aperçu en
  lecture seule des picks ; le client peut **valider / rejeter / mettre en favori**
  chaque photo, et le photographe récupère ces décisions.

---

## 7. Stack technique

| Domaine | Technologies |
| --- | --- |
| UI | React 19, TypeScript, Vite 6, Tailwind CSS 3, Framer Motion |
| État | Zustand (+ immer), TanStack Query |
| Composants | Radix UI, React Hook Form, React Hot Toast, lucide-react |
| Backend | Supabase (Postgres, Auth, Storage, pgvector) |
| Worker | Node + tsx, `@supabase/supabase-js` (service role) |
| Qualité | ESLint, Prettier, Vitest, React Testing Library |
| Divers | JSZip (export), react-dropzone, @fontsource (Space Grotesk auto-hébergée) |

---

## 8. Structure du projet

```
TREEPHOTOIA-master/
├── src/
│   ├── App.tsx                 # Shell applicatif (le code actif vit dans src/)
│   ├── features/               # Domaines métier
│   │   ├── ingestion/          #   Import + analyse
│   │   ├── triage/             #   Tri (notes, flags, filtres)
│   │   ├── development/        #   Retouches
│   │   ├── export/             #   Export ZIP / chapitres
│   │   ├── wedding/            #   Template projet mariage
│   │   └── cloud-projects/     #   Projets cloud, upload, recherche, visages
│   ├── components/
│   │   ├── autoflow/           # Tri assisté 3 piles + Swipe
│   │   ├── auth/               # Modal de connexion, menu utilisateur
│   │   ├── computer-vision/    # Composants liés à l'analyse
│   │   ├── performance/        # Debug perf
│   │   └── ui/                 # Primitives UI
│   ├── lib/                    # Analyse, CV, persistance, Supabase, utils
│   ├── services/               # Services d'analyse (local, worker, Gemini)
│   ├── store/                  # Zustand (photos, auth, projets, presets)
│   └── workers/                # Web Workers (analyse, retouche)
├── worker/                     # Worker serveur (jobs cloud)
├── supabase/migrations/        # Schéma versionné (RLS, RPC, buckets, pgvector)
├── scripts/                    # Lanceur dev + test E2E worker
└── DOCUMENTATION.md            # Ce fichier
```

> ⚠️ Le code actif est dans `src/`. Les dossiers racine `App.tsx`, `components/`
> et `services/` sont d'anciens doublons à ne pas faire évoluer.

---

## 9. Installation & scripts

```bash
pnpm install          # dépendances
pnpm dev              # serveur de dev (Vite)
pnpm build            # build de production
pnpm preview          # prévisualisation du build
pnpm test             # tests (Vitest)
pnpm lint             # ESLint (0 warning toléré)
pnpm type-check       # vérification TypeScript
pnpm worker           # worker de traitement des jobs cloud
```

---

## 10. Variables d'environnement

Copier `.env.example` vers `.env.local`.

**Frontend (exposé au navigateur — clé publique uniquement)**
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon publique>
```

**Worker (serveur/VPS — JAMAIS exposé au navigateur)**
```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<clé service_role secrète>
WORKER_ID=treephoto-worker-1
WORKER_POLL_INTERVAL_MS=5000
EMBEDDING_PROVIDER=deterministic   # ou clip
EMBEDDING_DIMENSIONS=512
FACE_PROVIDER=deterministic        # ou onnx
FACE_EMBEDDING_DIMENSIONS=128
```

> **Règle de sécurité absolue** : la clé `service_role` ne doit jamais apparaître
> dans une variable préfixée `VITE_` ni dans le code frontend. Elle appartient
> exclusivement au worker / serveur de confiance.

---

## 11. Principes de conception

- **Le mode local doit rester fonctionnel** à chaque étape de la migration cloud.
- **Jamais** de clé service role dans le frontend.
- **Visages** : détection anonyme, nommage toujours manuel, opt-in par projet.
- **AutoFlow** opère sur de vraies photos importées via `afUtils.ts`.
- Code actif strictement dans `src/`.

---

## 12. Tests

Suite Vitest (stores, services worker, migrations, features cloud, triage,
export, AutoFlow…). Lancer :

```bash
pnpm test          # mode watch
pnpm test -- --run # une passe
```
