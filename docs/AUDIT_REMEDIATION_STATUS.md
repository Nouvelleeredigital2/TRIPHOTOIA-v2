# Statut de remédiation — TreePhoto

Suivi des corrections P0/P1 du prompt maître de remédiation. Mis à jour à la fin
de chaque phase. Aucune commande n'est marquée « verte » sans exécution réelle.

## Légende statut

- ✅ terminé et vérifié
- 🟡 en cours / partiel
- ⬜ non commencé

## Environnement

- Gestionnaire de paquets : `pnpm@10.22.0`.
- **Contamination workspace** : un `pnpm-workspace.yaml` parasite dans le dossier
  personnel (`C:/Users/<user>/`) faisait remonter pnpm hors du projet et installait
  les dépendances dans le `node_modules` du dossier personnel → toolchain local
  cassé (vitest/eslint/tsc introuvables par intermittence). Contourné via
  `pnpm install --ignore-workspace`. Action recommandée : supprimer ou isoler ce
  workspace parasite côté poste.
- **Lockfile désynchronisé (préexistant)** : `pnpm-lock.yaml` épinglait
  `@types/react`/`@types/react-dom` en `^18.x` alors que `package.json` déclare
  `^19.0.0`. Réconcilié (install non-frozen ciblé, aucune montée de version
  applicative). `pnpm-lock.yaml` est donc modifié.
- `.npmrc` ajouté (`node-linker=hoisted`) pour fiabiliser l'installation sous
  Windows (évite les liens symboliques non matérialisés).

## P0 — Bloquants

### P0-A — Unifier le graphe de code actif ✅

| Élément                                                                      | Statut                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Imports `src/` → ancien dossier racine `services/` supprimés                 | ✅                                                   |
| Façade unique `src/services/geminiService.ts` (local only)                   | ✅                                                   |
| Providers `replicate`/`clarifai`/`huggingface` retirés de l'union et de l'UI | ✅                                                   |
| Champ clé API frontend retiré (`ApiSelector`)                                | ✅                                                   |
| Suppression racine `services/`, `components/`, `App.tsx`, `types.ts`         | ✅                                                   |
| `tsconfig.json` / `eslint.config.js` nettoyés des chemins supprimés          | ✅                                                   |
| Test garde-fou anti-import hors `src/`                                       | ✅ `src/test/architecture/no-legacy-imports.test.ts` |
| `.gitignore` : ajout `coverage`                                              | ✅                                                   |

Fichiers modifiés : `src/services/geminiService.ts`, `src/services/localAnalysisService.ts`,
`src/services/simpleAnalysisService.ts`, `src/hooks/usePhotoAnalysis.ts`,
`src/components/ApiSelector.tsx`, `src/test/hooks/usePhotoAnalysis.test.tsx`,
`tsconfig.json`, `eslint.config.js`, `.gitignore`. Supprimés : `services/`,
`components/`, `App.tsx`, `types.ts`.

Vérifs : `pnpm type-check` exit 0 ; greps d'acceptation (services racine, stubs
Replicate/Clarifai/hf_demo, `api-inference.huggingface.co`) → 0 occurrence.

### P0-B — Supprimer les simulations et tracer la provenance ✅

| Élément                                                                                | Statut        |
| -------------------------------------------------------------------------------------- | ------------- |
| Suppression du worker simulé `src/workers/simpleImageWorker.ts`                        | ✅ supprimé   |
| Suppression du fallback silencieux vers scores fabriqués (worker simple)               | ✅            |
| `Math.random()` retiré des chemins d'analyse (`src/services`, `src/workers`, `worker`) | ✅ (grep = 0) |
| Résultat par fichier (`Promise.allSettled`, fallback local réel par photo)             | ✅            |
| Modèle de provenance (`AnalysisMode` / `AnalysisProvenance` dans `src/types`)          | ✅            |
| Provenance attachée par le moteur local réel (`local-pixel`, `confidence: null`)       | ✅            |
| Validation Zod à la frontière (`validateAnalysisResult` dans la façade)                | ✅            |
| Rejet NaN/Infinity/hors plage + sans provenance → erreur structurée                    | ✅ (tests)    |
| Mode `demo` interdit en production / providers distants non sélectionnables            | ✅ (tests)    |

Tests : `src/test/services/analysisProvenance.test.ts` (6 cas).

### P0-C — Réduire mémoire et CPU du pipeline image ✅

| Élément                                                                  | Statut            |
| ------------------------------------------------------------------------ | ----------------- |
| `createImageBitmap(file)` direct (plus de copie ArrayBuffer→Blob)        | ✅                |
| Fermeture du bitmap dans `finally`                                       | ✅                |
| Redimensionnement borné (≤ 1600 px, ratio conservé) avant `getImageData` | ✅                |
| `OffscreenCanvas` dans le worker                                         | ✅ (déjà présent) |
| Calcul du flou une seule fois                                            | ✅                |
| Garde dimensions nulles / invalides                                      | ✅                |
| Pool borné `max(1, min(4, cœurs-1))`                                     | ✅                |
| Remplacement d'un worker fautif à l'index, sans croissance du pool       | ✅                |
| Timeout isolé à une photo + terminaison du worker bloqué                 | ✅                |
| `dispose()` (termine tout, rejette les tâches en attente)                | ✅                |
| Annulation `AbortSignal` (photo annulée → erreur, pas de fallback/score) | ✅ (tests)        |

