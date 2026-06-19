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

- [ ] `pnpm install --ignore-workspace --frozen-lockfile`
- [ ] `pnpm type-check`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`

## Cloud Verification

- [ ] Supabase migrations applied on staging
- [ ] Private bucket `project-photos` exists
- [ ] Auth sign-in works
- [ ] Project create/open works
- [ ] Upload creates `photos` rows
- [ ] AutoFlow decisions persist after refresh

## Worker Verification

- [ ] Worker starts with service role key
- [ ] Pending jobs become processing
- [ ] Jobs complete with thumbnail/quality/hash
- [ ] Failed jobs write `error_message`

## Production Verification

- [ ] Vercel build succeeds
- [ ] Env vars configured
- [ ] No service role key in frontend env
- [ ] RLS audit completed
- [ ] Beta wedding scenario completed
