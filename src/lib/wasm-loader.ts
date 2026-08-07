/**
 * WASM Game Engine Loader
 *
 * Dynamically loads the Emscripten-compiled Dolmexica Infinite WASM module
 * and provides typed wrappers for engine functions.
 */

export interface GameInstance {
  /** Emscripten module — call cwrap/ccall on this */
  Module: {
    ccall: (
      name: string,
      returnType: string | null,
      argTypes: string[],
      args: unknown[]
    ) => unknown;
    cwrap: (
      name: string,
      returnType: string | null,
      argTypes: string[]
    ) => (...args: unknown[]) => unknown;
    _main: () => void;
    _setExternalPlayerInput: (playerIndex: number, inputStr: string) => void;
    _disableExternalInput: (playerIndex: number) => void;
    _isExternalInputActive: (playerIndex: number) => number;
    _setPlayerAI: (playerIndex: number, level: number) => void;
    // State query exports
    _getPlayerLifeExport: (playerIndex: number) => number;
    _getPlayerLifeMaxExport: (playerIndex: number) => number;
    _getPlayerPowerExport: (playerIndex: number) => number;
    _isPlayerAliveExport: (playerIndex: number) => number;
    _getPlayerStateExport: (playerIndex: number) => number;
    _getPlayerRoundsWonExport: (playerIndex: number) => number;
    _getRoundNumberExport: () => number;
    _getRoundStateExport: () => number;
    _getSyncFingerprintExport: (outLo: number, outHi: number) => void;
    _setRandomSeedExport: (seed: number) => void;
    /** Emscripten heap access (for sync fingerprint) */
    HEAP8?: Int8Array;
    HEAP32?: Int32Array;
    /** Emscripten filesystem API (for injecting character files at runtime) */
    FS?: {
      mkdir: (path: string) => void;
      writeFile: (path: string, data: Uint8Array | ArrayBuffer) => void;
      readFile: (path: string) => Uint8Array;
      analyzePath: (path: string) => { exists: boolean };
      readdir: (path: string) => string[];
    };
    canvas: HTMLCanvasElement | null;
  };
}

/** Mapping from browser KeyboardEvent.code to MUGEN input characters.
 *  Note: Start (Q/Enter) is intentionally NOT in this map — it's an event,
 *  not a held state. See use-game-input.ts for Start handling (FIX-4). */
const KEY_MAP: Record<string, string> = {
  ArrowUp: "U",
  ArrowDown: "D",
  ArrowLeft: "B", // MUGEN: Back = left
  ArrowRight: "F", // MUGEN: Forward = right
  KeyZ: "a", // Light punch
  KeyX: "b", // Medium punch
  KeyC: "c", // Heavy punch
  KeyA: "x", // Light kick
  KeyS: "y", // Medium kick
  KeyD: "z", // Heavy kick
};

/** Key codes that trigger the MUGEN Start button (edge-triggered, not held) */
export const START_KEYS = ["KeyQ", "Enter"];

/**
 * Convert a set of pressed key codes to a MUGEN input string.
 * MUGEN expects characters like "U" (up), "D" (down), "a" (light punch), etc.
 * Multiple simultaneous inputs are concatenated: "Fa" = forward + light punch.
 *
 * Note: Start is NOT included — it's an edge-triggered event, not a held state (FIX-4).
 */
export function keyboardToInputString(activeKeys: Set<string>): string {
  let input = "";
  // Direction first (U/D/B/F), then actions (a/b/c/x/y/z)
  for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
    if (activeKeys.has(key)) {
      input += KEY_MAP[key];
    }
  }
  for (const key of ["KeyZ", "KeyX", "KeyC", "KeyA", "KeyS", "KeyD"]) {
    if (activeKeys.has(key)) {
      input += KEY_MAP[key];
    }
  }
  return input;
}

/**
 * Fetch the build version from /game/build-version.json.
 *
 * The build script (scripts/build-wasm.sh) writes this file with a fresh
 * timestamp + WASM sha256 on every rebuild. The loader uses it as the
 * cache-busting query string for /game/ files.
 *
 * Without this, the browser caches game.wasm?v=dev forever in local dev
 * (next.config.js falls back to "dev" when
 * NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is unset), and engine fixes never
 * reach the user's browser even after a rebuild.
 *
 * On Vercel, NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is set and used directly
 * — this fetch is redundant but harmless (the version won't change between
 * deploys, so the browser cache stays valid for the deploy's lifetime).
 *
 * Falls back to process.env.GAME_ASSET_VERSION if the fetch fails (e.g.
 * offline, or build-version.json doesn't exist yet).
 */
