// PREMIER import : migre les clés localStorage « triphotoia* » → « treephoto* »
// de façon synchrone, avant l'hydratation des stores zustand.
import { migrateIndexedDbDatabases } from './src/lib/storage-migration';
import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted Space Grotesk (replaces the Google Fonts CDN @import).
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import App from './src/App';
import './src/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Migration IndexedDB (catalogue + file d'analyse) avant le premier chargement.
async function bootstrap() {
  try {
    await migrateIndexedDbDatabases();
  } catch (error) {
    console.warn('[bootstrap] storage migration failed:', error);
  }

  const root = ReactDOM.createRoot(rootElement!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
