# Fighting Game Engine — Implementation Plan

**Date:** 2026-07-16
**Last Updated:** 2026-07-17
**Status:** In Progress

## Locked Decisions (2026-07-17)

After Phase 0 / 0.5 evaluation, the following scope decisions are locked:

1. **Rollback netcode lives in Phase 1.5** (was Phase 2). Online play is not shippable without it; pure lockstep over Bangladesh RTT (120–250ms to Deno Deploy) is unplayable.
2. **Asset stripdown.** `game.data` bundles only Songoku (~4MB) + 1 small character (TBD from user). Other characters stream on-demand from R2 via `Module.FS.writeFile()` starting Phase 1.5.
3. **Database moves to Phase 3.** Phase 1 / 1.5 relay is in-memory only. Match history and accounts are not needed for MVP.

## Task Tracker

### Phase 0: Engine → WASM ✅ COMPLETE
- [x] 01. Clone Dolmexica Infinite + Prism engine
- [x] 02. Fix Vector2D API change in playerdefinition.cpp (6 call sites)
- [x] 03. Create sound_web.cpp (SDL_mixer music replacement for FMOD)
- [x] 04. Create soundeffect_web.cpp (SDL_mixer SFX replacement for FMOD)
- [x] 05. Download zstd headers for compression support
- [x] 06. Write build-wasm.sh (Prism + Dolmexica + asset packaging)
- [x] 07. Build WASM successfully (game.wasm 3.1MB + game.js 207KB)
- [x] 08. Download and validate 3 test characters (KnightmareSuperman, Nightwing, Songoku)
- [x] 09. Rebuild WASM with assets bundled via file_packager
- [x] 10. Verify characters load with emrun

### Phase 0.5: Input Bridge ✅ CODE COMPLETE (needs rebuild + test)
- [x] 11. Add setExternalPlayerInput() C function in Dolmexica
- [x] 12. Expose to JS via Emscripten cwrap (EXPORTED_FUNCTIONS updated in build-wasm.sh)
- [ ] 13. **Rebuild WASM with Phase 0.5 changes** ← artifacts are gitignored, must rebuild
- [ ] 13b. **Write test harness for input bridge** ← 20-line HTML that calls `_setExternalPlayerInput(1, "Fa")` and verifies P2 walks forward. No network needed.
- [ ] 13c. Fix off-by-one bug in `connectRelayToGame` (FIX-1) — `from_slot` (1/2) vs `controllerIndex` (0/1)
- [ ] 13d. Fix `GameCanvas.tsx` race condition (FIX-2) — replace `setTimeout(100)` with `onRuntimeInitialized` callback

### Phase 1: Local Demo MVP (revised scope)
**Goal:** prove two humans can play the game in one browser tab. No relay, no netcode. This is the actual proof that the engine works in a browser.

- [ ] 14. Next.js game page with canvas component (partial — `GameCanvas` exists, page is bare)
- [ ] 15. Keyboard input capture → MUGEN input strings (partial — `useGameInput` hook exists)
- [ ] 16. Touch controls: D-pad + action buttons (partial — `TouchControls` exists, not wired to page)
- [ ] 16b. **Local 2-player mode** — P1 = WASD + ZXC, P2 = arrow keys + UIO. Uses `_setExternalPlayerInput` for P2 (proves the bridge without network).
- [ ] 20a. **Basic character select** — grid of bundled characters only (Songoku + 1 TBD), lock-in button. (Moved from Phase 2.)
- [ ] 19a. End-to-end local test — load page, pick chars, play 2P locally in one tab
- [ ] FIX-3. Strip KnightmareSuperman + Nightwing from `build-wasm.sh` `--preload` list
- [ ] FIX-4. Treat Start button as edge-triggered, not level-triggered in `use-game-input.ts`

### Phase 1.5: Online Relay MVP (new phase)
**Goal:** playable online over LAN / low-latency connections. Includes rollback.

