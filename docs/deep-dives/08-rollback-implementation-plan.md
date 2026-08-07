# Rollback Netcode + WebRTC P2P — Implementation Plan

**Last Updated:** 2026-08-06
**Purpose:** Step-by-step, file-by-file plan for upgrading the Dolmexica Infinite browser fighting game from input-delay lockstep (with snap-resync) to true GGPO-style rollback netcode, and from WebSocket relay to WebRTC DataChannel P2P transport (relay retained for signaling + fallback).
**Audience:** Another coding agent that will execute the plan. Each section is independently testable where possible.

---

## 0. Current State Summary (verified by source audit)

| Concern | Current State | Source |
|---|---|---|
| Engine | C++ → WASM via Emscripten, fixed 768 MB heap (no growth) | `scripts/build-wasm.sh:57` |
| Main loop | `emscripten_set_main_loop(performScreenIteration, 60, 1)` — Emscripten owns rAF | `addons/prism/wrapper.cpp:692` |
| Sim/Render separation | Already separated at `updateScreen()` vs `drawScreen()` | `addons/prism/wrapper.cpp:567`, `:602` |
| Input injection | `setExternalPlayerInput(playerIndex, char* inputString)` parses MUGEN strings | `addons/prism/input.cpp:641` |
| RNG | `srand`/`rand` (libc-internal state — **NOT** serializable today) | `addons/prism/math.cpp:14` |
| State query exports | Player pos/vel/life/state/facing, round number/state, sync fingerprint (FNV-1a 64-bit of rounded positions+life+state+facing+rounds) | `engine/DolmexicaInfinite/start_direct_match.cpp:273` |
| Snap-resync export | `setPlayerSyncStateExport(idx,x,y,life,state,facing)` snaps pos+life if drift > 30px | `start_direct_match.cpp:383` |
| Netcode (TS) | FIFO input queue with 1-frame grace prediction + catch-up drain, fixed-timestep accumulator (MAX_CATCHUP=3) | `src/hooks/use-online-multiplayer.ts:335` |
| Transport | JSON-over-WebSocket relay on Deno Deploy, `sendPing()` returns Cristian offset | `src/lib/relay-client.ts:413`, `server/src/index.ts` |
| Desync detection | `getSyncFingerprintExport` polled every 180 frames; on mismatch host sends snap-resync | `src/lib/desync-detector.ts:25`, `src/hooks/use-online-multiplayer.ts:556` |

**Gap to rollback:** No `saveGameState`/`restoreGameState` C exports. RNG state is not capturable. No way to call `updateScreen()` N times without also calling `drawScreen()`. WebRTC is not wired up at all.

**Gap to P2P:** All traffic goes through the relay (extra ½RTT). WebRTC DataChannel could shave 20–80 ms for same-region pairs.

---

## 1. ENGINE STATE SERIALIZATION (the hard part)

### 1.1 What state must be serialized

A save-state is "everything that, if changed, would change a future `updateScreen()` tick." Anything that is read-only after `loadFightScreen()` (asset data, animation definitions, sound files, sprite files) does **not** need to be saved. Anything that is purely visual and recomputed each frame (camera shake offset, current render target) does **not** need to be saved (but must be deterministic enough that re-deriving it from sim state gives the same value).

Audit by reading the `static struct { ... } g*Data` declarations (the engine follows this naming convention religiously):

#### Tier 1 — Critical, must serialize:

| Subsystem | Symbol | File:Line | Approx. size |
|---|---|---|---|
| Game logic | `gGameLogicData` | `gamelogic.cpp:50` | ~80 B (mGameTime, mRoundNumber, mRoundStateNumber, mRoundsToWin, mTimeSinceKO, mRoundWinner*, mMatchWinnerIndex, mMode, mExhibit, mSlowdown) |
| Player struct × 2 (root) | `gPlayerDefinition.mPlayers[0..1]` | `playerdefinition.cpp:66`, struct at `playerdefinition.h:104-287` | ~6–8 KB each (see breakdown below) |
| All helper players (children) | `gPlayerDefinition.mHelperStore` (unordered_map<int, DreamPlayer>) | `playerdefinition.cpp:78` | Variable — MUGEN characters spawn 0–8 helpers at a time. Cap at 32. |
| All projectiles | `gProjectileData.mProjectileList` (IntMap of `Projectile`, struct at `projectile.cpp:15-51`) | `projectile.cpp:53` | ~150 B each, typically 0–6 active |
| All explods (visual fx that affect gameplay via hit detection) | `gMugenExplod.mExplods` (unordered_map<int, Explod>) | `mugenexplod.cpp:79` | ~120 B each, 0–30 active |
| Stage camera & shake | `gMugenStageHandlerData` (camera pos, target, range, speed, zoom, shake offset, time dilatation) | `mugenstagehandler.cpp:18` | ~200 B (skip mStaticElements list — those are derived from stage def) |
| Stage static element animations | `gMugenStageHandlerData.mStaticElements` (anim time per element) | `mugenstagehandler.cpp:19` | ~24 B per element, ~10–40 elements |
| Timer system | `gTimerData.mList` (map<int, TimerElement>) | `addons/prism/timer.cpp:25` | ~32 B per active timer |
| External input overlay | `gExternalInput.mRemoteButtons[]`, `mIsActive[]` | `addons/prism/input.cpp:24` | 16 B (2 players × uint32 + 2 ints) |
| Local input prev/current flanks | `gPrismGeneralInputData.mStatus[].mPrev/mCurrent` | `addons/prism/input.cpp:71` | 2 × 2 × ~14 bytes = ~56 B (needed so flanks are correct after restore) |
| RNG state | Currently libc-internal — **must replace** (see §1.4) | `addons/prism/math.cpp` | 4 B (xorshift32) or 32 B (PCG) |
| Fight UI timers (round timer, intro timer) | `gFightUIData.mTime.mNow/mValue/mIsFinished/mIsActive`, mRound.mNow, mKO, mFight, mControl, mSlow, mStart, mOver | `fightui.cpp:486` | ~400 B (only the *numeric* state of each substruct — skip animation element pointers) |
| Fight UI combo counters | `gFightUIData.mCombos[2].mNow`, mCounter, mIsVisible | `fightui.cpp:502` | ~24 B |
| Fight UI env effects | `gFightUIData.mEnvironmentEffects` (active, remaining time, color), `mEnvironmentShake` (time, magnitude, offset) | `fightui.cpp:518` | ~64 B |
| Hit sparks list | `gFightUIData.mHitSparks` (list<HitSpark> — position, anim time, type) | `fightui.cpp:521` | ~32 B each, 0–8 active |

**Estimated total per save-state:** 25–60 KB per slot (depends on helper/projectile/explod count).
**8 save slots:** 200–500 KB RAM. Well within mobile budgets.

#### Tier 2 — Pointer rebasing required (still must serialize):

| Subsystem | Issue | Strategy |
|---|---|---|
| `DreamPlayer.mAnimationElement` (MugenAnimationHandlerElement*) | Heap pointer — invalid after restore | On save: serialize the element's mutable fields (current frame, time, draw flags). On restore: re-fetch pointer via `getPlayerAnimationElement()` (the engine already maintains the link) and overwrite the fields. |
| `DreamPlayer.mPhysicsElement` (PhysicsHandlerElement*) | Heap pointer | Re-fetch via `getPlayerPhysicsElement()`; serialize position+velocity from the handler element. The engine's `getPlayerPositionX/Y` already reads through this. |
| `DreamPlayer.mRegisteredStateMachine` (RegisteredMugenStateMachine*) | Pointer to a state-machine registration that is set up once during player load | Do NOT serialize. The registration is static once a player is loaded. Restoring mRegisteredStateMachine to its existing value (the pointer is the same across save/restore) is a no-op. |
| `DreamPlayer.mParent`, `mRoot`, `mOtherPlayer`, `mBoundTarget` | Player pointers | Re-derive from indices: serialize `mRootID`, `mID`, `mParentID`, `mBoundTargetID`; on restore, call `getPlayerByIndex(id)` or `getRootPlayer(idx)` to re-resolve. |
| `DreamPlayer.mHelpers` (List of DreamPlayer*) | List of pointers | Serialize the list of helper IDs; on restore, rebuild the list by looking up each ID in `gPlayerDefinition.mHelperStore`. |
| `DreamPlayer.mProjectiles` (IntMap) | Already keyed by int ID | Just save the keys + the DreamPlayer* pointers (resolve via ID on restore). |
| `DreamPlayer.mReceivedHitData` (std::list<PlayerHitData>) | Plain data — serialize directly | Serialize N entries × sizeof(PlayerHitData) (~64 B each, typically 0–4). |
| `DreamPlayer.mReceivedReversalDefPlayers`, `mActiveTargets` (std::set) | Sets of pointers | Same approach — save IDs, resolve on restore. |
| `DreamPlayer.mAfterImage` (DreamPlayerAfterImage) | Contains a list of image frames | Look at `afterimage.h`; serialize the queue. ~64 B × N (cap at N=30). |
| `DreamPlayer.mNotHitBy[2]` (DreamHitDefAttributeSlot) | Plain data | Serialize directly (~16 B). |

#### Tier 3 — Skip (do NOT serialize):

| Subsystem | Why |
|---|---|
| Sprite files, sound files, animation definitions | Read-only after `loadPlayers()`. Both clients load the same character files. |
| Stage definition (camera bounds, start positions, music paths) | Read-only after `loadStage()`. |
| Mugen definitions, state machine definitions | Read-only after load. |
| Drawing state (current GL textures, current animation element *as a render object*) | The render-side data is recomputed from sim state each frame. The *sim-side* data of the animation element (current step, time) IS in Tier 2. |
| Audio playback state (Mix_Music*, current playing channels) | Acceptable to lose on rollback; will be re-triggered by the next state-controller call. Sound effects during resim are muted (see §2.5). |
| `gPrismWrapperData.mUpdateTimeCounter`, `mGlobalTimeDilatation` | Render-loop state, not sim state. |
| `gDirectMatchStarted`, `gResyncData[]` | Persistent app state, not part of sim. |
| Debug counters (`gDebugAssignmentAmount`, etc.) | Diagnostic only. |

### 1.2 DreamPlayer struct field-by-field serialization

The `DreamPlayer` struct (playerdefinition.h:104-287) is the largest per-player cost. Here is the serialization plan, grouped:

