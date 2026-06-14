// Lanceur de dev server robuste au cwd.
// Le harness preview démarre les serveurs depuis la racine de session
// (le dossier parent), ce qui casse la résolution de postcss/tailwind et
// fait résoudre un vite fantôme. Ce script force le cwd sur la racine du
// projet AVANT de créer le serveur Vite, puis démarre Vite par programme
// (donc en utilisant le vite local du projet).
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(projectRoot);

const { createServer } = await import('vite');

const server = await createServer({
  root: projectRoot,
  configFile: `${projectRoot}/vite.config.ts`,
  server: { port: 5175, strictPort: false },
});

await server.listen();
server.printUrls();