- [ ] 17. Deno Deploy `main.ts` with `Deno.serve()` WebSocket handler — routes messages to `room-manager.ts` functions. (Currently missing — `room-manager.ts` is library code only.)
- [ ] 17b. **Implement real frame-buffered lockstep in `room-manager.ts`** — currently `processInput()` just forwards; needs per-frame input buffer, only emit `frame_advance` when both slots have inputs for that frame.
- [ ] 17c. **Configurable input-delay buffer** (default 4 frames, exposed as `set_input_delay` message)
- [ ] 24a. **GGPO-style rollback**: state save/restore on late input arrival. Requires engine modification to expose `saveState()` / `restoreState()` / `stepFrame()` from Dolmexica. See `docs/deep-dives/05-rollback-netcode.md`.
- [ ] 24b. **Enforce `sync_check`** — currently defined but not acted upon. On hash mismatch: pause + request resync.
- [ ] 18. Lobby UI — full screen flow: Home → Create/Join → Char Select → Waiting → Game (per `docs/deep-dives/04-room-lobby-ux.md`)
- [ ] 18b. **On-demand character streaming** — fetch char zip from R2 when selected in char-select, unzip in browser, write into Emscripten MEMFS via `Module.FS.writeFile()`. No WASM repackage at runtime.
- [ ] 18c. **Frame-synchronized input pump** — `requestAnimationFrame` loop that calls `getCurrentInput()` + `relay.sendInput(frame, data)` each frame. Frame counter resets on `game_start` for both clients.
- [ ] 18d. Fix `RelayClient` reconnect — re-join room after reconnect (FIX-5)
- [ ] 18e. Add per-session rate limit on `input` messages (FIX-7) — default 120/min, burst 60
- [ ] 19b. Two-tab end-to-end test on localhost — same room, both tabs play a round
- [ ] FIX-6. Delete duplicate `generateRoomCode()` (in `room-manager.ts` AND `server/utils/helpers.ts`)

### Phase 2: Polish
- [ ] 23. Cloudflare R2 full asset delivery pipeline (validator + uploader + CDN)
- [ ] 22. Upstash Redis room state cache — **metadata only** (room list, host info). **NOT input buffering** — Redis free tier (10K cmd/day) would be exhausted in 4 matches at 60fps.
- [ ] 24c. **Spectator mode** (moved from Phase 3 — easy once rollback state saves exist; spectator just replays saved states with delay)
- [ ] Misc UX polish, mobile tuning, asset compression, palette loading optimizations

### Phase 3: Scale
- [ ] 20. **Neon DB schema + migrations** (moved from Phase 2) — users, characters, stages, rooms, match_history per `docs/deep-dives/01-database-schema.md`
- [ ] 21. Persistent anonymous accounts (HMAC-signed session IDs)
- [ ] 25. Replay recording / playback (free with rollback state saves — just dump the input stream)
- [ ] 26. Ranked matchmaking (requires persistent accounts from task 21)

## Critical Bug Fixes (do before / during Phase 1)

These are pre-existing issues found during plan evaluation. They block Phase 1 if not fixed.

| ID | Issue | Fix |
|----|-------|-----|
| FIX-1 | `connectRelayToGame` calls `injectFn(remoteMsg.from_slot, ...)` where `from_slot` is 1/2, but `injectRemoteInput` expects 0/1. Off-by-one — P1 input gets injected into P2. | Add `- 1` translation at the JS↔relay boundary |
| FIX-2 | `GameCanvas.tsx` line 35: `await new Promise(r => setTimeout(r, 100))` — race condition. Emscripten init takes seconds on mobile. | Use `Module.onRuntimeInitialized` or `Module.then()` |
| FIX-3 | `build-wasm.sh` preloads all 3 chars (104MB) — incompatible with BD mobile data. | Strip to Songoku + 1 small char. Document `file_packager --preload` change. |
| FIX-4 | `use-game-input.ts` treats Start (Q/Enter) as level-triggered — sent every frame while held. | Edge-trigger Start; emit only on keydown transition |
| FIX-5 | `RelayClient.attemptReconnect` reconnects the socket but doesn't re-join the room. After reconnect, client is in limbo. | On `ws.onopen`, if `this.roomCode` is set, re-send `join_room` |
| FIX-6 | `generateRoomCode()` defined in both `room-manager.ts` and `server/utils/helpers.ts`. Drift waiting to happen. | Delete one (keep in `helpers.ts`, import from `room-manager.ts`) |
| FIX-7 | No rate limit on `input` messages — a malicious client can flood the relay at 6000 msgs/sec. | Per-session rate limit in relay: 120 msgs/min sustained, 60-msg burst |
| FIX-8 | `removePlayer` resets room status to `"waiting"` even mid-game — opponent rage-quit silently resets the room. | Emit `game_abandoned` event; don't silently reset to waiting |

## Dependencies

- Phase 0.5 task 13b depends on 13 (WASM rebuild)
- Phase 1 tasks depend on Phase 0.5 (need verified input bridge)
- Phase 1.5 task 17b depends on Phase 1 (need working local game first)
- Phase 1.5 task 24a (rollback) depends on 17b (lockstep foundation) + engine modification (see `docs/deep-dives/05-rollback-netcode.md`)
- Phase 1.5 task 18b depends on R2 bucket setup (Cloudflare account, credentials)
- Phase 2 task 24c (spectator) depends on 24a (rollback state saves)
- Phase 3 task 26 (ranked) depends on 21 (accounts)