```c
// Pseudocode for serializeDreamPlayer(Stream& s, DreamPlayer* p)
// Format: version (u8) + flag bits (u8) + payload

write u8 SERIALIZATION_VERSION = 1;
write u8 flags;  // bit0: hasHelpers, bit1: hasProjectiles, bit2: hasHitData, ...

// --- Identity & links (resolve to IDs on restore) ---
write int mRootID;
write int mID;
write int mControllerID;
write int mParentID;          // -1 if no parent
write int mOtherPlayerID;     // 0 or 1 (root) — for root players, this is the other root
write int mHelperIDInParent;
write int mHelperIDInRoot;
write int mHelperIDInStore;
write int mIsHelper;
write int mIsProjectile;
write int mProjectileID;
write int mProjectileDataID;
write int mPreferredPalette;

// --- State machine / animation ---
write int mCommandID;
write int mStateOwnerCoordinateP;
// mRegisteredStateMachine: do NOT serialize (re-derive from header)
// mAnimationElement: serialize the element's mutable state, re-link on restore
serializeAnimationElementState(p->mAnimationElement);  // see §1.5
// mActiveAnimations: pointer to header's animations — re-derive on restore

// --- Physics & position (via physics element) ---
// We serialize what the physics handler element stores; on restore we
// call setPlayerPosition/setPlayerVelocity to write through.
int coordP = getDreamMugenStageHandlerCameraCoordinateP();
write double getPlayerPositionX(p, coordP);
write double getPlayerPositionY(p, coordP);
write double getPlayerVelocityX(p, coordP);
write double getPlayerVelocityY(p, coordP);

// --- State enums ---
write int mStateType;
write int mMoveType;
write int mStatePhysics;
write int getPlayerState(p);            // current state number
write int getPlayerPreviousState(p);
write int getPlayerTimeInState(p);
write int mIsInControl;
write int mMoveContactCounter;
write int mMoveHit;
write int mMoveGuarded;
write int mLastHitGuarded;
write int mIsAlive;
write int mFaceDirection;
write int mNoWalkFlag; mNoAutoTurnFlag; mNoLandFlag; mPushDisabledFlag;
write int mNoJuggleCheckFlag; mIntroFlag; mNoAirGuardFlag; mNoCrouchGuardFlag;
write int mNoStandGuardFlag; mNoKOSoundFlag; mNoKOSlowdownFlag; mUnguardableFlag;
write int mTransparencyFlag; mWidthFlag; mInvisibilityFlag;
write Vector2DI mOneTickStageWidth;
write Vector2DI mOneTickPlayerWidth;
write Vector3D mDrawOffset;
write int mJumpFlank;
write int mAirJumpCounter;
write int mIsHitOver; mIsFalling; mCanRecoverFromFall;
write int mRecoverTimeSinceHitPause; mRecoverTime;
write double mDefenseMultiplier; mSuperDefenseMultiplier;
write int mIsFrozen; write Position mFreezePosition;
write int mIsLyingDown; mLyingDownTime;
write int mIsHitPaused; mHitPauseNow; mHitPauseDuration;
write int mSuperMoveTime; mPauseMoveTime;
write int mIsHitShakeActive; mHitShakeNow; mHitShakeDuration;
write int mIsHitOverWaitActive; mHitOverNow; mHitOverDuration;
write int mIsAngleActive; write double mAngle;
write Vector2D mTempScale;

// --- Resources ---
write int mLife;
write int mPower;
write int mCheeseWinFlag; mSuicideWinFlag;
write int mHitCount; mFallAmountInCombo;
write double mAttackMultiplier;
write int mMoveReversed;
write int mIsBound; mBoundNow; mBoundDuration; mBoundFaceSet;
write Position2D mBoundOffsetCameraSpace;
write int mBoundPositionType;
write int mBoundTargetID;          // re-resolve pointer
write int mBoundID;
write int mRoundsExisted; mComboCounter; mDisplayedComboCounter;
write int mRoundsWon;
write int mIsBoundToScreenForever; mIsBoundToScreenForTick;
write Vector3DI mIsCameraFollowing;
write double mStartLifePercentage;
write int mIsGuardingInternally; mIsBeingJuggled; mAirJugglePoints;
write double mTimeDilatationNow; write int mTimeDilatationUpdates; write double mTimeDilatation;
write int mHasOwnPalette;
write DreamPlayerDust mDustClouds[2];        // 2 × {int mLastDustTime} = 8 B
write DreamHitDefAttributeSlot mNotHitBy[2]; // ~16 B
write PlayerHitData mPassiveHitData;         // see playerhitdata.h
write PlayerHitData mActiveHitData;
write PlayerHitOverrides mHitOverrides;
write int mIsDestroyed;

// --- Vars (the big one — 400 ints + 200 doubles per player) ---
write int[100] mVars;
write int[100] mSystemVars;
write double[100] mFloatVars;
write double[100] mSystemFloatVars;

// --- Hit data history ---
write int mReceivedHitData.size();
for each entry: write PlayerHitData;  // ~64 B each

// --- Helpers / projectiles (recursive) ---
write int mHelpers.size();
for each helper DreamPlayer*: write int mID; // will be serialized separately by the helper store pass
write int mProjectiles.size();
for each projectile: write int key, write int mID;

// Skip:
//   mHeader (DreamPlayerHeader* — read-only after load, identical on both clients)
//   mCustomSizeData (read-only after load)
//   mShadow, mReflection, mDebug (visual-only / debug)
//   mAfterImage: serialize separately (see below)
serializeAfterImage(s, p->mAfterImage);
```

**Estimated DreamPlayer save size:**
- 400 ints × 4 B = 1600 B (mVars + mSystemVars)
- 200 doubles × 8 B = 1600 B (mFloatVars + mSystemFloatVars)
- ~200 B misc enum/flag fields
- ~100 B physics/position
- ~200 B hit data + passive/active hit data
- ~50 B after-image ring (30 frames × ~2 B per frame if compressed; can use 8 B per frame for full color)
- **≈ 3.5 KB per player** (without helpers)

With 4 helpers (typical Vegeta/Songoku), total ≈ 5 KB/player × 2 = 10 KB. Plus 5 KB of stage/timer/UI state. **≈ 15 KB per save slot.** 8 slots = 120 KB. Trivial.

### 1.3 How to audit for ALL mutable state (in case we missed something)

The audit above is based on reading source. To *guarantee* completeness, run this procedure once the basic save/restore exists:

1. **Static grep for `static` declarations** — already done in §1.1's table. Command:
   ```
   rg -n '^static\s+(struct\s+)?\{' engine/DolmexicaInfinite --glob '*.cpp'
   rg -n '^static\s+\w+\s+g\w+\s*[;=]' engine/DolmexicaInfinite --glob '*.cpp'
   ```
2. **SyncTest sweep (the deterministic approach)** — once `saveGameState`/`restoreGameState` exist, run the GGPO SyncTest mode (see §8.1). SyncTest does a save→restore→re-simulate every frame and compares state. Any field not serialized will produce a checksum mismatch immediately. This is self-documenting: the first failed frame's log shows which subsystem diverged.
3. **Memory-diff tool** — for development only: at frame N, save state, take a `Module.HEAPU8` snapshot, advance 1 frame, restore state, take another `HEAPU8` snapshot, diff. Any bytes that differ are state we missed. (Don't use this approach in production — 768 MB diff per frame is too slow — but it's gold for the audit.)
4. **GCC `-fdata-sections` + linker map** — examine the `.map` file for `.bss`/`.data` sections. Anything in `.bss` is zero-init mutable state; anything in `.data` is init-then-mutable. Cross-reference with the g*Data table from step 1.

### 1.4 RNG state (critical: must replace `srand`/`rand`)

**Problem:** `addons/prism/math.cpp:14-17` calls libc `srand()`/`rand()`. The RNG state lives in libc-internal memory, not in any variable we can serialize. After a save→restore, libc's RNG continues from its post-restore state, not the saved state.

**Fix:** Replace with a deterministic PRNG whose state lives in a global we control.

```cpp
// addons/prism/math.cpp — replace srand/rand
namespace prism {
    static uint32_t gRngState = 0x12345678;  // non-zero seed

    void setRandomSeed(unsigned int tSeed) {
        gRngState = tSeed ? tSeed : 0x12345678;  // avoid 0 (xorshift32 can't escape 0)
        // ALSO seed libc so any code that still calls rand() is deterministic
        srand(tSeed);
    }

    // xorshift32 — fast, deterministic, period 2^32-1, sufficient for a fighting game
    static uint32_t xorshift32() {
        uint32_t x = gRngState;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        gRngState = x;
        return x;
    }

    double randfrom(double tMin, double tMax) {
        double range = (tMax - tMin);
        if (range == 0) return tMin;
        // Use full 32 bits of entropy, scale to [0,1)
        double r = (double)xorshift32() / (double)0x100000000ULL;
        return tMin + r * range;
    }

    int randfromInteger(int tMin, int tMax) {
        int val = tMin - 1;
        int iters = 0;
        while (val < tMin || val > tMax) {
            val = (int)randfrom(tMin, tMax + 0.99);
            if (iters++ > 100) break;
        }
        return val;
    }
}
```

**Audit step:** `rg -n '\brand\b\(' engine/DolmexicaInfinite --glob '*.cpp'` shows all `rand()` callers. After replacing, each of these will go through `xorshift32()` automatically. The only remaining caller is `addons/prism/web/soundeffect_web.cpp:185` (`rand() % tCollection.mAmount`) for randomizing sound effect variants — that's audio cosmetic, but for determinism we route it through the same PRNG too.

**Add RNG state to save-state:** Tier 1, 4 bytes. Add to `serializeGameState()`:
```cpp
writeU32(gRngState);
```
On restore:
```cpp
gRngState = readU32();
```

### 1.5 Animation element state serialization

`MugenAnimationHandlerElement*` (playerdefinition.h:153) is heap-allocated by `addMugenAnimation`. We can't safely memcpy the struct (it has its own internal pointers). Strategy: serialize only the mutable fields, re-link on restore.

Look at `addons/prism/include/prism/mugenanimationhandler.h` for the element struct. Mutable fields are typically:
- `mTime` (int — current tick within current step)
- `mCurrentStep` (int — index into animation step array)
- `mHasLooped` (int)
- `mIsPaused` (int)
- `mDrawScale`, `mDrawOffset` (Vector2D/Vector3D)
- `mIsFacingRight` (int)
- `mHasFinished` (int)

The animation *definition* (steps, frame durations) is read-only from the player header. So serialize the mutable element state (~40 B) and on restore, find the existing element via `getPlayerAnimationElement(p)` and overwrite its mutable fields.

Same approach for explods, projectiles, stage background elements, and afterimages.

### 1.6 Save state C exports — API design

Add to `start_direct_match.cpp` (or a new file `rollbackstate.cpp`):

```cpp
// engine/DolmexicaInfinite/rollbackstate.h
#pragma once
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// Returns the maximum size of a save state. Call once at startup to size buffers.
size_t getGameStateMaxSizeExport(void);

// Save current state into the provided buffer. Returns bytes written, or 0 on error.
// The buffer must be at least getGameStateMaxSizeExport() bytes.
size_t saveGameStateExport(char* outBuf, size_t bufSize, int frame);

// Restore state from the provided buffer. Returns 0 on success, -1 on error.
// After this call, the engine's mutable state is identical to when saveGameStateExport
// was called, except for render-side state (which will be re-derived next frame).
int restoreGameStateExport(const char* inBuf, size_t bufSize);

// Returns the frame number embedded in the saved state (the frame argument
// passed to saveGameStateExport). Useful for sanity-checking.
int getSavedFrameExport(void);

// Compute a CRC32 checksum of the current state (lightweight, used for desync
// detection without copying the whole buffer). Same algorithm on both clients.
uint32_t getGameStateCrc32Export(void);

// Step the simulation N frames WITHOUT drawing. Used during rollback resim.
// Calls updateScreen() N times. Skips drawScreen() entirely.
void stepSimulationExport(int frames);

// Toggle a "skip draw" flag. While set, performScreenIteration will call updateScreen()
// but NOT drawScreen(). Use for catch-up frames where you want the main loop to
// advance but not render.
void setSkipDrawExport(int skip);

#ifdef __cplusplus
}
#endif
```

### 1.7 Save state implementation — buffer layout

**Memory management:** Pre-allocate 8 save-state slots in WASM heap at match start. Each slot is `getGameStateMaxSizeExport()` bytes (rounded up to 4 KB). Pre-allocate avoids GC pressure on the JS side and avoids `malloc`/`free` in the hot path.

