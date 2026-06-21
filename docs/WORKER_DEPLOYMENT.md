# TreePhoto — Déploiement du Worker

Le worker traite les jobs cloud (`generate_thumbnail`, `quality_analysis`,
`perceptual_hash`, `semantic_embedding`, `face_detection`) hors du navigateur. Il
utilise la **service role key** et doit tourner sur un serveur de confiance (VPS),
jamais dans le frontend.

## Prérequis VPS

- Node.js (version alignée sur le projet) + `pnpm`
- Accès réseau sortant vers le projet Supabase
- Le dépôt déployé, dépendances installées :
  ```bash
  pnpm install --ignore-workspace --frozen-lockfile
  ```

## Variables d'environnement (serveur uniquement)

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL` | URL du projet |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service role (**bypass RLS — secret serveur**) |
| `WORKER_ID` | identité du worker pour le verrouillage des jobs (optionnel) |
| `WORKER_POLL_INTERVAL_MS` | intervalle de poll à vide (défaut 5000) |
| `EMBEDDING_PROVIDER` | `deterministic` (défaut) \| `clip` |
| `FACE_PROVIDER` | `deterministic` \| `disabled` \| `onnx` |

> En **production**, le worker refuse de démarrer avec des providers `deterministic`
> (garde-fou `assertProvidersAllowed`) sauf `ALLOW_SIMULATED_PROVIDERS=true`. Voir
> [../worker/README.md](../worker/README.md) pour activer CLIP / le mode `disabled`.

## Lancer

```bash
pnpm worker
```

La boucle est **résiliente** : une erreur d'itération (réseau, claim, traitement)
est journalisée puis suivie d'un backoff exponentiel plafonné à 60 s — le process ne
s'arrête jamais sur une erreur transitoire. La réclamation des jobs est atomique
(`claim_next_job`, `FOR UPDATE SKIP LOCKED`) : plusieurs workers peuvent tourner en
parallèle sans prendre le même job.

## Gestionnaire de process

Exemple **pm2** :

```bash
pm2 start "pnpm worker" --name treephoto-worker --time
pm2 logs treephoto-worker
pm2 startup && pm2 save   # redémarrage auto au boot
```

Exemple **systemd** (`/etc/systemd/system/treephoto-worker.service`) :

```ini
[Service]
WorkingDirectory=/opt/treephoto
EnvironmentFile=/opt/treephoto/.env.worker
ExecStart=/usr/bin/pnpm worker
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
```

## Reprise sur échec

- Un job qui échoue passe en `failed` **avec** un `error_message` exploitable (un
  `job_type` inconnu donne `Unknown job type "..."`). Aucun job n'est laissé bloqué
  en `processing` après une erreur applicative.
- Vérifier la santé de bout en bout (staging) :
  ```bash
  TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:worker
  ```
  (Sans le flag : dry-run qui n'écrit rien.) Le smoke seed des jobs, les draine, et
  vérifie que chacun atteint un état terminal avec diagnostics, puis nettoie.
