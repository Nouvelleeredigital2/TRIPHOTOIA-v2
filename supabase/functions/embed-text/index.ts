// Edge Function `embed-text` — embedding texte CLIP (P2-1).
//
// Renvoie le vecteur CLIP texte (512 dims) d'une requête, dans le MÊME espace
// vectoriel que les embeddings image produits par le worker
// (worker/embedding.ts → createClipEmbedder, modèle Xenova/clip-vit-base-patch32).
// Permet la recherche sémantique texte→image via la RPC match_photo_embeddings.
//
// Auth : déployée avec verify_jwt=true → Supabase exige un JWT valide
// (le front l'attache automatiquement via supabase.functions.invoke).
//
// ⚠️ LIMITE CONNUE (2026-06) : le runtime Edge Deno de Supabase n'initialise pas
// le backend WASM d'onnxruntime-web → l'inférence échoue avec
// « Unsupported device "wasm". Should be one of: » (aucun execution provider
// enregistré), même avec env.backends.onnx.wasm.wasmPaths défini. La fonction
// se déploie et charge le modèle, mais l'inférence ONNX ne tourne pas ici.
//
// CHEMIN RECOMMANDÉ : servir cet embedding depuis le worker/VPS, qui exécute déjà
// CLIP avec succès via onnxruntime-node (worker/embedding.ts, EMBEDDING_PROVIDER=clip).
// Le front est agnostique : createEdgeTextEmbedder() n'a qu'à pointer vers
// l'endpoint qui renvoie { embedding: number[512] }. En attendant, l'UI retombe
// proprement sur le fallback mot-clé (source='fallback').
import { env, AutoTokenizer, CLIPTextModelWithProjection } from 'https://esm.sh/@huggingface/transformers@3.3.3';

env.allowLocalModels = false;
// Tentative de chargement des binaires WASM depuis un CDN (cf. limite ci-dessus).
try {
  env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
  env.backends.onnx.wasm.numThreads = 1;
} catch {
  /* config best-effort */
}

const MODEL = 'Xenova/clip-vit-base-patch32';

let tokenizerPromise: Promise<unknown> | null = null;
let modelPromise: Promise<unknown> | null = null;
const getTokenizer = () => (tokenizerPromise ??= AutoTokenizer.from_pretrained(MODEL));
const getModel = () =>
  (modelPromise ??= CLIPTextModelWithProjection.from_pretrained(MODEL, { device: 'wasm', dtype: 'fp32' }));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const { query } = await req.json().catch(() => ({ query: undefined }));
    if (typeof query !== 'string' || !query.trim()) {
      return json({ error: 'query_required' }, 400);
    }

    const tokenizer = await getTokenizer();
    const model = await getModel();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputs = (tokenizer as any)([query.trim()], { padding: true, truncation: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { text_embeds } = await (model as any)(inputs);
    const embedding = Array.from(text_embeds.normalize(2, -1).data as Iterable<number>);

    return json({ embedding, model: MODEL, dimensions: embedding.length });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});
