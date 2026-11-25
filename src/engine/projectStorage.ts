import type { SavedProjectPayload } from '../types/editor';

const DB_NAME = 'kinetix-studio-storage';
const STORE_NAME = 'projects';
const AUTOSAVE_KEY = 'latest';

function openProjectDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open project storage.'));
    request.onblocked = () => reject(new Error('Project storage is blocked by another browser tab.'));
  });
}

export async function saveProjectToIndexedDb(payload: SavedProjectPayload): Promise<void> {
  const db = await openProjectDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(payload, AUTOSAVE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save project media.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Project save was aborted.'));
    });
  } finally {
    db.close();
  }
}

export async function loadProjectFromIndexedDb(): Promise<SavedProjectPayload | null> {
  const db = await openProjectDatabase();
  try {
    return await new Promise<SavedProjectPayload | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(AUTOSAVE_KEY);
      request.onsuccess = () => resolve((request.result as SavedProjectPayload | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not load saved project.'));
    });
  } finally {
    db.close();
  }
}
