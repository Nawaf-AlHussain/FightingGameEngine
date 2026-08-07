/**
 * Stage Cache — IndexedDB-based cache for downloaded stage files.
 *
 * Mirrors character-cache.ts but uses a separate object store to keep
 * stages and characters independently evictable.
 *
 * Stage files (typically .def + .sff, 1-10MB each) are stored as
 * ArrayBuffers in IndexedDB so they persist across sessions.
 */

const DB_NAME = "fge-stage-cache";
const DB_VERSION = 1;
const STORE_NAME = "stage-files";

// Cache version — increment when stage files change to invalidate old cache
const CACHE_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Check if a stage is fully cached in IndexedDB.
 * @param stageId Stage ID (e.g., "DU_Campus")
 * @param expectedFiles List of files the stage should have
 * @returns true if ALL files are cached, false otherwise
 */
export async function isStageCached(
  stageId: string,
  expectedFiles: string[]
): Promise<boolean> {
  try {
    const db = await openDB();
    const versionKey = `${stageId}__version`;
    const versionReq = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(versionKey);

    const version = await new Promise<number | undefined>((resolve) => {
      versionReq.onsuccess = () => resolve(versionReq.result as number);
      versionReq.onerror = () => resolve(undefined);
    });

    if (version !== CACHE_VERSION) return false;

    // Check each file exists
    for (const filename of expectedFiles) {
      const key = `${stageId}/${filename}`;
      const req = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(key);

      const exists = await new Promise<boolean>((resolve) => {
        req.onsuccess = () => resolve(req.result !== undefined);
        req.onerror = () => resolve(false);
      });

      if (!exists) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get all cached stage files from IndexedDB.
 * @param stageId Stage ID
 * @returns Map of filename → ArrayBuffer, or empty Map if not cached
 */
export async function getCachedStage(
  stageId: string
): Promise<Map<string, ArrayBuffer>> {
  const files = new Map<string, ArrayBuffer>();

  try {
    const db = await openDB();
    const store = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME);

    const prefix = `${stageId}/`;
    const allKeysReq = store.getAllKeys();

    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      allKeysReq.onsuccess = () =>
        resolve(allKeysReq.result as IDBValidKey[]);
      allKeysReq.onerror = () => reject(allKeysReq.error);
    });

    for (const key of keys) {
      const keyStr = String(key);
      if (!keyStr.startsWith(prefix)) continue;
      if (keyStr.endsWith("__version")) continue;

      const filename = keyStr.slice(prefix.length);
      const req = store.get(key);

      const data = await new Promise<ArrayBuffer | undefined>((resolve) => {
        req.onsuccess = () => resolve(req.result as ArrayBuffer);
        req.onerror = () => resolve(undefined);
      });

      if (data) files.set(filename, data);
    }
  } catch (e) {
    console.error("[StageCache] Failed to get cached stage:", e);
  }

  return files;
}

/**
 * Save stage files to IndexedDB cache.
 * @param stageId Stage ID
 * @param files Map of filename → ArrayBuffer
 */
export async function cacheStage(
  stageId: string,
  files: Map<string, ArrayBuffer>
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Store each file
    for (const [filename, data] of files) {
      store.put(data, `${stageId}/${filename}`);
    }

    // Store cache version
    store.put(CACHE_VERSION, `${stageId}__version`);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    console.log(
      `[StageCache] Cached ${stageId}: ${files.size} files, ${(
        Array.from(files.values()).reduce((s, b) => s + b.byteLength, 0) /
        1024 /
        1024
      ).toFixed(1)}MB`
    );
  } catch (e) {
    console.error("[StageCache] Failed to cache stage:", e);
    throw e;
  }
}

/**
 * Clear the entire stage cache (for debugging/updates).
 */
export async function clearStageCache(): Promise<void> {
  try {
    const db = await openDB();
    const store = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME);
    store.clear();
    console.log("[StageCache] Cache cleared");
  } catch (e) {
    console.error("[StageCache] Failed to clear cache:", e);
  }
}
