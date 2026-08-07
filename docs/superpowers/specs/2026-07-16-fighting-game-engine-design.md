# Fighting Game Engine — Design Spec

**Date:** 2026-07-16
**Last Updated:** 2026-07-17
**Status:** Draft (revised after Phase 0/0.5 evaluation)
**Author:** Super Z + nawaf-al-hussain

## 1. Overview

Browser-based 2D fighting game platform using Dolmexica Infinite (MUGEN interpreter) compiled to WebAssembly. Players select characters, create/join rooms, and fight each other in real-time via lockstep + rollback netcode relayed through a WebSocket server.

Target region: Bangladesh. Target cost: $0 (no credit card).

## 2. Goals

- Run MUGEN-compatible fighting games in the browser via WASM
- Support real-time 1v1 online multiplayer with rollback netcode (Phase 1.5)
- Mobile-friendly with virtual touch controls
- Deploy on free-tier services (Vercel, Deno Deploy, Neon DB, Cloudflare R2)
- First-load bundle under 10MB (engine + 1–2 small characters)

## 3. Non-Goals

- Building a new fighting game engine from scratch (we use Dolmexica Infinite)
- Single-player story mode or AI opponents
- Account systems beyond anonymous session IDs (Phase 3)
- Spectator mode or replays (Phase 2+)
- Database persistence (Phase 3 — Phase 1 / 1.5 relay is in-memory)

## 4. Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│  Player A   │◄──────────────────►│  Deno Relay  │
│  (Browser)  │                    │  (lockstep + │
│  WASM+Next  │                    │  rollback)   │
└─────────────┘                    └──────┬───────┘
                                          │
                                   ┌──────▼──────┐
┌─────────────┐     WebSocket      │  In-memory  │
│  Player B   │◄──────────────────►│  room state │
│  (Browser)  │                    │  (Phase 1.5)│
│  WASM+Next  │                    └─────────────┘
└─────────────┘                           │
       ▲                                  │
       │ on-demand fetch (Phase 1.5)      │
       │                                  │
