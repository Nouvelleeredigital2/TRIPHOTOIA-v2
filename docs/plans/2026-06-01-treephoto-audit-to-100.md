# TreePhoto Audit To 100 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the current TreePhoto checkpoint into a fully audited, beta-ready application with local workflow, cloud persistence, worker processing, documentation, and production deployment checks completed.

**Architecture:** Keep local mode as a first-class fallback while hardening Supabase as the source of truth for cloud projects. Treat worker processing, storage, RLS, and frontend state sync as explicit integration boundaries with automated tests and manual smoke scripts.

**Tech Stack:** React 19, Vite, TypeScript, Zustand, TanStack Query, Supabase, Node.js TypeScript worker, Vitest, ESLint, Vercel.

---

## Current Verified Baseline

Last known good checkpoint:

- Branch: `codex/autoflow-local-foundation`
- Commit: `0bb2d82 checkpoint: stabilize TreePhoto roadmap implementation`
- `npm run type-check`: pass
- `npm run lint`: pass
- `npm run build`: pass
- `npx vitest run --sequence.concurrent false`: 39 files pass, 218 tests pass

This plan starts from that checkpoint.

---

## Definition Of 100%

TreePhoto is considered 100% for the audited V1 beta when all of these are true:

- Local workflow works end-to-end: import -> analysis -> Studio Grid -> AutoFlow -> duplicates -> smart collections -> export ZIP.
- Cloud workflow works end-to-end on a real Supabase staging project: auth -> project -> upload -> jobs -> worker -> decisions -> refresh persistence -> export.
- Supabase migrations apply cleanly from an empty database.
- RLS policies are tested for allowed and denied access.
- Worker runs outside the frontend and processes real pending jobs.
- No frontend service role key exposure is possible.
- Production build is deployable to Vercel.
- User documentation describes installation, local mode, cloud mode, worker mode, and beta workflow.
- Test suite, type-check, lint, and build pass after every phase.
- Git history has one commit per phase.

---

## Phase 1: Repository Hygiene And Release Baseline

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `README.md` if present
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/USER_GUIDE.md`
- Create: `docs/RELEASE_CHECKLIST.md`

**Step 1: Confirm package manager**

Run:

```bash
git status --short
pnpm --version
npm --version
```

Expected:

- Working tree clean before phase work.
- `pnpm-lock.yaml` is authoritative.
- `package-lock.json` remains removed.

**Step 2: Add package-manager declaration**

Modify `package.json`:

```json
{
  "packageManager": "pnpm@10.22.0"
}
```

Use the installed pnpm version if different.

**Step 3: Add release checklist**

Create `docs/RELEASE_CHECKLIST.md` with:

```markdown
# TreePhoto Release Checklist

## Local Verification
- [ ] `pnpm install --frozen-lockfile`
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
```

**Step 4: Run verification**

Run:

```bash
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

Expected: all pass.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml docs/RELEASE_CHECKLIST.md AGENTS.md CLAUDE.md docs/USER_GUIDE.md
git commit -m "chore: document release baseline"
```

---

## Phase 2: Local Workflow Hardening

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/ingestion/IngestionTab.tsx`
- Modify: `src/features/triage/TriageTab.tsx`
- Modify: `src/components/autoflow/AutoFlowMode.tsx`
- Modify: `src/features/export/ExportTab.tsx`
- Test: `src/test/integration/photoWorkflow.test.tsx`
- Test: `src/test/components/autoflow/AutoFlowMode.test.tsx`
- Test: `src/test/features/export/exportSelection.test.ts`

**Step 1: Add failing end-to-end local workflow test**

Extend `src/test/integration/photoWorkflow.test.tsx` with one test that verifies:

- photos can be added to store
- analysis metadata exists
- AutoFlow opens from filtered grid
- Pick decision updates local store
- Export tab receives picks-only filter

Expected test name:

```ts
it('completes local import to AutoFlow pick to export handoff', async () => {
  // arrange photo in store with analysis
  // open triage
  // open AutoFlow
  // pick photo
  // click export picks
  // assert setPendingExportFilterMode('picks-only')
});
```

**Step 2: Run failing test**

```bash
pnpm vitest run src/test/integration/photoWorkflow.test.tsx --sequence.concurrent false
```

Expected: fail only if the handoff is incomplete.

**Step 3: Fix minimal UI/store gaps**

If failure shows stale selected state or wrong filter handoff, patch only:

- `src/App.tsx`
- `src/features/triage/TriageTab.tsx`
- `src/components/autoflow/AutoFlowMode.tsx`
- `src/features/export/ExportTab.tsx`

**Step 4: Verify**

```bash
pnpm vitest run src/test/integration/photoWorkflow.test.tsx src/test/components/autoflow/AutoFlowMode.test.tsx src/test/features/export/exportSelection.test.ts --sequence.concurrent false
pnpm type-check
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/App.tsx src/features/ingestion/IngestionTab.tsx src/features/triage/TriageTab.tsx src/components/autoflow/AutoFlowMode.tsx src/features/export/ExportTab.tsx src/test/integration/photoWorkflow.test.tsx src/test/components/autoflow/AutoFlowMode.test.tsx src/test/features/export/exportSelection.test.ts
git commit -m "test: harden local workflow handoff"
```

---

## Phase 3: Supabase Migration And RLS Audit

**Files:**
- Modify: `supabase/migrations/20260528102000_treephoto_cloud_v1.sql`
- Modify: `supabase/migrations/20260529120000_treephoto_embeddings_v2.sql`
- Modify: `supabase/migrations/20260529140000_treephoto_faces_v2.sql`
- Modify: `supabase/migrations/20260529160000_fix_share_links_exposure.sql`
- Create: `supabase/README.md`
- Test: `src/test/supabase/cloudSchemaMigration.test.ts`
- Test: `src/test/supabase/embeddingsSchemaMigration.test.ts`
- Test: `src/test/supabase/facesSchemaMigration.test.ts`
- Test: `src/test/supabase/shareLinksFixMigration.test.ts`
- Create: `src/test/supabase/rlsPolicies.test.ts`

**Step 1: Write RLS policy coverage test**

Create `src/test/supabase/rlsPolicies.test.ts` that reads migration SQL and asserts:

- RLS is enabled for all user-owned tables.
- `organizations`, `organization_members`, `projects`, `photos`, `photo_analysis`, `collections`, `collection_photos`, `jobs`, `people`, `photo_faces`, `photo_embeddings` have policies or documented exceptions.
- share links do not expose deleted or private rows without token checks.
- no policy grants broad `using (true)` on private tables.

**Step 2: Run RLS tests**

```bash
pnpm vitest run src/test/supabase --sequence.concurrent false
```

Expected: fail if policies are missing or too broad.

**Step 3: Patch migrations**

Patch SQL to ensure:

```sql
alter table public.projects enable row level security;
alter table public.photos enable row level security;
alter table public.photo_analysis enable row level security;
alter table public.jobs enable row level security;
```

Add policies using organization membership checks. Avoid service role dependency in policies; service role bypasses RLS.

**Step 4: Add Supabase README**

Create `supabase/README.md`:

```markdown
# Supabase Setup

1. Create a Supabase project.
2. Apply migrations in timestamp order.
3. Create private bucket `project-photos`.
4. Configure frontend env:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Configure worker env:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or Vercel client env.
```

**Step 5: Verify**

```bash
pnpm vitest run src/test/supabase --sequence.concurrent false
pnpm type-check
pnpm lint
```

Expected: pass.

**Step 6: Commit**

```bash
git add supabase src/test/supabase
git commit -m "test: audit Supabase migrations and RLS"
```

---

## Phase 4: Real Cloud Smoke Harness

