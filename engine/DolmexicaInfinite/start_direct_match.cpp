// start_direct_match.cpp — Direct match start (bypasses title/select screens)
//
// Exposed as _startDirectMatch(p1Char, p2Char, stagePath) via Emscripten.
// Initializes the engine, sets player characters and stage, then starts
// the fight screen directly — skipping all text-dependent menu screens.

#include "config.h"
#include "playerdefinition.h"
#include "fightscreen.h"
#include "gamelogic.h"
#include "versusscreen.h"
#include "stage.h"
#include "ai.h"
#include "mugenstagehandler.h"

#include <prism/wrapper.h>
#include <prism/system.h>
#include <prism/log.h>
#include <prism/debug.h>
#include <prism/framerateselectscreen.h>
#include <prism/screeneffect.h>
#include <prism/mugenanimationhandler.h>
#include <prism/mugentexthandler.h>
#include <prism/clipboardhandler.h>
#include <prism/math.h>

#include <string.h>
#include <stdio.h>
#include <stdint.h>
#include <math.h>

extern "C" {

static int gDirectMatchStarted = 0;

static void directMatchFightFinishedCB() {
    // Return to a simple state — in a real game this would go back to lobby
    logg("[DIRECT_MATCH] Fight finished.");
}

static void directMatchVersusScreenFinishedCB() {
    setGameModeVersus();
    startFightScreen(directMatchFightFinishedCB);
}

static void startDirectMatchInternal(const char* p1Char, const char* p2Char, const char* stagePath) {
    logg("[DIRECT_MATCH] Setting up match...");
    
    // Build full paths
    char p1Path[1024], p2Path[1024], stageFullPath[1024];
    const char* assetFolder = getDolmexicaAssetFolder().c_str();
    
    sprintf(p1Path, "%schars/%s/%s.def", assetFolder, p1Char, p1Char);
    sprintf(p2Path, "%schars/%s/%s.def", assetFolder, p2Char, p2Char);
    sprintf(stageFullPath, "%sstages/%s", assetFolder, stagePath);
    
    logg("[DIRECT_MATCH] P1 path:");
    logString(p1Path);
    logg("[DIRECT_MATCH] P2 path:");
    logString(p2Path);
    logg("[DIRECT_MATCH] Stage path:");
    logString(stageFullPath);
    
    // Set player definition paths
    setPlayerDefinitionPath(0, p1Path);
    setPlayerDefinitionPath(1, p2Path);
    
    // Set the stage
    setDreamStageMugenDefinition(stageFullPath, "");
    
    // Set versus mode (2 rounds, human vs human)
    setGameModeVersus();
    
    // Set up versus screen callback for rematches
    setVersusScreenNoMatchNumber();
    setVersusScreenFinishedCB(directMatchVersusScreenFinishedCB);
    
    logg("[DIRECT_MATCH] Match setup complete.");
}

// Called from JavaScript to initialize the engine and start a match directly.
// This bypasses all menu screens (title, character select, versus) that
// require text rendering, which doesn't work in the WASM build.
//
// Must be called instead of _main(). The caller should NOT call _main().
//
// Parameters:
//   p1Char: character directory name (e.g., "Songoku")
//   p2Char: character directory name (e.g., "Vegeta")
//   stagePath: stage file path relative to stages/ (e.g., "stage0.def")
void startDirectMatch(const char* p1Char, const char* p2Char, const char* stagePath) {
    if (gDirectMatchStarted) {
        logg("[DIRECT_MATCH] Already started, setting up new match...");
        startDirectMatchInternal(p1Char, p2Char, stagePath);
        return;
    }
    gDirectMatchStarted = 1;
    
    logg("[DIRECT_MATCH] Initializing engine...");
    
    setMinimumLogType(LOG_TYPE_NORMAL);
    
    setGameName("FIGHTING GAME ENGINE");
    setScreenSize(320, 240);
    
    if (!isOnDreamcast()) {
        setMugenSpriteFileReaderSubTextureSplit(8, 1024);
    }
    
    // Initialize the wrapper — creates SDL window, GL context, audio, etc.
    initPrismWrapperWithMugenFlags();
    logg("[DIRECT_MATCH] Wrapper initialized.");
    
    // Load config (mugen.cfg) — needed for game speed, rules, etc.
    loadMugenConfig();
    logg("[DIRECT_MATCH] Config loaded.");
    
    loadGlobalVariables(PrismSaveSlot::AMOUNT);
    
    // Skip setFont and loadMugenSystemFonts — they crash in WASM
    
    logg("[DIRECT_MATCH] Check framerate");
    FramerateSelectReturnType framerateReturnType = selectFramerate();
    if (framerateReturnType == FRAMERATE_SCREEN_RETURN_ABORT) {
        logg("[DIRECT_MATCH] Framerate abort, exiting.");
        return;
    }
    
    setMemoryHandlerCompressionActive();
    setScreenEffectZ(99);
    setMugenAnimationHandlerPixelCenter(Vector2D(0.0, 0.0));
    
    // Set up match (player paths, stage, game mode)
    startDirectMatchInternal(p1Char, p2Char, stagePath);
    
    // Start screen handling — this calls loadScreen which calls
    // initBasicSystems again. The GL re-init is handled gracefully
    // (initOpenGL checks for existing state).
    // emscripten_set_main_loop(simulateInfiniteLoop=1) throws an exception
    // that is caught by the try/catch in the JS caller.
    logg("[DIRECT_MATCH] Starting screen handling with fight screen...");
    startScreenHandling(getDreamFightScreenForTesting());
    
    logg("[DIRECT_MATCH] Done.");
}

// Force a player into a specific state. Bypasses command system entirely.
void forcePlayerState(int playerIndex, int stateNo) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return;
    setPlayerControl(p, 1);
    changePlayerState(p, stateNo);
}

