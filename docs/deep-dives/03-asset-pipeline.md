# Asset Pipeline

**Last Updated:** 2026-07-17 (added on-demand streaming section, updated bundle policy)

## Overview

MUGEN characters are large (4–70MB each). Bundling all characters into the WASM `game.data` would make first-load unusable on Bangladesh mobile data (~৳5/MB prepaid). The asset pipeline therefore splits into:

1. **Bundle** (build time): engine + 1–2 small characters only
2. **Stream on-demand** (runtime, Phase 1.5): fetch larger characters from Cloudflare R2 when selected in the lobby

## Pipeline Stages

### 1. Download (one-time, offline)

- Characters come from MUGEN archive sites (Mugen Archive, etc.)
- Formats: `.zip`, `.rar`
- Stored temporarily in `upload/` (gitignored)

### 2. Validate

`tools/validate-mugen.py` checks:
- `.def` file exists and is parseable
- `.sff` header is valid (v1 or v2 magic bytes)
- `.snd` file exists
- No path traversal in filenames
- Total size < 50MB (soft limit; larger chars require manual approval)

### 3. Stage to R2

- Validated characters uploaded to Cloudflare R2 bucket `mugen-assets`
- Path: `r2://mugen-assets/chars/{CharacterName}/`
- Public URL: `https://assets.fge.dev/chars/{CharacterName}/` (Cloudflare CDN front)
- Bucket policy: public read, IAM write

### 4. Build-time bundle (Phase 1)

`scripts/build-wasm.sh` uses Emscripten `file_packager` with `--preload` to embed selected characters into `game.data`. **Only small characters are preloaded** — keeps total first-load under ~10MB.

Current preload list (after FIX-3, **pending implementation**):
```
chars/Songoku/                   # ~4MB
chars/Vegeta/                    # ~4.3MB (CHOUJIN, 2011)
stages/<default-stage>/          # ~1MB
```

FIX-3 implementation note: `scripts/build-wasm.sh` currently preloads the entire `chars/` directory. Modify it to accept a `BUNDLE_CHARS` env var (default `"Songoku Vegeta"`) and only preload those subdirectories.

Removed from preload (now R2-only):
```
chars/KnightmareSuperman/        # 69MB — too large for bundle
chars/Nightwing/                 # 30MB — too large for bundle
```

### 5. On-demand streaming (Phase 1.5)

When a player selects a non-bundled character in the lobby, the frontend:

1. Checks `Module.FS.analyzePath('/chars/' + charName)` — if exists, skip download
2. Fetches `https://assets.fge.dev/chars/{charName}.zip` via `fetch()`
3. Unzips in-browser using `fflate` (smaller than `pako`, supports zip)
4. Writes each file into Emscripten MEMFS:
   ```ts
   for (const [path, data] of Object.entries(unzippedFiles)) {
     Module.FS.createPath('/', '/chars/' + charName + '/' + dirname(path), true, true);
     Module.FS.writeFile('/chars/' + charName + '/' + path, data);
   }
   ```
5. Signals character-ready to the engine via a custom callback

**Why this works without repackage:** `file_packager --preload` at build time does exactly this — it bundles files into a `.data` blob and a `.js` loader that calls `Module.FS.writeFile` at startup. We're just doing the same thing at runtime for individual characters.

**Progress UI:** show download progress bar in char-select screen. For 30MB Nightwing on a 1MB/s connection = 30s wait. Acceptable for a one-time-per-session load.

**Caching:** use Cache API (`caches.open('mugen-chars')`) to persist downloaded characters across sessions. Character files are immutable per version, so cache key = char name + version hash.

### 6. Deploy

- `game.data` + `game.wasm` + `game.js` deployed to Vercel
- Static `game.data` cached on Vercel CDN
- R2 character assets cached on Cloudflare CDN

## Size Estimates

| Character | SFF | SND | CNS/AIR/CMD | Total | Bundle? |
|-----------|-----|-----|-------------|-------|---------|
| Songoku | 2MB | 2MB | 0.1MB | ~4MB | ✅ Yes (Phase 1) |
| Vegeta (CHOUJIN 2011) | 1.8MB | 2.2MB | 0.3MB | ~4.3MB | ✅ Yes (Phase 1) |
| Knightmare Superman | 41MB | 26MB | 1.5MB | ~69MB | ❌ R2 only |
| Nightwing | 20MB | 9.5MB | 0.5MB | ~30MB | ❌ R2 only |

## Phase 1 Bundle Budget

| Component | Size |
|---|---|
| `game.wasm` | ~3.1MB |
| `game.js` | ~207KB |
| Songoku | ~4MB |
| Vegeta | ~4.3MB |
| Default stage | ~1MB |
| **Total first-load** | **~13MB** |

Target: under 15MB. Bangladesh mobile users on 1MB/s connections wait ~13s for first load. Acceptable.

## Phase 1.5 R2 Streaming Budget

| Character | First fetch | Cached after? |
|---|---|---|
| Knightmare Superman | 69MB | Yes (Cache API) |
| Nightwing | 30MB | Yes (Cache API) |

Subsequent sessions re-use the cached version (Cache API persists across page reloads).

## Compression

SFF (sprite) files dominate character size. Future optimizations (Phase 2+):

- Re-encode SFF v1 → v2 (better compression)
- Convert PNGs inside SFF to WebP (30–50% smaller)
- Lazy-load palettes (don't load alt palettes until selected)
- Stream sprite chunks on-demand (only load sprites for current move)

These are NOT in Phase 1.5 scope — they're polish for Phase 2.
