import type { SavedProjectPayload } from '../types/editor';

const DB_NAME = 'kinetix-studio-storage';
const STORE_NAME = 'projects';
const AUTOSAVE_KEY = 'latest';
const LIBRARY_INDEX_KEY = 'library:index';
const LIBRARY_PREFIX = 'library:project:';

export interface ProjectLibraryEntry {
  id: string;
  name: string;
  folder: string;
  savedAt: string;
  clipCount: number;
  compositionName: string;
}

function openProjectDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open project storage.'));
    request.onblocked = () => reject(new Error('Project storage is blocked by another browser tab.'));
  });
}

async function readLibraryIndex(store: IDBObjectStore): Promise<ProjectLibraryEntry[]> {
  return new Promise((resolve, reject) => {
    const request = store.get(LIBRARY_INDEX_KEY);
    request.onsuccess = () => {
      const value = request.result;
      resolve(Array.isArray(value) ? value as ProjectLibraryEntry[] : []);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not load the project library index.'));
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

export async function listSavedProjects(): Promise<ProjectLibraryEntry[]> {
  const db = await openProjectDatabase();
  try {
    return await new Promise<ProjectLibraryEntry[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      void readLibraryIndex(transaction.objectStore(STORE_NAME)).then(resolve, reject);
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not read project library.'));
    });
  } finally {
    db.close();
  }
}

export async function saveNamedProject(
  payload: SavedProjectPayload,
  entry: Omit<ProjectLibraryEntry, 'savedAt' | 'clipCount' | 'compositionName'> & { savedAt?: string }
): Promise<ProjectLibraryEntry> {
  const db = await openProjectDatabase();
  const savedAt = entry.savedAt ?? new Date().toISOString();
  const record: ProjectLibraryEntry = {
    ...entry,
    savedAt,
    clipCount: payload.clips.length,
    compositionName: payload.composition.name,
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const indexRequest = store.get(LIBRARY_INDEX_KEY);
      indexRequest.onsuccess = () => {
        const previous = Array.isArray(indexRequest.result) ? indexRequest.result as ProjectLibraryEntry[] : [];
        store.put(payload, `${LIBRARY_PREFIX}${record.id}`);
        store.put([record, ...previous.filter((item) => item.id !== record.id)], LIBRARY_INDEX_KEY);
      };
      indexRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save project to the library.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Project library save was aborted.'));
    });
    return record;
  } finally {
    db.close();
  }
}

export async function loadNamedProject(id: string): Promise<SavedProjectPayload | null> {
  const db = await openProjectDatabase();
  try {
    return await new Promise<SavedProjectPayload | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(`${LIBRARY_PREFIX}${id}`);
      request.onsuccess = () => resolve((request.result as SavedProjectPayload | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not open the selected project.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteNamedProject(id: string): Promise<void> {
  const db = await openProjectDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(LIBRARY_INDEX_KEY);
      request.onsuccess = () => {
        const previous = Array.isArray(request.result) ? request.result as ProjectLibraryEntry[] : [];
        store.delete(`${LIBRARY_PREFIX}${id}`);
        store.put(previous.filter((item) => item.id !== id), LIBRARY_INDEX_KEY);
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete project.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Project deletion was aborted.'));
    });
  } finally {
    db.close();
  }
}
