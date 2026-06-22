import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Le Web Worker d'analyse charge MediaPipe en import dynamique (code-splitting).
    // Le format `iife` par défaut ne supporte pas le code-splitting dans un worker ;
    // `es` est requis (navigateurs modernes, worker `{ type: 'module' }`).
    worker: {
      format: 'es',
    },
    build: {
      rollupOptions: {
        output: {
          // Split heavy, rarely-changing vendor libs out of the app entry chunk
          // so the browser caches them across deploys and the initial bundle shrinks.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('@tanstack')) return 'vendor-tanstack';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('jszip')) return 'vendor-jszip';
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/') ||
              id.includes('/react-hook-form/') ||
              id.includes('/react-dropzone/') ||
              id.includes('/react-hot-toast/')
            ) {
              return 'vendor-react';
            }
            return 'vendor';
          },
        },
      },
    },
    server: {
      port: 4110,
      hmr: false, // Désactiver HMR pour éviter les erreurs WebSocket
      watch: {
        usePolling: true,
      },
      // Configuration pour éviter les erreurs WebSocket
      host: 'localhost',
      strictPort: true,
    },
  };
});
