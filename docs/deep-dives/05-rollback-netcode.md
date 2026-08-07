# Rollback Netcode Architecture

**Last Updated:** 2026-07-17
**Phase:** 1.5 (online relay MVP)

## Why Rollback

### The latency problem

Bangladesh RTT to Deno Deploy regions:
- `nce1` (Frankfurt): 180–250ms via Europe route
- `sfo1` (San Francisco): 240–320ms via US route
- `hnd1` (Tokyo): 140–200ms via Singapore hop (best case)

For two players both in Bangladesh, the round-trip-through-relay adds 2× their respective RTTs. Even in the best case (both via Tokyo, 150ms each), the relay path = ~300ms.

### Why pure lockstep fails

Pure lockstep waits for both players' inputs each frame before advancing. At 300ms relay path, the simulation runs at ~3.3 FPS. Unplayable.

### Why input delay alone is weak

Input delay (buffer your own input by N frames before applying) lets the simulation run at 60 FPS, but late remote inputs are dropped or guessed. Dropped inputs cause visible glitches (opponent "teleports" or misses actions). With 4-frame delay (66ms) and 300ms relay path, ~5 of every 6 frames need prediction — too many glitches.

### Why rollback wins

Rollback = input delay + state rewind. Local input is delayed by N frames. Remote input is predicted from the last known state. When the real remote input arrives (1–2 frames late typically), the client:

1. Saves state at the late frame
2. Restores the saved state
3. Re-applies corrected inputs from that frame forward (resimulation)
4. Resumes normal execution

This gives 60 FPS visible gameplay with correct state. The user only notices rollback as a brief visual "snap" when prediction was wrong — typically 1–2 frames of jitter, far less jarring than constant input lag or teleporting opponents.

## GGPO Reference