Tests : `src/test/services/workerAnalysisService.test.ts` (pool borné,
remplacement sans croissance, `dispose`). Échantillonnage pixel + fermeture
bitmap couverts par revue de code (worker non instrumentable sous jsdom).

## P1 — Critiques

- P1-A Politique d'import unique ✅ — `src/lib/import-policy.ts` (extension +
  taille + signature magic bytes + refus RAW + cap lot, motifs de refus
  détaillés), branchée sur le puits commun `handleFilesSelected` (Studio Grid +
  AutoFlow) ; `calculateFileHash` ne retourne plus jamais `''` (lève → fichier
  rejeté) ; URL blob créée seulement pour une photo unique (pas de fuite sur
  refus/doublon). Tests : `src/test/lib/import-policy.test.ts`.
- P1-B Retrait API IA / secrets navigateur ✅ — HF/3rd-party retiré (P0-A) ;
  CSP `vercel.json` déjà minimale (pas de `*`, scope `self` + `*.supabase.co`) ;
  `.env.example` distingue clairement `VITE_*` client et vars serveur ;
  `readSupabaseConfig` lève si une clé service-role `VITE_*` est présente ;
  garde statique `src/test/architecture/no-server-env-in-src.test.ts`.
- P1-C Partage client privé et révocable ⬜ — **non traité**. Le bucket
  `shared-photos` reste public (migration `20260531020000` appliquée sur le
  projet live). Correction sûre recommandée (§10.8 du prompt, faute d'edge
  function de transformation/signature) : migration passant le bucket en privé +
  désactivation de l'émission d'URL publique frontend (`getSharedPhotoUrl`) +
  note de migration des objets existants. **Action produit destructive
  (désactive le partage anonyme) → à confirmer avant application.**
- P1-D Upload cloud compensé ✅ — compensation Storage si l'enregistrement DB
  échoue (`cloudUpload.ts`) ; chemin déjà validé serveur par `register_cloud_photo`.
  Test de compensation ajouté.
- P1-E Reprise des jobs cloud ⬜ — **non traité**. La table `jobs` a `attempts`,
  `run_after`, `locked_at/by` et le claim atomique `FOR UPDATE SKIP LOCKED`
  (`claim_next_job`), mais le worker ne fait ni retry/backoff, ni max-attempts,
  ni DLQ, ni récupération de lock expiré. Nécessite migration (colonnes
  `max_attempts`/statut terminal + RPC de requeue/lock-reclaim) + reprise du
  worker (`worker/jobRunner.ts`, `worker/index.ts`).
- P1-F Validation runtime et mémoire durable 🟡 (cœur fait) — `undoStack`
  plafonné (`UNDO_STACK_LIMIT = 30`) avec libération des URL blob des
  `DELETE_PHOTO` évincés ; validation Zod des résultats worker (P0-B) ;
  sanitation Zod des analyses relues depuis IndexedDB
  (`sanitizeLoadedAnalysis`). Reste : validation Zod systématique des réponses
  RPC Supabase et des paramètres d'import/export catalogue.
  Tests : `src/test/store/undoStackCap.test.ts`,
  `src/test/lib/catalogue-sanitize.test.ts`.

## Vérifications exécutées (toolchain local réparé)

| Commande                                  | Résultat                |
| ----------------------------------------- | ----------------------- |
| `pnpm type-check` (`tsc --noEmit`)        | ✅ exit 0               |
| `pnpm lint` (`eslint . --max-warnings 0`) | ✅ exit 0               |
| `pnpm exec vitest run` (suite complète)   | ✅ 290/290, 54 fichiers |
| `pnpm build` (`vite build`)               | ✅ built in ~17 s       |
| `prettier --check` (fichiers modifiés)    | ✅ clean                |
| Greps d'acceptation P0-A/P0-B             | ✅ 0 occurrence         |
| Scan bundle `dist/assets` (stubs/secrets) | ✅ 0 occurrence         |

## Risques ouverts (P0/P1 restants)

- **P0-B** : ✅ traité (provenance + validation Zod à la frontière d'analyse).
- **P0-C** : ✅ traité (mémoire/pool/lifecycle + `AbortSignal`).
- **P1-A** : politique d'import unifiée (magic bytes, rejet RAW, hash non vide)
  non traitée. Sévérité : haute.
- **P1-B** : CSP minimale `vercel.json`, `.env.example` audité, garde « variable
  serveur dans `src/` » non traités (le retrait des appels HF/secrets navigateur
  est fait en P0-A).
- **P1-C** : partage privé/révocable + strip EXIF + migration bucket **non
  traités**. Sévérité : haute (bucket public durable encore présent).
- **P1-D** : ✅ traité (compensation upload).
- **P1-E** : reprise des jobs (retry/backoff/DLQ/lock-recovery) **non traitée**.
  Sévérité : moyenne-haute.
- **P1-F** : ✅ cœur traité (undo borné + blob + sanitation IDB) ; reste la
  validation Zod systématique RPC/export.
- **P2** : non traité.

Voir le rapport de session pour la décision de release.
