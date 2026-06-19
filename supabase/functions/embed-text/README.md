# Edge Function `embed-text`

Embedding **texte CLIP** (512 dims) pour la recherche sémantique texte→image (audit P2-1).
Renvoie un vecteur dans le **même espace** que les embeddings image du worker
(`worker/embedding.ts` → `createClipEmbedder`, modèle `Xenova/clip-vit-base-patch32`),
consommé par la RPC `match_photo_embeddings`.

## Contrat

`POST /functions/v1/embed-text` (JWT requis)

```json
// requête
{ "query": "coucher de soleil sur la plage" }
// réponse
{ "embedding": [/* 512 nombres */], "model": "Xenova/clip-vit-base-patch32", "dimensions": 512 }
```

Le front l'appelle via `createEdgeTextEmbedder()` (src/features/cloud-projects/cloudSemanticSearch.ts),
passé à `searchPhotosByText({ embedText })`. Si l'appel échoue, l'UI retombe
proprement sur le fallback mot-clé (`source: 'fallback'`).

## Déploiement

```bash
supabase functions deploy embed-text   # verify_jwt activé
```

## ⚠️ Limite connue (2026-06)

Le runtime **Edge Deno** de Supabase n'initialise pas le backend WASM
d'`onnxruntime-web` : l'inférence échoue avec
`Unsupported device "wasm". Should be one of:` (aucun execution provider),
même avec `env.backends.onnx.wasm.wasmPaths` défini. La fonction se déploie et
charge le modèle, mais **l'inférence ONNX ne tourne pas dans l'edge**.

### Chemin recommandé

Servir cet embedding depuis le **worker/VPS**, qui exécute déjà CLIP avec succès
via `onnxruntime-node` (`EMBEDDING_PROVIDER=clip`). Exposer un petit endpoint HTTP
authentifié qui appelle `createClipEmbedder(env).embedText(query)` et renvoie le
même JSON `{ embedding }`. Côté front, il suffit de pointer `createEdgeTextEmbedder`
vers cet endpoint — le reste du câblage (UI, fallback, RPC) est déjà en place.

En l'état, l'UI de recherche texte est fonctionnelle et dégrade gracieusement
tant que l'embedder texte n'est pas opérationnel.