```cpp
// engine/DolmexicaInfinite/rollbackstate.cpp
#include "rollbackstate.h"
#include "playerdefinition.h"
#include "gamelogic.h"
#include "fightui.h"
#include "stage.h"
#include "mugenstagehandler.h"
#include "projectile.h"
#include "mugenexplod.h"
#include "afterimage.h"

#include <prism/timer.h>
#include <prism/input.h>
#include <prism/math.h>
#include <string.h>

extern "C" {

// ---- Save state slot ring buffer (8 slots, pre-allocated) ----
#define ROLLBACK_STATE_SLOTS 8
#define ROLLBACK_STATE_MAX_SIZE (256 * 1024)   // 256 KB per slot — generous

static char gSaveStateBuffer[ROLLBACK_STATE_SLOTS][ROLLBACK_STATE_MAX_SIZE];
static size_t gSaveStateSizes[ROLLBACK_STATE_SLOTS];
static int gSaveStateFrames[ROLLBACK_STATE_SLOTS];
static int gSavedFrame = -1;

size_t getGameStateMaxSizeExport(void) {
    return ROLLBACK_STATE_MAX_SIZE;
}

// ---- Streaming writer/reader over a raw byte buffer ----
struct WriteStream {
    char* buf;
    size_t pos;
    size_t cap;
    bool overflow;
};

static void wsWrite(WriteStream* s, const void* data, size_t n) {
    if (s->pos + n > s->cap) { s->overflow = true; return; }
    memcpy(s->buf + s->pos, data, n);
    s->pos += n;
}
template<typename T> static void wsT(WriteStream* s, T v) { wsWrite(s, &v, sizeof(T)); }

struct ReadStream {
    const char* buf;
    size_t pos;
    size_t cap;
    bool underflow;
};

static void rsRead(ReadStream* s, void* out, size_t n) {
    if (s->pos + n > s->cap) { s->underflow = true; memset(out, 0, n); return; }
    memcpy(out, s->buf + s->pos, n);
    s->pos += n;
}
template<typename T> static T rsT(ReadStream* s) { T v; rsRead(s, &v, sizeof(T)); return v; }


// ---- Forward declarations for per-subsystem serialize functions ----
static void serializeGameLogic(WriteStream* s);
static void deserializeGameLogic(ReadStream* s);
static void serializePlayers(WriteStream* s);
static void deserializePlayers(ReadStream* s);
static void serializeProjectiles(WriteStream* s);
static void deserializeProjectiles(ReadStream* s);
static void serializeExplods(WriteStream* s);
static void deserializeExplods(ReadStream* s);
static void serializeStage(WriteStream* s);
static void deserializeStage(ReadStream* s);
static void serializeTimer(WriteStream* s);
static void deserializeTimer(ReadStream* s);
static void serializeInputState(WriteStream* s);
static void deserializeInputState(ReadStream* s);
static void serializeFightUI(WriteStream* s);
static void deserializeFightUI(ReadStream* s);
static void serializeRng(WriteStream* s);
static void deserializeRng(ReadStream* s);
// (Plus helper functions to resolve pointers from IDs)

size_t saveGameStateExport(char* outBuf, size_t bufSize, int frame) {
    WriteStream s = { outBuf, 0, bufSize, false };

    // Magic + version + frame
    wsT<uint32_t>(&s, 0x524F4C42 /* 'ROLB' */);
    wsT<uint16_t>(&s, 1);  // version
    wsT<int32_t>(&s, frame);

    serializeRng(&s);
    serializeGameLogic(&s);
    serializePlayers(&s);
    serializeProjectiles(&s);
    serializeExplods(&s);
    serializeStage(&s);
    serializeTimer(&s);
    serializeInputState(&s);
    serializeFightUI(&s);

    if (s.overflow) {
        logg("[ROLLBACK] ERROR: save state overflow!");
        return 0;
    }
    gSavedFrame = frame;
    return s.pos;
}

int restoreGameStateExport(const char* inBuf, size_t bufSize) {
    ReadStream s = { inBuf, 0, bufSize, false };

    uint32_t magic = rsT<uint32_t>(&s);
    uint16_t version = rsT<uint16_t>(&s);
    int32_t frame = rsT<int32_t>(&s);
    if (magic != 0x524F4C42 || version != 1) {
        logg("[ROLLBACK] ERROR: invalid save state magic/version");
        return -1;
    }

    deserializeRng(&s);
    deserializeGameLogic(&s);
    deserializePlayers(&s);
    deserializeProjectiles(&s);
    deserializeExplods(&s);
    deserializeStage(&s);
    deserializeTimer(&s);
    deserializeInputState(&s);
    deserializeFightUI(&s);

    if (s.underflow) {
        logg("[ROLLBACK] ERROR: save state underflow!");
        return -1;
    }
    gSavedFrame = frame;
    return 0;
}

int getSavedFrameExport(void) { return gSavedFrame; }
size_t getSaveStateSizeExport(int slot) {
    if (slot < 0 || slot >= ROLLBACK_STATE_SLOTS) return 0;
    return gSaveStateSizes[slot];
}

// Save into slot ring buffer
void saveGameStateToSlotExport(int slot, int frame) {
    if (slot < 0 || slot >= ROLLBACK_STATE_SLOTS) return;
    gSaveStateSizes[slot] = saveGameStateExport(gSaveStateBuffer[slot], ROLLBACK_STATE_MAX_SIZE, frame);
    gSaveStateFrames[slot] = frame;
}

int restoreGameStateFromSlotExport(int slot) {
    if (slot < 0 || slot >= ROLLBACK_STATE_SLOTS) return -1;
    if (gSaveStateSizes[slot] == 0) return -1;
    return restoreGameStateExport(gSaveStateBuffer[slot], gSaveStateSizes[slot]);
}

int getSaveStateSlotFrameExport(int slot) {
    if (slot < 0 || slot >= ROLLBACK_STATE_SLOTS) return -1;
    return gSaveStateFrames[slot];
}

// CRC32 — tableless (poly 0xEDB88320), 4 KB incremental
static uint32_t crc32Update(uint32_t crc, const uint8_t* data, size_t n) {
    crc = ~crc;
    for (size_t i = 0; i < n; i++) {
        crc ^= data[i];
        for (int k = 0; k < 8; k++) {
            crc = (crc >> 1) ^ (0xEDB88320 & -(crc & 1));
        }
    }
    return ~crc;
}

uint32_t getGameStateCrc32Export(void) {
    // Save to a scratch buffer, CRC the buffer, return.
    // Cost: one full save (~15 KB) + CRC32 over 15 KB = ~30 µs. Acceptable per frame.
    static char scratch[ROLLBACK_STATE_MAX_SIZE];
    size_t n = saveGameStateExport(scratch, sizeof(scratch), -1);
    if (n == 0) return 0;
    return crc32Update(0, (const uint8_t*)scratch, n);
}

} // extern "C"
```

### 1.8 How many save states — and ring buffer indexing

**GGPO default:** 8 save states (covers 8-frame rollback window).
**Ikemen GO:** 8 + 2 = 10 (extra headroom).
**Recommendation:** 8 slots. With input delay of 2–4 frames and ~150 ms RTT (9 frames at 60 Hz), rollbacks longer than 6 frames are rare.

The ring buffer in §1.7 (`gSaveStateBuffer[8][256KB]`) is *not* indexed by frame number directly — it's a ring. JS-side `RollbackStateBuffer` (see §3) tracks `frame → slot` mapping:

```ts
class SaveStateRing {
  private slots = new Map<number, number>();  // frame → slot index 0..7
  private lruFrames: number[] = [];           // for eviction
  save(frame: number) {
    const slot = this.pickSlot();
    Module._saveGameStateToSlotExport(slot, frame);
    this.slots.set(frame, slot);
    this.lruFrames = this.lruFrames.filter(f => f !== frame).concat(frame);
  }
  restore(frame: number): boolean {
    const slot = this.slots.get(frame);
    if (slot === undefined) return false;
    return Module._restoreGameStateFromSlotExport(slot) === 0;
  }
  private pickSlot(): number {
    if (this.slots.size < 8) return this.slots.size;  // fill unused slots first
    // Evict the oldest frame
    const oldest = this.lruFrames.shift()!;
    const slot = this.slots.get(oldest)!;
    this.slots.delete(oldest);
    return slot;
  }
}
```

### 1.9 Estimated per-frame cost of save/restore

- **Save:** ~15 KB memcpy + struct field reads ≈ 5–15 µs per frame (60 fps = 16,667 µs budget). **0.1% of frame budget.** Negligible.
- **Restore:** Same memcpy in reverse + pointer re-resolution ≈ 10–20 µs.
- **CRC32 (for desync detection):** ~15 KB CRC32 ≈ 5 µs.
- **Per rollback tick:** 1 restore + N resim steps + N saves. With N=4, total ≈ 4 × (15 + 15) = 120 µs. <1% of frame budget.

---

## 2. SIMULATION SEPARATION

### 2.1 Current state of separation

The engine **already separates `update` and `draw`** at the wrapper level:

```cpp
// addons/prism/wrapper.cpp:567
static void updateScreen() {
    updateNetplay();
    updateSystem();
    updateSound();
    updateInput();
    if (isNetplaySyncing()) return;
    if (!paused) {
        updatePhysicsHandler();
        updateAnimationHandler();
        updateCollisionHandler();
        updateTimer();
    }
    updateActorHandler();           // runs all actors including players, stage, projectiles, UI
    if (!paused) {
        if (gPrismWrapperData.mScreen->mUpdate)
            gPrismWrapperData.mScreen->mUpdate();
    }
    updateScreenDebug();
    updateExhibitionMode();
    updateScreenAbort();
}

// addons/prism/wrapper.cpp:602
static void drawScreen() {
    waitForScreen();
    if (!isSkippingDrawing()) {
        startDrawing();
        drawHandledAnimations();
        drawHandledCollisions();
        drawActorHandler();
        if (gPrismWrapperData.mScreen->mDraw)
            gPrismWrapperData.mScreen->mDraw();
        stopDrawing();
    }
}

// addons/prism/wrapper.cpp:637
static void performScreenIteration() {
    gPrismWrapperData.mUpdateTimeCounter += gPrismWrapperData.mGlobalTimeDilatation;
    int updateAmount = (int)gPrismWrapperData.mUpdateTimeCounter;
    for (int i = 0; i < updateAmount; i++) {
        updateScreen();
        if (isPrismWrappedScreenOver()) break;
    }
    gPrismWrapperData.mUpdateTimeCounter -= updateAmount;
    drawScreen();   // <-- draw ONCE per rAF tick, regardless of update count
    ...
}
```

This is *exactly* the structure rollback needs: `updateScreen()` advances sim by one tick; `drawScreen()` renders the current state. We just need to expose `updateScreen()` to JS and add a "skip draw" path.

### 2.2 Required changes

**Change 1: Expose `stepSimulationExport(n)` to JS.**

`updateScreen()` is currently `static`. Either make it non-static and declare in `wrapper.h`, or add a public wrapper:

```cpp
// addons/prism/wrapper.cpp — add near the bottom of the prism namespace
void stepSimulation(int frames) {
    for (int i = 0; i < frames; i++) {
        updateScreen();
        if (isPrismWrappedScreenOver()) break;
    }
}
```

```cpp
// addons/prism/include/prism/wrapper.h
void stepSimulation(int frames);
```

Then in `rollbackstate.cpp`:
```cpp
void stepSimulationExport(int frames) {
    stepSimulation(frames);
}
```

**Change 2: Add a "skip draw" flag.**

```cpp
// addons/prism/wrapper.cpp
static int gSkipDraw = 0;
void setSkipDraw(int skip) { gSkipDraw = skip; }
bool isSkippingDrawing() { return gSkipDraw != 0; }  // overrides platform impls
```

For the web build, the existing `isSkippingDrawing()` is in `addons/prism/dc/drawing_dc.cpp:273` (returns false) and `addons/prism/windows/drawing_win.cpp:1032`. We need to override for web. The cleanest approach is to add a web-specific override:

```cpp
// addons/prism/web/drawing_web.cpp (new file, or add to existing web/sound_web.cpp pattern)
namespace prism {
    static int gWebSkipDraw = 0;
    void setWebSkipDraw(int skip) { gWebSkipDraw = skip; }
}
extern "C" void setSkipDrawExport(int skip) {
    prism::setWebSkipDraw(skip);
}
```

And in `wrapper.cpp:608`, replace `if (!isSkippingDrawing())` with `if (!isSkippingDrawing() && !prism::gWebSkipDraw)`. Or simpler: make `isSkippingDrawing()` itself check the web flag.

**Change 3: Decouple Emscripten's main loop from JS.**

Currently `emscripten_set_main_loop(performScreenIteration, 60, 1)` (wrapper.cpp:692) owns the rAF. This is fine for normal play. For rollback, we have two paths:

- **Path A (preferred):** Keep Emscripten's main loop for normal rendering. For rollback resim, JS calls `stepSimulationExport(n)` *synchronously* inside its own rAF callback, BEFORE Emscripten's rAF fires. This advances the sim N times without drawing, then Emscripten's rAF renders the final state. **No need to cancel Emscripten's loop.**

  The trick: Emscripten's main loop runs `performScreenIteration` once per rAF, which itself can do 1+ updates. If we ALSO call `stepSimulationExport` from JS, we get extra updates. To avoid double-advancing, JS sets `gSkipDraw=1`, calls `stepSimulationExport(n)`, sets `gSkipDraw=0`, then Emscripten's rAF runs `performScreenIteration` which (because `gSkipDraw` is now 0) just draws.

  But this still calls `updateScreen()` once from Emscripten. So we'd be doing N+1 updates. Fix: have JS set a "I'm handling stepping" flag that makes `performScreenIteration` only draw, not update.

- **Path B (cleaner, more invasive):** Cancel Emscripten's main loop after `startDirectMatch` and run our own rAF in JS. JS calls `stepSimulationExport(1)` (or N for catch-up) then `drawScreenExport()`. Total control.

  Implement Path B as follows:

  ```cpp
  // In start_direct_match.cpp, after startScreenHandling returns (or in a new exported fn)
  extern "C" void cancelEmscriptenMainLoopExport() {
      // emscripten_cancel_main_loop is safe to call from inside the loop's callback
      // (it sets a flag that takes effect after the current callback returns).
      emscripten_cancel_main_loop();
  }

  extern "C" void drawScreenExport() {
      // Need to expose the static drawScreen() — add a wrapper.
      drawScreenInternal();  // see wrapper.cpp modification
  }
  ```

  Then JS:
  ```ts
  // After startDirectMatch completes (the engine's startScreenHandling throws to break out)
  Module._cancelEmscriptenMainLoopExport();
  // Now we own the rAF loop:
  function pump(now: number) {
    accumulator += now - lastTime;
    lastTime = now;
    let steps = 0;
    while (accumulator >= FRAME_MS && steps < MAX_STEPS) {
      rollbackNetcode.step();        // does save/predict/inject/step
      accumulator -= FRAME_MS;
      steps++;
    }
    Module._drawScreenExport();
    requestAnimationFrame(pump);
  }
  requestAnimationFrame(pump);
  ```

  The challenge: `startScreenHandling()` in `wrapper.cpp:723` is the function that calls `emscripten_set_main_loop`. It does NOT return until screen handling aborts. Currently `startDirectMatch` (start_direct_match.cpp:142) calls `startScreenHandling(getDreamFightScreenForTesting())` and that's the last thing — execution never returns to JS until the screen handling throws.

  **Workaround that already exists:** The existing comment at `start_direct_match.cpp:140` says: "emscripten_set_main_loop(simulateInfiniteLoop=1) throws an exception that is caught by the try/catch in the JS caller." So `startDirectMatch` actually throws to JS once the main loop is set up. JS then owns control flow. We can have JS call `cancelEmscriptenMainLoopExport()` immediately after catching the exception, then run our own rAF.

  This is the existing pattern — we're just adding the cancel+reroute step.

