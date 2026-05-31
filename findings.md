# Findings - TreePhoto

## Project Understanding

- Current app is TRIPHOTOIA, a React/Vite/TypeScript local photo culling application.
- Target product is TreePhoto, a cloud culling studio for photographers.
- Primary vertical: wedding, event, and studio photography.
- Target stack: React, TypeScript, Vite, Tailwind, Supabase Cloud, Vercel, VPS Worker.

## Existing Capabilities

- Photo import.
- Local/browser analysis.
- Worker-based analysis.
- Rating 0-5.
- Pick/reject.
- Color labels.
- Collections and smart collections.
- Duplicate detection.
- Comparison and fullscreen review.
- Export.
- Local persistence.

## Migration Constraints

- Do not rewrite the whole app.
- Do not migrate all Zustand state at once.
- Keep local mode working.
- Introduce Supabase progressively.
- Heavy processing belongs on VPS Worker, not Vercel.
- RLS is mandatory for cloud data.
- Service role key must never reach frontend code.

## Planning Output

- Main sprint roadmap created in `TREEPHOTO_SPRINT_PLAN.md`.
- The plan spans Sprint 0 through Sprint 24.
- The roadmap separates stabilization, cloud foundation, upload, cloud triage, jobs, worker, smart collections, search, people/faces, wedding workflow, realtime, production, and beta.
