import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Les tests d'intégration lourds montent tout <App/> sous jsdom : 5 s (défaut)
    // provoquait des timeouts intermittents en suite complète sous charge (flakiness
    // signalée par l'audit §6). On laisse une marge confortable.
    testTimeout: 20000,
    hookTimeout: 20000,
    setupFiles: [
      './src/test/setup.ts',
      './src/test/vitest-setup.ts',
      './src/test/setup-globals.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
