#!/usr/bin/env bash
# =============================================================================
# build-wasm.sh — Build Dolmexica Infinite to WebAssembly
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE_DIR="$PROJECT_ROOT/engine/DolmexicaInfinite"
PRISM_DIR="$ENGINE_DIR/addons/prism"
BUILD_DIR="$PROJECT_ROOT/build/wasm"
OUTPUT_DIR="$PROJECT_ROOT/public/game"

export EMSDK_QUIET=1
# Source emsdk first (it sets EMSDK var), then prepend the tool paths.
source /tmp/emsdk/emsdk_env.sh 2>&1 || true
export PATH="/tmp/emsdk/upstream/emscripten:/tmp/emsdk/upstream/bin:/tmp/emsdk/node/22.16.0_64bit/bin:$PATH"

if ! command -v emcc &>/dev/null; then
    echo "ERROR: emcc not found."
    exit 1
fi

# Redirect all output to a log file
exec > >(tee -a /tmp/wasm-build.log) 2>&1

echo "=== Emscripten $(emcc --version | head -1) ==="

CLEAN=0
for arg in "$@"; do
    case "$arg" in --clean) CLEAN=1 ;; esac
done

if [ $CLEAN -eq 1 ]; then
    echo "=== Cleaning ==="
    rm -rf "$BUILD_DIR" "$OUTPUT_DIR"
fi

mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"

# Common flags — based on Prism Makefile.commonweb
# Note: -O1 instead of -O2 to reduce memory usage during compilation
# (system has 4GB cgroup limit; -O2 causes OOM kills on larger files)
PRISM_FLAGS="-s WASM=1 -s USE_SDL=2 -s USE_SDL_MIXER=2 -s USE_SDL_TTF=2"
PRISM_FLAGS="$PRISM_FLAGS --use-port=sdl2_image:formats=png"
PRISM_FLAGS="$PRISM_FLAGS -std=c++17 -fpermissive -O1 -g2"
PRISM_FLAGS="$PRISM_FLAGS -I$PRISM_DIR/include"

DOLMEXICA_FLAGS="$PRISM_FLAGS"
DOLMEXICA_FLAGS="$DOLMEXICA_FLAGS -I$ENGINE_DIR"

LINK_FLAGS="-s WASM=1 -O1 -g2"
LINK_FLAGS="$LINK_FLAGS -s USE_SDL=2 -s USE_SDL_MIXER=2 -s USE_SDL_TTF=2"
LINK_FLAGS="$LINK_FLAGS --use-port=sdl2_image:formats=png"
LINK_FLAGS="$LINK_FLAGS -s NO_EXIT_RUNTIME=1"
LINK_FLAGS="$LINK_FLAGS -s CASE_INSENSITIVE_FS=1 -s FORCE_FILESYSTEM=1"
LINK_FLAGS="$LINK_FLAGS -s TOTAL_MEMORY=805306368"          # 768 MB fixed (no growth)
# NOTE: Do NOT use ALLOW_MEMORY_GROWTH. When the WASM heap grows, all
# existing C++ pointers (DreamPlayer*, hit data, animation pointers)
# become invalid because the heap is relocated. This causes
# "memory access out of bounds" crashes during HitDef evaluation.
# The original Dolmexica build uses fixed 384MB with no growth.
# We use 768MB to have headroom for 3 characters + AI without growing.
LINK_FLAGS="$LINK_FLAGS -s EXPORTED_RUNTIME_METHODS=ccall,cwrap,setValue,getValue,FS,HEAP32,HEAP8"
LINK_FLAGS="$LINK_FLAGS -s EXPORTED_FUNCTIONS=[_setExternalPlayerInput,_disableExternalInput,_isExternalInputActive,_startDirectMatch,_forcePlayerState,_forcePlayerControl,_setPlayerAI,_getPlayerLifeExport,_getPlayerLifeMaxExport,_getPlayerPowerExport,_isPlayerAliveExport,_getPlayerStateExport,_getPlayerRoundsWonExport,_getRoundNumberExport,_getRoundStateExport,_getSyncFingerprintExport,_setRandomSeedExport,_setPlayerSyncStateExport,_updateResyncInterpolationExport,_getPlayerPositionXExport,_getPlayerPositionYExport,_getPlayerVelocityXExport,_getPlayerVelocityYExport,_getPlayerFacingExport,_malloc,_free,_main]"

