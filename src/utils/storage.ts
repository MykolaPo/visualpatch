import type { ProjectSnapshot } from '../types/editor';

const DB_NAME = 'visualpatch_db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

export interface SavedProjectMeta {
  id: string;
  name: string;
  sourceUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  updatedAt: string;
  elementCount: number;
  operationCount: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'project.id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProjectSnapshot(snapshot: ProjectSnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(snapshot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(projectId);
    req.onsuccess = () => resolve((req.result as ProjectSnapshot) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listSavedProjects(): Promise<SavedProjectMeta[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const items = (req.result as ProjectSnapshot[]) || [];
      const metas = items
        .map((s) => ({
          id: s.project.id,
          name: s.project.name,
          sourceUrl: s.project.sourceUrl,
          canvasWidth: s.project.canvasWidth,
          canvasHeight: s.project.canvasHeight,
          updatedAt: s.project.updatedAt,
          elementCount: s.elements.filter((e) => !e.deleted).length,
          operationCount: s.operations.length,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(metas);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSavedProject(projectId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
