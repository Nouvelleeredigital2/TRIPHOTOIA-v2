# TreePhoto Release Checklist

## Install

> ⚠️ Ce dépôt vit sous un dossier parent qui contient un `pnpm-workspace.yaml`
> (workspace pnpm accidentel). Installer **toujours** en mode autonome, sinon
> les dépendances sont hissées vers le mauvais `node_modules` :
>
> ```bash
> pnpm install --ignore-workspace --frozen-lockfile
> ```

## Local Verification

- [x] `pnpm install --ignore-workspace --frozen-lockfile`
- [x] `pnpm type-check`
- [x] `pnpm lint`
- [x] `pnpm test` (308 tests)
- [x] `pnpm build` (aucun warning)

## Cloud Verification

> ✅ Vérifié sur staging `cnnshwmdynggvjcxaohe` le 2026-06-21 (cf. AUDIT_FINAL_REPORT.md).

- [x] Supabase migrations applied on staging (21 migrations)
- [x] Private bucket `project-photos` exists (privé)
- [x] Auth sign-in works (UI réelle — user de test, session stockée)
- [x] Project create/open works (via smoke RPC)
- [x] Upload creates `photos` rows (via smoke)
- [x] Session persiste après refresh navigateur (UI réelle)
- [ ] Décision AutoFlow persistée après refresh via l'UI complète (décision OK via smoke ; chaîne UI complète non rejouée)
- [x] `TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:cloud` → `cloud smoke: ok`

## Worker Verification

> ✅ Vérifié sur staging (smoke). VPS de production restant.

- [x] Worker starts with service role key
- [x] Pending jobs become processing
- [x] Jobs complete with thumbnail/quality/hash
- [x] Failed jobs write `error_message`
- [x] `TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:worker` → `worker smoke: ok`

## Production Verification

- [ ] Vercel build succeeds
- [ ] Env vars configured
- [ ] No service role key in frontend env
- [ ] RLS audit completed
- [ ] Beta wedding scenario completed