**Files:**
- Create: `scripts/cloud-smoke.ts`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `docs/USER_GUIDE.md`
- Test: `src/test/features/cloud-projects/cloudProjects.test.ts`
- Test: `src/test/features/cloud-projects/cloudUpload.test.ts`
- Test: `src/test/features/cloud-projects/cloudDecisions.test.ts`

**Step 1: Add script command**

Modify `package.json`:

```json
{
  "scripts": {
    "smoke:cloud": "tsx scripts/cloud-smoke.ts"
  }
}
```

**Step 2: Create cloud smoke script**

Create `scripts/cloud-smoke.ts` that:

- reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- fails fast if missing
- checks database connection
- checks bucket `project-photos`
- inserts a smoke organization/project/photo/job
- updates a photo decision
- deletes smoke rows

Expected output:

```txt
cloud smoke: ok
```

**Step 3: Add dry-run guard**

Script must require:

```txt
TREEPHOTO_SMOKE_CONFIRM=1
```

without it, print what would run and exit 0.

**Step 4: Verify unit tests**

```bash
pnpm vitest run src/test/features/cloud-projects --sequence.concurrent false
pnpm type-check
```

Expected: pass.

**Step 5: Manual staging run**

Run only with staging credentials:

```bash
TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:cloud
```

Expected: `cloud smoke: ok`.

**Step 6: Commit**

```bash
git add package.json .env.example scripts/cloud-smoke.ts docs/USER_GUIDE.md src/test/features/cloud-projects
git commit -m "chore: add Supabase cloud smoke check"
```

---

## Phase 5: Worker End-To-End Hardening

**Files:**
- Modify: `worker/config.ts`
- Modify: `worker/jobRunner.ts`
- Modify: `worker/index.ts`
- Modify: `worker/embedding.ts`
- Modify: `worker/faceDetection.ts`
- Modify: `worker/README.md`
- Create: `scripts/worker-smoke.ts`
- Modify: `package.json`
- Test: `src/test/worker/jobRunner.test.ts`
- Test: `src/test/worker/config.test.ts`
- Test: `src/test/worker/embedding.test.ts`
- Test: `src/test/worker/faceDetection.test.ts`

**Step 1: Add worker smoke script**

Modify `package.json`:

```json
{
  "scripts": {
    "smoke:worker": "tsx scripts/worker-smoke.ts"
  }
}
```

**Step 2: Create `scripts/worker-smoke.ts`**

Script should:

- require `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TREEPHOTO_SMOKE_CONFIRM=1`
- insert smoke photo row
- insert pending jobs: `generate_thumbnail`, `quality_analysis`, `perceptual_hash`
- call worker job runner once
- assert jobs are completed or failed with explicit `error_message`
- clean up smoke rows

**Step 3: Strengthen worker job contracts**

In `worker/jobRunner.ts`, enforce:

- pending -> processing -> completed
- pending -> processing -> failed
- failed must write `error_message`
- worker must not leave jobs stuck processing after uncaught errors

**Step 4: Verify worker tests**

```bash
pnpm vitest run src/test/worker --sequence.concurrent false
pnpm type-check
```

Expected: pass.

**Step 5: Manual staging smoke**

```bash
TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:worker
```

Expected: `worker smoke: ok`.

**Step 6: Commit**

```bash
git add worker scripts/worker-smoke.ts package.json src/test/worker
git commit -m "test: add worker smoke coverage"
```

---

## Phase 6: Real AI Provider Boundary

**Files:**
- Modify: `worker/embedding.ts`
- Modify: `worker/faceDetection.ts`
- Modify: `worker/config.ts`
- Modify: `.env.example`
- Modify: `worker/README.md`
- Test: `src/test/worker/embedding.test.ts`
- Test: `src/test/worker/faceDetection.test.ts`

**Step 1: Document provider modes**

In `.env.example` and `worker/README.md`, document:

```txt
EMBEDDING_PROVIDER=deterministic | clip
FACE_PROVIDER=deterministic | disabled
```

Face provider stays `deterministic | disabled` until a real ONNX model is integrated. Do not pretend it is production face recognition.

