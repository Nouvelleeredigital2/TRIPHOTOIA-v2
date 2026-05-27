import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
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
