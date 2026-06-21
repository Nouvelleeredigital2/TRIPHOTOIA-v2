# TreePhoto Worker

Background job runner for cloud projects. Polls the `jobs` table and processes
`generate_thumbnail`, `quality_analysis`, `perceptual_hash`, `semantic_embedding`
and `face_detection` jobs.

## Run

```bash
pnpm worker
```

## Smoke check

End-to-end check that the worker drains real jobs to a terminal state:

```bash
# dry-run (prints the plan, touches nothing):
pnpm smoke:worker
# live (disposable staging only — writes then deletes smoke rows):
TREEPHOTO_SMOKE_CONFIRM=1 pnpm smoke:worker
```

It seeds a temporary user + project + photo, inserts the three core pending jobs
(`generate_thumbnail`, `quality_analysis`, `perceptual_hash`), drains them through
the job runner, and asserts every job ends `completed` — or `failed` **with** an
`error_message` (never stuck in `processing`). Cleanup cascades from the temp user.
A job with an unknown `job_type` fails with an explicit `Unknown job type "..."`
message instead of a cryptic runtime error.

Required environment (worker/VPS only — never expose the service-role key to the browser):

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (trusted server only) |
| `WORKER_ID` | Optional worker identity for job locking |
| `WORKER_POLL_INTERVAL_MS` | Poll interval when idle (default 5000) |

See `.env.example` for the full list, including the embedding/face options below.

## Providers

Both AI providers default to a **deterministic, model-free stand-in** so the whole
pipeline runs in dev/CI without any model download. The stand-ins are structurally
correct (stable, normalised vectors) but not semantically meaningful — enable the
real providers on the VPS.

### Real semantic search (CLIP)

1. Install the model runtime on the VPS:
   ```bash
   pnpm add @xenova/transformers
   ```
2. Set environment:
   ```bash
   EMBEDDING_PROVIDER=clip
   EMBEDDING_MODEL=Xenova/clip-vit-base-patch32   # 512-dim, matches the vector(512) column
   ```
3. First run downloads the model (~350 MB) to the Transformers.js cache. Image bytes
   are pulled from the `project-photos` bucket via the service-role client.
4. Text-image search: pass the same CLIP text embedder to the frontend search path
   (e.g. behind a Supabase Edge Function) so `searchPhotosByText` gets real vectors.

> Not exercised in CI. Validate end-to-end on the VPS after the first model download.

### Real face recognition (ONNX)

`FACE_PROVIDER=onnx` is a documented extension point in `worker/faceDetection.ts`
(SCRFD detection + ArcFace embeddings via `onnxruntime-node`). It is intentionally
left unimplemented rather than faked, because it cannot be validated in CI. Faces are
**never auto-named** regardless of provider — naming is always a manual action, and
detection is strict opt-in per project (`projects.face_analysis_enabled`).
