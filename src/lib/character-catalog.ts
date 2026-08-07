/**
 * Character catalog — defines the roster of playable characters.
 *
 * Characters come in two types:
 * 1. **Bundled** (bundled: true) — Pre-loaded in game.data. Available instantly.
 *    Example: Songoku, Vegeta
 * 2. **Downloadable** (bundled: false) — Fetched on-demand from CDN (jsDelivr)
 *    when the player selects them. Cached in IndexedDB for instant reuse.
 *    Example: Ultra Instinct Goku, Spider-Man, Nightwing
 *
 * Downloadable characters have `cdnBase` (URL to their file folder) and
 * `files` (list of files to download). These are populated from the remote
 * manifest.json fetched at app startup (see character-manifest.ts).
 */

export interface CharacterInfo {
  /** Internal name (matches folder name under chars/) */
  id: string;
  /** Display name shown in UI */
  displayName: string;
  /** Author credit */
  author: string;
  /** Short description shown on char select */
  description: string;
  /** Approximate size for display purposes */
  sizeMB: number;
  /** Whether the character is bundled in game.data (true) or
   *  downloaded on-demand from CDN (false) */
  bundled: boolean;
  /** Base URL for downloading character files (only for bundled: false)
   *  Example: "https://cdn.jsdelivr.net/gh/USER/REPO@main/chars/KnightmareSuperman/" */
  cdnBase?: string;
  /** List of files to download (only for bundled: false)
   *  Example: ["KnightmareSuperman.def", "KnightmareSuperman.cns", ...] */
  files?: string[];
}

/** Bundled characters — always available (loaded from game.data) */
export const BUNDLED_CHARACTERS: CharacterInfo[] = [
  {
    id: "Songoku",
    displayName: "Songoku",
    author: "Dolmexica",
    description: "Dragon Ball Z — balanced all-rounder. Bundled with engine.",
    sizeMB: 4,
    bundled: true,
  },
  {
    id: "Vegeta",
    displayName: "Vegeta",
    author: "CHOUJIN (2011)",
    description: "Dragon Ball Z — prince of Saiyans. Aggressive rushdown.",
    sizeMB: 4.3,
    bundled: true,
  },
];

/**
 * Get all bundled characters.
 * These are always available — no download needed.
 */
export function getBundledCharacters(): CharacterInfo[] {
  return BUNDLED_CHARACTERS;
}

/**
 * Get only the bundled characters (legacy compatibility — used by
 * CharacterSelect before the download system was implemented).
 * Now returns the same as getBundledCharacters().
 */
export function getPlayableCharacters(): CharacterInfo[] {
  return BUNDLED_CHARACTERS;
}

/** Find a character by ID in the bundled characters */
export function getCharacterById(id: string): CharacterInfo | undefined {
  return BUNDLED_CHARACTERS.find((c) => c.id === id);
}
