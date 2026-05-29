# TreePhoto Agent Guide

## Source of Truth

- The active application source is under `src/`.
- Root-level `App.tsx`, `components/`, and `services/` are legacy duplicates kept for reference only.
- New UI, store, service, and test work should target `src/` unless a task explicitly asks to migrate or delete legacy files.

## Current Product Direction

TreePhoto is centered on two local V1 experiences before cloud migration:

- Studio Grid: organize, filter, inspect, compare, search, and export.
- AutoFlow: fast immersive culling by keyboard or swipe.

AutoFlow V1 decisions are:

- `pick`
- `reject`
- `favorite`
- `review`

The local app must keep working without Supabase. Supabase is introduced later as an optional cloud source of truth.

## Verification

Use the narrowest useful test first, then broaden:

- `npm run type-check`
- `npm run lint`
- `npm run test`
- `npm run build`

For AutoFlow changes, run:

```bash
npx vitest run src/test/components/autoflow/AutoFlowMode.test.tsx
```
