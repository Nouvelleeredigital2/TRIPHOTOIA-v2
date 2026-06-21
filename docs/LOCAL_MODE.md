# TreePhoto — Mode Local

Le mode local est le mode par défaut : tout fonctionne dans le navigateur, sans
compte ni cloud. Vos photos ne quittent pas votre machine.

## Installation

> ⚠️ Ce dépôt vit sous un dossier parent contenant un `pnpm-workspace.yaml`
> (workspace pnpm accidentel). Installez **toujours** en mode autonome :

```bash
pnpm install --ignore-workspace --frozen-lockfile
```

## Lancer en développement

```bash
pnpm dev
```

Le serveur démarre sur **http://localhost:4110** (port fixe / `strictPort`).

## Flux complet

1. **Importer** — onglet **Import**. Glisser-déposer (JPEG, PNG, WebP, AVIF, GIF…).
   L'analyse qualité (netteté, exposition, composition) démarre automatiquement en
   arrière-plan.
2. **Analyser** — chaque photo reçoit un score et une classe AutoFlow
   (`keep` / `review` / `reject`). Les non-analysées peuvent être relancées.
3. **AutoFlow** — bouton disponible une fois des photos analysées. Tri une à une
   dans l'ordre `review → keep → reject`. Raccourcis :

   | Touche | Action |
   | --- | --- |
   | → | Garder (pick) |
   | ← | Rejeter |
   | ↑ | Favori + 5 étoiles |
   | 1–5 | Noter sans avancer |
   | Échap | Retour au tableau de bord |

   En mode local, chaque décision est écrite dans le store local immédiatement
   (un toast « Décisions enregistrées en local » le confirme).
4. **Doublons** — AutoFlow détecte les rafales/doublons et propose un comparateur
   A/B pour ne garder que la meilleure.
5. **Smart collections** — regroupements automatiques (ex. picks, favoris) en plus
   des collections manuelles.
6. **Export ZIP** — onglet **Export**. Depuis AutoFlow, « Exporter les picks »
   bascule sur Export avec le filtre `picks-only` pré-appliqué. Choisissez d'inclure
   ou non les rejetées / doublons, puis générez le ZIP.

## Vérifier (avant toute PR)

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

Voir aussi : [USER_GUIDE.md](USER_GUIDE.md) (version courte), [CLOUD_MODE.md](CLOUD_MODE.md)
pour activer la persistance cloud.