**Recommendation:** Path B. Cleaner, more predictable, easier to reason about for rollback timing. The current `use-online-multiplayer.ts:528` pump already runs its own accumulator; it just doesn't call `drawScreenExport()` because Emscripten's rAF is doing both. After Path B, JS owns the full pump.

### 2.3 Audio muting during resim

During rollback resim (calling `stepSimulation(N)` to catch up), state-controllers may fire sound effects. We must NOT replay them — the user already heard them on the original (predicted) frame.

Add a global audio mute flag:

```cpp
// addons/prism/web/sound_web.cpp
static int gSoundMuted = 0;
void setSoundMuted(int muted) { gSoundMuted = muted; }
// In playSoundEffect() and playMusic(): if (gSoundMuted) return;
```

JS sets muted=1 before calling `stepSimulationExport(N)`, sets muted=0 after. Same for any sound-spawning state-controllers in `mugensound.cpp`.

### 2.4 Input handling during stepSimulation

`updateInput()` (input.cpp:564) does:
1. `updateInputPlatform()` — reads SDL events (keyboard). **Skip during resim.** We don't want to consume real keyboard events during catch-up.
2. `updateInputSetting()` — handles "waiting for key press" UI. Skip.
3. `updateInputFlanks()` — copies `mCurrent` to `mPrev`. **Keep.** This is essential for command detection (e.g., "press A this frame" flank).
4. `applyExternalInputOverlay()` — copies `gExternalInput.mRemoteButtons[i]` into `gPrismGeneralInputData.mStatus[i].mCurrent`. **Keep.** This is how injected inputs take effect.

Add a "sim-only" mode to `updateInput()`:

```cpp
void updateInput() {
    setProfilingSectionMarkerCurrentFunction();
    if (!gSimOnlyMode) {
        updateInputPlatform();
        updateInputSetting();
    }
    updateInputFlanks();
    applyExternalInputOverlay();
}
```

Toggle `gSimOnlyMode` via `setSimOnlyModeExport(int)` from JS during resim.

### 2.5 Catch-up budget per visible frame

GGPO allows resimulating up to ~8 frames per visible frame during rollback (the "MaxFrames" budget). To avoid the "spiral of death" (resim takes longer than a frame, so we fall further behind), cap resim at 4 frames per visible frame. If the rollback would be longer than 4 frames, trigger a snap-resync (the existing `setPlayerSyncStateExport`) instead.

---

## 3. ROLLBACK LOOP

### 3.1 Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│  JS (TypeScript)                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ RollbackNetcode (new: src/lib/rollback-netcode.ts)  │    │
│  │  - Frame counter                                     │    │
│  │  - Input delay buffer (per player)                   │    │
│  │  - Save-state ring (8 slots, calls _saveGameStateToSlotExport) │
│  │  - Prediction: last-known remote input               │    │
│  │  - On remote input mismatch: restore + resim         │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                       │
│  ┌────────────────────▼────────────────────────────────┐    │
│  │ GameCanvas pump (rAF, fixed-timestep accumulator)   │    │
│  │  - Reads local input                                 │    │
│  │  - Calls RollbackNetcode.step()                     │    │
│  │  - Calls _drawScreenExport()                         │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                       │
                       │  WebRTC DataChannel (P2P) or WebSocket (fallback)
                       ▼
                    Opponent
```

### 3.2 Frame timing and input delay

- **Input delay:** 2 frames (default), tunable 0–6. Lower = more responsive, but more frequent rollbacks. Per GGPO: 2 is the sweet spot for sub-150ms RTT.
- **Local input:** Captured at frame N, applied at frame N+delay. Buffer local input for at least `delay + max_rollback = 2 + 8 = 10` frames.
- **Remote input:** Predicted from last known. When the real input arrives, if it differs, rollback.

```ts
// src/lib/rollback-netcode.ts (new file)
const INPUT_DELAY = 2;
const MAX_ROLLBACK_FRAMES = 8;
const MAX_RESIM_PER_TICK = 4;  // cap catch-up to avoid spiral-of-death

interface FrameInputs {
  p1: number;  // 16-bit bitmask: see §3.3
  p2: number;
}

export class RollbackNetcode {
  private currentFrame = 0;
  private localPlayer: 0 | 1;
  private inputDelay: number;

  // Per-frame input log (frame → inputs)
  private localInputs = new Map<number, number>();
  private remoteInputs = new Map<number, number>();
  private lastConfirmedRemoteFrame = -1;
  private lastKnownRemoteInput = 0;

  // Save state ring
  private stateSlots = new Map<number, number>();  // frame → slot
  private slotOrder: number[] = [];  // LRU eviction

  // Transport
  private transport: NetcodeTransport;  // WebRTC or WebSocket

  constructor(localPlayer: 0 | 1, transport: NetcodeTransport, inputDelay = INPUT_DELAY) {
    this.localPlayer = localPlayer;
    this.transport = transport;
    this.inputDelay = inputDelay;
    this.transport.onRemoteInput((frame, input) => this.onRemoteInput(frame, input));
  }

  // Called once per simulation tick (60 Hz).
  step(localInput: number): void {
    const frame = this.currentFrame;

    // 1. Save current state for this frame (BEFORE applying inputs).
    //    GGPO pattern: save BEFORE advance, so we can restore to this frame
    //    if a later remote input disagrees with our prediction.
    this.saveState(frame);

    // 2. Record local input for this frame.
    this.localInputs.set(frame, localInput);

    // 3. Send local input to remote (with delay applied).
    //    We send input for frame `frame - inputDelay` so the remote has time to receive.
    //    Actually GGPO sends immediately; the delay is applied on the receive side.
    //    Simpler: send immediately, both clients apply inputDelay locally.
    this.transport.sendInput(frame, localInput);

    // 4. Determine inputs for this frame.
    //    Local input is taken from `frame - inputDelay` (the input captured delay frames ago).
    //    Remote input: if we have the real remote input for this frame, use it.
    //    Otherwise predict (use last known).
    const localInputForThisFrame = this.localInputs.get(frame - this.inputDelay) ?? 0;
    let remoteInputForThisFrame: number;
    if (this.remoteInputs.has(frame - this.inputDelay)) {
      remoteInputForThisFrame = this.remoteInputs.get(frame - this.inputDelay)!;
      this.lastConfirmedRemoteFrame = Math.max(this.lastConfirmedRemoteFrame, frame - this.inputDelay);
    } else {
      // Predict: use last known remote input.
      remoteInputForThisFrame = this.lastKnownRemoteInput;
    }

    // 5. Inject both inputs into the engine.
    const p1Input = this.localPlayer === 0 ? localInputForThisFrame : remoteInputForThisFrame;
    const p2Input = this.localPlayer === 1 ? localInputForThisFrame : remoteInputForThisFrame;
    injectInput(0, p1Input);
    injectInput(1, p2Input);

    // 6. Advance simulation by 1 frame.
    Module._stepSimulationExport(1);

    this.currentFrame++;
  }

  // Called when a remote input packet arrives.
  private onRemoteInput(frame: number, input: number): void {
    this.remoteInputs.set(frame, input);
    this.lastKnownRemoteInput = input;

    // If this input is for a frame we've already simulated (with a prediction),
    // and it differs from our prediction, trigger a rollback.
    const predictedInput = this.remoteInputs.get(frame) ?? this.lastKnownRemoteInput;
    // ^ Wait, we just set it. Need to check: did we predict correctly?
    // The trick: we need to know what we USED as the prediction, not what we have now.
    // Refactor: track "what we used" separately.

    if (frame <= this.currentFrame - this.inputDelay) {
      // We already simulated this frame with a (possibly wrong) prediction.
      // Check if the prediction was correct.
      const usedPrediction = this.usedPredictions.get(frame) ?? this.lastKnownRemoteInput;
      if (input !== usedPrediction) {
        this.triggerRollback(frame);
      }
    }
  }

  private usedPredictions = new Map<number, number>();

  private triggerRollback(conflictFrame: number): void {
    // Restore to the conflict frame, re-simulate forward with corrected inputs.
    const restoreFrame = conflictFrame;
    if (!this.stateSlots.has(restoreFrame)) {
      // We don't have a save state for this frame (too old — beyond MAX_ROLLBACK_FRAMES).
      // Fall back to snap-resync.
      this.requestSnapResync();
      return;
    }

    const framesToResim = this.currentFrame - restoreFrame;
    if (framesToResim > MAX_ROLLBACK_FRAMES) {
      this.requestSnapResync();
      return;
    }
    if (framesToResim > MAX_RESIM_PER_TICK) {
      // Spread resim over multiple ticks to avoid hitching.
      // For now, just cap and accept a longer rollback.
    }

    // 1. Mute audio during resim.
    Module._setSoundMutedExport(1);
    Module._setSimOnlyModeExport(1);

    // 2. Restore state.
    const slot = this.stateSlots.get(restoreFrame)!;
    Module._restoreGameStateFromSlotExport(slot);

    // 3. Re-simulate from restoreFrame to currentFrame-1 (the current frame will be
    //    advanced by step() normally).
    for (let f = restoreFrame; f < this.currentFrame; f++) {
      const localInputForFrame = this.localInputs.get(f - this.inputDelay) ?? 0;
      const remoteInputForFrame = this.remoteInputs.get(f - this.inputDelay) ?? this.lastKnownRemoteInput;
      this.usedPredictions.set(f - this.inputDelay, remoteInputForFrame);

      const p1Input = this.localPlayer === 0 ? localInputForFrame : remoteInputForFrame;
      const p2Input = this.localPlayer === 1 ? localInputForFrame : remoteInputForFrame;
      injectInput(0, p1Input);
      injectInput(1, p2Input);
      Module._stepSimulationExport(1);

      // Save state for the new (corrected) frame, so a future rollback can restore here.
      this.saveState(f + 1);
    }

    Module._setSimOnlyModeExport(0);
    Module._setSoundMutedExport(0);
  }

  private saveState(frame: number): void {
    const slot = this.pickSlot();
    Module._saveGameStateToSlotExport(slot, frame);
    this.stateSlots.set(frame, slot);
    this.slotOrder = this.slotOrder.filter(f => f !== frame).concat(frame);
  }

  private pickSlot(): number {
    if (this.stateSlots.size < 8) return this.stateSlots.size;
    const oldest = this.slotOrder.shift()!;
    const slot = this.stateSlots.get(oldest)!;
    this.stateSlots.delete(oldest);
    return slot;
  }

  private requestSnapResync(): void {
    // Fall back to existing setPlayerSyncStateExport path (host sends authoritative state).
    // This is the safety net when rollback window is exceeded.
    this.transport.requestSnapResync();
  }

  // First N frames: no prediction needed (we have real remote inputs).
  // This is handled naturally by the algorithm — if remoteInputs.has(frame) is true,
  // we use the real input, no prediction. The "first N frames" is just normal operation
  // before any prediction has been needed.
}

function injectInput(playerIndex: number, inputBitmask: number): void {
  // Convert 16-bit bitmask back to MUGEN input string.
  // (Or better: add a new C export _setExternalPlayerInputBitmask that takes a uint16,
  // avoiding string conversion entirely.)
  const inputString = bitmaskToMugenString(inputBitmask);
  Module._setExternalPlayerInput(playerIndex, inputString);
}

function bitmaskToMugenString(mask: number): string {
  let s = "";
  if (mask & 0x01) s += "U";
  if (mask & 0x02) s += "D";
  if (mask & 0x04) s += "B";
  if (mask & 0x08) s += "F";
  if (mask & 0x10) s += "a";
  if (mask & 0x20) s += "b";
  if (mask & 0x40) s += "c";
  if (mask & 0x80) s += "x";
  if (mask & 0x100) s += "y";
  if (mask & 0x200) s += "z";
  if (mask & 0x400) s += "s";  // start
  return s;
}
```

### 3.3 Input encoding (binary)

The existing code sends MUGEN strings like `"UBFac"` over JSON (~60 bytes/msg with frame). For rollback we want fixed-size binary packets over DataChannel:

```ts
// 16-bit bitmask:
//   bit 0:  U (up)
//   bit 1:  D (down)
//   bit 2:  B (back/left)
//   bit 3:  F (forward/right)
//   bit 4:  a (punch weak)
//   bit 5:  b (punch medium)
//   bit 6:  c (punch strong)  -- MUGEN C = Prism R
//   bit 7:  x (kick weak)
//   bit 8:  y (kick medium)
//   bit 9:  z (kick strong)   -- MUGEN Z = Prism L
//   bit 10: s (start)
//   bits 11-15: reserved

// Wire format (6 bytes per input packet):
//   [0..3]  uint32 LE  frame number
//   [4..5]  uint16 LE  input bitmask

function encodeInputPacket(frame: number, mask: number): Uint8Array {
  const buf = new Uint8Array(6);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, frame, true);
  dv.setUint16(4, mask, true);
  return buf;
}

