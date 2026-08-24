# DOLMEXICA INFINITE — SESSION 7 HANDOFF (Super Z → Claude)

## FOR: Claude (or any AI/developer continuing this work)

This is the second handoff document. The first (`HANDOFF-FOR-CLAUDE.md`) is still in the repo and contains the full project overview. This document covers what happened in Session 7 (after Claude's Session 6 fixes).

---

## 1. CRITICAL: ENVIRONMENT RESET WIPED CLAUDE'S FIXES

**Claude made 3 fixes in Session 6 (commits `11d205b`, `f9e0234`, `87a29b5`). These were pushed to `origin/main`. Super Z then built the WASM and pushed (commit `14a2f50`).**

**However, the development environment reset between sessions, and the local git repo was restored to commit `05ea4fb` — BEFORE Claude's fixes.** The remote (`origin/main`) was also reset to `05ea4fb` during force-push operations.

### Current state of `origin/main`: commit `05ea4fb`

This means **NONE of Claude's Session 6 fixes are on the remote or in the deployed WASM:**

| Fix | Status | Evidence |
|-----|--------|----------|
| Friction (C2) | **NOT APPLIED** | `playerdefinition.cpp:2400` still passes `p->mHeader->mFiles.mConstants.mMovementData.mStandFiction` directly (not `1.0 - friction`) |
| ignorehitpause (C1) | **NOT APPLIED** | `mugenstatereader.h` has no `mIgnoreHitPause` field; `playerdefinition.cpp:3690` still calls `pauseDreamRegisteredStateMachine`; `mugenstatehandler.cpp:138` still bails on `mIsPaused` |
| Helper vars (C3) | **PARTIALLY APPLIED** | `playerdefinition.cpp:410-413` has `memset` in `resetHelperState` (this was from an earlier session, not Claude's — but it does zero helper vars) |

### What IS in the current deployed WASM (`dev-1787511494`):
This was built from commit `14a2f50` which included Claude's fixes. **BUT the remote has since been force-pushed back to `05ea4fb`, so this build is from a commit that no longer exists on the remote.** The next Vercel deploy will build from `05ea4fb` and will NOT have Claude's fixes.

**Action needed:** Re-apply Claude's 3 fixes from the Session 6 handoff, rebuild, and push.

---

## 2. SESSION 7 FINDINGS

### 2.1 Tien/Vegetto Disappearing During Charge — ROOT CAUSE FOUND

**This is the most important finding of Session 7.**

Tien and Vegetto "disappear" during their charge moves. The root cause is **NOT** helper variables, AssertSpecial flags, or any CNS logic — it's an **OpenGL blend function bug** in the WebGL rendering code.

**Root cause:** `drawing_win.cpp` line 797:
```cpp
case BLEND_TYPE_ADDITION:
    glBlendEquation(GL_FUNC_ADD);
    glBlendFunc(GL_SRC_ALPHA, GL_DST_ALPHA);  // BUG: GL_DST_ALPHA
    break;
```

`GL_DST_ALPHA` uses the **destination framebuffer's alpha** as the blend factor. In WebGL, the destination alpha is often 0, making the result:
```
src * srcAlpha + dst * 0 = src * srcAlpha  (NOT additive — just dim/invisible)
```

Charge animations use `A1` (additive) blending on their sprite frames:
```mugen
; Tien's charge animation (anim 1900)
888,67, 3,3, 2, , A1    ; A1 = additive blend
888,68, 3,3, 2, , A1    ; A1 = additive blend
```

With `GL_DST_ALPHA`, these frames render as nearly invisible instead of bright/glowing.

**The fix (1 line):**
```cpp
glBlendFunc(GL_SRC_ALPHA, GL_ONE);  // Correct: src*srcAlpha + dst*1 (true additive)
```

**Note:** There's a `#ifndef __EMSCRIPTEN__` block above (line 784) that uses a shader-based approach for non-WASM builds. WASM builds use the `glBlendFunc` path which was wrong. The fix only affects the WASM/`__EMSCRIPTEN__` path.

**This fix was applied and built (`dev-1787521399`, commit `5b9c0e2`) but was lost in the environment reset.** It needs to be re-applied.

### 2.2 Tien's Charge System Architecture (for reference)

State 1900 (Tien's charge):
- `anim = 1900` (charge animation, uses sprites 888,64/67/68 with A1 blending)
- Spawns helper (state 1902, `anim = 1950`) for the aura effect
- Helper uses `BindToParent`, `NoShadow`, `DestroySelf` when charge ends
- `ownpal = 1` on helper (own palette copy)
- `ignorehitpause = 1` on helper

The character disappears because the PLAYER's charge animation (1900) uses A1 blending. The helper (aura) may also use A1 but the main issue is the player sprite.

### 2.3 Cooler Back Dash — Still Unfixed

The animation time off-by-one (`getTimeWhenStepStarts` returns `sum + 1`) was NOT fixed in this session. Multiple attempts failed:
- Removing the `+1` breaks `animelemtime(1) = 0` triggers (jump animations)
- Keeping the `+1` and incrementing `mOverallTime` after animation end didn't work because `mHasLooped` resets every frame
- The correct fix requires a full rewrite of the animation time system (see Section 5 of the original `HANDOFF-FOR-CLAUDE.md`)

### 2.4 Zarbon Opponent Freeze — Not Investigated

Still unfixed. Likely caused by `ignorehitpause` not working (Claude's fix was lost) or `p2stateno` custom state issues.

---

## 3. WHAT NEEDS TO BE DONE (PRIORITY ORDER)

### Step 1: Re-apply Claude's Session 6 fixes (lost in environment reset)

These 3 fixes were properly root-caused and implemented by Claude. They need to be re-applied:

1. **Friction (C2)** — `playerdefinition.cpp` lines 2400, 2409: change `p->mHeader->mFiles.mConstants.mMovementData.mStandFiction` to `1.0 - p->mHeader->mFiles.mConstants.mMovementData.mStandFiction` (same for CrouchFriction)

2. **ignorehitpause (C1)** — 4 files need changes:
   - `mugenstatereader.h`: Add `uint8_t mIgnoreHitPause;` to `DreamMugenStateController`
   - `mugenstatecontrollers.cpp`: Add `parseStateControllerIgnoreHitPause()` that parses `ignorehitpause` from group key (default 0)
   - `mugenstatehandler.cpp:62`: In `updateSingleController()`, skip if `isPlayerHitPaused(player) && !controller->mIgnoreHitPause`
   - `mugenstatehandler.cpp`: In `updateSingleStateMachineByReference()`, remove the `mIsPaused` early return for hitpause; instead walk all controllers but only increment `mTimeInState` when NOT hitpaused
   - `playerdefinition.cpp`: In `pausePlayer()` and `forceUnpausePlayer()`, remove `pauseDreamRegisteredStateMachine`/`unpauseDreamRegisteredStateMachine` calls (keep physics/animation pausing)

3. **Helper vars (C3)** — `playerdefinition.cpp`: Add `memset` calls in `resetHelperState()` (this is ALREADY in the code at lines 410-413, so this fix survived)

### Step 2: Apply the A1 blend fix (Tien/Vegetto disappearing)

`drawing_win.cpp` line 797: Change `GL_DST_ALPHA` to `GL_ONE`:
```cpp
glBlendFunc(GL_SRC_ALPHA, GL_ONE);
```

### Step 3: Build and deploy

```bash
# Install emsdk (deleted on every environment restart)
git clone https://github.com/emscripten-core/emsdk.git /home/z/emsdk
cd /home/z/emsdk && ./emsdk install latest && ./emsdk activate latest

# Download ports (Python urllib is flaky — use curl)
mkdir -p /home/z/emsdk/upstream/emscripten/cache/ports
cd /home/z/emsdk/upstream/emscripten/cache/ports
curl -sL -o zlib.tar.gz "https://github.com/madler/zlib/archive/refs/tags/v1.3.2.tar.gz"
curl -sL -o harfbuzz.tar.xz "https://github.com/harfbuzz/harfbuzz/releases/download/3.2.0/harfbuzz-3.2.0.tar.xz"
curl -sL -o sdl2.zip "https://github.com/libsdl-org/SDL/archive/release-2.32.10.zip"
curl -sL -o sdl2_image.zip "https://github.com/libsdl-org/SDL_image/archive/refs/tags/release-2.6.0.zip"
curl -sL -o sdl2_mixer.zip "https://github.com/libsdl-org/SDL_mixer/archive/release-2.8.0.zip"
curl -sL -o sdl2_ttf.zip "https://github.com/libsdl-org/SDL_ttf/archive/release-2.20.2.zip"
curl -sL -o ogg.zip "https://github.com/xiph/ogg/releases/download/v1.3.5/libogg-1.3.5.zip"
curl -sL -o vorbis.zip "https://github.com/xiph/vorbis/releases/download/v1.3.7/libvorbis-1.3.7.zip"
curl -sL -o freetype.zip "https://github.com/freetype/freetype/archive/VER-2-13-3.zip"

# Build ports
cd /home/z/emsdk/upstream/emscripten
python3 ./embuilder.py build zlib harfbuzz sdl2 sdl2_image sdl2_mixer sdl2_ttf ogg vorbis freetype

# Build WASM (takes 3-5 minutes, use nohup if timeout)
cd /home/z/my-project/fight-engine
nohup bash scripts/build-wasm.sh > /tmp/build.log 2>&1 &
sleep 200; tail -15 /tmp/build.log

# Commit and push (DO NOT use --force)
git add -A && git commit -m "FIX: re-apply friction + ignorehitpause + A1 blend fix" && git push origin main
```

### Step 4: Verify deployment
```bash
curl -sL "https://fighting-game-engine.vercel.app/game/build-version.json"
# Compare version with local build
```

---

## 4. WHAT NOT TO DO (updated from Session 6)

1. **Do NOT `git push --force`** — causes Vercel downtime and can lose commits
2. **Do NOT modify `getTimeWhenStepStarts` or `mHasLooped`** — attempted 6+ times, always breaks something else
3. **Do NOT modify `updateLanding`** — attempted 3 times, broke all airborne attacks
4. **Do NOT trust that environment changes persist between sessions** — the environment resets and loses all uncommitted work AND sometimes committed work that was force-pushed
5. **Do NOT use the Edit tool on engine source files** — it converts tabs to 8-space sequences, creating massive diffs. Use Python scripts or `sed` instead.
6. **Do NOT forget to download Emscripten ports via curl** — Python `urllib` fails with HTTP 429 rate limiting. Always pre-download ports with `curl` before running `embuilder.py`.

---

## 5. REMAINING ISSUES (after Steps 1-3)

| Issue | Status | Fix Complexity |
|-------|--------|---------------|
| Cooler back dash freeze | Not fixed — needs animation time rewrite | High (~100 lines, high risk) |
| Zarbon opponent freeze | Not investigated | Unknown |
| 34 AssertSpecial flags not enforced | Known — stored but not enforced | Medium (per-flag enforcement) |
| ReversalDef gives no power | Known — 1 line fix | Trivial |
| HitOverride + p2stateno logic | Known — needs rewrite | Medium (~20 lines) |
| Animation time system rewrite | Known — needs full 0-indexed rewrite | High (~100 lines, highest risk) |

---

## 6. KEY FILES

- `docs/HANDOFF-FOR-CLAUDE.md` — Original handoff (full project overview, all issues, architecture)
- `docs/deep-dives/16-engine-compatibility-analysis.md` — Full compatibility audit (7 critical, 8 medium, 12 low)
- `worklog.md` — Full development history (4000+ lines, includes COMPAT-ANIM/STATE/HELPER/PHYS audit entries)
- `TODO.md` — All fixes done and pending
- `PROGRESS.md` — Session-by-session progress log

---

## 7. SUMMARY

The most impactful fix this session was finding the **A1 blend function bug** — a 1-line OpenGL fix that makes Tien/Vegetto charge animations visible. This was a rendering bug, not a CNS/engine logic bug.

The most impactful fix still pending is Claude's **ignorehitpause implementation** — it was properly root-caused and implemented in Session 6 but was lost in the environment reset. It needs to be re-applied.

The hardest remaining issue is the **animation time system** — it needs a full rewrite to be 0-indexed like Ikemen GO. This is high-risk and should only be attempted with dedicated testing time.
