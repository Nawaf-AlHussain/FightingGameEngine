/**
 * WASM Asset Injector — Injects downloaded character files into the
 * Emscripten MEMFS (in-memory virtual filesystem).
 *
 * The WASM engine reads character files from MEMFS. This module writes
 * downloaded files into MEMFS so the engine can load them via
 * startDirectMatch() — the engine doesn't know the difference between
 * preloaded files (game.data) and injected files.
 *
 * Emscripten FS API:
 * - Module.FS.mkdir(path) — create directory
 * - Module.FS.writeFile(path, data) — write file (Uint8Array or ArrayBuffer)
 * - Module.FS.readFile(path) — read file (for verification)
 * - Module.FS.analyzePath(path) — check if path exists
 */

import type { GameInstance } from "@/lib/wasm-loader";

/**
 * Inject character files into the WASM filesystem.
 *
 * @param game The loaded GameInstance
 * @param charId Character ID (e.g., "KnightmareSuperman")
 * @param files Map of filename → ArrayBuffer
 * @returns true if all files were injected successfully
 */
export async function injectCharacterIntoWasm(
  game: GameInstance,
  charId: string,
  files: Map<string, ArrayBuffer>
): Promise<boolean> {
  const charPath = `/chars/${charId}`;

  // Emscripten FS is accessed via Module.FS
  // The FS object is available after runtime initialization
  const FS = (game.Module as unknown as {
    FS?: {
      mkdir: (path: string) => void;
      writeFile: (path: string, data: Uint8Array | ArrayBuffer) => void;
      analyzePath: (path: string) => { exists: boolean };
      readdir: (path: string) => string[];
    };
  }).FS;

  if (!FS) {
    console.error("[WasmInjector] Module.FS not available — runtime not ready");
    return false;
  }

  try {
    // Create the character directory if it doesn't exist
    const pathCheck = FS.analyzePath(charPath);
    if (!pathCheck.exists) {
      // Create parent directories as needed
      const parts = charPath.split("/").filter(Boolean);
      let currentPath = "";
      for (const part of parts) {
        currentPath += "/" + part;
        const check = FS.analyzePath(currentPath);
        if (!check.exists) {
          FS.mkdir(currentPath);
        }
      }
    }

    // Write each file
    let injected = 0;
    for (const [filename, data] of files) {
      const filePath = `${charPath}/${filename}`;
      try {
        FS.writeFile(filePath, new Uint8Array(data));
        injected++;
      } catch (e) {
        console.error(`[WasmInjector] Failed to write ${filePath}:`, e);
      }
    }

    console.log(
      `[WasmInjector] Injected ${charId}: ${injected}/${files.size} files into ${charPath}`
    );

    // Verify by listing directory
    try {
      const dirContents = FS.readdir(charPath);
      console.log(
        `[WasmInjector] ${charPath} contents:`,
        dirContents.filter((f) => f !== "." && f !== "..")
      );
    } catch {
      // readdir might fail, but files may still be there
    }

    return injected === files.size;
  } catch (e) {
    console.error(`[WasmInjector] Failed to inject ${charId}:`, e);
    return false;
  }
}

/**
 * Check if a character is already loaded in the WASM filesystem.
 * Useful to avoid re-injecting files that are already there.
 */
export function isCharacterInWasm(
  game: GameInstance,
  charId: string
): boolean {
  const FS = (game.Module as unknown as {
    FS?: {
      analyzePath: (path: string) => { exists: boolean };
    };
  }).FS;

  if (!FS) return false;

  const charPath = `/chars/${charId}`;
  return FS.analyzePath(charPath).exists;
}

/**
 * Inject stage files into the WASM filesystem.
 *
 * Stage files are injected FLAT into /stages/ (not in a subfolder) because
 * startDirectMatch() builds the path as "<assetFolder>stages/<stagePath>"
 * and stage .def files reference their sprites as "stages/<file>.sff".
 *
 * @param game The loaded GameInstance
 * @param stageId Stage ID (e.g., "DU_Campus") — used for the .def filename
 * @param files Map of filename → ArrayBuffer (e.g., "DU_Campus.def" → data)
 * @returns true if all files were injected successfully
 */
export async function injectStageIntoWasm(
  game: GameInstance,
  stageId: string,
  files: Map<string, ArrayBuffer>
): Promise<boolean> {
  const stagesPath = `/stages`;

  const FS = (game.Module as unknown as {
    FS?: {
      mkdir: (path: string) => void;
      writeFile: (path: string, data: Uint8Array | ArrayBuffer) => void;
      analyzePath: (path: string) => { exists: boolean };
      readdir: (path: string) => string[];
    };
  }).FS;

  if (!FS) {
    console.error("[WasmInjector] Module.FS not available — runtime not ready");
    return false;
  }

  try {
    // /stages/ already exists (bundled stage is preloaded there), but ensure
    const pathCheck = FS.analyzePath(stagesPath);
    if (!pathCheck.exists) {
      const parts = stagesPath.split("/").filter(Boolean);
      let currentPath = "";
      for (const part of parts) {
        currentPath += "/" + part;
        const check = FS.analyzePath(currentPath);
        if (!check.exists) {
          FS.mkdir(currentPath);
        }
      }
    }

    // Write each file flat into /stages/<filename>
    let injected = 0;
    for (const [filename, data] of files) {
      const filePath = `${stagesPath}/${filename}`;
      try {
        FS.writeFile(filePath, new Uint8Array(data));
        injected++;
      } catch (e) {
        console.error(`[WasmInjector] Failed to write ${filePath}:`, e);
      }
    }

    console.log(
      `[WasmInjector] Injected stage ${stageId}: ${injected}/${files.size} files into ${stagesPath}/`
    );

    return injected === files.size;
  } catch (e) {
    console.error(`[WasmInjector] Failed to inject stage ${stageId}:`, e);
    return false;
  }
}

/**
 * Check if a stage is already loaded in the WASM filesystem.
 * A stage is "loaded" if its .def file exists at /stages/<stageId>.def
 */
export function isStageInWasm(
  game: GameInstance,
  stageId: string
): boolean {
  const FS = (game.Module as unknown as {
    FS?: {
      analyzePath: (path: string) => { exists: boolean };
    };
  }).FS;

  if (!FS) return false;

  const stageDefPath = `/stages/${stageId}.def`;
  return FS.analyzePath(stageDefPath).exists;
}