function decodeInputPacket(buf: ArrayBuffer): { frame: number; mask: number } {
  const dv = new DataView(buf);
  return {
    frame: dv.getUint32(0, true),
    mask: dv.getUint16(4, true),
  };
}
```

Add a new C export to accept bitmask directly (avoids string parsing in the hot path):

```cpp
// addons/prism/input.cpp — add to extern "C" block
void setExternalPlayerInputBitmask(int playerIndex, uint16_t mask) {
    using namespace prism;
    if (playerIndex < 0 || playerIndex >= MAXIMUM_CONTROLLER_AMOUNT) return;
    gExternalInput.mRemoteButtons[playerIndex] = mask;
    gExternalInput.mIsActive[playerIndex] = 1;
}
```

Add to `EXPORTED_FUNCTIONS` in `scripts/build-wasm.sh`.

### 3.4 Frame advantage catch-up

If the local client is behind the remote (received a frame-N input but we're at frame N-2), we should advance 2 extra frames this tick. The fixed-timestep accumulator already supports this — `MAX_CATCHUP_STEPS = 3` in the current `use-online-multiplayer.ts:84`. Increase to `MAX_CATCHUP_STEPS = 6` for rollback (to allow up to 6 sim steps per rAF: 1 normal + 5 catch-up). But cap by wall-clock time to avoid spiral-of-death.

```ts
const MAX_CATCHUP_STEPS = 6;
const FRAME_MS = 1000 / 60;

function pump(now: number) {
  accumulator += now - lastTime;
  lastTime = now;
  if (accumulator > MAX_CATCHUP_STEPS * FRAME_MS) {
    accumulator = MAX_CATCHUP_STEPS * FRAME_MS;  // clamp — drop frames if too far behind
  }
  let steps = 0;
  while (accumulator >= FRAME_MS && steps < MAX_CATCHUP_STEPS) {
    const localInput = readLocalInput();
    rollbackNetcode.step(localInput);
    accumulator -= FRAME_MS;
    steps++;
  }
  Module._drawScreenExport();
  requestAnimationFrame(pump);
}
```

### 3.5 First N frames — no prediction needed

For the first `inputDelay` frames (frame 0 to frame `inputDelay-1`), we don't have any local input to apply (it's still in the delay buffer). Two approaches:

- **Approach A:** Send a "no-op" input for frames before 0. Both clients agree that frames 0..delay-1 use input 0 (no buttons pressed). This is the GGPO approach — the game starts with a brief "neutral" period.
- **Approach B:** Start the simulation only after both clients have exchanged their first `inputDelay` frames of input. The host's `game_start` message includes a `start_frame = inputDelay` and both clients warm-up by running `inputDelay` no-op frames locally before showing the screen.

Recommendation: Approach A. Simpler. The first 2 frames of input are "no-op" — the round intro animation covers this anyway (round state INTRO lasts ~60 frames before FIGHT state).

### 3.6 Replacing `use-online-multiplayer.ts`

The existing `use-online-multiplayer.ts` is the input-delay FIFO queue. We keep its UI (latency display, queue depth, etc.) but replace the core `simulateOneFrame` with a call to `RollbackNetcode.step()`. The hook becomes a thin wrapper:

```ts
// src/hooks/use-online-multiplayer.ts (rewritten)
export function useOnlineMultiplayer(game, relay, mySlot, inputDelay = 2) {
  // ... existing refs for keys, latency, etc.

  const rollbackRef = useRef<RollbackNetcode | null>(null);

  const start = useCallback(() => {
    if (!game || !relay) return;

    // Cancel Emscripten's main loop — we own the rAF now.
    game.Module._cancelEmscriptenMainLoopExport();

    const transport = new WebsocketRollbackTransport(relay, mySlot);
    // Or: const transport = await createWebRTCTransport(relay, mySlot); // see §4
    rollbackRef.current = new RollbackNetcode(mySlot - 1, transport, inputDelay);

    // Run our own pump.
    lastTimeRef.current = 0;
    accumulatorRef.current = 0;
    rafRef.current = requestAnimationFrame(pump);
  }, [game, relay, mySlot, inputDelay]);

  const pump = (now: number) => {
    // ... fixed-timestep accumulator (see §3.4)
    // Each step: readLocalInput() → rollbackRef.current.step(localInput)
    // After all steps: Module._drawScreenExport()
  };
  // ...
}
```

---

## 4. WEBRTC DATACHANNEL TRANSPORT

### 4.1 Architecture

```
┌──────────────────────────┐         ┌──────────────────────────┐
│  Player 1 (browser)       │         │  Player 2 (browser)       │
│                            │         │                            │
│  ┌─────────────────────┐ │         │ ┌─────────────────────┐  │
│  │ RollbackNetcode     │ │         │ │ RollbackNetcode     │  │
│  │  (uses NetcodeTransport) │      │ │  (uses NetcodeTransport) │
│  └──────────┬──────────┘ │         │ └──────────┬──────────┘  │
│             │              │         │             │              │
│  ┌──────────▼──────────┐ │         │ ┌──────────▼──────────┐  │
│  │ TransportSelector   │ │         │ │ TransportSelector   │  │
│  │  - tries WebRTC      │ │         │ │  - tries WebRTC      │  │
│  │  - falls back to WS  │ │         │ │  - falls back to WS  │  │
│  └─────┬───────┬───────┘ │         │ └─────┬───────┬───────┘  │
│        │       │          │         │       │       │          │
│   ┌────▼─┐ ┌───▼────┐    │         │  ┌────▼─┐ ┌───▼────┐    │
│   │ WebRTC│ │ WebSocket│   │         │  │ WebRTC│ │ WebSocket│   │
│   │ DC    │ │ (relay) │   │         │  │ DC    │ │ (relay) │   │
│   └───┬───┘ └────┬────┘   │         │  └───┬───┘ └────┬────┘   │
│       │          │         │         │      │          │         │
└───────┼──────────┼─────────┘         └──────┼──────────┼─────────┘
        │          │                            │          │
        │   SDP/ICE signaling (relay)           │          │
        └──────────┴───────────┐  ┌─────────────┘          │
                               ▼  ▼                          │
                       ┌─────────────────┐                  │
                       │  Deno Deploy     │ ◄────────────────┘
                       │  WebSocket Relay │  (fallback path)
                       │  (signaling +    │
                       │   fallback)      │
                       └─────────────────┘
```

### 4.2 Transport interface

```ts
// src/lib/netcode-transport.ts (new file)
export interface NetcodeTransport {
  sendInput(frame: number, inputMask: number): void;
  onRemoteInput(cb: (frame: number, inputMask: number) => void): void;
  sendChecksum(frame: number, checksum: number): void;
  onRemoteChecksum(cb: (frame: number, checksum: number) => void): void;
  requestSnapResync(): void;
  onSnapResync(cb: (state: SnapResyncState) => void): void;
  sendSnapResyncState(state: SnapResyncState): void;
  getLatencyMs(): number | null;
  getTransportType(): "webrtc" | "websocket";
  close(): void;
}
```

### 4.3 WebRTC transport implementation

```ts
// src/lib/webrtc-transport.ts (new file)
import type { NetcodeTransport, SnapResyncState } from "./netcode-transport";
import type { RelayClient } from "./relay-client";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // OpenRelay free TURN (port 80/443 to bypass most firewalls)
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export class WebRTCTransport implements NetcodeTransport {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private relay: RelayClient;
  private mySlot: 1 | 2;
  private remoteInputCb: ((frame: number, input: number) => void) | null = null;
  private remoteChecksumCb: ((frame: number, checksum: number) => void) | null = null;
  private snapResyncCb: ((state: SnapResyncState) => void) | null = null;
  private connected = false;

  constructor(relay: RelayClient, mySlot: 1 | 2) {
    this.relay = relay;
    this.mySlot = mySlot;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // DataChannel config for input packets: unordered + unreliable (like UDP)
    // For checksums/snap-resync: a second channel, ordered + reliable
    if (mySlot === 1) {
      // Host creates the data channels; guest waits for them.
      this.dc = this.pc.createDataChannel("inputs", {
        ordered: false,
        maxRetransmits: 0,  // unreliable — drop stale inputs
      });
      this.setupDataChannel(this.dc);
      this.pc.createDataChannel("control", { ordered: true });  // reliable for checksums/resync
    }
    // Guest sets up ondatachannel handler below.

    this.pc.ondatachannel = (e) => {
      if (e.channel.label === "inputs") {
        this.dc = e.channel;
        this.setupDataChannel(e.channel);
      } else if (e.channel.label === "control") {
        this.setupControlChannel(e.channel);
      }
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.relay.sendWebRTCIce(e.candidate.candidate, e.candidate.sdpMid, e.candidate.sdpMLineIndex);
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log("[WebRTC] connection state:", this.pc.connectionState);
      if (this.pc.connectionState === "connected") {
        this.connected = true;
      } else if (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected") {
        this.connected = false;
        // Fallback handled by TransportSelector
      }
    };

    // Relay signaling handlers
    this.relay.on("webrtc_sdp_offer", (msg) => this.onSdpOffer(msg as any));
    this.relay.on("webrtc_sdp_answer", (msg) => this.onSdpAnswer(msg as any));
    this.relay.on("webrtc_ice", (msg) => this.onRemoteIce(msg as any));
  }

  // Host initiates the offer.
  async initiate(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.relay.sendWebRTCSdpOffer(offer.sdp!);
  }

  private async onSdpOffer(msg: { sdp: string; from_slot: number }) {
    if (msg.from_slot === this.mySlot) return;
    await this.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.relay.sendWebRTCSdpAnswer(answer.sdp!);
  }

  private async onSdpAnswer(msg: { sdp: string; from_slot: number }) {
    if (msg.from_slot === this.mySlot) return;
    await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
  }

  private async onRemoteIce(msg: { candidate: string; sdp_mid: string | null; sdp_mline_index: number | null; from_slot: number }) {
    if (msg.from_slot === this.mySlot) return;
    try {
      await this.pc.addIceCandidate({
        candidate: msg.candidate,
        sdpMid: msg.sdp_mid,
        sdpMLineIndex: msg.sdp_mline_index,
      });
    } catch (e) {
      console.warn("[WebRTC] addIceCandidate failed:", e);
    }
  }

  private setupDataChannel(dc: RTCDataChannel) {
    dc.binaryType = "arraybuffer";
    dc.onopen = () => { console.log("[WebRTC] inputs channel open"); };
    dc.onmessage = (e) => {
      const buf = e.data as ArrayBuffer;
      if (buf.byteLength === 6) {
        // Input packet: [frame u32][mask u16]
        const dv = new DataView(buf);
        const frame = dv.getUint32(0, true);
        const mask = dv.getUint16(4, true);
        this.remoteInputCb?.(frame, mask);
      }
    };
  }

  private controlChannel: RTCDataChannel | null = null;
  private setupControlChannel(dc: RTCDataChannel) {
    this.controlChannel = dc;
    dc.binaryType = "arraybuffer";
    dc.onmessage = (e) => {
      const buf = e.data as ArrayBuffer;
      const dv = new DataView(buf);
      const type = dv.getUint8(0);
      if (type === 1 && buf.byteLength === 9) {
        // Checksum: [1][frame u32][checksum u32]
        const frame = dv.getUint32(1, true);
        const checksum = dv.getUint32(5, true);
        this.remoteChecksumCb?.(frame, checksum);
      } else if (type === 2) {
        // Snap-resync request
        this.snapResyncCb?.(decodeSnapResyncState(buf, 1));
      } else if (type === 3) {
        // Snap-resync state
        this.snapResyncCb?.(decodeSnapResyncState(buf, 1));
      }
    };
  }

  sendInput(frame: number, mask: number): void {
    if (!this.dc || this.dc.readyState !== "open") return;
    const buf = new Uint8Array(6);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, frame, true);
    dv.setUint16(4, mask, true);
    this.dc.send(buf);
  }

  onRemoteInput(cb: (frame: number, input: number) => void): void {
    this.remoteInputCb = cb;
  }

  sendChecksum(frame: number, checksum: number): void {
    if (!this.controlChannel || this.controlChannel.readyState !== "open") return;
    const buf = new Uint8Array(9);
    const dv = new DataView(buf.buffer);
    dv.setUint8(0, 1);
    dv.setUint32(1, frame, true);
    dv.setUint32(5, checksum, true);
    this.controlChannel.send(buf);
  }

  onRemoteChecksum(cb: (frame: number, checksum: number) => void): void {
    this.remoteChecksumCb = cb;
  }

  requestSnapResync(): void {
    if (!this.controlChannel || this.controlChannel.readyState !== "open") return;
    const buf = new Uint8Array(1);
    buf[0] = 2;
    this.controlChannel.send(buf);
  }

  onSnapResync(cb: (state: SnapResyncState) => void): void {
    this.snapResyncCb = cb;
  }

  sendSnapResyncState(state: SnapResyncState): void {
    if (!this.controlChannel || this.controlChannel.readyState !== "open") return;
    const buf = encodeSnapResyncState(state);
    this.controlChannel.send(buf);
  }

  getLatencyMs(): number | null {
    // WebRTC stats API for actual round-trip
    // For now, return null — stats are async, hard to use synchronously
    return null;
  }

  getTransportType(): "webrtc" | "websocket" { return "webrtc"; }

  close(): void {
    this.dc?.close();
    this.controlChannel?.close();
    this.pc.close();
  }
}
```

### 4.4 DataChannel configuration choices

| Channel | `ordered` | `maxRetransmits` | `maxPacketLifeTime` | Why |
|---|---|---|---|---|
| `inputs` (per-frame input packets) | `false` | `0` | (unset) | Mimic UDP — drop stale inputs. We only care about the latest input per frame. |
| `control` (checksums, snap-resync) | `true` | (unset, defaults to reliable) | (unset) | Checksums and resync state MUST arrive in order, MUST arrive. |

Per [MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/maxRetransmits) and the [webrtchacks P2P gaming tutorial](https://webrtchacks.com/datachannel-multiplayer-game): `maxRetransmits: 0` + `ordered: false` is the standard config for game inputs. SCTP (the underlying transport) treats this as "send once, never retry, accept reordering."

### 4.5 Relay signaling additions

Add three new message types to the relay protocol (`server/src/index.ts` and `src/lib/relay-client.ts`):

- `webrtc_sdp_offer` — host → relay → guest. Contains `{ sdp, from_slot }`.
- `webrtc_sdp_answer` — guest → relay → host. Contains `{ sdp, from_slot }`.
- `webrtc_ice` — bidirectional. Contains `{ candidate, sdp_mid, sdp_mline_index, from_slot }`.

The relay just forwards these (it's a signaling channel — no SDP parsing). Add to rate-limit exceptions (these are rare — at most ~20 ICE candidates per connection setup).

```ts
// src/lib/relay-client.ts — add methods
sendWebRTCSdpOffer(sdp: string): void {
  this.send({ type: "webrtc_sdp_offer", sdp, from_slot: this.mySlot, room_code: this.roomCode });
}
sendWebRTCSdpAnswer(sdp: string): void {
  this.send({ type: "webrtc_sdp_answer", sdp, from_slot: this.mySlot, room_code: this.roomCode });
}
sendWebRTCIce(candidate: string, sdpMid: string | null, sdpMLineIndex: number | null): void {
  this.send({ type: "webrtc_ice", candidate, sdp_mid: sdpMid, sdp_mline_index: sdpMLineIndex, from_slot: this.mySlot, room_code: this.roomCode });
}
```

```ts
// server/src/index.ts — add to message handler
case "webrtc_sdp_offer":
case "webrtc_sdp_answer":
case "webrtc_ice":
  broadcastToRoom(room, msg, sessionId);  // forward to the other player
  break;
