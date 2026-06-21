# TreePhoto — Guide utilisateur (beta)

Guide court pour un reportage complet : **import → analyse → tri AutoFlow → doublons → export**.

## 1. Importer

Onglet **Import**. Glissez-déposez vos photos (JPEG, PNG, WebP, TIFF, HEIC…). L'analyse
qualité (netteté, exposition, composition) démarre automatiquement en arrière-plan.

## 2. Trier avec AutoFlow

Le mode **AutoFlow** présente les photos une à une, dans l'ordre `review → keep → reject`.

Raccourcis clavier :

| Touche | Action                    |
| ------ | ------------------------- |
| →      | Garder (pick)             |
| ←      | Rejeter                   |
| ↑      | Favori + 5 étoiles        |
| 1–5    | Noter sans avancer        |
| Échap  | Retour au tableau de bord |

## 3. Filtrer et chercher

Onglet **Triage** : filtres par note, statut (pick/reject/review), label couleur, date,
collection, et recherche par nom de fichier ou tag.

En mode cloud, la **recherche par similarité** (« Similaires ») trouve les photos
visuellement proches d'une image de référence, avec un score (« 92 % similaire »).

## 4. Repérer les doublons

Les photos quasi-identiques sont détectées par empreinte perceptuelle et regroupées
pour ne garder que la meilleure prise.

## 5. Personnes (optionnel, opt-in)

L'analyse de visage est **désactivée par défaut** et strictement opt-in par projet
(panneau « Personnes & visages »). Les visages détectés restent **anonymes** : aucun
nom n'est attribué automatiquement. Vous validez et nommez chaque groupe manuellement,
et pouvez **supprimer toutes les données visage** à tout moment.

## 6. Exporter

Onglet **Export** : exporte la sélection (picks / favoris / collection), organisée en
chapitres pour un reportage mariage (Préparatifs, Cérémonie, Couple, Famille, …).

---

## Modes local et cloud

- **Local** (par défaut) : tout reste sur votre machine, aucune configuration requise.
- **Cloud** (optionnel) : projets partagés via Supabase. Renseignez `VITE_SUPABASE_URL`
  et `VITE_SUPABASE_ANON_KEY` (voir `.env.example`). Le mode local reste pleinement
  fonctionnel sans cloud.

Pour le traitement IA cloud (recherche sémantique, détection de visages), un worker
tourne sur un serveur dédié — voir `worker/README.md`.