# =============================================================================
# STEP 1: Build Prism
# =============================================================================
echo ""
echo "=== [1/4] Building Prism library ==="
cd "$PRISM_DIR"

# Core Prism sources (flat in repo root)
# EXCLUDE soundeffect.cpp — it's replaced by web/soundeffect_web.cpp (SDL_mixer)
PRISM_SRC=$(ls *.cpp 2>/dev/null | grep -v test | grep -v '^soundeffect\.cpp$' | sort)
PRISM_COUNT=$(echo "$PRISM_SRC" | wc -w)

echo "  Compiling $PRISM_COUNT Prism source files..."

PRISM_OBJS=""
for f in $PRISM_SRC; do
    base=$(basename "$f" .cpp)
    # Resume support: skip if .o already exists and is newer than .cpp
    if [ -f "$BUILD_DIR/prism_${base}.o" ] && [ "$BUILD_DIR/prism_${base}.o" -nt "$f" ]; then
        echo "    $f (cached)"
        PRISM_OBJS="$PRISM_OBJS $BUILD_DIR/prism_${base}.o"
        continue
    fi
    echo "    $f"
    if ! em++ $PRISM_FLAGS -c "$f" -o "$BUILD_DIR/prism_${base}.o" 2>&1; then
        echo "  ERROR compiling $f — see above"
        exit 1
    fi
    PRISM_OBJS="$PRISM_OBJS $BUILD_DIR/prism_${base}.o"
done

# Windows platform files (SDL-based, cross-platform)
# NOTE: thread_win.cpp is EXCLUDED — it includes Windows.h and is replaced
# by web/thread_web.cpp (synchronous, no threads). See Phase 0 notes.
WIN_FILES=""
for f in \
    windows/drawing_win.cpp \
    windows/input_win.cpp \
    windows/system_win.cpp \
    windows/file_win.cpp \
    windows/math_win.cpp \
    windows/memoryhandler_win.cpp \
    windows/log_win.cpp \
    windows/texture_win.cpp \
    windows/screeneffect_win.cpp \
    windows/framerateselect_win.cpp \
    windows/saveload_win.cpp \
    windows/romdisk_win.cpp; do
    if [ -f "$PRISM_DIR/$f" ]; then
        base=$(basename "$f" .cpp)
        # Resume support: skip if .o already exists and is newer than .cpp
        if [ -f "$BUILD_DIR/prism_${base}.o" ] && [ "$BUILD_DIR/prism_${base}.o" -nt "$PRISM_DIR/$f" ]; then
            echo "    $f (cached, platform)"
            WIN_FILES="$WIN_FILES $BUILD_DIR/prism_${base}.o"
            continue
        fi
        echo "    $f (platform)"
        if ! em++ $PRISM_FLAGS -c "$PRISM_DIR/$f" -o "$BUILD_DIR/prism_${base}.o" 2>&1; then
            echo "  ERROR compiling $f — see above"
            exit 1
        fi
        WIN_FILES="$WIN_FILES $BUILD_DIR/prism_${base}.o"
    fi
done