**Step 2: Add explicit production guard**

In `worker/config.ts`, add:

- if `NODE_ENV=production` and `EMBEDDING_PROVIDER=deterministic`, log a warning
- if `NODE_ENV=production` and `FACE_PROVIDER=deterministic`, log a warning
- if `FACE_PROVIDER=onnx`, throw `Unsupported provider: onnx` until implemented

**Step 3: Add tests**

Test:

- deterministic embedding remains stable
- unsupported providers fail clearly
- disabled face provider returns no face records with explicit reason

**Step 4: Verify**

```bash
pnpm vitest run src/test/worker --sequence.concurrent false
pnpm type-check
```

Expected: pass.

**Step 5: Commit**

```bash
git add worker .env.example src/test/worker
git commit -m "chore: clarify AI provider boundaries"
```

---

## Phase 7: Production Security Audit

**Files:**
- Modify: `src/lib/supabase.ts`
- Modify: `src/lib/supabaseConfig.ts`
- Modify: `.env.example`
- Modify: `vercel.json`
- Create: `docs/SECURITY.md`
- Test: `src/test/security/security.test.ts`
- Test: `src/test/security/security.test.tsx`
- Test: `src/test/lib/supabaseConfig.test.ts`

**Step 1: Add service-role exposure tests**

Extend `src/test/security/security.test.ts` to scan:

- `.env.example`
- `src/`
- `vercel.json`

Assert:

- no `SUPABASE_SERVICE_ROLE_KEY` usage under `src/`
- no `VITE_SUPABASE_SERVICE_ROLE_KEY`
- no service role key in Vercel public env examples

**Step 2: Add `docs/SECURITY.md`**

Include:

- frontend env rules
- worker env rules
- RLS assumptions
- share link limitations
- face data deletion policy
- beta data warning

**Step 3: Verify**

```bash
pnpm vitest run src/test/security src/test/lib/supabaseConfig.test.ts --sequence.concurrent false
pnpm lint
```

Expected: pass.

**Step 4: Commit**

```bash
git add src/test/security src/test/lib/supabaseConfig.test.ts src/lib/supabase.ts src/lib/supabaseConfig.ts .env.example vercel.json docs/SECURITY.md
git commit -m "test: enforce frontend security boundaries"
```

---