┌──────┴──────┐                    ┌──────▼──────┐
│ Cloudflare  │                    │  Neon DB    │
│  R2         │                    │  (Phase 3)  │
│ char assets │                    └─────────────┘
└─────────────┘
```

Each browser runs a local WASM instance of Dolmexica Infinite. The relay buffers inputs per-frame and forwards them; clients run a local input-delay buffer and roll back on late arrivals.

## 5. Tech Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Next.js 14 + React 18 | Free (Vercel) |
| Game Engine | Dolmexica Infinite → WASM (Emscripten 3.1.74) | Free |
| WebSocket Relay | Deno Deploy | Free ($0) |
| Database | Neon Serverless Postgres | Free tier (Phase 3 only) |
| Cache | Upstash Redis | Free tier (room metadata only — Phase 2) |
| Asset Storage | Cloudflare R2 | Free 10GB |
| Audio | SDL_mixer (compiled into WASM) | Free |

## 6. Key Technical Decisions

### 6.1 Netcode Evolution

The netcode evolves through three stages. Pure lockstep is not used — Bangladesh RTT to Deno Deploy regions (Frankfurt `nce1` or SF `sfo1`) is 120–250ms, which would cap pure lockstep at ~4 simulated FPS.

**Phase 1: Local only.** Two players share one keyboard. No network. P2 input is injected via `_setExternalPlayerInput()` — this proves the input bridge works without network complexity.

**Phase 1.5: Input-delay lockstep + rollback (GGPO-style).** Both clients run identical WASM instances. The relay buffers per-frame inputs from both players and only emits a `frame_advance` signal when both slots have inputs for that frame. Each client also maintains a 4-frame input-delay buffer (configurable). On late remote input arrival, the client:
1. Saves its state at the late frame (via engine `saveState()` API — requires Dolmexica modification)
2. Restores the saved state
3. Re-applies corrected inputs from that frame forward (resimulation)
4. Resumes normal execution

This keeps the game at 60 FPS and only "rolls back" on rare late packets. See `docs/deep-dives/05-rollback-netcode.md` for full architecture.

**Phase 2: Spectator mode** piggybacks on the rollback state save buffer — spectators replay saved states with a fixed delay, no input forwarding needed.

### 6.2 FMOD Replacement

Dolmexica Infinite uses proprietary FMOD for audio. We replace it with SDL_mixer (`sound_web.cpp`, `soundeffect_web.cpp`) since FMOD cannot be compiled to WASM without a commercial license.

### 6.3 Asset Delivery

**Phase 1: Minimal bundle.** `game.data` contains only the engine + Songoku (~4MB) + 1 small character TBD. Total first-load under ~10MB. This is essential for Bangladesh mobile data costs (~৳5/MB prepaid).

**Phase 1.5: On-demand streaming.** When a player selects a character in the lobby, the frontend fetches the character zip from Cloudflare R2, unzips in-browser (via `fflate` or `pako`), and writes each file into the Emscripten MEMFS via `Module.FS.writeFile()`. No WASM repackage needed at runtime — this is a manual version of what `file_packager --preload` does at build time.

**Phase 2: Full R2 pipeline.** Validated character uploads, CDN distribution, palette loading optimizations, sprite compression.

### 6.4 Mobile Support

Virtual D-pad (U/D/B/F) + 5 action buttons (A/B/C/X/Y) rendered as HTML overlays. Multi-touch supported via `touchstart` / `touchmove` / `touchend` events. D-pad 120×120px bottom-left, action buttons 48px diameter bottom-right, canvas fills remaining space.

### 6.5 Threading Model

The web build runs **single-threaded**. `thread_web.cpp` runs all functions synchronously (no threads). Consequences:

- No `SharedArrayBuffer` required
- No COOP/COEP headers needed on Vercel
- WASM artifact is `game.wasm` (not `game.threaded.wasm`)
- Simpler deployment — no special headers conflict with fonts, analytics, or third-party scripts
- Performance ceiling is lower than threaded build, but acceptable for 1v1 MUGEN

### 6.6 Netcode State Save/Restore

Dolmexica does not natively expose state save/restore. Phase 1.5 rollback requires adding three C functions to the engine:

```c
int saveGameState(int slot);          // returns slot ID, 0 on failure
int restoreGameState(int slot);       // returns 0 on success
int stepSimulation(int frames);       // advance N frames with current input
```

Implementation approach is documented in `docs/deep-dives/05-rollback-netcode.md`. This is the single biggest engine modification in the project.

## 7. Risks

| Risk | Mitigation | Status |
|------|-----------|--------|
| Bangladesh latency kills online play | Rollback netcode (Phase 1.5) + configurable input delay (default 4 frames) | Mitigated in 1.5 |
| Large asset files (100MB+ chars) | Strip bundle to <10MB; on-demand R2 streaming in Phase 1.5 | Mitigated in 1.5 |
| Lockstep desync from packet loss | Rollback state restore + enforced `sync_check` | Mitigated in 1.5 |
| Dolmexica state save/restore not native | Engine modification required — see deep-dive 05 | Open (Phase 1.5 work) |
| Emscripten version drift | Pin to 3.1.74 (handoff confirmed) | Resolved |
| Relay flooding by malicious client | Per-session rate limit on `input` messages (FIX-7) | Phase 1.5 |
| Brute-force room codes (32^6 ≈ 1B) | Acceptable for MVP; HMAC-signed sessions in Phase 3 | Accept Phase 1.5 |
| Dolmexica WASM performance on mobile | Profile in Phase 1, reduce asset sizes, quality toggle | Phase 1 |
| Upstash Redis free-tier exhaustion (10K cmd/day) | Redis for room metadata only — NOT input buffering | Resolved by design |
| tmpfiles.org / asset hosting takedown | Mirror to R2 in Phase 1.5; validate all assets before bundling | Phase 1.5 |

## 8. Scope

### Phase 0: Engine to WASM ✅ COMPLETE
- Compile Dolmexica Infinite to WASM with SDL2, SDL_mixer, SDL2_image (PNG), SDL_ttf
- Replace FMOD with SDL_mixer web implementations
- Bundle 3 test characters and verify they load

### Phase 0.5: Input Bridge ✅ CODE COMPLETE (needs rebuild + test)
- Add `setExternalPlayerInput()` C function for remote input injection
- Expose to JavaScript via Emscripten `ccall` / `cwrap`
- Test harness verifies P2 walks forward when JS calls `_setExternalPlayerInput(1, "Fa")`

### Phase 1: Local Demo MVP
- Next.js game page with canvas
- Keyboard + touch input capture
- **Local 2-player mode** (two players on one keyboard — proves input bridge without network)
- **Basic character select** (bundled chars only)
- No network, no relay — prove the engine works in a browser

### Phase 1.5: Online Relay MVP
- Deno Deploy WebSocket relay with **real frame-buffered lockstep**
- **Rollback netcode** (GGPO-style state save/restore)
- **Configurable input-delay buffer** (default 4 frames)
- Lobby UI: create/join/char-select/waiting/game
- **On-demand character streaming** from R2 via `Module.FS.writeFile`
- **Frame-synchronized input pump** (rAF loop, frame negotiation on `game_start`)
- Two-tab end-to-end test

### Phase 2: Polish
- Cloudflare R2 full asset delivery pipeline (validator + uploader + CDN)
- Upstash Redis for room metadata (NOT input buffering)
- **Spectator mode** (uses rollback state saves)
- Mobile UX tuning, asset compression, palette loading optimizations

### Phase 3: Scale
- **Neon DB persistence** (users, match history)
- Persistent anonymous accounts (HMAC-signed session IDs)
- Replay recording / playback (free with rollback state saves)
- Ranked matchmaking