# Web replacements (SDL_mixer audio, netplay stubs, threading, zstd)
for f in \
    web/sound_web.cpp \
    web/soundeffect_web.cpp \
    web/netplay_web.cpp \
    web/thread_web.cpp \
    web/zstd_stub.cpp; do
    if [ -f "$PRISM_DIR/$f" ]; then
        base=$(basename "$f" .cpp)
        # Resume support
        if [ -f "$BUILD_DIR/prism_${base}.o" ] && [ "$BUILD_DIR/prism_${base}.o" -nt "$PRISM_DIR/$f" ]; then
            echo "    $f (cached, web)"
            WIN_FILES="$WIN_FILES $BUILD_DIR/prism_${base}.o"
            continue
        fi
        echo "    $f (web)"
        if ! em++ $PRISM_FLAGS -c "$PRISM_DIR/$f" -o "$BUILD_DIR/prism_${base}.o" 2>&1; then
            echo "  ERROR compiling $f — see above"
            exit 1
        fi
        WIN_FILES="$WIN_FILES $BUILD_DIR/prism_${base}.o"
    fi
done

echo "  Archiving libprism.a..."
ar rcs "$BUILD_DIR/libprism.a" $PRISM_OBJS $WIN_FILES
echo "  ✓ Prism: $(du -h "$BUILD_DIR/libprism.a" | cut -f1)"

# =============================================================================
# STEP 2: Build Dolmexica
# =============================================================================
echo ""
echo "=== [2/4] Building Dolmexica ==="
cd "$ENGINE_DIR"

DOLMEXICA_SRC=$(ls *.cpp 2>/dev/null | grep -v test | sort)
DOLMEXICA_COUNT=$(echo "$DOLMEXICA_SRC" | wc -w)

echo "  Compiling $DOLMEXICA_COUNT Dolmexica files..."

DOLMEXICA_OBJS=""
for f in $DOLMEXICA_SRC; do
    base=$(basename "$f" .cpp)
    # Resume support: skip if .o already exists and is newer than .cpp
    if [ -f "$BUILD_DIR/dolmexica_${base}.o" ] && [ "$BUILD_DIR/dolmexica_${base}.o" -nt "$f" ]; then
        echo "    $f (cached)"
        DOLMEXICA_OBJS="$DOLMEXICA_OBJS $BUILD_DIR/dolmexica_${base}.o"
        continue
    fi
    echo "    $f"
    if ! em++ $DOLMEXICA_FLAGS -c "$f" -o "$BUILD_DIR/dolmexica_${base}.o" 2>&1; then
        echo "  ERROR compiling $f — see above"
        exit 1
    fi
    DOLMEXICA_OBJS="$DOLMEXICA_OBJS $BUILD_DIR/dolmexica_${base}.o"
done

# =============================================================================
# STEP 3: Link
# =============================================================================
echo ""
echo "=== [3/4] Linking WASM ==="

ALL_OBJS="$BUILD_DIR/dolmexica_*.o $BUILD_DIR/prism_*.o"

em++ $ALL_OBJS "$BUILD_DIR/libprism.a" \
    $LINK_FLAGS \
    -o "$BUILD_DIR/game.js" \
    2>&1 | tail -10

echo "  ✓ Linked: game.js + game.wasm"

# =============================================================================
# STEP 4: Package assets
# =============================================================================
echo ""
echo "=== [4/4] Packaging assets ==="

CHARS_DIR="$ENGINE_DIR/chars"
DATA_DIR="$ENGINE_DIR/data"

# FIX-3: Selective preload. Only bundle small characters by default.
# Override with BUNDLE_CHARS="Songoku Vegeta" env var.
# Default bundle: Songoku (~4MB) + Vegeta (~4.3MB) keeps first-load under ~10MB.
BUNDLE_CHARS="${BUNDLE_CHARS:-Songoku Vegeta}"