## Phase 8: UX Beta Pass

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/CollectionSidebar.tsx`
- Modify: `src/components/autoflow/AutoFlowMode.tsx`
- Modify: `src/features/triage/TriageTab.tsx`
- Modify: `src/features/export/ExportTab.tsx`
- Modify: `src/features/cloud-projects/CloudProjectsDashboard.tsx`
- Test: `src/test/accessibility/accessibility.test.tsx`
- Test: `src/test/compatibility/compatibility.test.tsx`
- Test: `src/test/regression/regression.test.tsx`

**Step 1: Run app locally**

```bash
pnpm dev
```

Open:

```txt
http://localhost:4110
```

**Step 2: Manual UX smoke**

Check:

- first viewport is application, not landing page
- Import, Triage, Export navigation visible
- AutoFlow button appears after analyzed photos
- no text overflow on desktop width 1440
- no text overflow on mobile width 390
- dialogs have titles and descriptions
- keyboard shortcuts do not trigger while typing in inputs

**Step 3: Add regression tests for critical UX**

Add tests for:

- primary tabs exist by role
- AutoFlow dashboard can be opened
- Export picks action sets correct filter
- dialogs have accessible descriptions

**Step 4: Verify**

```bash
pnpm vitest run src/test/accessibility src/test/compatibility src/test/regression --sequence.concurrent false
pnpm build
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/App.tsx src/components src/features src/test/accessibility src/test/compatibility src/test/regression
git commit -m "fix: polish beta UX and accessibility"
```

---

## Phase 9: Documentation Completion

**Files:**
- Modify: `docs/USER_GUIDE.md`
- Create: `docs/LOCAL_MODE.md`
- Create: `docs/CLOUD_MODE.md`
- Create: `docs/WORKER_DEPLOYMENT.md`
- Create: `docs/BETA_WEDDING_SCENARIO.md`
- Modify: `README.md` if present

**Step 1: Local mode doc**

Create `docs/LOCAL_MODE.md` with:

- install
- run dev
- import photos
- analyze
- AutoFlow
- duplicates
- smart collections
- export ZIP

**Step 2: Cloud mode doc**

Create `docs/CLOUD_MODE.md` with:

- Supabase env
- migrations
- storage bucket
- auth
- project dashboard
- upload
- decision persistence

**Step 3: Worker deployment doc**

Create `docs/WORKER_DEPLOYMENT.md` with:

- VPS prerequisites
- env vars
- `pnpm worker`
- process manager example
- logs
- failure recovery

**Step 4: Beta wedding scenario doc**

Create `docs/BETA_WEDDING_SCENARIO.md` with:

```txt
Create wedding project
Import sample set
Analyze
Run AutoFlow
Resolve duplicates
Use smart collections
Export picks
Export chapters
Verify refresh persistence in cloud mode
```

**Step 5: Verify docs links**

Run:

```bash
pnpm lint
```

Expected: pass.

**Step 6: Commit**

```bash
git add docs README.md
git commit -m "docs: complete beta operating guides"
```

---

## Phase 10: Final Production Gate

**Files:**
- Modify: `docs/RELEASE_CHECKLIST.md`
- Create: `docs/AUDIT_FINAL_REPORT.md`

**Step 1: Run full verification**

Run:

```bash
pnpm install --frozen-lockfile
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

Expected:

- all pass
- no Vite missing asset warning
- no Browserslist stale warning
- no failing tests

**Step 2: Run smoke checks**

If staging env is available:

```bash
TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:cloud
TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:worker
```

Expected:

- both pass

If staging env is unavailable, document as blocked in `docs/AUDIT_FINAL_REPORT.md`.

**Step 3: Write final audit report**

Create `docs/AUDIT_FINAL_REPORT.md`:

```markdown
# TreePhoto Final Audit Report

## Verification
- type-check:
- lint:
- tests:
- build:
- cloud smoke:
- worker smoke:

## Completed
- Local workflow:
- Cloud workflow:
- Worker:
- Security:
- Documentation:
- Production:

## Known Limits
- Real face model:
- Real CLIP model:
- Staging credentials:

## Beta Decision
Ready / Not Ready
```

**Step 4: Commit**

```bash
git add docs/AUDIT_FINAL_REPORT.md docs/RELEASE_CHECKLIST.md
git commit -m "docs: add final audit report"
```

---

## Final Verification Commands

Run from repository root:

```bash
pnpm install --frozen-lockfile
pnpm type-check
pnpm lint
pnpm test
pnpm build
git status --short
```

Expected:

- all commands pass
- `git status --short` is empty

---

## Commit Strategy

Use one commit per phase:

1. `chore: document release baseline`
2. `test: harden local workflow handoff`
3. `test: audit Supabase migrations and RLS`
4. `chore: add Supabase cloud smoke check`
5. `test: add worker smoke coverage`
6. `chore: clarify AI provider boundaries`
7. `test: enforce frontend security boundaries`
8. `fix: polish beta UX and accessibility`
9. `docs: complete beta operating guides`
10. `docs: add final audit report`

---

## What Cannot Be Claimed Without External Credentials

Do not mark these complete unless a real staging Supabase project and worker runtime are available:

- storage upload to private bucket
- RLS behavior against real authenticated users
- worker polling real jobs
- Vercel deployment smoke test
- cloud refresh persistence after browser reload

If credentials are not available, the final audit report must say:

```txt
Local application: verified
Cloud code and migrations: statically verified
Cloud runtime: blocked pending staging credentials
Worker runtime: blocked pending staging credentials/VPS
```

