# SFF (Sprite File Format) Compatibility Research

**Date:** 2026-08-06
**Scope:** Research SFF version compatibility in the Dolmexica Infinite engine vs Ikemen GO, identify the root cause of the "SFF v2 characters turn black when jumping/attacking" bug, and propose concrete code fixes.

**Source files inspected:**
- `engine/DolmexicaInfinite/addons/prism/mugenspritefilereader.cpp` (1,684 lines)
- `engine/DolmexicaInfinite/addons/prism/include/prism/mugenspritefilereader.h`
- `ikemen-go/src/image.go` (2,140 lines — Ikemen GO's SFF/PNG/PCX decoder)

**Web sources:** Elecbyte docs, virtualltek.com community docs, MUGEN wiki, Ikemen GO issue tracker, Dolmexica itch.io changelog, kazzmir/paintown issue tracker, FightersParadise compatibility doc.

---

## 1. SFF Versions That Actually Exist

There is **no "SFF v3"** in the MUGEN ecosystem. The user's question listed `v1, v2, v2.01, v3` — the `v3` either refers to the Dolmexica-custom "preloaded" format (which uses version bytes `0,0,0,100` and is engine-private), or is a misnomer. The real versions are:

| Version | Header bytes (`verhi,verlo1,verlo2,verlo3`) | Engine | Container | Sprite formats | Palette alpha handling |
|---|---|---|---|---|---|
| **v1.01** | `00 01 00 01` | MUGEN 2002.04+ / WinMUGEN / 1.0 (read-only) | Old 512-byte header (SFFHeader) — `GroupAmount`, `ImageAmount`, `FirstFileOffset` | PCX only (RLE5-encoded 8bpp indexed, palette trailing each PCX) | Implicit: index 0 transparent, all others opaque |
| **v1.02** | `00 01 00 02` | (rare; some tools mis-saved v2 files with these bytes) | Same as v1.01 | Same as v1.01 | Same as v1.01 |
| **v2.00** | `00 00 00 02` | MUGEN 1.0 | New 512-byte header (SFFHeader2) — separate `SpriteOffset`, `PaletteOffset`, `LDataOffset`, `TDataOffset` | 0=raw, 2=RLE8, 4=LZ5 (8bpp indexed) | **Forced**: index 0 transparent, all others opaque |
| **v2.01** | `00 00 01 02` | MUGEN 1.1 (incompatible with 1.0) | Identical container to v2.00 | Adds 10=PNG-paletted, 11=PNG-RGB, 12=PNG-RGBA | **Respected**: alpha values stored per palette entry (any slot can be transparent) |
| *(Dolmexica preloaded)* | `00 00 00 64` (i.e. `0,0,0,100`) | Dolmexica Infinite only | Custom block-based format with ZSTD compression | Pre-decoded paletted/ARGB16 twiddled | n/a (pre-decoded) |

**Critical detail:** v2.00 and v2.01 share an *identical* container/decode layout (same `SFFHeader2` struct, same sprite node layout, same palette node layout). The **only difference** is one byte (`verlo2`, i.e. `mVersion[2]`) and the semantic meaning of palette alpha values. The FightersParadise compatibility doc confirms: *"SFF v2.01 (MUGEN 1.1) Supported — Decode parity with v2.00 — the two minor revisions share an identical container/decode layout; only the minor-[version differs]"*.

The virtualltek community doc adds: *"SFF Version 2.0.1. The latest format designed by Elecbyte, introduced in M.U.G.E.N 1.1. It adds support for PNG images, from 8 to 32 bit depth and 32 bit color components for Palettes (with Alpha channel for transparency)."*

The Elecbyte update history confirms: *"Using such compression methods will generate an SFF (v2.01) that is incompatible with MUGEN 1.0."*

A MUGENFreeForAll forum post nails the user-visible distinction: *"Unless it's a 1.1 sprite file where any slot can be transparent, MUGEN always reads the first colour slot in the palette as transparent."*

---

## 2. What Dolmexica Currently Supports vs Doesn't

Dispatch logic lives at `mugenspritefilereader.cpp:1442-1464`:

```cpp
SFFSharedHeader header;
gPrismMugenSpriteFileReaderData.mReader.mRead(..., &header, sizeof(SFFSharedHeader));

if (header.mVersion[1] == 1 && header.mVersion[3] == 1) {
    ret = loadMugenSpriteFile1(...);              // v1.01  (0,1,0,1)
} else if (header.mVersion[1] == 1 && header.mVersion[3] == 2) {
    ret = loadMugenSpriteFile2(...);              // "v1.02" (0,1,0,2) → routed to v2 loader
} else if (header.mVersion[1] == 0 && header.mVersion[3] == 2) {
    ret = loadMugenSpriteFile2(...);              // v2.00 (0,0,0,2) AND v2.01 (0,0,1,2) — INDISTINGUISHABLE
} else if (header.mVersion[1] == 0 && header.mVersion[3] == 100) {
    ret = loadMugenSpriteFilePreloaded(...);      // Dolmexica custom (0,0,0,100)
} else {
    logError("Unrecognized SFF version.");        // v1.00 (0,1,0,0) falls through here
    recoverFromError();
}
```

**Bundled SFF files** (verified by reading bytes 12-15 of each file):

| File | Version bytes | Routed to |
|---|---|---|
| `chars/Songoku/songoku.sff` | `0,1,0,1` (v1.01) | `loadMugenSpriteFile1` ✓ |
| `chars/Vegeta/vegeta.sff` | `0,1,0,1` (v1.01) | `loadMugenSpriteFile1` ✓ |
| `data/fight.sff`, `data/fightfx.sff`, `data/system.sff` | `0,1,0,1` (v1.01) | `loadMugenSpriteFile1` ✓ |
| `stages/uiu_campus_low.sff` | `0,1,0,1` (v1.01) | `loadMugenSpriteFile1` ✓ |

All bundled content is v1.01 → uses the v1 path → no palette bugs. The bug only manifests for downloaded v2 characters (e.g. Ultra Instinct Goku mentioned in `TODO.md` entry #32).

| Format | Status | Notes |
|---|---|---|
| v1.01 | ✅ Works | Used by all bundled content |
| v1.02 (real) | ⚠️ Misrouted | Routed to `loadMugenSpriteFile2`. The branch was likely added to handle MCM/Fighter Factory bugs that mis-saved v2 files as `0,1,0,2`, but it would break a real v1.02 file (if any exist in the wild) |
| v2.00 | ⚠️ Partial | Loads, but uses unreliable alpha heuristic (see Bug #1) |
| v2.01 | ❌ **Broken** | Loads as v2.00 — palette alpha values ignored. This is the root cause of "characters turn black when jumping/attacking" |
| Dolmexica preloaded | ✅ Works | Custom format, only used by Dolmexica's optimizer tool |
| v1.00 | ❌ Rejected | Falls through to error (very rare, pre-2002 files) |
| "v3" | n/a | Does not exist in MUGEN |

---

## 3. Specific Bugs in Dolmexica's SFF v2 Loading Code

### Bug #1 — CRITICAL: Cannot distinguish v2.00 from v2.01

**Location:** `mugenspritefilereader.cpp:1445-1464` (dispatch) and `:1041-1060` (palette processing)

**Issue:** The dispatch only checks `mVersion[1]` and `mVersion[3]`. Both v2.00 (`0,0,0,2`) and v2.01 (`0,0,1,2`) match the `mVersion[1]==0 && mVersion[3]==2` branch and get routed to `loadMugenSpriteFile2`. The distinguishing byte `mVersion[2]` (= 0 for v2.00, = 1 for v2.01) is never read.

Inside `loadMugenSpriteFile2`, palette alpha handling is decided by a **heuristic**, not by the version byte:

```cpp
static bool isUsingSpecialPalette2Loading(Buffer tRaw)
// SF2_Ryu (the HD remake one) expects its alpha values to be respected,
// which seemingly breaks all other SFFv2 1.0 palettes
{
    int n = tRaw.mLength / 4;
    assert(n <= 256);
    uint8_t* raw = (uint8_t*)tRaw.mData;
    return n == 256 && raw[3] != 0x0; // no clue if this even holds up
}

static Buffer processRawPalette2(Buffer tRaw) {
    if (isUsingSpecialPalette2Loading(tRaw))
        return processRawPalette2AlphaFromBuffer(tRaw);   // respect alpha
    else
        return processRawPalette2FixedAlpha(tRaw);        // force idx0 transparent, drop alpha
}
```

The author's own comment — `// no clue if this even holds up` — admits the heuristic is fragile. It returns `true` only when (a) the palette has exactly 256 colors AND (b) the alpha byte of palette entry 0 is non-zero.

**Failure modes:**
- A v2.01 file with `pal[0].alpha == 0` (author used forced transparency, common in tools) → heuristic returns `false` → `processRawPalette2FixedAlpha` runs → **all other palette entries forced opaque** → semi-transparent effects lost, but no "black" symptom
- A v2.01 file with `pal[0].alpha == 255` (author marked it opaque, with another index transparent) → heuristic returns `true` → `processRawPalette2AlphaFromBuffer` runs → respects alpha → **works correctly by accident**
- A v2.01 file where the author set `pal[N].alpha == 0` for some `N != 0` (intending index N transparent) AND `pal[0].alpha == 0` (default) → heuristic returns `false` → `processRawPalette2FixedAlpha` runs → **forces index N to opaque (alpha=255)** → the sprite using index N as its "transparent" color renders that color as solid → **character turns that color (often black for shadow/darkness sprites used in jump/attack frames)**

This matches the symptom in `TODO.md:32`: *"SFF v2 characters render correctly standing but turn black when jumping/attacking."* Standing sprites typically use index 0 (which is correctly forced transparent); jump/attack frames in MUGEN 1.1 characters often use sprite-format 10/11/12 PNG sprites with per-pixel alpha, OR use palette indices other than 0 for transparency — both of which break under the v2.00-style FixedAlpha handling.

The Dolmexica itch.io changelog confirms two SFFv2-related fixes were applied (so the code we're reading has *partial* fixes):
- *"Bugfix: [General] SFFv2 files will use the alpha in their palette entries when the first palette entry is not the palette's alpha entry."* ← this is `isUsingSpecialPalette2Loading`, the unreliable heuristic
- *"Bugfix: [General] SFFv2 files with paletted PNG files and bit depth 8 will use the palettes from the SFF instead of the PNG palette now."* ← this is `makeMugenSpriteFileSpriteFromRawPNGBuffer` passing `tIsUsingPngPalette=0` (line 753), correctly discarding the PNG's own palette

But the heuristic is still wrong — it needs to be replaced with a version-byte check.

### Bug #2 — MINOR: PNG sprite data length off-by-4

**Location:** `mugenspritefilereader.cpp:1202-1210`

```cpp
else if (isRawPNG) {
    uint32_t originalPosition = ...->mGetCurrentOffset(...);
    ...->mSeek(..., getSpriteDataOffset(&sprite, tHeader));
    uint16_t textureWidth, textureHeight;
    ...->mRead(..., &textureWidth, 2);        // read 4-byte prefix
    ...->mRead(..., &textureHeight, 2);
    Buffer pngBuffer = ...->mReadBufferReadOnly(..., sprite.mDataLength);  // reads mDataLength bytes
    ...
}
```

Per the official SFF v2 spec, `mDataLength` is the **total** data length including the 4-byte `textureWidth/textureHeight` prefix. The code reads the 4-byte prefix *first*, then reads `mDataLength` more bytes — meaning it reads 4 bytes past the actual PNG data.

**Symptom:** Usually harmless (libpng stops at IEND), but on tightly-packed SFF files it could read into the adjacent sprite's data and trigger a `Trying to read outside buffer` error in `readPNGDataFromInputStream` (line 528).

The project's own `scripts/generate-system-sff.py` documents this convention explicitly at line 43: `mDataLength (uint32 LE) — PNG data length (NOT including 4-byte prefix)` — meaning the Python generator uses a DIFFERENT convention than the official MUGEN spec. The C++ reader matches the Python generator's convention (good for self-generated files) but mismatches the official spec (bad for downloaded MUGEN characters).

### Bug #3 — MODERATE: External .act palette breaks palette indexing

**Location:** `mugenspritefilereader.cpp:1185`

```cpp
const int palette = tHasPalette ? sprite.mPaletteIndex + 1 : sprite.mPaletteIndex;
...
auto& paletteElement = tDst->mPalettes[palette];   // line 1197 / 1209
```

When an external `.act` file is loaded (the typical case for MUGEN characters with alt palettes — `pal1.act` ... `pal12.act`), the code:
1. Loads only ONE `.act` file via `loadMugenSpriteFilePaletteFile` (line 954)
2. Inserts it as `mPalettes[0]`
3. Shifts every sprite's palette lookup by `+1` so the SFF's own palettes start at index 1

Problems:
- **Multiple `.act` files not loaded.** A character with `pal1=pal1.act, pal2=pal2.act, ...` in its `.def` will only ever load `pal1.act` — the others are silently ignored.
- **Out-of-bounds access risk.** If `sprite.mPaletteIndex == mPalettes.size() - 1` and `tHasPalette == true`, then `palette = mPalettes.size()`, and `mPalettes[palette]` reads past the end of the vector. No bounds check exists.

Ikemen GO clamps with `if spriteList[i].palidx >= sys.cfg.Config.PaletteMax || spriteList[i].palidx < 0 { spriteList[i].palidx = 0 }` (image.go:1790).

### Bug #4 — MODERATE: `remapMugenSpriteFilePalette` forces index 0 transparent

**Location:** `mugenspritefilereader.cpp:1605`

```cpp
if (isRGBPalette(paletteElement.mBuffer))
    setPaletteFromBGR256WithFirstValueTransparentBuffer(tPaletteID, paletteElement.mBuffer);
else
    setPaletteFromARGB256Buffer(tPaletteID, paletteElement.mBuffer);
```

When a player picks an alt palette, RGB palettes get forced index-0-transparent (via `setPaletteFromBGR256WithFirstValueTransparentBuffer`). For v2.01 characters authored with a non-zero transparent index, this is wrong — it forces the wrong slot transparent and makes the intended-transparent slot opaque.

### Bug #5 — MINOR: SFF v1.00 rejected

**Location:** `mugenspritefilereader.cpp:1445-1464`

A real v1.00 file (bytes `0,1,0,0`, pre-2002 MUGEN) matches none of the branches and falls through to `logError("Unrecognized SFF version.")`. Very rare in practice; safe to defer.

### Bug #6 — MINOR: No header validation

**Location:** `loadSFFHeader2` (line 999) and downstream consumers

`mSpriteTotal`, `mPaletteTotal`, `mLDataOffset`, `mLDataLength`, `mTDataOffset`, `mTDataLength` are read without any sanity check. A truncated/corrupted SFF could cause:
- Infinite loop in `loadPalettes2` / `loadSprites2` (if `mPaletteTotal`/`mSpriteTotal` is huge)
- Out-of-bounds file seeks (if offsets point past EOF)

The `mReader.mReadBufferReadOnly` call does have bounds checks against the buffer for the buffer-file-reader path, but the file-file-reader path may not.

---

## 4. How Ikemen GO Fixed SFF v2 Palette Issues

Ikemen GO's SFF code lives in `ikemen-go/src/image.go` (2,140 lines). The relevant fixes:

### Fix A — Version-byte-based alpha handling (THE KEY FIX)

**Location:** `image.go:2024` (in `Sff.ReadPalette`)

```go
// Read one SFFv2 palette
func (s *Sff) ReadPalette(f io.ReadSeeker, offset int64, size uint32) ([]uint32, error) {
    ...
    for i := 0; i < len(pal); i++ {
        var rgba [4]byte
        if i < rawCount {
            if err := binary.Read(f, binary.LittleEndian, rgba[:]); err != nil {
                return nil, err
            }
        }
        // Fill in the alpha values
        if s.header.Version[2] == 0 { // Version 2.0.0.0 only? i.e. exclude 1.0.1.0 and 2.0.1.0?
            if i == 0 {
                rgba[3] = 0 // Index 0 forced transparent
            } else {
                rgba[3] = 255 // All others forced opaque
            }
        }
        pal[i] = uint32(rgba[3])<<24 | uint32(rgba[2])<<16 | uint32(rgba[1])<<8 | uint32(rgba[0])
    }
    return pal, nil
}
```

For v2.00 (`Version[2] == 0`): force index 0 transparent, all others opaque (legacy MUGEN 1.0 behavior).
For v2.01 (`Version[2] == 1`): the `if` block is skipped — the alpha values from the file are kept as-is. **No heuristic, no guesswork.**

The same pattern is repeated in `loadFromSff` (image.go:705, currently commented out — superseded by the active `loadPalettes`/`ReadPalette` path):
```go
if h.Version[2] == 0 {
    rgba[3] = 255
}
```

### Fix B — Proper PNG/compressed data length handling

**Location:** `image.go:1174-1257` (`Sprite.readV2`)

```go
if s.rle == 0 {
    // Uncompressed: read datasize bytes from offset (no prefix)
    f.Seek(offset, 0)
    px = make([]uint8, datasize)
    binary.Read(f, binary.LittleEndian, px)
    ...
} else {
    // Compressed (RLE5/RLE8/LZ5) or PNG: skip 4-byte prefix, read datasize-4 bytes
    f.Seek(offset+4, 0)
    format := -s.rle
    if 2 <= format && format <= 4 {
        if datasize < 4 { datasize = 4 }
        px = make([]byte, datasize-4)
        ...
    }
    switch format {
    case 2: px = s.Rle8Decode(px)
    case 3: px = s.Rle5Decode(px)   // Dolmexica doesn't support format 3 (RLE5)!
    case 4: px = s.Lz5Decode(px)
    case 10: img, _ := png.Decode(f)              // PNG-paletted
    case 11, 12: img, _ := png.Decode(f)          // PNG-RGB/RGBA
    }
}
```

Note Ikemen also supports **format 3 (RLE5)** which Dolmexica does NOT — see code change #5 below.

### Fix C — Palette index bounds checking

**Location:** `image.go:1790-1794` (in `preloadSff`)

```go
if spriteList[i].palidx >= sys.cfg.Config.PaletteMax || spriteList[i].palidx < 0 {
    spriteList[i].palidx = 0
}
```

Clamps palette indices to `[0, PaletteMax)`. Prevents the out-of-bounds access described in Bug #3.

### Fix D — Dedicated palette loading path for v2

**Location:** `image.go:1913-1981` (`Sff.loadPalettes`)

```go
func (s *Sff) loadPalettes(f io.ReadSeeker, lofs uint32) error {
    if s.header.Version[0] == 1 { return nil }   // skip for v1
    ...
    for i := 0; i < int(s.header.NumberOfPalettes); i++ {
        f.Seek(int64(s.header.FirstPaletteHeaderOffset)+int64(i*16), 0)
        var gn [3]uint16       // group, item, numcols
        var link uint16
        var ofs, plSize uint32
        ...
        if plSize == 0 {
            // Linked palette — reuse another palette's data
            idx = int(link)
            pal = s.palList.Get(idx)
        } else {
            pal, err = s.ReadPalette(f, int64(lofs+ofs), plSize)
            ...
        }
        s.palList.SetSource(i, pal)
        s.palList.PalTable[[2]uint16{gn[0], gn[1]}] = idx
        s.palList.numcols[[2]uint16{gn[0], gn[1]}] = int(gn[2])
    }
}
```

This handles three things Dolmexica's `loadSinglePalette2` doesn't:
1. **Linked palettes** (`plSize == 0`): reuses another palette's data instead of re-reading from disk
2. **Palette color count** (`gn[2]`): stored for later rendering decisions (some sprites use 16-color palettes, not 256)
3. **PalTable mapping**: explicitly maps `(group, item) → palette index`, which is what powers `RemapPal` SCTRL at runtime

### Fix E — Post-load palette 1,1 mapping for selectable palettes

**Location:** `image.go:1882-1907`

```go
if sff.header.Version[0] != 1 && char {
    for i := 0; i < int(sff.header.NumberOfPalettes); i++ {
        f.Seek(int64(sff.header.FirstPaletteHeaderOffset)+int64(i*16), 0)
        // re-read palette header to find which (group,item) it maps to
        ...
        // if this palette is the one referenced by pal1/pal2/... in the .def, register it
    }
}
```

This explicitly maps the SFF's palette slots to the character's `.def`-declared `pal1.act`, `pal2.act`, etc., so when a player presses a button on the character select screen to pick palette 3, the engine knows which SFF palette slot that corresponds to.

A later improvement (referenced in the Ikemen GO issue tracker, issue #3460) loads ALL palettes up-front during preload to avoid palette-loading races when RemapPal is invoked mid-match.

### Fix F — External .ACT palette support for SFF v2

**Location:** `image.go:2040-2079` (`Sff.loadActPalettes`)

```go
// TODO: External .ACTs on SFFv2 without palette slots may cause color bleeding,
// on sprites with unique palettes if a SFFv2 with Acts is loaded by sffNew,
// since is a simplified utility and lacks the engine's palInfo/cgi logic to
// properly isolate palette remapping during rendering.
```

Ikemen explicitly loads external `.act` files into the PalTable for v2 characters, mapping them to `(1, N)` slots. The TODO comment acknowledges this is still imperfect for characters with mixed-palette sprites.

---

## 5. Specific Code Changes Needed

All changes are in `engine/DolmexicaInfinite/addons/prism/mugenspritefilereader.cpp` unless otherwise noted. Listed by priority/effort.

### Change #1 — Replace `isUsingSpecialPalette2Loading` heuristic with version-byte check (CRITICAL FIX)

**Effort:** ~30 min (small surgical edit, but needs testing with v2.00 *and* v2.01 characters)

**Steps:**

1. Add a `verlo2` (the third version byte) parameter to the palette processing functions, OR thread the SFF header through. Simplest approach: add a `static int gSffVersionVerlo2 = 0;` field to `gPrismMugenSpriteFileReaderData` and set it in `loadMugenSpriteFileGeneral` right after reading the `SFFSharedHeader`:

```cpp
static struct {
    int mIsOnlyLoadingPortraits;
    int mHasPaletteFile;
    int mIsUsingRealPalette;
    int mPaletteID;
    FileReader mReader;
    // ... existing fields ...
    uint8_t mSffVerlo2 = 0;   // NEW: 0 = v2.00, 1 = v2.01 (only meaningful for SFF v2)
} gPrismMugenSpriteFileReaderData;
```

2. In `loadMugenSpriteFileGeneral`, set it after reading `SFFSharedHeader`:

```cpp
SFFSharedHeader header;
gPrismMugenSpriteFileReaderData.mReader.mRead(..., &header, sizeof(SFFSharedHeader));
gPrismMugenSpriteFileReaderData.mSffVerlo2 = header.mVersion[2];   // NEW
```

3. Replace `isUsingSpecialPalette2Loading` with a version check:

```cpp
static bool isUsingSpecialPalette2Loading(Buffer tRaw)
{
    // v2.01 (verlo2 == 1): respect per-entry alpha values from the palette data.
    // v2.00 (verlo2 == 0): force index 0 transparent, all others opaque (legacy MUGEN 1.0 behavior).
    // See Ikemen GO image.go:2024 for the reference implementation.
    return gPrismMugenSpriteFileReaderData.mSffVerlo2 != 0;
}
```

The `tRaw` parameter is now unused but kept for ABI stability; alternatively delete it and update the one caller at line 1052.

**Expected result:** v2.01 characters (Ultra Instinct Goku, etc.) will render correctly during jump/attack frames because their per-entry palette alpha values are now respected. v2.00 characters remain unaffected (still use FixedAlpha). The `// no clue if this even holds up` comment can finally be retired.

**Test plan:**
- Load a known v2.00 character (e.g., any MUGEN 1.0 character saved by Sprmake2 v1.0). Verify standing + jump + attack render correctly. Verify index 0 is forced transparent.
- Load a known v2.01 character with PNG sprites (e.g., an HD character like SF2_Ryu HD remake). Verify semi-transparent effects render correctly.
- Load the project's own generated `system.sff` (Python generator writes version bytes `0,0,0,2` = v2.00) and verify it still works.

### Change #2 — Fix PNG sprite data length off-by-4

**Effort:** ~15 min

**Location:** `mugenspritefilereader.cpp:1208`

```cpp
// BEFORE:
Buffer pngBuffer = gPrismMugenSpriteFileReaderData.mReader.mReadBufferReadOnly(
    &gPrismMugenSpriteFileReaderData.mReader, sprite.mDataLength);

// AFTER:
const uint32_t pngDataLength = (sprite.mDataLength > 4) ? (sprite.mDataLength - 4) : 0;
Buffer pngBuffer = gPrismMugenSpriteFileReaderData.mReader.mReadBufferReadOnly(
    &gPrismMugenSpriteFileReaderData.mReader, pngDataLength);
```

This matches the official SFF v2 spec (mDataLength is total including the 4-byte prefix). The project's Python generator (`scripts/generate-system-sff.py`) needs to be updated to write `mDataLength = 4 + len(png_data)` to match — currently it writes `mDataLength = len(png_data)`. Without updating the generator, self-generated files would break. Either:
- (a) Update the generator to write `mDataLength` including the prefix → matches spec, matches reader fix
- (b) Add a special-case branch in the reader: if file was generated by the project's Python generator, use the old convention; otherwise use spec convention. **Don't do this** — it's a hack.

**Recommendation:** Go with (a). Update both reader and generator consistently.

### Change #3 — Bounds-check palette index in `loadSingleSprite2`

**Effort:** ~10 min

**Location:** `mugenspritefilereader.cpp:1185-1199` and `:1209`

```cpp
// BEFORE:
const int palette = tHasPalette ? sprite.mPaletteIndex + 1 : sprite.mPaletteIndex;
...
auto& paletteElement = tDst->mPalettes[palette];   // potential OOB

// AFTER:
const int palette = tHasPalette ? sprite.mPaletteIndex + 1 : sprite.mPaletteIndex;
const int paletteCount = (int)tDst->mPalettes.size();
const int safePalette = (palette >= 0 && palette < paletteCount) ? palette : 0;
if (palette != safePalette) {
    logWarningFormat("[MugenSpriteFileReader] Palette index %d out of range [0,%d). Using palette 0.",
                     palette, paletteCount);
}
...
auto& paletteElement = tDst->mPalettes[safePalette];
```

Apply the same fix at line 1209 (the PNG branch).

### Change #4 — Fix `remapMugenSpriteFilePalette` to respect v2.01 alpha

**Effort:** ~20 min

**Location:** `mugenspritefilereader.cpp:1603-1610`

```cpp
// BEFORE:
if (isRGBPalette(paletteElement.mBuffer))
    setPaletteFromBGR256WithFirstValueTransparentBuffer(tPaletteID, paletteElement.mBuffer);
else
    setPaletteFromARGB256Buffer(tPaletteID, paletteElement.mBuffer);

// AFTER:
if (isRGBPalette(paletteElement.mBuffer)) {
    if (gPrismMugenSpriteFileReaderData.mSffVerlo2 != 0) {
        // v2.01: respect per-entry alpha (convert RGB→ARGB with all-opaque, then respect any override)
        setPaletteFromBGR256Buffer(tPaletteID, paletteElement.mBuffer);   // no forced transparency
    } else {
        // v2.00 / v1: force index 0 transparent (legacy behavior)
        setPaletteFromBGR256WithFirstValueTransparentBuffer(tPaletteID, paletteElement.mBuffer);
    }
} else {
    setPaletteFromARGB256Buffer(tPaletteID, paletteElement.mBuffer);
}
```

This requires a new `setPaletteFromBGR256Buffer` function (without the "first value transparent" behavior) in the texture/palette layer. If that function doesn't exist, the alternative is to convert the RGB palette to ARGB in-place with alpha=255 for all entries, then call `setPaletteFromARGB256Buffer` — but that loses the v2.01 "any slot can be transparent" semantics unless we have a way to know which slot the author wanted transparent.

A pragmatic alternative: for v2.01, the alpha information is in the ARGB palette entries (not RGB), so RGB palettes from v2.01 files are already broken (no alpha to respect). The only correct fix is to ensure v2.01 palettes are stored as ARGB throughout the pipeline, not downgraded to RGB.

### Change #5 — Add support for sprite format 3 (RLE5)

**Effort:** ~45 min (need to write a decoder and test)

**Location:** `mugenspritefilereader.cpp:1141-1148` (`readRawSprite2`)

```cpp
// BEFORE:
if (tSprite->mFormat == 0) {
    return readRawUncompressedSprite2(tSprite->mDataLength);
}
else if (tSprite->mFormat == 2) {
    return readRawRLE8Sprite2(tSprite->mDataLength);
} else if (tSprite->mFormat == 4) {
    return readRawLZ5Sprite2(tSprite->mDataLength);
}
else {
    logError("Unable to parse sprite format.");
    ...
}

// AFTER — add format 3 (RLE5):
if (tSprite->mFormat == 0) {
    return readRawUncompressedSprite2(tSprite->mDataLength);
}
else if (tSprite->mFormat == 2) {
    return readRawRLE8Sprite2(tSprite->mDataLength);
}
else if (tSprite->mFormat == 3) {                              // NEW
    return readRawRLE5Sprite2(tSprite->mDataLength);           // NEW
}
else if (tSprite->mFormat == 4) {
    return readRawLZ5Sprite2(tSprite->mDataLength);
}
else {
    logError("Unable to parse sprite format.");
    ...
}
```

Also update `isPaletted` check at line 1183:
```cpp
int isPaletted = sprite.mFormat == 0 || sprite.mFormat == 2 || sprite.mFormat == 3 || sprite.mFormat == 4;  // add format 3
```

Reference: Ikemen GO's `Rle5Decode` at `image.go:1053-1095`. The format is similar to RLE8 but with 2 pixels packed per byte (4 bits each). The Dolmexica code already has `decodeRLE5BufferAndReturnOwnedBuffer` at line 347 (used by the v1 PCX path) — that's RLE5 for PCX, which may or may not be the same algorithm as SFF v2's format 3 RLE5. **Verify with the Ikemen GO reference before reusing.**

### Change #6 — Add SFF v1.00 dispatch branch

**Effort:** ~5 min

**Location:** `mugenspritefilereader.cpp:1445-1464`

```cpp
if (header.mVersion[1] == 1 && header.mVersion[3] == 1) {
    ret = loadMugenSpriteFile1(...);              // v1.01
}
else if (header.mVersion[1] == 1 && header.mVersion[3] == 0) {   // NEW
    ret = loadMugenSpriteFile1(...);              // v1.00 — same loader, slightly different subfile layout
}
else if (header.mVersion[1] == 1 && header.mVersion[3] == 2) {
    ret = loadMugenSpriteFile2(...);              // "v1.02" (mis-saved v2)
}
else if (header.mVersion[1] == 0 && header.mVersion[3] == 2) {
    ret = loadMugenSpriteFile2(...);              // v2.00 + v2.01
}
...
```

Very rare in practice (pre-2002 MUGEN files). The subfile layout for v1.00 may differ slightly from v1.01 (the `mIndexOfPreciousSpriteCopy` field semantics changed) — needs verification. Safe to defer if no test characters are available.

### Change #7 — Add header validation (defensive)

**Effort:** ~30 min

Add sanity checks in `loadMugenSpriteFile2` after `loadSFFHeader2`:

```cpp
loadSFFHeader2(&header);

// Sanity-check header (NEW)
if (header.mSpriteTotal > 100000) {
    logErrorFormat("Suspicious mSpriteTotal: %u (limit 100000). Aborting.", header.mSpriteTotal);
    recoverFromError();
}
if (header.mPaletteTotal > 1024) {
    logErrorFormat("Suspicious mPaletteTotal: %u (limit 1024). Aborting.", header.mPaletteTotal);
    recoverFromError();
}
if (header.mLDataOffset == 0 || header.mLDataLength == 0) {
    logWarning("SFF v2 has zero LDataOffset/LDataLength — sprites may fail to load");
}
```

Tune the limits based on real-world character sizes (the largest known character has ~5,000 sprites; 100,000 is a safe upper bound).

### Change #8 — Load multiple external .act files (not just one)

**Effort:** ~1-2 hours

**Location:** `loadMugenSpriteFilePaletteFile` (line 954) and `loadMugenSpriteFile2`'s palette setup

Currently only ONE `.act` file is loaded (the first one referenced in the `.def`). For full alt-palette support (e.g., player pressing different buttons on character select), the engine needs to load all `.act` files declared in the `.def`'s `pal1=`, `pal2=`, ... keys and store them as `mPalettes[0]`, `mPalettes[1]`, ... respectively, then update `remapMugenSpriteFilePalette` to switch between them.

This is a non-trivial change because:
- The current `+1` offset hack (line 1185) assumes exactly one external palette
- The `MugenSpriteFile` struct doesn't track which palette index corresponds to which `.def` `palN=`
- Ikemen GO solves this with a `PalTable` mapping `(1, N) → palette_index`; Dolmexica would need similar infrastructure

**Recommendation:** Defer until Change #1 is validated. Change #1 alone fixes the reported "characters turn black" bug; this Change #8 is for full alt-palette UX parity with Ikemen GO.

---

## 6. Effort Summary & Recommended Order

| # | Fix | Severity | Effort | Blocks "characters turn black"? |
|---|---|---|---|---|
| 1 | Version-byte palette alpha dispatch | 🔴 Critical | 30 min | ✅ YES — root cause |
| 3 | Palette index bounds check | 🟡 Moderate | 10 min | Partial (prevents crash, not black sprites) |
| 2 | PNG data length off-by-4 | 🟡 Moderate | 15 min | No (rare crash on tightly-packed files) |
| 4 | `remapMugenSpriteFilePalette` alpha | 🟡 Moderate | 20 min | No (alt-palette switching only) |
| 7 | Header validation | 🟢 Minor | 30 min | No (defensive hardening) |
| 5 | RLE5 format 3 support | 🟢 Minor | 45 min | No (rare format) |
| 6 | v1.00 dispatch | 🟢 Minor | 5 min | No (very rare) |
| 8 | Multi-.act palette loading | 🟢 Minor | 1-2 hr | No (alt-palette UX) |

**Total estimated effort for all 8 fixes:** ~4-5 hours of focused work + testing.

**Minimum viable fix for the reported bug:** Change #1 alone (~30 min). This replaces the unreliable `isUsingSpecialPalette2Loading` heuristic with a proper version-byte check, matching Ikemen GO's implementation. Validate by loading the Ultra Instinct Goku character (or any v2.01 character with PNG sprites and per-entry palette alpha) and verifying that standing, walking, jumping, and attacking all render correctly.

**Recommended batch:** Changes #1 + #2 + #3 together (~55 min). This fixes the root cause, prevents a related crash on tightly-packed SFF files, and adds a safety net for out-of-range palette indices.

---

## 7. Verification: SFF File Versions in the Repo

All bundled SFF files are v1.01 (`0,1,0,1`):

```
songoku.sff         sig=[ElecbyteSpr] ver_hex=[00010001] ver_dec=[ 0 1 0 1]
vegeta.sff          sig=[ElecbyteSpr] ver_hex=[00010001] ver_dec=[ 0 1 0 1]
fight.sff           sig=[ElecbyteSpr] ver_hex=[00010001] ver_dec=[ 0 1 0 1]
fightfx.sff         sig=[ElecbyteSpr] ver_hex=[00010001] ver_dec=[ 0 1 0 1]
system.sff          sig=[ElecbyteSpr] ver_hex=[00010001] ver_dec=[ 0 1 0 1]
uiu_campus_low.sff  sig=[ElecbyteSpr] ver_hex=[00010001] ver_dec=[ 0 1 0 1]
```

This is why Songoku and Vegeta (bundled, v1.01) work flawlessly while downloaded v2 characters (e.g., Ultra Instinct Goku) hit the palette bug. The Python generators (`scripts/generate-system-sff.py` writes v2.00, `scripts/generate-system-sff-v1.py` writes v1.01) match: the v2.00 generator's output uses `0,0,0,2` bytes.

---

## 8. References

- **Dolmexica itch.io changelog** (confirms two prior SFFv2 bugfixes are already in the code): https://captaindreamcast.itch.io/dolmexica-infinite
- **FightersParadise MUGEN compatibility doc** (v2.00 ↔ v2.01 decode parity): https://github.com/fakoli/FightersParadise/blob/main/docs/mugen-compatibility.md
- **Virtualltek community doc** (v2.01 introduced in MUGEN 1.1, adds PNG + alpha palettes): https://virtualltek.com/community/postid/89
- **Elecbyte sprmake2 docs** (SFF v2 = MUGEN 1.0; v1 deprecated): https://www.elecbyte.com/mugendocs/sprmake2.html
- **Elecbyte update history** (v2.01 incompatible with MUGEN 1.0): https://www.elecbyte.com/mugendocs-11b1/history.html
- **kazzmir/paintown issue #90** (v2.00 forces index 0 transparent): https://github.com/kazzmir/paintown/issues/90
- **MUGENFreeForAll forum** (v2.01 allows any slot transparent): https://mugenfreeforall.com/topic/47335-fighter-factory-3-transparent-palette-help
- **Ikemen GO image.go** (reference implementation, v2.01 alpha handling at line 2024): `ikemen-go/src/image.go`
- **Project TODO.md entry #32** (documents the reported bug): `fight-engine/TODO.md:122`
