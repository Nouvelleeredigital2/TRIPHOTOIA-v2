# TreePhoto Security

This document describes the security boundaries of the TreePhoto beta. Several of
these rules are enforced by automated tests — see the references below.

## Frontend environment rules

The frontend bundle is public. Only public values may reach it.

- ✅ `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — public, subject to RLS.
- ⛔ **No service-role key in the frontend, ever.** `src/lib/supabaseConfig.ts`
  throws at startup if `VITE_SUPABASE_SERVICE_ROLE_KEY` is set.
- Enforced by `src/test/security/serviceRoleExposure.test.ts`, which scans `src/`,
  `.env.example`, and `vercel.json` for any service-role exposure.

## Worker environment rules

- The worker runs off the browser (VPS/server) and uses
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- The service-role key **bypasses RLS** — it is a server secret. Never alias it
  under a `VITE_` prefix and never embed it in client config.
- In production the worker refuses to start with simulated AI providers
  (`assertProvidersAllowed`); see `worker/README.md`.

## RLS assumptions

- Row Level Security is enabled on **every** user-owned table; access is scoped by
  organization membership. No policy uses an unrestricted `using (true)` predicate.
- `service_role` never appears in a table policy — the worker bypasses RLS by key,
  and only receives `grant execute` on specific functions.
- Audited by `src/test/supabase/rlsPolicies.test.ts` and `supabase/README.md`.

## Share link limitations

- Public share resolution goes through `get_shared_link(token)`
  (SECURITY DEFINER, token-scoped, expiry-aware). The share_links table cannot be
  enumerated anonymously.
- Links honour `expires_at`; expired tokens resolve to nothing.
- Beta caveat: a valid, unexpired token grants read access to the shared photo
  hashes to anyone who holds it. Treat tokens as secrets and set expiries.

## Face data policy

- Face detection is **strict opt-in per project** (`projects.face_analysis_enabled`
  defaults to `false`). It can be turned off entirely worker-side with
  `FACE_PROVIDER=disabled` (zero faces, nothing fabricated).
- Faces are **never auto-named**: detection produces anonymous records only;
  naming/grouping is always an explicit manual action.
- Deletion:
  - Deleting a photo cascades to its faces (`photo_faces.photo_id … on delete cascade`).
  - Deleting a person un-links faces without deleting them
    (`photo_faces.person_id … on delete set null`).
- `photo_faces` is RLS-protected (members-only select/insert/update/delete).

## Supabase advisors (staging audit, 2026-06-21)

Audit live sur `cnnshwmdynggvjcxaohe` (cf. AUDIT_FINAL_REPORT.md). État :

- **Perf** : corrigés (index FK + RLS `(select auth.uid())`) — voir migration
  `..._advisor_perf_fk_indexes_rls_initplan.sql`.
- **Sécurité — corrigé** : `claim_next_job`, `fail_or_retry_job`,
  `reclaim_stuck_jobs` ne sont plus exécutables par `authenticated` (worker only,
  via service_role) — migration `..._advisor_security_revoke_worker_rpc.sql`.
- **Sécurité — by-design (conservés)** : fonctions de partage anon-callables
  (partage par token), helpers RLS évalués dans les policies (révoquer casserait
  la RLS), RPC applicatives de l'utilisateur authentifié.
- **Sécurité — manuel restant** : activer « Leaked password protection »
  (dashboard Auth) ; déplacer l'extension `vector` hors du schéma `public`
  (cosmétique).

## Beta data warning

TreePhoto is a beta. Do not store irreplaceable originals only in the cloud:

- keep your own backup of source files;
- treat staging/beta projects as disposable;
- assume share tokens may be retained by recipients even after a link is deleted.