PRELOAD_FLAGS=""
if [ -d "$DATA_DIR" ] && [ "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
    PRELOAD_FLAGS="$PRELOAD_FLAGS --preload $DATA_DIR@/data"
    echo "  Including data/ directory"
fi

# Per-character selective preload (FIX-3)
if [ -d "$CHARS_DIR" ]; then
    for char in $BUNDLE_CHARS; do
        char_dir="$CHARS_DIR/$char"
        if [ -d "$char_dir" ]; then
            PRELOAD_FLAGS="$PRELOAD_FLAGS --preload $char_dir@/chars/$char"
            size=$(du -sh "$char_dir" | cut -f1)
            echo "  Including chars/$char ($size)"
        else
            echo "  WARNING: chars/$char not found (skipping)"
        fi
    done
fi

# Also include any stages directory if present
STAGES_DIR="$ENGINE_DIR/stages"
if [ -d "$STAGES_DIR" ] && [ "$(ls -A "$STAGES_DIR" 2>/dev/null)" ]; then
    PRELOAD_FLAGS="$PRELOAD_FLAGS --preload $STAGES_DIR@/stages"
    echo "  Including stages/ directory"
fi

# Include font directory (prism fonts for engine text rendering)
FONT_DIR="$ENGINE_DIR/font"
if [ -d "$FONT_DIR" ] && [ "$(ls -A "$FONT_DIR" 2>/dev/null)" ]; then
    PRELOAD_FLAGS="$PRELOAD_FLAGS --preload $FONT_DIR@/font"
    echo "  Including font/ directory"
fi

if [ -n "$PRELOAD_FLAGS" ]; then
    echo "  Running file_packager..."
    EMSCRIPTEN_ROOT="$(dirname "$(which emcc)")"
    python3 "$EMSCRIPTEN_ROOT/tools/file_packager.py" \
        "$BUILD_DIR/game.data" \
        --use-preload-plugins \
        $PRELOAD_FLAGS \
        --js-output="$BUILD_DIR/game.assets.js" \
        2>&1 | tail -5

    # Merge the assets JS into the main game.js
    cat "$BUILD_DIR/game.assets.js" >> "$BUILD_DIR/game.js"
    echo "  ✓ Assets packaged: $(du -h "$BUILD_DIR/game.data" | cut -f1)"
else
    echo "  No assets to package"
fi

# =============================================================================
# STEP 5: Copy artifacts
# =============================================================================
echo ""
echo "=== [5/5] Copying to $OUTPUT_DIR ==="

cp -f "$BUILD_DIR/game.js" "$OUTPUT_DIR/" && echo "  ✓ game.js ($(du -h "$OUTPUT_DIR/game.js" | cut -f1))"
cp -f "$BUILD_DIR/game.wasm" "$OUTPUT_DIR/" && echo "  ✓ game.wasm ($(du -h "$OUTPUT_DIR/game.wasm" | cut -f1))"
[ -f "$BUILD_DIR/game.data" ] && cp -f "$BUILD_DIR/game.data" "$OUTPUT_DIR/" && echo "  ✓ game.data ($(du -h "$OUTPUT_DIR/game.data" | cut -f1))"

# Write a build-version.json with a timestamp + wasm hash so the frontend
# loader can cache-bust /game/ files properly. Without this, the browser
# caches game.wasm?v=dev forever in local dev (next.config.js falls back
# to "dev" when NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is unset), and engine
# fixes never reach the user's browser even after a rebuild.
BUILD_TS=$(date +%s)
WASM_SHA256=$(sha256sum "$OUTPUT_DIR/game.wasm" | cut -d' ' -f1)
cat > "$OUTPUT_DIR/build-version.json" <<EOF
{
  "version": "dev-${BUILD_TS}",
  "buildTime": ${BUILD_TS},
  "wasmSha256": "${WASM_SHA256}",
  "wasmSize": $(stat -c%s "$OUTPUT_DIR/game.wasm")
}
EOF
echo "  ✓ build-version.json (version=dev-${BUILD_TS})"

# Generate index.html
cat > "$OUTPUT_DIR/index.html" <<'HTML'
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fighting Game Engine</title>
  <style>
    body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
    canvas { image-rendering: pixelated; image-rendering: crisp-edges; }
  </style>
</head>
<body>
  <script src="game.js"></script>
</body>
</html>
HTML
echo "  ✓ index.html"

echo ""
echo "=== Build Complete ==="
ls -lh "$OUTPUT_DIR/" | grep -v total
echo ""
echo "To test: python3 -m http.server 8080 -d $OUTPUT_DIR"