```

### 4.6 STUN/TURN servers

| Server | Type | Cost | Coverage |
|---|---|---|---|
| `stun:stun.l.google.com:19302` | STUN | Free | ~70–80% of NAT pairs |
| `stun:stun1.l.google.com:19302` | STUN | Free | Backup |
| OpenRelay `turn:openrelay.metered.ca:80` / `:443` | TURN | Free (metered) | Fallback for symmetric NAT / corporate firewalls. Port 80/443 to bypass most firewalls. TCP transport supported. |
| Self-hosted coturn | TURN | Free (server cost) | Full control, but requires a server with public IP and UDP port range open. Optional, for production scaling. |

For MVP, use Google STUN + OpenRelay TURN. For production, run coturn on a cheap VPS ($5/month) and replace OpenRelay.

### 4.7 Fallback to WebSocket relay

The `TransportSelector` tries WebRTC first; if it fails (no ICE candidates, connection state `failed`), it falls back to the existing WebSocket relay:

```ts
// src/lib/transport-selector.ts (new file)
export async function createTransport(relay: RelayClient, mySlot: 1 | 2): Promise<NetcodeTransport> {
  // Try WebRTC
  try {
    const webrtc = new WebRTCTransport(relay, mySlot);
    if (mySlot === 1) await webrtc.initiate();

    // Wait up to 5 seconds for the data channel to open.
    const opened = await Promise.race([
      webrtc.waitForOpen().then(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000)),
    ]);

    if (opened) {
      console.log("[Transport] Using WebRTC P2P");
      return webrtc;
    }
    console.warn("[Transport] WebRTC failed to connect in 5s — falling back to WebSocket");
    webrtc.close();
  } catch (e) {
    console.warn("[Transport] WebRTC setup failed:", e);
  }

  // Fallback to WebSocket relay
  console.log("[Transport] Using WebSocket relay");
  return new WebSocketTransport(relay, mySlot);
}
```

The `WebSocketTransport` wraps the existing relay input/checksum/sync-check messages, translating between the binary `NetcodeTransport` API and the JSON-over-WebSocket protocol. This keeps the existing relay working as a safety net.

### 4.8 Keeping the relay for signaling + fallback

The relay continues to handle:
- Room creation/joining
- Character/stage selection sync
- `game_start` broadcast (host generates RNG seed, sends start time)
- `loading_ready` barrier
- WebRTC SDP/ICE signaling forwarding
- Fallback input forwarding (when WebRTC fails)
- Sync check / snap-resync forwarding (when on WebSocket fallback)
- Disconnect detection

The relay does NOT need to know whether WebRTC is active. It just forwards whatever messages it receives.

---

## 5. DESYNC DETECTION

### 5.1 Two-tier checksum strategy

Following Ikemen GO's pattern (see `docs/deep-dives/07-ikemen-go-netcode-research.md` §4):

- **Tier 1: Per-frame `LiveChecksum` (lightweight CRC32 of curated state).** Computed every frame from a small set of fields: RNG state, round number, round state, both players' (life, power, state, time-in-state, position rounded to int, velocity rounded to int). ~80 bytes hashed. Cost: ~2 µs. Sent to remote every 30 frames (0.5 s).
- **Tier 2: Per-save-state full CRC32 (only in SyncTest mode).** The full save-state buffer is CRC32'd. Used only by the offline SyncTest to catch determinism bugs. In production, return `0` (skip).

```cpp
// In rollbackstate.cpp
uint32_t getLiveChecksumExport(void) {
    uint32_t crc = 0xFFFFFFFF;
    // RNG
    crc = crc32Update(crc, (uint8_t*)&gRngState, 4);
    // Game logic
    crc = crc32Update(crc, (uint8_t*)&gGameLogicData.mGameTime, sizeof(int) * 8);  // mGameTime + mRoundNumber + mRoundStateNumber + mRoundsToWin + ...
    // Players (rounded to int for float stability)
    for (int i = 0; i < 2; i++) {
        DreamPlayer* p = getRootPlayer(i);
        if (!p) continue;
        int life = getPlayerLife(p);
        int power = getPlayerPower(p);
        int state = getPlayerState(p);
        int timeInState = getPlayerTimeInState(p);
        int coordP = getDreamMugenStageHandlerCameraCoordinateP();
        int posX = (int) getPlayerPositionX(p, coordP);
        int posY = (int) getPlayerPositionY(p, coordP);
        int facing = getPlayerIsFacingRight(p) ? 1 : -1;
        crc = crc32Update(crc, (uint8_t*)&life, sizeof(int));
        crc = crc32Update(crc, (uint8_t*)&power, sizeof(int));
        crc = crc32Update(crc, (uint8_t*)&state, sizeof(int));
        crc = crc32Update(crc, (uint8_t*)&timeInState, sizeof(int));
        crc = crc32Update(crc, (uint8_t*)&posX, sizeof(int));
        crc = crc32Update(crc, (uint8_t*)&posY, sizeof(int));
        crc = crc32Update(crc, (uint8_t*)&facing, sizeof(int));
    }
    return crc ^ 0xFFFFFFFF;
}
```

### 5.2 Comparison protocol

Every 30 frames, each client:
1. Computes `localChecksum = getLiveChecksumExport()`.
2. Sends `{ frame, checksum }` to remote via the `control` DataChannel (or `sync_check` relay message).
3. When a remote checksum arrives, compares with the local checksum for the same frame.

If we receive a remote checksum for frame F, but we're currently at frame F+10, we need to either:
- (a) Have stored our local checksum for frame F (cheap — just store the last 60 checksums in a ring).
- (b) Compute a checksum for frame F by restoring the save state for F and calling `getLiveChecksumExport()`, then restoring back. (Expensive.)

Approach (a) is correct. Keep a ring buffer of the last 60 frame checksums.

### 5.3 On mismatch: rollback, not end match

Ikemen GO ends the match on desync. We can do better *because we have rollback*: a checksum mismatch means our local state diverged from the remote's at some past frame. If the divergence is recent (within MAX_ROLLBACK_FRAMES), we can:

1. Identify the frame of divergence (binary-search the checksum ring).
2. Restore our state to that frame.
3. Re-apply the *remote's* confirmed inputs from that frame forward (the remote's inputs are authoritative for the remote player).
4. Re-simulate forward.

If the divergence is too old (beyond rollback window), fall back to snap-resync (existing `setPlayerSyncStateExport`).

```ts
// In RollbackNetcode
private onRemoteChecksum(frame: number, remoteChecksum: number): void {
  const localChecksum = this.checksumRing.get(frame);
  if (localChecksum === undefined) return;  // too old, ignore
  if (localChecksum === remoteChecksum) return;  // in sync

  console.warn(`[Rollback] Desync at frame ${frame}: local=${localChecksum.toString(16)} remote=${remoteChecksum.toString(16)}`);

  // Find the divergence point (binary search backward)
  let divergenceFrame = frame;
  for (let f = frame - 1; f >= Math.max(0, frame - MAX_ROLLBACK_FRAMES); f--) {
    const lc = this.checksumRing.get(f);
    const rc = this.remoteChecksumRing.get(f);
    if (lc !== undefined && rc !== undefined && lc === rc) {
      divergenceFrame = f + 1;
      break;
    }
  }

  if (frame - divergenceFrame > MAX_ROLLBACK_FRAMES) {
    // Too far back — snap-resync
    this.requestSnapResync();
  } else {
    // Rollback to divergenceFrame and re-simulate with confirmed remote inputs.
    this.triggerRollback(divergenceFrame);
  }
}
```

**Important:** This only works if the divergence is due to a *prediction error* (we predicted remote input X, they actually input Y). If the divergence is due to a *true determinism bug* (same inputs, different state), rollback won't fix it — the re-sim will produce the same divergent state, and we'll loop. To detect this, count consecutive desyncs; if >3 in 60 frames, fall back to snap-resync and log a warning for debugging.

---

## 6. IMPLEMENTATION ORDER

Each phase is independently testable. Phases can run in parallel where noted.

### Phase 0 — Prerequisites (1 day, risk: low)
**Goal:** Build infrastructure needed before any rollback work.

- [ ] **0.1** Replace `srand`/`rand` with `xorshift32` (§1.4). Audit `rg '\brand\b\(' engine/`. Test: run a match with `setRandomSeedExport(42)`, record a 100-frame input sequence, restart, replay — both runs must produce identical fingerprints (already have `getSyncFingerprintExport`).
- [ ] **0.2** Add `setExternalPlayerInputBitmask` C export (§3.3). Test: call from JS, verify both players respond.
- [ ] **0.3** Extend `EXPORTED_FUNCTIONS` in `scripts/build-wasm.sh` with all new exports.
- [ ] **0.4** Add `setSimOnlyModeExport` and `setSkipDrawExport` and `setSoundMutedExport` flags to engine (§2.2, §2.3, §2.4). Test: call each from JS, verify no crash.

**Risk:** Low. All additive changes. No behavior change in normal play.

### Phase 1 — Save/Restore (5–7 days, risk: HIGH)
**Goal:** Implement `saveGameStateExport` / `restoreGameStateExport` and verify via roundtrip tests.

- [ ] **1.1** Create `engine/DolmexicaInfinite/rollbackstate.cpp` and `.h` with the streaming writer/reader, the slot ring buffer, and the API stubs (§1.6, §1.7).
- [ ] **1.2** Implement `serializeRng`, `serializeGameLogic`, `serializeInputState`, `serializeTimer`. Test: save → restore → verify fields match (via getters).
- [ ] **1.3** Implement `serializePlayers` / `deserializePlayers` (§1.2). This is the biggest task. Test: save → restore → call `getSyncFingerprintExport` — must match the pre-save value.
- [ ] **1.4** Implement `serializeProjectiles`, `serializeExplods`, `serializeStage`, `serializeFightUI`.
- [ ] **1.5** Implement `serializeAnimationElementState` for the pointer-rebased fields (§1.5). Test: trigger a projectile (Vegeta ki blast), save, advance 10 frames, restore — projectile must be at the saved position with the saved velocity.
- [ ] **1.6** Add `saveGameStateToSlotExport` / `restoreGameStateFromSlotExport` ring buffer API.
- [ ] **1.7** Add `getGameStateCrc32Export` and `getLiveChecksumExport`.
- [ ] **1.8** **Roundtrip determinism test (manual):** Play 60 frames, save slot 0, play 60 more frames, restore slot 0, save slot 1. Slot 0 and slot 1 must be byte-identical. (If not, some state was missed — use the memory-diff approach from §1.3 to find it.)
- [ ] **1.9** **SyncTest mode (automated):** Implement §8.1. Run for 1000 frames with random inputs. Must complete with zero checksum mismatches.

**Risk:** HIGH. This is the make-or-break phase. If a field is missed, every rollback will produce a desync. The SyncTest (§8.1) is the safety net — it catches missed fields immediately.

**Time estimate:** 5–7 days of focused work. The DreamPlayer struct is large; budget 2 days just for that. Projectiles/explods/UI: 1 day each. Animation element rebasing: 1 day. Testing + debugging: 1–2 days.

### Phase 2 — Simulation Separation (2–3 days, risk: medium)
**Goal:** JS owns the rAF pump; can call `stepSimulationExport(n)` and `drawScreenExport()` independently.

- [ ] **2.1** Add `stepSimulation(frames)` to `wrapper.cpp` and expose via `stepSimulationExport` (§2.2).
- [ ] **2.2** Add `drawScreenExport()` to `wrapper.cpp`.
- [ ] **2.3** Add `cancelEmscriptenMainLoopExport()` (§2.2 Path B).
- [ ] **2.4** Modify `start_direct_match.cpp` to call `cancelEmscriptenMainLoopExport` after `startScreenHandling` returns (or have JS call it after catching the exception).
- [ ] **2.5** Add `setSoundMutedExport` and `setSimOnlyModeExport` wiring (already stubbed in Phase 0).
- [ ] **2.6** Rewrite `use-online-multiplayer.ts` to use the new pump (§3.6). Keep the input-delay logic for now (no rollback yet). Test: existing input-delay netcode still works, just with JS owning the rAF.

**Risk:** Medium. The Emscripten main loop cancellation is tricky — if done wrong, the canvas stops rendering. Mitigation: test on a clean local match first, before adding netcode.

### Phase 3 — Rollback Loop (3–4 days, risk: medium)
**Goal:** Replace input-delay with rollback. Still on WebSocket transport.

- [ ] **3.1** Create `src/lib/rollback-netcode.ts` (§3.2). Implement `RollbackNetcode` class.
- [ ] **3.2** Create `src/lib/netcode-transport.ts` interface.
- [ ] **3.3** Create `src/lib/websocket-transport.ts` — wraps existing relay protocol in the NetcodeTransport interface.
- [ ] **3.4** Wire `use-online-multiplayer.ts` to use `RollbackNetcode` + `WebSocketTransport`.
- [ ] **3.5** Implement rollback trigger on remote input mismatch (§3.2 `triggerRollback`).
- [ ] **3.6** Implement frame advantage catch-up (§3.4).
- [ ] **3.7** Two-browser-tab test (§8.2): both tabs connect to local relay, play 60 seconds of random inputs, verify no desync. Compare to current input-delay behavior — rollback should produce fewer visible glitches.

**Risk:** Medium. Logic is complex but each piece is testable. The trickiest part is correctly tracking "what did we predict" vs "what did we receive" for the rollback trigger.

### Phase 4 — Desync Detection Upgrade (1–2 days, risk: low)
**Goal:** Replace the existing 180-frame sync check with the per-30-frame live checksum, with rollback-on-mismatch.

- [ ] **4.1** Add `getLiveChecksumExport` C export (§5.1).
- [ ] **4.2** Add checksum ring buffer to `RollbackNetcode` (local + remote, 60 frames each).
- [ ] **4.3** Implement `onRemoteChecksum` with divergence detection and rollback trigger (§5.3).
- [ ] **4.4** Test: inject a fake desync (manually corrupt local state), verify rollback fires and corrects.

**Risk:** Low. Additive on top of Phase 3.

### Phase 5 — WebRTC Transport (3–5 days, risk: medium-high)
**Goal:** Add WebRTC P2P as primary transport, WebSocket as fallback.

- [ ] **5.1** Add `webrtc_sdp_offer`, `webrtc_sdp_answer`, `webrtc_ice` message types to relay (`server/src/index.ts`) and client (`src/lib/relay-client.ts`).
- [ ] **5.2** Create `src/lib/webrtc-transport.ts` (§4.3).
- [ ] **5.3** Create `src/lib/transport-selector.ts` (§4.7).
- [ ] **5.4** Test: two tabs on the same machine — WebRTC should connect (loopback ICE candidate). Verify inputs flow over DataChannel.
- [ ] **5.5** Test: two machines on the same LAN — STUN should suffice.
- [ ] **5.6** Test: two machines on different networks (one on mobile data) — verify TURN fallback works.
- [ ] **5.7** Test: kill WebRTC mid-match (close the DataChannel) — verify fallback to WebSocket relay.

**Risk:** Medium-high. WebRTC has many failure modes (NAT types, firewall, ICE timeout). The fallback to WebSocket is the safety net. The OpenRelay TURN has reliability/quotas — may need a self-hosted coturn for production.

**Can run in parallel with Phase 3–4** (different files, no conflicts).

### Phase 6 — Polish (2–3 days, risk: low)
**Goal:** Production-quality.

- [ ] **6.1** Adaptive input delay: measure RTT via WebRTC stats or relay ping, set `inputDelay = clamp(round(RTT/16.67) + 1, 2, 6)`.
- [ ] **6.2** Visual rollback indicator: brief screen-edge flash when rollback fires (1-frame, subtle). Helps debugging.
- [ ] **6.3** Rollback stats logging: count rollbacks per match, average rollback depth, max rollback depth. Log to console for playtesting.
- [ ] **6.4** Binary input encoding on WebSocket fallback too (saves ~50 bytes/msg, helps on slow connections).
- [ ] **6.5** Documentation: update `docs/deep-dives/05-rollback-netcode.md` to reflect what was actually built.

---

## 7. KEY FILES TO MODIFY

### 7.1 C++ engine files

| File | Change | Phase |
|---|---|---|
| `engine/DolmexicaInfinite/rollbackstate.cpp` | **NEW** — save/restore implementation, ring buffer, CRC32, exports | 1 |
| `engine/DolmexicaInfinite/rollbackstate.h` | **NEW** — public API header | 1 |
| `engine/DolmexicaInfinite/Makefile.common` | Add `rollbackstate.o` to OBJS | 1 |
| `engine/DolmexicaInfinite/start_direct_match.cpp` | Add new exports (or move them to rollbackstate.cpp). Remove `gResyncData[]` if replaced by rollback. | 1, 2 |
| `engine/DolmexicaInfinite/addons/prism/math.cpp` | Replace `srand`/`rand` with `xorshift32`. Add `getRngState`/`setRngState`. | 0 |
| `engine/DolmexicaInfinite/addons/prism/include/prism/math.h` | Declare `getRngState`/`setRngState`. | 0 |
| `engine/DolmexicaInfinite/addons/prism/input.cpp` | Add `setExternalPlayerInputBitmask` export. Add `gSimOnlyMode` flag to `updateInput()`. | 0, 2 |
| `engine/DolmexicaInfinite/addons/prism/include/prism/input.h` | Declare new functions. | 0, 2 |
| `engine/DolmexicaInfinite/addons/prism/wrapper.cpp` | Make `updateScreen()`/`drawScreen()` non-static (or add public wrappers). Add `stepSimulation()`, `drawScreenExport()`, `cancelEmscriptenMainLoopExport()`. Add `gSkipDraw` flag. | 2 |
| `engine/DolmexicaInfinite/addons/prism/include/prism/wrapper.h` | Declare new functions. | 2 |
| `engine/DolmexicaInfinite/addons/prism/web/sound_web.cpp` | Add `gSoundMuted` flag, gate `playSoundEffect`/`playMusic`. | 2 |
| `engine/DolmexicaInfinite/addons/prism/web/soundeffect_web.cpp` | Same muting (uses `rand()` — will pick up xorshift32 automatically). | 0, 2 |
| `engine/DolmexicaInfinite/playerdefinition.cpp` | Add `serializeDreamPlayer`/`deserializeDreamPlayer` (or put in rollbackstate.cpp). Expose `gPlayerDefinition` internals via accessors. | 1 |
| `engine/DolmexicaInfinite/playerdefinition.h` | Add serialize function declarations if needed. | 1 |
| `engine/DolmexicaInfinite/gamelogic.cpp` | Expose `gGameLogicData` for serialization (add `getGameLogicDataPtr()` accessor). | 1 |
| `engine/DolmexicaInfinite/stage.cpp` | Same for `gStageData`. | 1 |
| `engine/DolmexicaInfinite/mugenstagehandler.cpp` | Same for `gMugenStageHandlerData`. | 1 |
| `engine/DolmexicaInfinite/projectile.cpp` | Same for `gProjectileData`. Add projectile iterator for serialization. | 1 |
| `engine/DolmexicaInfinite/mugenexplod.cpp` | Same for `gMugenExplod`. | 1 |
| `engine/DolmexicaInfinite/fightui.cpp` | Same for `gFightUIData`. | 1 |
| `engine/DolmexicaInfinite/addons/prism/timer.cpp` | Same for `gTimerData`. | 1 |
| `engine/DolmexicaInfinite/addons/prism/mugenanimationhandler.cpp` | Add accessor for animation element mutable state (or serialize inline). | 1 |
| `engine/DolmexicaInfinite/afterimage.cpp` | Add serialize for after-image ring. | 1 |
| `engine/DolmexicaInfinite/playerhitdata.h` / `.cpp` | Ensure `PlayerHitData` is a plain struct (no pointers) — if it has pointers, add serialize. | 1 |
| `scripts/build-wasm.sh` | Add new exports to `EXPORTED_FUNCTIONS`. | 0, 1, 2 |

### 7.2 TypeScript files

| File | Change | Phase |
|---|---|---|
| `src/lib/rollback-netcode.ts` | **NEW** — core rollback loop, save-state ring, prediction, rollback trigger | 3 |
| `src/lib/netcode-transport.ts` | **NEW** — transport interface | 3 |
| `src/lib/websocket-transport.ts` | **NEW** — wraps existing relay in NetcodeTransport | 3 |
| `src/lib/webrtc-transport.ts` | **NEW** — WebRTC DataChannel transport | 5 |
| `src/lib/transport-selector.ts` | **NEW** — tries WebRTC, falls back to WS | 5 |
| `src/lib/input-bitmask.ts` | **NEW** — encode/decode 16-bit input masks | 3 |
| `src/lib/checksum-ring.ts` | **NEW** — ring buffer for frame checksums | 4 |
| `src/hooks/use-online-multiplayer.ts` | Rewrite to use `RollbackNetcode` + `TransportSelector` | 3, 5 |
| `src/lib/relay-client.ts` | Add `sendWebRTCSdpOffer/Answer/Ice` methods. Add `webrtc_sdp_offer`/`answer`/`ice` message handlers. | 5 |
| `src/lib/desync-detector.ts` | Replace with rollback-integrated checksum comparison (or remove — logic moves into RollbackNetcode) | 4 |
| `src/lib/wasm-loader.ts` | Add type declarations for new exports (`_saveGameStateToSlotExport`, etc.) | 1 |
| `src/components/GameCanvas.tsx` | Hook into the new pump (or no change — pump moves to `use-online-multiplayer.ts`) | 2 |
| `src/app/online/page.tsx` | Pass `inputDelay` config to `useOnlineMultiplayer` | 6 |

### 7.3 Server files

| File | Change | Phase |
|---|---|---|
| `server/src/index.ts` | Add `webrtc_sdp_offer`/`answer`/`ice` message types — forward as broadcast to room | 5 |
| `server/src/ws/room-manager.ts` | (No change — just relays) | — |

### 7.4 Documentation

| File | Change | Phase |
|---|---|---|
| `docs/deep-dives/05-rollback-netcode.md` | Update "Open Questions" with answers; mark Phase 1.5b as implemented | 6 |
| `docs/deep-dives/08-rollback-implementation-plan.md` | **THIS FILE** — update with status as phases complete | All |
| `docs/deep-dives/09-webrtc-transport.md` | **NEW** (optional) — detailed WebRTC debugging guide | 5 |

---

## 8. TESTING STRATEGY

### 8.1 SyncTest mode (offline determinism test, critical)

This is GGPO's recommended approach for catching determinism bugs. Run two local simulations in lockstep; every frame, save state → restore → re-simulate → compare checksums.

```ts
// src/lib/sync-test.ts (new file, development only)
export class SyncTest {
  private game: GameInstance;
  private frame = 0;
  private mismatches = 0;
  private inputHistory: number[] = [];  // deterministic pseudo-random inputs