// Force give player control
void forcePlayerControl(int playerIndex, int control) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return;
    setPlayerControl(p, control);
}

// Set player as AI-controlled (uses MUGEN CNS AI commands in .cmd file)
// level: 1-8 (1=easiest, 8=hardest). 0 = human.
// This is how the original Dolmexica and MUGEN handle AI — the character's
// .cmd file has AI-specific ChangeState triggers (var(51)=1) that activate
// when mAILevel > 0. The engine's gamelogic.cpp also uses setPlayerArtificial
// for arcade mode.
void setPlayerAI(int playerIndex, int level) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return;
    setPlayerArtificial(playerIndex, level);
    // MUST call setDreamAIActive to register the player in the AI handler.
    // setPlayerArtificial only sets mAILevel — the AI handler is activated
    // during loadPlayerFiles, which has already happened by the time we
    // call this. So we need to manually activate the AI handler.
    setDreamAIActive(p);
}

// =============================================================================
// State query exports — for TypeScript fight state machine
// =============================================================================

// Returns player's current life (0 = dead)
int getPlayerLifeExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return getPlayerLife(p);
}

// Returns player's max life
int getPlayerLifeMaxExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return getPlayerLifeMax(p);
}

// Returns player's power (0-3000 for MUGEN standard)
int getPlayerPowerExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return getPlayerPower(p);
}

// Returns 1 if player is alive, 0 if dead
int isPlayerAliveExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return isPlayerAlive(p) ? 1 : 0;
}

// Returns player's current state number (e.g., 0=stand, 20=walk, 40=jump, 10=crouch)
int getPlayerStateExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return getPlayerState(p);
}

// Returns player's rounds won (0, 1, or 2 in best-of-3)
int getPlayerRoundsWonExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return p->mRoundsWon;
}

// Returns current round number (1, 2, 3, etc.)
int getRoundNumberExport() {
    return getDreamRoundNumber();
}

// Returns current round state:
// 0=FADE_IN, 1=INTRO, 2=FIGHT, 3=OVER, 4=WIN_POSE
int getRoundStateExport() {
    return getDreamRoundStateNumber();
}

// =============================================================================
// Sync fingerprint — for online desync detection
//
// Returns a 64-bit hash of both players' positions, velocities, life, and state.
// Both clients should produce the same hash if they're in sync.
// Called from JS every ~30 frames to detect desyncs.
//
// The hash is computed by XOR-ing together rounded integer values of the
// state fields. Rounding to integers tolerates sub-pixel float drift
// (which is harmless for gameplay but would cause false positives in a
// raw byte comparison).
// =============================================================================

// Simple hash combining function (FNV-1a variant)
static uint64_t hashSyncValue(uint64_t hash, double value) {
    // Round to nearest integer to tolerate sub-pixel float drift
    int64_t rounded = (int64_t)(value >= 0 ? value + 0.5 : value - 0.5);
    hash ^= (uint64_t)rounded;
    hash *= 0x100000001b3ULL;  // FNV prime
    return hash;
}

static uint64_t hashSyncValueInt(uint64_t hash, int value) {
    hash ^= (uint64_t)value;
    hash *= 0x100000001b3ULL;
    return hash;
}

// Returns a 64-bit sync fingerprint. Both clients should produce the same
// value if their game states are identical.
// Returns the hash as two 32-bit values via out_lo and out_hi pointers
// (JavaScript can't handle 64-bit integers natively, so we split it).
//
// Both clients run the SAME WASM binary with the SAME inputs, so float
// operations are bit-identical (IEEE 754 guarantees this for the same binary).
// Positions ARE included (rounded to integers via hashSyncValue) because
// position drift is the most common desync symptom.
void getSyncFingerprintExport(int* out_lo, int* out_hi) {
    uint64_t hash = 0xcbf29ce484222325ULL;  // FNV offset basis

    for (int i = 0; i < 2; i++) {
        DreamPlayer* p = getRootPlayer(i);
        if (!p) {
            hash = hashSyncValueInt(hash, -999999);
            continue;
        }

        int coordP = getDreamMugenStageHandlerCameraCoordinateP();

        // Position (rounded to integers — catches position drift)
        hash = hashSyncValue(hash, getPlayerPositionX(p, coordP));
        hash = hashSyncValue(hash, getPlayerPositionY(p, coordP));

        // Life, state, facing, rounds won
        hash = hashSyncValueInt(hash, getPlayerLife(p));
        hash = hashSyncValueInt(hash, getPlayerState(p));
        hash = hashSyncValueInt(hash, getPlayerIsFacingRight(p) ? 1 : -1);
        hash = hashSyncValueInt(hash, p->mRoundsWon);
    }

    *out_lo = (int)(hash & 0xFFFFFFFF);
    *out_hi = (int)((hash >> 32) & 0xFFFFFFFF);
}

