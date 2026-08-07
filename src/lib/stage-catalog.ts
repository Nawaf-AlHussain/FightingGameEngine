/**
 * Stage catalog — defines the stages available in the game.
 *
 * Like characters, stages come in two types:
 * 1. **Bundled** (bundled: true) — Pre-loaded in game.data. Available instantly.
 *    Example: uiu_campus_low (the only bundled stage)
 * 2. **Downloadable** (bundled: false) — Fetched on-demand from the assets repo
 *    (FightingGameEngine-Assets) when the player selects them. Cached in
 *    IndexedDB for instant reuse.
 *
 * Downloadable stages have `cdnBase` (URL to the stages folder) and `files`
 * (list of files to download — typically just .def + .sff). These are
 * populated from the remote manifest.json fetched at app startup
 * (see character-manifest.ts).
 *
 * Stage files are injected FLAT into /stages/ in the WASM filesystem
 * (not in a subfolder) because startDirectMatch() builds the path as
 * "<assetFolder>stages/<stagePath>" and the stage .def files reference
 * sprites as "stages/<file>.sff".
 */

export interface StageInfo {
  /** Internal name (matches the .def filename without extension,
   *  AND the file basename on disk — e.g., "DU_Campus" → "DU_Campus.def") */
  id: string;
  /** Display name shown in UI */
  displayName: string;
  /** Author credit */
  author: string;
  /** Short description shown on stage select */
  description: string;
  /** Approximate size for display purposes */
  sizeMB: number;
  /** Whether the stage is bundled in game.data (true) or
   *  downloaded on-demand from CDN (false) */
  bundled: boolean;
  /** Base URL for downloading stage files (only for bundled: false)
   *  Example: "https://cdn.jsdelivr.net/gh/USER/REPO@main/stages/" */
  cdnBase?: string;
  /** List of files to download (only for bundled: false)
   *  Example: ["DU_Campus.def", "DU_Campus.sff"] */
  files?: string[];
}

/**
 * Bundled stages — always available (loaded from game.data).
 *
 * NOTE: `id` matches the .def filename without extension. The engine's
 * startDirectMatch() takes a stage filename like "uiu_campus_low.def"
 * and loads it from /stages/uiu_campus_low.def.
 */
export const BUNDLED_STAGES: StageInfo[] = [
  {
    id: "uiu_campus_low",
    displayName: "UIU Campus Low",
    author: "Nawaf",
    description: "Default bundled stage. 1280x720 native, scaled to 4:3.",
    sizeMB: 4.7,
    bundled: true,
  },
];

/**
 * Get all bundled stages.
 * These are always available — no download needed.
 */
export function getBundledStages(): StageInfo[] {
  return BUNDLED_STAGES;
}

/** Find a stage by ID in the bundled stages */
export function getStageById(id: string): StageInfo | undefined {
  return BUNDLED_STAGES.find((s) => s.id === id);
}