  constructor(game: GameInstance) {
    this.game = game;
    // Pre-generate 1000 frames of pseudo-random inputs (deterministic)
    let seed = 0xDEADBEEF;
    for (let i = 0; i < 1000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
      this.inputHistory.push(seed & 0x3FF);  // 10-bit input mask
    }
  }

  run(maxFrames = 1000): void {
    Module._setRandomSeedExport(42);
    Module._setSoundMutedExport(1);

    for (let f = 0; f < maxFrames; f++) {
      const input = this.inputHistory[f];

      // 1. Save state (slot 0).
      Module._saveGameStateToSlotExport(0, f);

      // 2. Compute "before" checksum.
      const beforeChecksum = Module._getLiveChecksumExport();

      // 3. Inject input, advance 1 frame.
      Module._setExternalPlayerInputBitmask(0, input);
      Module._setExternalPlayerInputBitmask(1, input ^ 0x3FF);  // inverted for p2
      Module._stepSimulationExport(1);

      // 4. Restore to slot 0 (frame f state).
      Module._restoreGameStateFromSlotExport(0);

      // 5. Re-inject the same input, advance 1 frame again.
      Module._setExternalPlayerInputBitmask(0, input);
      Module._setExternalPlayerInputBitmask(1, input ^ 0x3FF);
      Module._stepSimulationExport(1);

      // 6. Compute "after" checksum. Must match step 2's "before" checksum + 1 frame of advance.
      // Actually, we need a different approach: save before step 3, restore, step again,
      // compare the post-step state with what we got the first time.

      // Simpler: save → step → save again (A). Restore → step → save again (B). A == B?
      const checksumA = Module._getLiveChecksumExport();

      // Restore to slot 0 again.
      Module._restoreGameStateFromSlotExport(0);
      Module._setExternalPlayerInputBitmask(0, input);
      Module._setExternalPlayerInputBitmask(1, input ^ 0x3FF);
      Module._stepSimulationExport(1);
      const checksumB = Module._getLiveChecksumExport();

      if (checksumA !== checksumB) {
        console.error(`[SyncTest] MISMATCH at frame ${f}: A=${checksumA.toString(16)} B=${checksumB.toString(16)}`);
        this.mismatches++;
        if (this.mismatches > 10) {
          console.error("[SyncTest] Too many mismatches, aborting.");
          return;
        }
      } else {
        if (f % 60 === 0) console.log(`[SyncTest] frame ${f}: OK (checksum ${checksumA.toString(16)})`);
      }

      this.frame++;
    }

    console.log(`[SyncTest] Done. ${this.mismatches} mismatches in ${maxFrames} frames.`);
  }
}
```

**How to use:** Add a `?synctest=1` URL parameter that, on the online page, runs `SyncTest` instead of connecting to the relay. Should produce 0 mismatches over 1000 frames.

When mismatches occur, the divergence is due to either:
- A missed state field in serialization (find via memory-diff, §1.3).
- A non-deterministic operation (uninitialized memory, undefined evaluation order, libc-internal state).
- An external time source leaking into sim (grep for `time(NULL)`, `clock()`, `Date.now()` in sim code).

### 8.2 Two-browser-tab test (integration)

Automated with Playwright (or manual):

1. Open two browser tabs to `http://localhost:3000/online?room=TEST`.
2. Both tabs connect to a local relay (`ws://localhost:8080/ws`).
3. Run a Playwright script that types random keys in both tabs for 60 seconds.
4. After 60 seconds, read the final sync fingerprint from both tabs.
5. Assert: fingerprints must match.

