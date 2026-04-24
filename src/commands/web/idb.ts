/**
 * Minimal IndexedDB wrapper for project persistence in the Web build.
 * Mirrors the SQLite schema used by the Tauri backend.
 */

const DB_NAME = 'storyboard';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  mode: IDBTransactionMode,
): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
  return openDb().then((db) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return { store, done };
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface IdbProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
  nodesJson: string;
  edgesJson: string;
  viewportJson: string;
  historyJson: string;
  scriptMd: string;
  scriptSourceFileName: string;
  scriptImportedAt: number | null;
  scriptAnalysisJson: string;
}

export interface IdbProjectSummaryRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
}

export async function idbListProjectSummaries(): Promise<IdbProjectSummaryRecord[]> {
  const { store, done } = await tx('readonly');
  const all = await reqToPromise(store.getAll());
  await done;
  return all.map((r: IdbProjectRecord) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    nodeCount: r.nodeCount,
  }));
}

export async function idbGetProjectRecord(projectId: string): Promise<IdbProjectRecord | null> {
  const { store, done } = await tx('readonly');
  const result = await reqToPromise(store.get(projectId));
  await done;
  return (result as IdbProjectRecord) ?? null;
}

export async function idbUpsertProjectRecord(record: IdbProjectRecord): Promise<void> {
  const { store, done } = await tx('readwrite');
  store.put(record);
  await done;
}

export async function idbUpdateProjectViewport(
  projectId: string,
  viewportJson: string,
): Promise<void> {
  const { store, done } = await tx('readwrite');
  const existing = await reqToPromise(store.get(projectId));
  if (existing) {
    (existing as IdbProjectRecord).viewportJson = viewportJson;
    store.put(existing);
  }
  await done;
}

export async function idbUpdateProjectScriptMd(
  projectId: string,
  scriptMd: string,
): Promise<void> {
  const { store, done } = await tx('readwrite');
  const existing = await reqToPromise(store.get(projectId));
  if (existing) {
    (existing as IdbProjectRecord).scriptMd = scriptMd;
    store.put(existing);
  }
  await done;
}

export async function idbRenameProject(
  projectId: string,
  name: string,
  updatedAt: number,
): Promise<void> {
  const { store, done } = await tx('readwrite');
  const existing = await reqToPromise(store.get(projectId));
  if (existing) {
    const rec = existing as IdbProjectRecord;
    rec.name = name;
    rec.updatedAt = updatedAt;
    store.put(rec);
  }
  await done;
}

export async function idbDeleteProject(projectId: string): Promise<void> {
  const { store, done } = await tx('readwrite');
  store.delete(projectId);
  await done;
}
