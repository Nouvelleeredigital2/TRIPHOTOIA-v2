# Task Plan - TreePhoto

## Goal

Create and maintain a complete multi-sprint execution plan for transforming TRIPHOTOIA into TreePhoto: a cloud photo culling platform using React/Vite, Supabase, Vercel, and a VPS Worker.

## Current Status

| Phase                     | Status   | Notes                                                                                  |
| ------------------------- | -------- | -------------------------------------------------------------------------------------- |
| Read working document     | complete | Source: `C:\Users\5070 Ti\Downloads\TreePhoto_document_de_travail_Codex_ClaudeCode.md` |
| Create sprint plan        | complete | Main output: `TREEPHOTO_SPRINT_PLAN.md`                                                |
| Initialize planning files | complete | `task_plan.md`, `findings.md`, `progress.md`                                           |
| Begin Sprint 0 execution  | pending  | Requires audit commands and fixes                                                      |

## Execution Phases

1. Sprint 0: Audit and stabilization.
2. Sprint 1: Repo cleanup and conventions.
3. Sprint 2-5: Supabase foundation, dashboard, projects, layout.
4. Sprint 6-10: Cloud upload, gallery, triage, collections, duplicates.
5. Sprint 11-15: Jobs, VPS worker, analysis, smart collections, export.
6. Sprint 16-20: Search, embeddings, tags, people/faces.
7. Sprint 21-24: Wedding workflow, realtime collaboration, production, beta.

## Decisions

- Keep `src/` as active source.
- Keep local workflow alive during cloud migration.
- Use Zustand for local UI state.
- Use TanStack Query for server state.
- Use Supabase anon key in frontend only.
- Use service role key only in VPS Worker.

## Next Action

Start Sprint 0 by running:

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

Then classify failures and apply targeted fixes.

## Errors Encountered

| Error                     | Attempt | Resolution     |
| ------------------------- | ------- | -------------- |
| None during plan creation | 1       | Not applicable |
