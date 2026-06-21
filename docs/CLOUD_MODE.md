# TreePhoto — Mode Cloud

Le cloud est **optionnel** : il ajoute auth, persistance des projets, stockage des
photos et traitement par worker. Le mode local reste pleinement fonctionnel sans lui.

## 1. Variables d'environnement (frontend)

Copier `.env.example` vers `.env.local` et renseigner **uniquement** :

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...   # clé anon (publique, soumise à la RLS)
```

> ⛔ Ne jamais mettre de service role key côté frontend. `src/lib/supabaseConfig.ts`
> lève une erreur au démarrage si `VITE_SUPABASE_SERVICE_ROLE_KEY` est défini.
> Sans `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`, l'app reste en mode local.

## 2. Migrations

Appliquer les migrations de `supabase/migrations/` **dans l'ordre des timestamps**
(préfixe du nom de fichier). Détails et modèle de sécurité : [../supabase/README.md](../supabase/README.md).

## 3. Stockage

Créer deux buckets **privés** :

- `project-photos` — fichiers sources des projets
- `shared-photos` — dérivés exposés via les liens de partage

## 4. Utilisation

1. **Auth** — « Se connecter au cloud » depuis la barre d'en-tête.
2. **Projet** — créer/ouvrir un projet depuis le dashboard cloud.
3. **Upload** — l'envoi crée les lignes dans la table `photos` et empile des jobs
   d'analyse (thumbnail, qualité, hash perceptuel, embedding).
4. **Traitement** — un worker hors navigateur consomme les jobs
   (voir [WORKER_DEPLOYMENT.md](WORKER_DEPLOYMENT.md)).
5. **Décisions** — les décisions AutoFlow (pick/reject/favorite/review) sont
   persistées sur la photo cloud (`pick_status`, `autoflow_class`, `is_favorite`,
   `rating`) ; elles **survivent au rafraîchissement** du navigateur.

## 5. Vérification cloud (staging)

```bash
TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:cloud
```

(Sans le flag, c'est un dry-run qui n'écrit rien.) Voir aussi
[SECURITY.md](SECURITY.md) pour les hypothèses RLS et les limites des liens de partage.