This design follows [GGPO](https://github.com/pondwater/GGPO) architecture:

- **Local input delay** (default 4 frames, configurable 0–10)
- **State save ring buffer** (8 slots — saves last 8 frames of state)
- **Prediction** — when remote input is missing, reuse last known input
- **Resimulation** — on late input arrival, rewind to the late frame and resimulate forward
- **Frame advantage** — client that's behind catches up by resimulating multiple frames in one tick

## Dolmexica State Save/Restore

**This is the hardest part of Phase 1.5.** Dolmexica does not natively expose state save/restore. We must add it.

### Option A: Heap snapshot (rejected)

Save: copy entire WASM heap (`Module.HEAPU8`) to a `Uint8Array`.
Restore: copy back.

| Pros | Cons |
|---|---|
| No engine code changes | Heap is ~30MB → 8 save slots = 240MB RAM. Mobile browsers will OOM. |
| Trivial to implement | Restore is ~30MB memcpy = 5–10ms per rollback. Acceptable on desktop, borderline on mobile. |
| Captures all state | Includes transient JS-side state, may cause issues |

**Verdict:** rejected for mobile, viable fallback for desktop-only.

### Option B: Engine-level state save (recommended)

Add C functions to Dolmexica that serialize/deserialize the game state to a byte buffer:

```c
// Returns size of buffer needed, or actual size written if buf is non-null
size_t serializeGameState(char* buf, size_t maxSize);

// Restore from buffer, returns 0 on success
int deserializeGameState(const char* buf, size_t size);

// Advance simulation by N frames with current input state
void stepSimulation(int frames);
```

Implementation requires identifying all mutable game state in Dolmexica:
- Player objects (position, velocity, state, animation frame, hitboxes, health, super meter)
- Stage state (camera position, round timer, round number)
- Particle/effects systems
- Input history (per-frame input log)
- RNG state (must be deterministic across both clients)

Excluded from serialization:
- Asset data (sprites, sounds — read-only, loaded once)
- Display-only state (camera shake offset — recomputed each frame)
- Audio playback state (acceptable to drop on rollback)

**Estimated work:** 2–3 weeks for an engineer familiar with the Dolmexica codebase. State size target: ~200–500KB per save (8 slots = 1.6–4MB RAM — fits mobile).

**Prerequisite:** audit Dolmexica source to enumerate all mutable state. The engine has ~50 .cpp files in `addons/prism/` plus ~50 Dolmexica files. Need a thorough pass.

### Option C: Lite rollback (rejected — dishonest)

"Rewind" only the input buffer, not the actual game state. Apply corrected inputs from the late frame forward, but don't actually restore state. This is **not rollback** — it's input replay with no state correction. Visual glitches would be severe (opponent's animation state wrong, hitboxes wrong, combos drop randomly).

**Verdict:** rejected. If we can't do real rollback, ship input-delay only and call it that.

## Recommended Phase 1.5 Approach

**Start with input-delay lockstep (no rollback), then add rollback if time permits.**

This gives us a fallback: if engine state save/restore turns out to be too hard in Phase 1.5, ship input-delay only and label it honestly. Rollback can then slide to early Phase 2.

### Phase 1.5 staged delivery:

**1.5a — Input-delay lockstep (must ship)**
- Frame-buffered relay (`frame_advance` message)
- 4-frame input-delay buffer on client
- Late remote input → predict from last known, no rollback
- `sync_check` enforcement — on hash mismatch, pause and `resync_request`

**1.5b — Rollback (ship if engine work completes)**
- Dolmexica state save/restore (Option B)
- 8-slot state ring buffer per client
- Resimulation on late input
- Frame advantage catch-up

**1.5c — Polish**
- Adaptive input delay (auto-tune based on jitter)
- Spectator groundwork (state save buffer can be replayed with delay)

## Frame Buffer Design

### Client-side state (per client)

```ts
interface ClientNetcodeState {
  currentFrame: number;          // local frame counter
  inputDelay: number;            // default 4
  localInputBuffer: string[];    // [frame] = input string, indexed by frame
  remoteInputBuffer: Map<number, string>;  // sparse — filled as remote inputs arrive
  stateSaveBuffer: Map<number, StateSlot>; // 1.5b only — frame → state
  pendingResimulation: number | null;      // frame to roll back to, or null
}

interface StateSlot {
  frame: number;
  stateData: Uint8Array;  // from serializeGameState()
  localInput: string;
  remoteInput: string;    // predicted or actual
}
```

### Per-frame loop (60 FPS)

```
1. Capture local input for frame N → localInputBuffer[N] = getCurrentInput()
2. Send localInputBuffer[N - inputDelay] to relay
   (i.e., we send input from 4 frames ago — this gives the relay 4 frames of headroom)
3. Receive frame_advance messages from relay
   - For each frame_advance for frame F:
     - Store remoteInputBuffer[F] = inputs[other_slot]
     - If F < currentFrame (late arrival): trigger rollback
4. If no rollback pending:
   - Advance simulation by 1 frame
   - Save state to stateSaveBuffer[currentFrame] (1.5b only)
   - currentFrame++
5. If rollback pending at frame F:
   - Restore state from stateSaveBuffer[F]
   - For each frame from F to currentFrame:
     - Apply localInputBuffer[frame] + remoteInputBuffer[frame]
     - stepSimulation(1)
   - Save new states for each resimulated frame
   - Clear rollback pending
```

### Late input handling

If a remote input arrives for frame F where `F < currentFrame`:

1. **Detection:** `remoteInputBuffer[F]` was predicted (used last known). New input differs.
2. **Trigger rollback:** set `pendingResimulation = F`
3. **Next tick:** execute rollback branch in the per-frame loop above
4. **Resimulation cost:** ~`(currentFrame - F)` frames of `stepSimulation(1)`. With 4-frame delay, typical rollback is 1–4 frames = 16–66ms of catch-up work, spread across the next 1–4 visible frames.

## Desync Detection

Every 60 frames (~1 second), each client:
1. Calls `serializeGameState()` and hashes the result (SHA-1, ~20 bytes)
2. Sends `sync_check { frame, hash }` to relay
3. Relay forwards to other client
4. Other client compares with its own hash for that frame

On mismatch:
- Both clients pause simulation
- The "behind" client (smaller frame number) sends `resync_request`
- The "ahead" client responds with `resync_state` — full state snapshot, ~200–500KB
- Behind client calls `deserializeGameState()` and resumes

Desync should be rare with proper rollback. If it happens more than once per match, that signals a determinism bug (e.g., uninitialized memory, uninitialized RNG, floating-point mode mismatch).

## Determinism Requirements

For rollback to work, both clients must produce identical state given identical inputs. This requires:

1. **No `Math.random()` or `rand()` in game logic** — use a seeded PRNG (e.g., xorshift32) initialized from a seed both clients agree on at `game_start`
2. **No floating-point operations that differ by platform** — WebAssembly floats are IEEE 754, but `fma()` and trig functions may differ. Audit Dolmexica for these.
3. **No `Date.now()` or `performance.now()` in game logic** — only in UI code
4. **No file-system reads mid-simulation** — all assets loaded before `game_start`
5. **No uninitialized memory reads** — run Dolmexica under Valgrind or ASan to find these

**Determinism audit task (Phase 1.5):** grep Dolmexica source for `rand`, `srand`, `time`, `clock`, `Date`, `Math.random`, `fmod`, `sin`, `cos`, `tan`, `sqrt` calls in non-audio/non-render code paths. Replace with deterministic alternatives or precomputed lookup tables.

## Configuration

| Parameter | Default | Range | Notes |
|---|---|---|---|
| `input_delay` | 4 frames | 0–10 | Higher = more lag tolerance, worse feel. Host can set per-room. |
| `state_buffer_size` | 8 slots | 4–16 | RAM = `slots × state_size`. 8 × 500KB = 4MB. |
| `sync_check_interval` | 60 frames | 30–300 | Every 1 second at 60fps. |
| `resync_timeout` | 5000ms | 1000–30000 | Give up after this; declare match invalid. |
| `max_rollback_frames` | 8 | 4–16 | Match `state_buffer_size`. Beyond this, full resync. |

## Testing Strategy

### Unit tests
- `serializeGameState` / `deserializeGameState` roundtrip — save → restore → save again, both saves must be byte-identical
- Determinism test — given identical inputs for 1000 frames, two clients produce identical state hashes
- Rollback test — apply input A for 10 frames, save state, apply input B for 5 frames, rollback to frame 10, apply input C — result must match a fresh run with inputs A→C

### Integration tests
- Two-browser-tab test — automated with Playwright. Both tabs connect to local relay, run 60 seconds of random inputs, compare final state hashes. Must match.
- Network simulation — use Chrome DevTools "slow 3G" preset (400ms RTT, 1.5Mbps). Verify rollback fires correctly, no permanent desync.
- Mobile test — run on actual Android device via Chrome remote debug. Verify RAM usage stays under 200MB.

### Manual playtest
- Bangladesh-to-Bangladesh test (Phase 1.5 acceptance criterion): two testers in different cities, both on mobile data, play a full round. Rollback should fire ~5–15 times per round, no visible teleporting, no permanent desync.

## Open Questions

1. **Does Dolmexica use floating-point anywhere that would break determinism?** Need source audit. MUGEN's CNS scripting uses floats heavily for physics. WASM floats should be deterministic across browsers (both IEEE 754), but transcendentals (`sin`/`cos` in `libm`) may differ. May need to bundle a deterministic `libm`.

2. **How big is the actual state?** Need to instrument Dolmexica with a sizeof pass on all global/static mutable state. Estimate is 200–500KB; could be more if there's a large particle pool.

3. **Does stepSimulation() need to skip rendering?** During resimulation, we don't want to render intermediate frames (would cause visual jitter). Need a `stepSimulationNoRender()` variant, or a flag the renderer checks.

4. **Audio during rollback?** Sound effects triggered in resimulated frames should NOT replay. Need to mark audio system as "muted during resim" — engine modification.

## References

- [GGPO source code](https://github.com/pondwater/GGPO) — reference implementation
- [Rollback Networking in INJUSTICE 2 (GDC 2017)](https://www.youtube.com/watch?v=K3dykqGDssk) — NRS talk on production rollback
- [GGPO.net](https://github.com/maximilianhagner/GGPO.net) — C# port, good architecture reference
- [Why Rollback Netcode Is The Future (Core-A Gaming)](https://www.youtube.com/watch?v=k9JTIn1AVQY) — player-facing explainer