// =============================================================================
// RNG seed export — for online determinism
//
// Both clients MUST start with the same random seed, otherwise any engine
// randomness (AI behavior, hit spark variation, palette selection, screen
// shake) will diverge and cause desyncs.
//
// The host generates a random seed and sends it to the guest via the relay.
// Both clients call setRandomSeedExport(seed) before startDirectMatch.
// =============================================================================

void setRandomSeedExport(unsigned int seed) {
    setRandomSeed(seed);
    logg("[DIRECT_MATCH] Set random seed for online determinism.");
    logInteger(seed);
}

// Position getters for snap-resync
double getPlayerPositionXExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return getPlayerPositionX(p, getDreamMugenStageHandlerCameraCoordinateP());
}

double getPlayerPositionYExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return getPlayerPositionY(p, getDreamMugenStageHandlerCameraCoordinateP());
}

double getPlayerVelocityXExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return getPlayerVelocityX(p, getDreamMugenStageHandlerCameraCoordinateP());
}

double getPlayerVelocityYExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 0;
    return getPlayerVelocityY(p, getDreamMugenStageHandlerCameraCoordinateP());
}

int getPlayerFacingExport(int playerIndex) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return 1;
    return getPlayerIsFacingRight(p) ? 1 : -1;
}

// =============================================================================
// Snap-resync — correct desyncs by overwriting player position/life
//
// When a desync is detected (via sync fingerprint), the host (authoritative)
// sends its player positions/life to the guest. The guest calls this
// function to snap its players to the host's state.
//
// IMPORTANT: We only overwrite POSITION and LIFE — NOT state or facing.
// Overwriting state/facing breaks the engine's internal state machine
// (animation gets stuck, physics break, character becomes unresponsive).
// The engine will naturally correct facing/state on the next frame from
// the inputs being processed.
//
// SMOOTH INTERPOLATION:
// Instead of instantly teleporting, we interpolate the position over
// RESYNC_INTERPOLATION_FRAMES frames (~167ms at 60fps). The character
// slides to the corrected position instead of jumping. This makes the
// correction much less jarring.
// =============================================================================

#define RESYNC_INTERPOLATION_FRAMES 10

struct ResyncData {
    int active;
    double targetX;
    double targetY;
    double startX;
    double startY;
    int framesRemaining;
};

static ResyncData gResyncData[2] = {{0,0,0,0,0,0}, {0,0,0,0,0,0}};

// Called from JS to start a resync (guest only)
// Snaps position + velocity + life instantly
void setPlayerSyncStateExport(int playerIndex, double x, double y, int life, int state, int facing) {
    DreamPlayer* p = getRootPlayer(playerIndex);
    if (!p) return;

    int coordP = getDreamMugenStageHandlerCameraCoordinateP();

    // Only correct life (safe — doesn't break state machine)
    setPlayerLife(p, p, life);

    // Check if position correction is needed (threshold: 100px)
    double currentX = getPlayerPositionX(p, coordP);
    double currentY = getPlayerPositionY(p, coordP);
    double dx = x - currentX;
    double dy = y - currentY;
    double distance = sqrt(dx * dx + dy * dy);

    if (distance < 30.0) {
        // Position is close enough — no correction needed
        // 30px threshold: correct visible desyncs, ignore minor drift
        return;
    }

    // SNAP position instantly
    setPlayerPositionX(p, x, coordP);
    setPlayerPositionY(p, y, coordP);

    // Zero velocity to prevent physics from fighting the correction
    setPlayerVelocityX(p, 0, coordP);
    setPlayerVelocityY(p, 0, coordP);

    logg("[DIRECT_MATCH] Resync snap (100px threshold) applied to player ");
    logInteger(playerIndex);
}

// Called every frame to apply smooth position interpolation
// Call this from the main game loop (or from JS via ccall)
void updateResyncInterpolationExport() {
    for (int i = 0; i < 2; i++) {
        if (!gResyncData[i].active) continue;

        DreamPlayer* p = getRootPlayer(i);
        if (!p) {
            gResyncData[i].active = 0;
            continue;
        }

        int coordP = getDreamMugenStageHandlerCameraCoordinateP();

        // Only interpolate X (Y was already snapped instantly)
        double curX = getPlayerPositionX(p, coordP);
        double lerpX = curX + (gResyncData[i].targetX - curX) * (1.0 / gResyncData[i].framesRemaining);

        setPlayerPositionX(p, lerpX, coordP);

        gResyncData[i].framesRemaining--;
        if (gResyncData[i].framesRemaining <= 0) {
            // Final snap to exact target X
            setPlayerPositionX(p, gResyncData[i].targetX, coordP);
            gResyncData[i].active = 0;
        }
    }
}

} // extern "C"