async function fetchBuildVersion(): Promise<string> {
  // If Vercel set a git SHA, use it directly — no need to fetch.
  const envVersion = process.env.GAME_ASSET_VERSION;
  if (envVersion && envVersion !== "dev") {
    return envVersion;
  }
  // Local dev: fetch build-version.json for a per-build version string.
  try {
    const resp = await fetch("/game/build-version.json", { cache: "no-cache" });
    if (resp.ok) {
      const data = (await resp.json()) as { version?: string };
      if (data.version) {
        return data.version;
      }
    }
  } catch {
    // Ignore — fall through to default.
  }
  return "dev";
}

/**
 * Load the game engine WASM module.
 * FIX-2: Uses the Emscripten onRuntimeInitialized callback pattern instead
 * of a setTimeout-based race. Pre-configures window.Module with a callback
 * before loading game.js, so Emscripten uses our config when it boots.
 *
 * Also sets locateFile() so Emscripten fetches game.wasm and game.data from
 * /game/ regardless of the current page URL. Without this, the loader uses
 * page-relative paths and 404s when the page isn't at the site root.
 *
 * FIX-PRELOAD: Wraps FS_preloadFile to wait for WASM compilation
 * (Module._main being exposed) before processing. The Emscripten
 * file_packager IIFE runs at script eval, kicks off a fetch. If the
 * fetch resolves before WASM compilation completes, FS_preloadFile is
 * called before HEAP8 is set, causing MEMFS write to crash with
 * "Cannot read properties of undefined (reading 'buffer')".
 * Module._main is set inside receiveInstance, AFTER updateMemoryViews
 * sets HEAP8, so waiting for _main guarantees HEAP8 is ready. No
 * deadlock: FS_preloadFile doesn't depend on runDependencies, and
 * run() awaits runDependencies which includes 'datafile_...'.
 *
 * Usage: call this BEFORE dynamically loading game.js script tag.
 * Returns a Promise that resolves once the WASM runtime is fully initialized.
 */
export async function loadGameEngine(): Promise<GameInstance> {
  const buildVersion = await fetchBuildVersion();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(
        "WASM runtime initialization timed out after 120 seconds. " +
        "Check console for errors."
      ));
    }, 120000);

    const w = window as unknown as Record<string, unknown>;
    const existingConfig = (w.Module as Record<string, unknown> | undefined) || {};

    w.Module = {
      ...existingConfig,
      // Cache-bust /game/ files with the build version. In local dev this
      // changes on every rebuild (fetched from build-version.json), forcing
      // the browser to re-fetch the WASM. On Vercel it's the git SHA,
      // which is stable per deploy.
      locateFile: (path: string) => {
        return `/game/${path}?v=${buildVersion}`;
      },
      noInitialRun: true,
      onRuntimeInitialized: () => {
        clearTimeout(timeout);
        const module = w.Module as GameInstance["Module"];
        if (!module) {
          reject(new Error("Module not found after runtime init"));
          return;
        }
        resolve({ Module: module } as GameInstance);
      },
    };

    // Create a WASM-ready promise that FS_preloadFile can wait on.
    // Resolves when Module._main is exposed (set inside assignWasmExports,
    // called from receiveInstance, BEFORE run()). At that point HEAP8 is set.
    //
    // M6 note: The original design used a silent setTimeout to clear the
    // polling interval after 30s. We keep that behavior (no rejection) because
    // rejecting would cascade into FS_preloadFile and break preloading.
    // Instead we log a warning so the failure is observable.
    const wasmReady = new Promise<void>((resolveWasm) => {
      let resolved = false;
      const checkInterval = setInterval(() => {
        const m = w.Module as { _main?: unknown } | undefined;
        if (m && typeof m._main === "function") {
          clearInterval(checkInterval);
          resolved = true;
          resolveWasm();
        }
      }, 5);
      // M6: warn (not reject) on timeout — rejecting breaks FS_preloadFile.
      setTimeout(() => {
        if (!resolved) {
          clearInterval(checkInterval);
          console.warn("[WASM] Module._main did not appear within 30s — engine may have failed to boot.");
        }
      }, 120000);
    });

    // FIX-PRELOAD: Patch FS_preloadFile to wait for WASM compilation.
    // The file_packager IIFE runs at script eval, kicks off a fetch.
    // If the fetch resolves before WASM compilation completes, FS_preloadFile
    // is called before HEAP8 is set, causing MEMFS write to crash with
    // "Cannot read properties of undefined (reading 'buffer')".
    // By waiting for Module._main (which is set in receiveInstance, AFTER
    // updateMemoryViews), we guarantee HEAP8 is initialized before any
    // preload write happens. No deadlock: FS_preloadFile doesn't depend
    // on runDependencies, and run() awaits runDependencies which includes
    // the 'datafile_...' dependency added by runWithFS.
    let patchDone = false;
    const patchInterval = setInterval(() => {
      const M = w.Module as
        | (Record<string, unknown> & { FS_preloadFile?: (...args: unknown[]) => Promise<unknown> })
        | undefined;
      if (!M || typeof M.FS_preloadFile !== "function" || (M as { _fsPreloadPatched?: boolean })._fsPreloadPatched) {
        return;
      }
      const orig = M.FS_preloadFile;
      (M as { _fsPreloadPatched?: boolean })._fsPreloadPatched = true;

      M.FS_preloadFile = async (...args: unknown[]) => {
        await wasmReady;
        return orig.apply(M, args);
      };
      clearInterval(patchInterval);
      patchDone = true;
    }, 5);
    // M6 fix: warn (not silent) on timeout
    setTimeout(() => {
      if (!patchDone) {
        clearInterval(patchInterval);
        console.warn("[WASM] FS_preloadFile patch did not install within 30s — preloading may break.");
      }
    }, 120000);
  });
}

