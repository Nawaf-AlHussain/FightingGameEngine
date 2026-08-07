# Phase 0 Checklist — Engine to WASM

## Execution Steps

### Step 1: Clone Engine
```bash
git clone --recursive https://github.com/Dolmexica/DolmexicaInfinite.git engine/DolmexicaInfinite
cd engine/DolmexicaInfinite/addons/prism && git checkout develop
```

### Step 2: Fix Vector2D API
File: `engine/DolmexicaInfinite/playerdefinition.cpp`
- 6 call sites changed from `setMugenAnimationCoordinateSystemScale(elem, 1.0)` to `setMugenAnimationCoordinateSystemScale(elem, Vector2D(1.0, 1.0))`

### Step 3: Replace FMOD Audio
Created:
- `engine/DolmexicaInfinite/addons/prism/web/sound_web.cpp` — SDL_mixer music
- `engine/DolmexicaInfinite/addons/prism/web/soundeffect_web.cpp` — SDL_mixer SFX

### Step 4: Add zstd Headers
Downloaded from facebook/zstd:
- `prism/include/zstd.h`
- `prism/include/zstd_errors.h`

### Step 5: Build Script
`scripts/build-wasm.sh` — handles:
1. Build Prism (60+ .cpp + 14 Windows platform .cpp + 2 web sound .cpp → libprism.a)
2. Build Dolmexica (50 .cpp files)
3. Link with SDL2, SDL_mixer, SDL2_image (PNG), SDL_ttf
4. Package assets with file_packager
5. Copy to public/game/

### Step 6: First Build (no assets)
```bash
bash scripts/build-wasm.sh
# Result: game.wasm (3.2MB), game.js (180KB)
```

### Step 7: Download Characters
- Superman Rebirth (43MB SFF + 26MB SND)
- Nightwing by O Illusionista (20MB SFF + 9.5MB SND)
- Songoku (2MB SFF + 2MB SND)

### Step 8: Validate
```bash
python3 tools/validate-mugen.py engine/DolmexicaInfinite/chars/KnightmareSuperman/KnightmareSuperman.def
```

### Step 9: Rebuild with Assets
```bash
bash scripts/build-wasm.sh
# Now includes chars/ + data/ in game.data
```

## Error Reference

| Error | Fix |
|-------|-----|
| `SDL2_IMAGE_FORMATS` ISO C99 error | Use `--use-port=sdl2_image:formats=png` instead of `-s SDL2_IMAGE_FORMATS='["png"]'` |
| Missing zstd.h | Download headers into prism/include/ |
| Vector2D type mismatch | Changed 6 call sites to use `Vector2D(1.0, 1.0)` |
| Missing platform symbols | Add 14 Windows platform .cpp files (SDL-based, cross-platform) |
| FMOD not available | Created web/ sound replacements with SDL_mixer |
| Buffer.mSize undefined | Use Buffer.mLength (Prism API) |

## Verification Checkpoints

- [ ] `emrun public/game/index.html` opens a canvas
- [ ] Console shows no SDL/FMOD errors
- [ ] Character select screen appears (MUGEN default)
- [ ] Selecting a character loads their sprites