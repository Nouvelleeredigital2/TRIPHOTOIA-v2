# Supabase Setup

TreePhoto fonctionne en **mode local** par défaut. Le cloud Supabase est une
couche optionnelle : auth, persistance des projets, stockage des photos et file
de jobs traitée par un worker hors navigateur.

## 1. Créer le projet

1. Créer un projet Supabase.
2. Appliquer les migrations **dans l'ordre des timestamps** (préfixe du nom de
   fichier) depuis `supabase/migrations/`.
3. Buckets de stockage **privés** requis :
   - `project-photos` — fichiers sources des projets
   - `shared-photos` — dérivés exposés via les liens de partage

## 2. Variables d'environnement

### Frontend (`VITE_*` — embarquées dans le bundle, donc publiques)

| Variable                 | Rôle                                  |
| ------------------------ | ------------------------------------- |
| `VITE_SUPABASE_URL`      | URL du projet                         |
| `VITE_SUPABASE_ANON_KEY` | clé anon (publique, soumise à la RLS) |

> ⛔ **`VITE_SUPABASE_SERVICE_ROLE_KEY` est interdite.** `src/lib/supabaseConfig.ts`
> lève une erreur au démarrage si elle est présente — la service role key
> contourne la RLS et ne doit jamais atteindre le frontend ni l'env client Vercel.

### Worker (hors navigateur — secrets serveur)

| Variable                    | Rôle                                                  |
| --------------------------- | ----------------------------------------------------- |
| `SUPABASE_URL`              | URL du projet                                         |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service role (bypass RLS, **serveur uniquement**) |
| `PROJECT_PHOTOS_BUCKET`     | optionnel, défaut `project-photos`                    |
| `EMBEDDING_PROVIDER`        | `deterministic` (défaut) \| `clip`                    |
| `FACE_PROVIDER`             | voir `worker/README.md`                               |

## 3. Modèle de sécurité (RLS)

Invariants vérifiés automatiquement par `src/test/supabase/rlsPolicies.test.ts` :

- **RLS activé sur toutes les tables** créées (`organizations`,
  `organization_members`, `projects`, `photos`, `photo_analysis`, `collections`,
  `collection_photos`, `jobs`, `people`, `photo_faces`, `photo_embeddings`,
  `photo_metadata`, `cloud_collections`, `session_stats`, `share_links`,
  `share_approvals`).
- **Aucune policy non bornée** : pas de `using (true)` / `with check (true)` actif.
- **Liens de partage protégés par token** : la fonction `get_shared_link(token)`
  (SECURITY DEFINER, filtrée par token + expiration) remplace l'ancienne policy
  `share_links_public_read` énumérable.
- **`service_role` n'apparaît jamais dans une policy de table** : le worker
  contourne la RLS de par sa clé ; il reçoit seulement des `grant execute` sur
  les fonctions (`claim_next_job`, etc.).

La service role key contourne la RLS : ne l'utiliser que côté worker, jamais en
définissant de policy qui en dépend.
