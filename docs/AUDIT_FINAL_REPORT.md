# TreePhoto — Rapport d'audit final

Date : 2026-06-21 · Branche : `codex/autoflow-local-foundation`

## Vérification (dernière exécution)

| Porte | Résultat |
| --- | --- |
| `pnpm install --ignore-workspace --frozen-lockfile` | ✅ |
| `pnpm type-check` | ✅ |
| `pnpm lint` | ✅ (0 erreur) |
| `pnpm test` | ✅ **348 tests** |
| `pnpm build` | ✅ aucun warning |
| `pnpm smoke:cloud` (live) | ✅ **ok** — staging `cnnshwmdynggvjcxaohe` (bucket privé, org/project/photo/job, décision) |
| `pnpm smoke:worker` (live) | ✅ **ok** — 3 jobs drainés par le runner, états terminaux avec diagnostics |

> Runtime cloud **vérifié sur staging** le 2026-06-21 (projet `cnnshwmdynggvjcxaohe`) :
> schéma + RLS + buckets privés confirmés sur le live, advisors perf corrigés
> (index FK + RLS init-plan), smokes cloud & worker passés de bout en bout.
>
> Caveat connu : le cleanup du user temporaire des smokes échoue car
> `projects.created_by` référence `auth.users` sans `ON DELETE CASCADE` — les
> orphelins ont été nettoyés manuellement ; durcir le `finally` (supprimer l'org
> avant le user) reste à faire.
> Restant pour 100% : auth UI réelle + déploiement Vercel ; advisors sécurité
> WARN (leaked-password protection, EXECUTE sur fonctions internes).

> Note environnement : ce dépôt est imbriqué sous un `pnpm-workspace.yaml` parent.
> Installer **toujours** avec `--ignore-workspace` (cf. RELEASE_CHECKLIST / READMEs).

## Réalisé (phases 1 → 9)

| Phase | Objet | Commit |
| --- | --- | --- |
| 0 | Baseline verte (install pnpm réparée) | `45065ef` |
| 1 | Hygiène du dépôt + baseline de release | `bb238dc` |
| 2 | Durcissement handoff workflow local AutoFlow → Export | `77df519` |
| 3 | Audit RLS Supabase + doc cloud | `174f7e0` |
| 4 | Harnais de smoke cloud | `942e132` |
| 5 | Durcissement worker E2E + smoke | `070c26c` |
| 6 | Frontière des providers IA (mode `disabled` honnête) | `7efb9a0` |
| 7 | Audit sécurité prod (anti-exposition service-role) | `262d97b` |
| 8 | Passe UX beta + régressions critiques | `36be17f` |
| 9 | Guides d'exploitation beta | `60ad2e5` |

- **Workflow local** : vérifié (import → analyse → AutoFlow → doublons → smart
  collections → export ZIP). Handoff `picks-only` couvert par test d'intégration.
- **Workflow cloud** : code et migrations vérifiés statiquement (RLS, décisions,
  upload). Runtime non exécuté (credentials).
- **Worker** : contrats durcis (états terminaux, `error_message`, job_type inconnu),
  smoke testé hors Supabase. Runtime non exécuté (credentials).
- **Sécurité** : service-role jamais côté frontend (garde-fou + scan statique),
  RLS sur toutes les tables, share links token-scoped, faces opt-in/jamais nommées.
- **Documentation** : LOCAL / CLOUD / WORKER / scénario beta / sécurité / release.
- **Production** : build déployable (Vite/Vercel), `vercel.json` sans secret.

## Limites connues

- **Modèle face réel** : `FACE_PROVIDER=onnx` est un point d'extension documenté, non
  câblé (lève une erreur explicite). Mode `disabled` disponible. Jamais simulé en prod.
- **Modèle CLIP réel** : `EMBEDDING_PROVIDER=clip` via `@xenova/transformers`, à
  valider sur le VPS après premier téléchargement du modèle (non exercé en CI).
- **Credentials staging** : indisponibles dans cet environnement.

## Statut

```
Application locale            : vérifiée
Code et migrations cloud      : vérifiés (statique + live staging)
Runtime cloud                 : vérifié sur staging (smoke:cloud ok)
Runtime worker                : vérifié sur staging (smoke:worker ok ; VPS de prod restant)
```

## Décision beta

**Prêt pour la beta** côté application locale et qualité du code (toutes portes
vertes, build sans warning, 308 tests). La mise en service **cloud** reste
conditionnée à une exécution réelle des smokes (`smoke:cloud`, `smoke:worker`) sur
un projet Supabase de staging + worker VPS, à réaliser avant ouverture aux
utilisateurs cloud.