For network simulation: use Chrome DevTools "slow 3G" preset (400ms RTT, 1.5 Mbps) on one tab. Verify rollback fires and final state still matches.

### 8.3 Two-PC test with network simulation

For real-world validation:
1. Two developers, two machines, different networks (one on mobile data if possible).
2. Play a full 3-round match.
3. Verify: no permanent desync, rollback fires 5–30 times per round (visible in stats logging), no visible teleporting except brief 1–2 frame snaps.
4. Use `?relay-debug=1` URL param to see relay logs.
5. Use Chrome's `chrome://webrtc-internals` to inspect DataChannel stats (packets sent/received, RTT).

### 8.4 Determinism verification

Beyond SyncTest, periodically:
1. Hash the `game.wasm` file on both clients at match start. Compare via relay. If mismatch, abort match ("Build mismatch — both clients must use the same WASM version").
2. Add a `determinism_check` relay message: both clients run 60 no-op frames from a known seed, then exchange `getSyncFingerprintExport()`. Must match before `game_start` is sent.
3. Periodically (every 30s of gameplay) log the live checksum to console. Both clients should have the same value at the same frame.

### 8.5 Test checklist per phase

| Phase | Test | Pass criterion |
|---|---|---|
| 0 | RNG determinism | Same seed + same inputs → same fingerprint over 1000 frames |
| 1.8 | Save/restore roundtrip | Save → advance → restore → save again == first save (byte-identical) |
| 1.9 | SyncTest | 0 checksum mismatches over 1000 frames |
| 2.6 | JS-owned rAF | Local match (no relay) plays normally for 60 seconds |
| 3.7 | Two-tab rollback | 60-second match, no permanent desync, fewer glitches than input-delay |
| 4.4 | Injected desync | Manually corrupt state → rollback fires → state corrects within 30 frames |
| 5.4 | WebRTC loopback | Two tabs on same machine connect via WebRTC, inputs flow, latency < 50ms |
| 5.5 | WebRTC LAN | Two machines on same LAN, STUN-only connection works |
| 5.6 | WebRTC cross-network | Two machines on different networks, TURN fallback works |
| 5.7 | WebRTC failure fallback | Kill DataChannel mid-match → seamless fallback to WebSocket relay |
| 6.3 | Rollback stats | Log shows rollbacks per match, average depth, max depth |

---

## 9. KEY RISKS & MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Missed state field in serialization | HIGH (first attempt) | Desyncs on every rollback | SyncTest (§8.1) catches immediately; memory-diff (§1.3) finds the field |
| RNG state not serializable | CERTAIN (without fix) | Desync after first rollback | Replace `srand`/`rand` with `xorshift32` (§1.4) — Phase 0 |
| Emscripten main loop cancellation breaks rendering | MEDIUM | Canvas goes black | Test on local match first (Phase 2.6); fallback: keep Emscripten's loop, use Path A (§2.2) |
| WebRTC fails on restrictive NATs (symmetric NAT, carrier-grade NAT) | HIGH (~20–30% of pairs) | No P2P connection | TURN fallback (OpenRelay); WebSocket relay as ultimate fallback (§4.7) |
| OpenRelay TURN quota exceeded | MEDIUM | TURN stops working for new users | Self-host coturn on $5/month VPS for production (§4.6) |
| Rollback window exceeded (RTT > 8 frames = 130ms) | MEDIUM on bad connections | Frequent snap-resyncs | Adaptive input delay (§6.1) increases delay for high-RTT pairs |
| DreamPlayer struct changes between engine versions | LOW (engine is stable) | Save states from old version won't restore | Version field in save state header (§1.7); reject mismatched versions |
| Float non-determinism across browsers | LOW (WASM is bit-exact for IEEE 754 ops) | Rare desyncs | SyncTest (§8.1) catches; round positions to int for checksums (§5.1) |
| Audio plays during resim | MEDIUM (if muting missed a path) | Sound effects stutter during rollback | `setSoundMutedExport` flag gates all audio paths (§2.3); test with audio enabled |
| Memory budget exceeded (8 × 256 KB = 2 MB) | LOW | WASM heap grows, may OOM | 2 MB is trivial vs 768 MB heap. Monitor via `Module.HEAPU8.length`. |
| WebRTC DataChannel buffering during lag spikes | MEDIUM | Inputs arrive in burst, trigger many rollbacks | `maxRetransmits: 0` drops stale inputs; `bufferedAmount` check before send |

---

## 10. REFERENCES

### Source code analyzed for this plan
- `engine/DolmexicaInfinite/start_direct_match.cpp` — existing C exports, snap-resync
- `engine/DolmexicaInfinite/playerdefinition.h` — DreamPlayer struct (811 lines)
- `engine/DolmexicaInfinite/playerdefinition.cpp` — `gPlayerDefinition` global
- `engine/DolmexicaInfinite/gamelogic.cpp` — `gGameLogicData`, `updateGameLogic`
- `engine/DolmexicaInfinite/fightscreen.cpp` — fight screen load/draw
- `engine/DolmexicaInfinite/fightui.cpp` — `gFightUIData`, timer, KO display
- `engine/DolmexicaInfinite/stage.cpp` — `gStageData`
- `engine/DolmexicaInfinite/mugenstagehandler.cpp` — `gMugenStageHandlerData`
- `engine/DolmexicaInfinite/projectile.cpp` — `gProjectileData`, Projectile struct
- `engine/DolmexicaInfinite/mugenexplod.cpp` — `gMugenExplod`, Explod struct
- `engine/DolmexicaInfinite/fightnetplay.cpp` — existing (unused) netplay sync hooks
- `engine/DolmexicaInfinite/addons/prism/wrapper.cpp` — `performScreenIteration`, `updateScreen`, `drawScreen`, `startScreenHandling`
- `engine/DolmexicaInfinite/addons/prism/input.cpp` — `setExternalPlayerInput`, `updateInput`, `gExternalInput`, `gPrismGeneralInputData`
- `engine/DolmexicaInfinite/addons/prism/math.cpp` — `srand`/`rand` (to be replaced)
- `engine/DolmexicaInfinite/addons/prism/timer.cpp` — `gTimerData`
- `engine/DolmexicaInfinite/addons/prism/actorhandler.cpp` — `updateActorHandler`, `drawActorHandler`
- `src/hooks/use-online-multiplayer.ts` — current netcode (to be replaced)
- `src/lib/relay-client.ts` — current transport (to be extended)
- `src/lib/desync-detector.ts` — current desync detection (to be replaced)
- `server/src/index.ts` — relay server (to be extended with WebRTC signaling)
- `scripts/build-wasm.sh` — build config, `EXPORTED_FUNCTIONS`
- `docs/deep-dives/05-rollback-netcode.md` — prior rollback design doc
- `docs/deep-dives/06-netcode-sync-research.md` — prior sync research
- `docs/deep-dives/07-ikemen-go-netcode-research.md` — Ikemen GO reference

### External references
- [GGPO Developer Guide](https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md) — save/load callbacks, SyncTest, frame delay tuning, isolation of game state from non-game state, beware of static variables, beware of RNG state
- [GGPO source code](https://github.com/pond3r/ggpo) — reference implementation in C
- [Netcode Architectures Part 2: Rollback (Snapnet blog)](https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback) — modern overview
- [Infil's "Fightin' Words" — Netcode](https://words.infil.net/w02-netcode.html) — player-facing explanation, FGC perspective
- [8 Frames in 16ms: Rollback Networking in Mortal Kombat (GDC 2018)](https://www.gdcvault.com/play/1025471/8-Frames-in-16ms-Rollback) — NetherRealm's production rollback talk
- [Delta Rollback: New optimizations (David Dehaene)](https://medium.com/@david.dehaene/delta-rollback-new-optimizations-for-rollback-netcode-7d283d56e54b) — delta encoding for save states
- [WebRTC unreliable data channels in real-time multiplayer](https://www.reddit.com/r/webdev/comments/jrmfmg/) — `ordered: false, maxRetransmits: 0` config
- [RTCDataChannel.maxRetransmits (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/maxRetransmits) — API reference
- [Peer-to-peer gaming with WebRTC DataChannel (webrtchacks)](https://webrtchacks.com/datachannel-multiplayer-game) — practical tutorial
- [How does reliability work in RTCDataChannel? (Jim Fisher)](https://jameshfisher.com/2017/01/17/webrtc-datachannel-reliability) — SCTP/DTLS internals
- [OpenRelay Project: Free TURN server](https://www.metered.ca/tools/openrelay) — free TURN for fallback
- [WebRTC TURN Servers: When you NEED it (bloggeek.me)](https://bloggeek.me/webrtc-turn) — when STUN isn't enough
- [WebRTC getting started: TURN server](https://webrtc.org/getting-started/turn-server) — official docs
- [GGPO rollback netcode on GitHub topics](https://github.com/topics/rollback-netcode) — Rust/WASM implementations worth studying
- [Making a GGPO-style rollback networking multiplayer game (outof.pizza)](https://outof.pizza/posts/rollback) — browser-based rollback tutorial

---

## 11. SUMMARY — What to do first

**If you have 1 day:** Phase 0 (replace RNG, add input bitmask export, add the skip-draw/sim-only/sound-muted flags). This unblocks everything else and is independently testable.

**If you have 1 week:** Phase 0 + Phase 1 (save/restore). By end of week 1, SyncTest passes for 1000 frames. No network code touched yet.

**If you have 2 weeks:** + Phase 2 + Phase 3 (simulation separation + rollback loop on WebSocket transport). By end of week 2, two-browser-tab rollback works over the existing relay.

**If you have 3 weeks:** + Phase 4 + Phase 5 (desync detection upgrade + WebRTC transport). By end of week 3, full P2P rollback with WebSocket fallback.

**If you have 4 weeks:** + Phase 6 (polish: adaptive delay, stats logging, documentation).

**Total estimated effort:** 17–22 days of focused engineering work for a single developer. The riskiest phase is Phase 1 (save/restore) — budget 7 days, not 5, for the inevitable "missed a field" debugging cycle. SyncTest is the critical safety net throughout.
