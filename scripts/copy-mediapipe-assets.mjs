/**
 * Copie les assets MediaPipe (WASM + modèle) en local sous `public/mediapipe/`
 * pour servir la détection visage SANS dépendance CDN à l'exécution (objectif
 * « 100% navigateur » + suppression du cold-start réseau ~3s).
 *
 * - Le fileset WASM (~33 Mo) est copié depuis node_modules (jamais commité : voir
 *   .gitignore) — il est régénéré à chaque install via ce script (predev/prebuild).
 * - Le modèle `face_landmarker.task` (~3,8 Mo) est téléchargé une seule fois si
 *   absent. Source surchargeable via FACE_LANDMARKER_MODEL_URL.
 *
 * Idempotent : ne re-télécharge pas le modèle s'il existe déjà.
 */
import { cp, mkdir, access, writeFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = path.join(
  root,
  'node_modules',
  '@mediapipe',
  'tasks-vision',
  'wasm'
);
const wasmDest = path.join(root, 'public', 'mediapipe', 'wasm');
const modelDir = path.join(root, 'public', 'mediapipe', 'models');
const modelPath = path.join(modelDir, 'face_landmarker.task');
const MODEL_URL =
  process.env.FACE_LANDMARKER_MODEL_URL ||
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const exists = async (p) =>
  access(p, constants.F_OK).then(
    () => true,
    () => false
  );

async function main() {
  // 1) WASM fileset → public/mediapipe/wasm
  if (!(await exists(wasmSrc))) {
    console.error(
      '[mediapipe] fileset WASM introuvable. Lance `pnpm install` d’abord.'
    );
    process.exit(1);
  }
  await mkdir(wasmDest, { recursive: true });
  await cp(wasmSrc, wasmDest, { recursive: true });
  console.log(`[mediapipe] WASM copié → ${path.relative(root, wasmDest)}`);

  // 2) Modèle face_landmarker.task → public/mediapipe/models (une seule fois)
  await mkdir(modelDir, { recursive: true });
  if (await exists(modelPath)) {
    const { size } = await stat(modelPath);
    console.log(
      `[mediapipe] modèle déjà présent (${(size / 1e6).toFixed(1)} Mo), pas de re-téléchargement.`
    );
    return;
  }
  console.log(`[mediapipe] téléchargement du modèle depuis ${MODEL_URL} …`);
  // NON-FATAL : un échec réseau (CI hors-ligne, aléa) ne doit pas casser le build.
  // Le modèle est un asset runtime ; à défaut, la détection visage retombe sur le
  // CDN à l'exécution (variables VITE_FACE_LANDMARKER_MODEL surchargeables).
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) {
      console.warn(
        `[mediapipe] téléchargement du modèle échoué (${res.status}) — ignoré (asset runtime).`
      );
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(modelPath, buf);
    console.log(
      `[mediapipe] modèle écrit (${(buf.length / 1e6).toFixed(1)} Mo) → ${path.relative(root, modelPath)}`
    );
  } catch (err) {
    console.warn(
      `[mediapipe] téléchargement du modèle impossible (${err instanceof Error ? err.message : err}) — ignoré.`
    );
  }
}

main().catch((err) => {
  // Seule la copie WASM (locale) est critique ; le reste est best-effort.
  console.error('[mediapipe] erreur:', err);
  process.exit(1);
});
