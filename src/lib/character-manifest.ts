/**
 * Asset Manifest — Fetches the remote manifest from GitHub.
 *
 * The manifest is a JSON file hosted in the FightingGameEngine-Assets repo
 * that lists all downloadable characters AND stages with their CDN URLs
 * and file lists.
 *
 * Manifest URL: https://raw.githubusercontent.com/USER/FightingGameEngine-Assets/main/manifest.json
 *
 * The manifest is fetched once at app startup and merged with the bundled
 * characters (Songoku, Vegeta) and bundled stages (UIU Campus Low) to
 * create the full asset lists.
 */

import type { CharacterInfo } from "@/lib/character-catalog";
import type { StageInfo } from "@/lib/stage-catalog";

/** Remote manifest entry (matches manifest.json format in assets repo) */
export interface RemoteManifestEntry {
  id: string;
  displayName: string;
  author: string;
  description: string;
  sizeMB: number;
  bundled: false;
  /** Base URL for downloading character files (jsDelivr CDN) */
  cdnBase: string;
  /** List of files to download */
  files: string[];
}

/** Remote manifest entry for a stage (matches manifest.json format) */
export interface RemoteStageManifestEntry {
  id: string;
  displayName: string;
  author: string;
  description: string;
  sizeMB: number;
  bundled: false;
  /** Base URL for downloading stage files (jsDelivr CDN) */
  cdnBase: string;
  /** List of files to download */
  files: string[];
}

/** Remote manifest format */
export interface RemoteManifest {
  characters: RemoteManifestEntry[];
  stages?: RemoteStageManifestEntry[];
  /** Manifest version — increment when format changes */
  version: number;
}

// =============================================================================
// CONFIGURATION — Update this URL when the assets repo is created
// =============================================================================

/**
 * URL to the remote character manifest.
 *
 * Uses GitHub raw (not jsDelivr) for the manifest itself — jsDelivr caches
 * aggressively and manifest updates can take hours to propagate. GitHub raw
 * always serves the latest version.
 *
 * Character FILES (sprites, sounds) still use jsDelivr for speed.
 */
export const MANIFEST_URL =
  "https://raw.githubusercontent.com/Nawaf-AlHussain/FightingGameEngine-Assets/main/manifest.json";

// =============================================================================
// Manifest fetching
// =============================================================================

/** Cache the manifest so we only fetch it once per session */
let cachedManifest: RemoteManifest | null = null;

/**
 * Fetch the remote character manifest from GitHub (via jsDelivr CDN).
 *
 * If the fetch fails (network error, 404, etc.), returns an empty manifest
 * — the app still works with bundled characters only.
 *
 * @param forceRefresh If true, re-fetch even if cached
 * @returns The remote manifest, or empty manifest on failure
 */
export async function fetchRemoteManifest(
  forceRefresh = false
): Promise<RemoteManifest> {
  // Return cached manifest if available
  if (cachedManifest && !forceRefresh) {
    return cachedManifest;
  }

  try {
    console.log("[Manifest] Fetching remote character manifest...");
    const response = await fetch(MANIFEST_URL, {
      cache: "no-cache", // Always get the latest manifest
    });

    if (!response.ok) {
      console.warn(
        `[Manifest] Failed to fetch manifest: HTTP ${response.status} — ` +
        "only bundled assets will be available"
      );
      return { characters: [], stages: [], version: 0 };
    }

    const manifest = (await response.json()) as RemoteManifest;
    console.log(
      `[Manifest] Fetched manifest: ${manifest.characters.length} downloadable characters, ` +
      `${manifest.stages?.length ?? 0} downloadable stages`
    );

    cachedManifest = manifest;
    return manifest;
  } catch (e) {
    console.warn(
      "[Manifest] Failed to fetch manifest (network error):",
      e,
      "— only bundled assets will be available"
    );
    return { characters: [], stages: [], version: 0 };
  }
}

/**
 * Get all characters: bundled + remote (downloadable).
 *
 * Fetches the remote manifest and merges it with the bundled characters.
 * The result is the full character list for the character select screen.
 *
 * @param bundledChars The bundled characters (from character-catalog.ts)
 * @returns All characters (bundled + remote)
 */
export async function getAllCharacters(
  bundledChars: CharacterInfo[]
): Promise<CharacterInfo[]> {
  const manifest = await fetchRemoteManifest();

  // Convert manifest entries to CharacterInfo format
  const remoteChars: CharacterInfo[] = manifest.characters.map((entry) => ({
    id: entry.id,
    displayName: entry.displayName,
    author: entry.author,
    description: entry.description,
    sizeMB: entry.sizeMB,
    bundled: false,
    cdnBase: entry.cdnBase,
    files: entry.files,
  }));

  // Combine: bundled first, then remote (sorted by name)
  const remoteSorted = remoteChars.sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  return [...bundledChars, ...remoteSorted];
}

/**
 * Get all stages: bundled + remote (downloadable).
 *
 * Fetches the remote manifest and merges it with the bundled stages.
 * The result is the full stage list for the stage select screen.
 *
 * @param bundledStages The bundled stages (from stage-catalog.ts)
 * @returns All stages (bundled + remote)
 */
export async function getAllStages(
  bundledStages: StageInfo[]
): Promise<StageInfo[]> {
  const manifest = await fetchRemoteManifest();

  // Convert manifest entries to StageInfo format
  const remoteStages: StageInfo[] = (manifest.stages ?? []).map((entry) => ({
    id: entry.id,
    displayName: entry.displayName,
    author: entry.author,
    description: entry.description,
    sizeMB: entry.sizeMB,
    bundled: false,
    cdnBase: entry.cdnBase,
    files: entry.files,
  }));

  // Combine: bundled first, then remote (sorted by name)
  const remoteSorted = remoteStages.sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  return [...bundledStages, ...remoteSorted];
}
