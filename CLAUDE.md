# TreePhoto Development Notes

## Active Codebase

Work in `src/`. The root `App.tsx`, `components/`, and `services/` folders are older duplicates and should not receive new feature work.

## AutoFlow V1 Contract

AutoFlow must operate on real imported photos adapted through `src/components/autoflow/afUtils.ts`.

Swipe queue order:

1. `review`
2. `keep`
3. `reject`

Keyboard shortcuts:

- `ArrowRight`: Pick
- `ArrowLeft`: Reject
- `ArrowUp`: Favorite and five stars
- `1-5`: manual rating without advancing
- `Escape`: return to dashboard

Decision mapping:

- `pick`: `isPick=true`, `isRejected=false`, `isFavorite=false`, `cls='keep'`
- `reject`: `isRejected=true`, `isPick=false`, `isFavorite=false`, `cls='reject'`
- `favorite`: `isPick=true`, `isRejected=false`, `isFavorite=true`, `rating=5`, `cls='keep'`
- `review`: `isPick=false`, `isRejected=false`, `isFavorite=false`, `cls='review'`

## Cloud Boundary

Keep local mode functional during every cloud migration step. Never expose Supabase service role keys in frontend code.
