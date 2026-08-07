/**
 * Character Cache — IndexedDB-based cache for downloaded character files.
 *
 * Stores character files (sprites, sounds, configs) as ArrayBuffers in
 * IndexedDB so they persist across sessions. This avoids re-downloading
 * characters every time the user selects them.
 *
 * Why IndexedDB (not localStorage)?
 * - localStorage has a 5MB limit — too small for character files (4-70MB each)
 * - IndexedDB can store hundreds of MB per origin
 * - IndexedDB supports Blobs/ArrayBuffers natively
 */

const DB_NAME = "fge-character-cache";
const DB_VERSION = 1;
const STORE_NAME = "character-files";

// Cache version — increment when character files change to invalidate old cache.
// Bumped to 6 on Aug 6, 2026: engine now follows SFF v2 palette links
// (palettes with mDataLength=0 that reference another palette via mIndex).
// Old cached character files were processed by the old palette code — bumping
// forces re-download.
const CACHE_VERSION = 6;

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
 * Check if a character is fully cached in IndexedDB.
 * @param charId Character ID (e.g., "KnightmareSuperman")
 * @param expectedFiles List of files the character should have
 * @returns true if ALL files are cached, false otherwise
 */
export async function isCharacterCached(
  charId: string,
  expectedFiles: string[]
): Promise<boolean> {
  try {
    const db = await openDB();
    const versionKey = `${charId}__version`;
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
      const key = `${charId}/${filename}`;
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
 * Get all cached character files from IndexedDB.
 * @param charId Character ID
 * @returns Map of filename → ArrayBuffer, or empty Map if not cached
 */
export async function getCachedCharacter(
  charId: string
): Promise<Map<string, ArrayBuffer>> {
  const files = new Map<string, ArrayBuffer>();

  try {
    const db = await openDB();
    const store = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME);

    const prefix = `${charId}/`;
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
    console.error("[CharacterCache] Failed to get cached character:", e);
  }

  return files;
}

/**
 * Save character files to IndexedDB cache.
 * @param charId Character ID
 * @param files Map of filename → ArrayBuffer
 */
export async function cacheCharacter(
  charId: string,
  files: Map<string, ArrayBuffer>
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Store each file
    for (const [filename, data] of files) {
      store.put(data, `${charId}/${filename}`);
    }

    // Store cache version
    store.put(CACHE_VERSION, `${charId}__version`);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    console.log(
      `[CharacterCache] Cached ${charId}: ${files.size} files, ${(
        Array.from(files.values()).reduce((s, b) => s + b.byteLength, 0) /
        1024 /
        1024
      ).toFixed(1)}MB`
    );
  } catch (e) {
    console.error("[CharacterCache] Failed to cache character:", e);
    throw e;
  }
}

/**
 * Remove a character from the cache.
 * @param charId Character ID
 */
export async function evictCharacter(charId: string): Promise<void> {
  try {
    const db = await openDB();
    const store = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME);

    const prefix = `${charId}/`;
    const allKeysReq = store.getAllKeys();

    const keys = await new Promise<IDBValidKey[]>((resolve) => {
      allKeysReq.onsuccess = () =>
        resolve(allKeysReq.result as IDBValidKey[]);
      allKeysReq.onerror = () => resolve([]);
    });

    for (const key of keys) {
      const keyStr = String(key);
      if (keyStr.startsWith(prefix) || keyStr === `${charId}__version`) {
        store.delete(key);
      }
    }
  } catch (e) {
    console.error("[CharacterCache] Failed to evict character:", e);
  }
}

/**
 * Clear the entire character cache (for debugging/updates).
 */
export async function clearCharacterCache(): Promise<void> {
  try {
    const db = await openDB();
    const store = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME);
    store.clear();
    console.log("[CharacterCache] Cache cleared");
  } catch (e) {
    console.error("[CharacterCache] Failed to clear cache:", e);
  }
}

/**
 * Get the total size of all cached characters (in bytes).
 * Useful for displaying cache usage in settings.
 */
export async function getCacheSize(): Promise<number> {
  try {
    const db = await openDB();
    const store = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME);

    const allReq = store.getAll();
    const allData = await new Promise<ArrayBuffer[]>((resolve) => {
      allReq.onsuccess = () => resolve(allReq.result as ArrayBuffer[]);
      allReq.onerror = () => resolve([]);
    });

    return allData.reduce((sum, buf) => sum + buf.byteLength, 0);
  } catch {
    return 0;
  }
}
