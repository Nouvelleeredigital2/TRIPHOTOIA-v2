/**
 * storage-migration.ts — Renommage des clés de stockage « triphotoia* » → « treephoto* ».
 *
 * Le projet a été renommé Tree Photo IA. Les anciennes données locales (thème, presets,
 * onboarding, catalogue IndexedDB…) doivent être conservées : on migre une seule fois,
 * de façon idempotente, sans perte.
 *
 * - localStorage : copie clé→clé, exécutée SYNCHRONEMENT à l'import (avant l'hydratation
 *   des stores zustand). Ce module doit donc être le PREMIER import de index.tsx.
 * - IndexedDB : copie complète des object stores vers la nouvelle base, puis suppression
 *   de l'ancienne. Asynchrone — à await dans le bootstrap avant le premier load du catalogue.
 */

const LS_FLAG = 'treephoto-ls-migrated-v1';
const IDB_FLAG = 'treephoto-idb-migrated-v1';

/** Anciennes → nouvelles clés localStorage. */
const LS_KEY_MAP: Record<string, string> = {
  'triphotoia-theme': 'treephoto-theme',
  'triphotoia-accent': 'treephoto-accent',
  'triphotoia-export-presets': 'treephoto-export-presets',
  'triphotoia-presets': 'treephoto-presets',
  'triphotoia-onboarding-completed': 'treephoto-onboarding-completed',
  'triphotoia_autoAdvance': 'treephoto_autoAdvance',
  'triphotoia_approvals': 'treephoto_approvals',
};

/** Anciennes → nouvelles bases IndexedDB. */
const IDB_NAME_MAP: Record<string, string> = {
  'triphotoia-catalogue': 'treephoto-catalogue',
  'tri-photo-analysis': 'tree-photo-analysis',
};

export function migrateLocalStorageKeys(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(LS_FLAG)) return;

  try {
    for (const [oldKey, newKey] of Object.entries(LS_KEY_MAP)) {
      const value = localStorage.getItem(oldKey);
      if (value === null) continue;
      // Ne pas écraser une valeur déjà présente sous la nouvelle clé.
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, value);
      }
      localStorage.removeItem(oldKey);
    }
    localStorage.setItem(LS_FLAG, '1');
  } catch (error) {
    console.warn('[storage-migration] localStorage migration failed:', error);
  }
}

// --- IndexedDB helpers ------------------------------------------------------

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'));
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve(); // best-effort
    request.onblocked = () => resolve();
  });
}

/** Ouvre une base à sa version courante. Renvoie null si elle n'existait pas (créée vide). */
function openExisting(name: string): Promise<IDBDatabase | null> {
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      // La base n'existait pas : onupgradeneeded crée une base vide (aucun store).
      // On la laisse telle quelle ; le onsuccess détectera l'absence de stores.
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IDB open failed'));
  });
}

interface StoreDump {
  keyPath: IDBObjectStore['keyPath'];
  autoIncrement: boolean;
  records: unknown[];
  keys: IDBValidKey[];
}

async function renameIndexedDb(oldName: string, newName: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const oldDb = await openExisting(oldName);
  if (!oldDb) return;

  const storeNames = Array.from(oldDb.objectStoreNames);
  const version = oldDb.version;

  // Ancienne base inexistante / vide : rien à migrer, on nettoie la base fantôme.
  if (storeNames.length === 0) {
    oldDb.close();
    await deleteDatabase(oldName);
    return;
  }

  // Si la nouvelle base contient déjà des données, ne pas écraser (idempotence).
  const targetCheck = await openExisting(newName);
  if (targetCheck) {
    const targetHasStores = targetCheck.objectStoreNames.length > 0;
    let targetHasData = false;
    if (targetHasStores) {
      const tnames = Array.from(targetCheck.objectStoreNames);
      const ttx = targetCheck.transaction(tnames, 'readonly');
      const counts = await Promise.all(tnames.map((s) => req(ttx.objectStore(s).count())));
      targetHasData = counts.some((c) => c > 0);
    }
    targetCheck.close();
    if (targetHasData) {
      oldDb.close();
      await deleteDatabase(oldName);
      return;
    }
    // Base cible vide : on la supprime pour la recréer proprement avec le bon schéma.
    await deleteDatabase(newName);
  }

  // 1. Dump complet de l'ancienne base.
  const dumps: Record<string, StoreDump> = {};
  const rtx = oldDb.transaction(storeNames, 'readonly');
  for (const name of storeNames) {
    const store = rtx.objectStore(name);
    const records = await req(store.getAll());
    // Clés explicites uniquement pour les stores sans keyPath (out-of-line).
    const keys = store.keyPath ? [] : await req(store.getAllKeys());
    dumps[name] = {
      keyPath: store.keyPath,
      autoIncrement: store.autoIncrement,
      records,
      keys,
    };
  }
  await txDone(rtx);
  oldDb.close();

  // 2. Création de la nouvelle base avec le même schéma.
  const newDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(newName, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of storeNames) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, {
            keyPath: dumps[name].keyPath ?? undefined,
            autoIncrement: dumps[name].autoIncrement,
          });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IDB create failed'));
  });

  // 3. Copie des enregistrements.
  const wtx = newDb.transaction(storeNames, 'readwrite');
  for (const name of storeNames) {
    const store = wtx.objectStore(name);
    const { records, keys, keyPath } = dumps[name];
    records.forEach((record, i) => {
      if (keyPath) {
        store.put(record);
      } else {
        store.put(record, keys[i]);
      }
    });
  }
  await txDone(wtx);
  newDb.close();

  // 4. Suppression de l'ancienne base.
  await deleteDatabase(oldName);
}

export async function migrateIndexedDbDatabases(): Promise<void> {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(IDB_FLAG)) return;

  try {
    for (const [oldName, newName] of Object.entries(IDB_NAME_MAP)) {
      await renameIndexedDb(oldName, newName);
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem(IDB_FLAG, '1');
  } catch (error) {
    // En cas d'échec, on ne pose pas le flag : nouvelle tentative au prochain lancement
    // (renameIndexedDb est idempotent).
    console.warn('[storage-migration] IndexedDB migration failed:', error);
  }
}

// Migration localStorage exécutée immédiatement à l'import, avant l'hydratation des stores.
migrateLocalStorageKeys();
