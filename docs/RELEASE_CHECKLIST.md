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

> ⛔ Bloqué en attente de credentials staging — à exécuter avant ouverture cloud.
> Code et migrations vérifiés statiquement (cf. AUDIT_FINAL_REPORT.md).

- [ ] Supabase migrations applied on staging
- [ ] Private bucket `project-photos` exists
- [ ] Auth sign-in works
- [ ] Project create/open works
- [ ] Upload creates `photos` rows
- [ ] AutoFlow decisions persist after refresh
- [ ] `TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:cloud` → `cloud smoke: ok`

## Worker Verification

> ⛔ Bloqué en attente de credentials staging / VPS.

- [ ] Worker starts with service role key
- [ ] Pending jobs become processing
- [ ] Jobs complete with thumbnail/quality/hash
- [ ] Failed jobs write `error_message`
- [ ] `TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:worker` → `worker smoke: ok`

## Production Verification

- [ ] Vercel build succeeds
- [ ] Env vars configured
- [ ] No service role key in frontend env
- [ ] RLS audit completed
- [ ] Beta wedding scenario completed