/** Inject a remote player's input into the WASM engine.
 * @param game The loaded GameInstance
 * @param controllerIndex 0 = Player 1, 1 = Player 2
 * @param inputString MUGEN input string (e.g. "Fa", "DBz", "")
 */
export function injectRemoteInput(
  game: GameInstance,
  controllerIndex: number, // 0 = P1, 1 = P2
  inputString: string
): void {
  if (game.Module._setExternalPlayerInput) {
    game.Module._setExternalPlayerInput(controllerIndex, inputString);
  }
}

/** Revert a player to local keyboard input */
export function disableRemoteInput(
  game: GameInstance,
  controllerIndex: number
): void {
  if (game.Module._disableExternalInput) {
    game.Module._disableExternalInput(controllerIndex);
  }
}

/** Check if a player is using remote input */
export function isRemoteInputActive(
  game: GameInstance,
  controllerIndex: number
): boolean {
  if (game.Module._isExternalInputActive) {
    return game.Module._isExternalInputActive(controllerIndex) === 1;
  }
  return false;
}

// =============================================================================
// State query helpers — for fight state machine
// =============================================================================

export interface PlayerStateInfo {
  life: number;
  lifeMax: number;
  power: number;
  alive: boolean;
  stateNo: number;
  roundsWon: number;
}

export interface RoundStateInfo {
  roundNumber: number;
  roundState: number; // 0=fade_in, 1=intro, 2=fight, 3=over, 4=win_pose
}

export function getPlayerStateInfo(game: GameInstance, playerIndex: number): PlayerStateInfo {
  const M = game.Module;
  return {
    life: M._getPlayerLifeExport ? M._getPlayerLifeExport(playerIndex) : 0,
    lifeMax: M._getPlayerLifeMaxExport ? M._getPlayerLifeMaxExport(playerIndex) : 1000,
    power: M._getPlayerPowerExport ? M._getPlayerPowerExport(playerIndex) : 0,
    alive: M._isPlayerAliveExport ? M._isPlayerAliveExport(playerIndex) === 1 : true,
    stateNo: M._getPlayerStateExport ? M._getPlayerStateExport(playerIndex) : 0,
    roundsWon: M._getPlayerRoundsWonExport ? M._getPlayerRoundsWonExport(playerIndex) : 0,
  };
}

export function getRoundInfo(game: GameInstance): RoundStateInfo {
  const M = game.Module;
  return {
    roundNumber: M._getRoundNumberExport ? M._getRoundNumberExport() : 1,
    roundState: M._getRoundStateExport ? M._getRoundStateExport() : 2,
  };
}