# Netcode Sync Research Report

**Last Updated:** 2026-08-04
**Purpose:** Research best approaches for synchronizing two browser-based fighting game clients over a WebSocket relay, given the constraint that the Dolmexica WASM engine has **no** `saveGameState`/`restoreGameState` C exports.

---

## TL;DR — Recommended Path Forward

**Input-delay lockstep + clock sync + desync detection + pause-and-resync.** No rollback (no state save/restore), no WebRTC. This is the highest-value-per-effort combination that stays within your constraints:

1. **Fix clock sync** with Cristian's algorithm over the existing relay (≈1 day, fixes the root cause of both failed lockstep attempts).
2. **Re-attempt frame-locked lockstep** with a relay-mediated `start_signal` and input-delay of 4–6 frames (≈2–3 days). This is what your docs call "Phase 1.5a."
3. **Add desync detection** by extending the engine's *existing* `gatherNetplaySyncCheckData` hook to include positions + state numbers, not just life (≈1 day of C++ + JS).
4. **Add pause-and-resync** on detected mismatch: freeze both sims, exchange authoritative positions via the engine getters, snap-forward (≈2 days). This is the "lite rollback" that actually works without state save.
5. **Keep the WebSocket relay.** WebRTC P2P is not worth the complexity on free-tier-only infra.

This gets you ~90% of rollback's robustness at ~10% of the effort, with zero weeks-long engine surgery.

---

## The Root Cause of Your Desync

Your current "input forwarding" model (`use-online-multiplayer.ts`) has a fatal flaw that no amount of determinism can fix:

> **Both clients run their simulations independently, and remote inputs are injected into *whatever frame the local engine happens to be on* when the packet arrives.** There is no frame-alignment. Player 2's "frame 100 input" may land during Player 1's frame 98 or frame 103 depending on jitter. A deterministic engine fed inputs at different frames produces divergent state. This is not a determinism bug — it's a *synchronization* bug.

This is exactly why frame-locked lockstep exists: it guarantees both clients apply input *N* on frame *N*. Your two failed attempts failed not because lockstep is wrong, but because the **start alignment** and **clock sync** were broken. Both are solvable. Details below.

---

## 1. Clock Synchronization Algorithms

### Cristian's Algorithm (recommended)
The standard for client-server clock sync. The client sends a timestamped ping; the server echoes it back immediately. From the round-trip:

```
RTT = t_reply_received - t_request_sent
clock_offset = t_server_at_reply - (t_request_sent + RTT/2)
```

The assumption is symmetric latency (forward path == backward path). The error bound is ±(RTT/2 − min_one_way). With a 40ms RTT relay, you get ~±10–20ms accuracy.

**How many samples?** Take **8–20 samples**, discard the highest 2–3 (jitter spikes), and **take the minimum RTT sample's offset** (the min RTT is closest to the true one-way delay — any extra RTT is queuing delay on top of the minimum path latency). This is exactly what NTP does internally. Accuracy: **1–10ms** is achievable and more than sufficient for 60fps (16.67ms/frame).

**Can this run over your WebSocket relay?** Yes — you already have `sendPing()`/`pong` in `relay-client.ts`. The relay just needs to timestamp the pong with `Date.now()` on the server side (it runs on Deno Deploy, which has NTP-synced clocks). Right now your pong echoes the client's own `ts`, which only measures RTT, not *offset*. Add a server timestamp to compute offset.

### Berkeley Algorithm
A master polls all slaves, estimates their offsets, then tells each slave how much to adjust. Useful for *N*-party. For 2 clients you don't need it — Cristian's against the relay is simpler and equivalent.

### NTP-style
Full NTP is overkill (it has hierarchical strata, drift filters, etc.). But NTP's *core estimator* — "use the minimum-delay sample, apply exponential moving average to offset" — is what you should steal. Pseudocode:

```
offsets = []
for i in 0..20: offsets.push(cristianPing())   // spread over ~2s
offsets.sortByRTT()
best = offsets[0..4].mean()                      // 5 lowest-RTT samples
clock_offset = ema(clock_offset, best, alpha=0.3)
```

**Recommendation:** Cristian's with min-RTT selection, 10 samples, re-run every 30s to track drift. Accuracy ±2–5ms. Fully compatible with your relay.

---

## 2. Frame-Locked Lockstep Done Right

### How GGPO / Fightcade / StarCraft align frames

The critical insight your two attempts missed: **you cannot start frame 0 "at the same instant" via wall-clock time alone.** Clocks skew, and even a 5ms error means one client starts a frame early. Instead, use a **frame-schedule** model:

#### The Start Protocol (relay-mediated)

1. Both clients finish loading and send `ready` to relay.
2. Relay picks a **future start time** `T_start = now + 2000ms` (enough headroom for both to receive it) and broadcasts `game_start { start_time: T_start }` to both. Your `GameStartMsg` already has `start_time` — you just weren't using it for frame alignment.
3. Each client waits until its *local adjusted clock* reaches `T_start`, then begins frame 0. With Cristian-synced clocks (±5ms), both start within 5ms = within 1 frame of each other. Acceptable.

But here's the **robust** version that doesn't even need perfect clock sync:

#### The Input-Acknowledgment Model (better, no clock needed for alignment)

Don't align on wall-clock. Align on **input availability**:

```
Each frame N:
  1. Capture local input for frame N
  2. Send input[N] to relay (tagged with frame N)
  3. Do NOT advance to frame N+1 until you have received
     the opponent's input for frame N (or N-delay)
```

This is **pure deterministic lockstep**. Both clients naturally converge: neither can run ahead because it's waiting for the other's input. Frame 0 begins the moment both clients' first inputs have been exchanged through the relay. No clock sync needed for *alignment* — you only need clock sync to **decide how long to wait before declaring the opponent disconnected** and to implement input-delay (see §3).

**Why your v1/v2 failed:**
- **v1:** "Frame counters not aligned (started at different times)" → you tried to start independently and sync counters after. The fix is to *gate advancement on input receipt* so counters can't diverge.
- **v2:** "Wall-clock time origin mismatch (performance.now vs Date.now) + clock skew" → you tried to derive frame number from wall clock. The fix is to treat the frame counter as a pure logical counter incremented only when both inputs are available.

#### Input-delay makes it playable

Pure lockstep stalls the sim whenever an input is late. At 100ms RTT, you'd run at ~10fps. **Input delay** solves this: each client waits until it has inputs for frames `[N..N+delay]` before running frame N. With delay=4 and 100ms RTT, inputs comfortably arrive within the 4-frame (66ms) window most of the time; occasional late arrivals cause a brief stall (1 frame) rather than continuous slowness.

#### Recommended lockstep loop

```
state:
  localFrame = 0
  remoteFrame = 0        // highest frame we have remote input for
  delay = 4
  localInputs = {}       // frame -> input
  remoteInputs = {}      // frame -> input

per requestAnimationFrame tick:
  if (localFrame > remoteFrame + delay) and (remoteFrame < localFrame):
      // we're too far ahead, remote input hasn't arrived — stall 1 frame
      return  (don't advance, don't increment)

  // capture + buffer local input
  localInputs[localFrame] = readLocalInput()
  sendToRelay(localFrame, localInputs[localFrame])

  // we can advance if we have remote input for this frame
  if localFrame <= remoteFrame + delay:   // predict within the delay window
      inject(localInputs[localFrame], remoteInputs[localFrame] ?? lastKnownRemote)
      engine.step()
      localFrame++
  else:
      // stall — wait for remote
```

Late remote input (arrives for a frame already executed): with no rollback, you have two choices — (a) **drop it** (opponent's action is lost, causes glitches) or (b) **inject it next frame** (input is applied 1 frame late, minor). Option (b) is what your current code does and is acceptable within the delay window. Outside the window, trigger resync (§7).

---

## 3. Input Delay vs Rollback Tradeoffs

### Typical input delay for fighting games
- **GGPO default:** 4 frames (66ms). Configurable 0–10.
- **Console fighting games (delay-based):** 3–6 frames typically, sometimes adaptive.
- **Rollback with delay:** 2–3 frames base delay + rollback to correct.
- **Sweet spot for 60–150ms RTT:** 4–6 frames. For 150–250ms: 6–8 frames (gets laggy).

At 4 frames delay, local input feels near-instant (offline is 0). The delay is only on *when your input takes effect in the shared sim*, not on visual feedback — but since both players share the same sim, both experience the same delay. 4 frames is the competitive standard.

### How rollback works conceptually
1. Local input is applied **immediately** (feels offline).
2. Remote input is **predicted** (assume opponent keeps doing what they did last frame).
3. Every frame, **save full state**.
4. When the *real* remote input arrives (1–4 frames late), if it differs from prediction:
   - **Restore** the saved state from the late frame.
   - **Re-simulate** frame-by-frame with the corrected input up to the present.
   - The player sees a 1–2 frame "snap" — far less jarring than constant input lag.
5. Frame advantage: if you're behind, you can resimulate multiple frames in one rAF tick to catch up.

### Is there a "lite rollback" without state save/restore?

**No true rollback.** Without `saveGameState`/`restoreGameState`, you cannot rewind and re-simulate — the engine has no way to return to a past frame. Your existing doc (`05-rollback-netcode.md`) correctly rejects "Option C: lite rollback" as dishonest.

**But there IS a practical middle ground** — what I'd call **"snap resync"** (see §7): don't try to undo history; instead, when desync is *detected* (not predicted), pause both clients, exchange authoritative positions, and snap both engines to a corrected state using the engine's **input-injection + position-overwrite** capabilities. This is coarser than rollback (it's a hard reset of positions, not a seamless resimulation) but requires **zero engine state-save work**.

### Recommendation
Ship **input-delay lockstep (no rollback)** as your netcode. This is what your docs call "Phase 1.5a" and what the FGC calls "delay-based netcode." It's what most fighting games used before ~2017 and is perfectly playable at <150ms RTT. Add snap-resync (§7) as the safety net. Do NOT attempt true rollback unless/until you add `saveGameState`/`restoreGameState` to the engine.

---

## 4. WebRTC P2P vs WebSocket Relay

### Latency comparison
| | WebSocket relay | WebRTC P2P (direct) | WebRTC via TURN |
|---|---|---|---|
| Path | client → relay → client | client → client (direct) | client → TURN → client |
| Same-city (20–50ms) | +20–40ms relay hop | lowest possible | worse than relay |
| Cross-region (100–200ms) | +relay processing (~5ms) | direct path | — |
| Protocol | TCP (reliable, ordered) | SCTP over DTLS (reliable or unreliable mode) | TCP-like |
| Head-of-line blocking | yes (TCP) | configurable (unordered/unreliable avoids it) | yes |

**P2P can save ~20–50ms** (the relay hop) for same-city pairs, and avoids the relay as a bottleneck. For two players in the same city, relay RTT ≈ 2×(client→relay) ≈ 40–100ms; P2P direct ≈ 20–50ms. Meaningful but not transformative.

### The free-tier problem
- **STUN** (for NAT traversal): free STUN servers exist (Google's `stun:stun.l.google.com:19302`). Works for ~70–80% of NAT pairs (both behind "easy" NATs).
- **TURN** (relay fallback when P2P fails): **costs money / bandwidth.** Free TURN barely exists. When P2P fails (symmetric NAT, carrier-grade NAT, corporate firewall — common on mobile data, which your docs mention is a target), you fall back to TURN or you have no connection. This is the dealbreaker: **without TURN, ~20–30% of player pairs simply cannot connect P2P.** You'd need the WebSocket relay anyway as a fallback → you now maintain two transport paths.

### Complexity
- WebRTC requires: SDP offer/answer exchange (needs a signaling channel → your relay again), ICE candidate gathering, STUN, DTLS handshake, `RTCDataChannel` setup, plus a TURN fallback path. Easily 500–1000 lines of fiddly async code with many failure modes.
- WebSocket relay: you already have it, deployed, working.

### Recommendation
**Stay on WebSocket relay.** The latency savings from WebRTC (20–50ms) are real but modest, and you can reclaim much of that by (a) choosing a Deno Deploy region close to both players, (b) keeping messages tiny (your input strings are ~10 bytes), and (c) not serializing JSON for hot-path input (see §8 — consider binary frames). The complexity and TURN-cost of WebRTC is not justified on a zero-budget browser game. Revisit only if relay latency is demonstrably the bottleneck *after* fixing sync.

---

## 5. Browser-Specific Timing Issues

### `requestAnimationFrame` vs `setTimeout` vs fixed timestep

- **`requestAnimationFrame` (rAF):** the correct choice. Tied to display refresh (60Hz typically, 120/144Hz on high-end). The browser aims for vsync. **But:** the callback fires at the *display's* cadence, which may be 60, 120, or 144Hz. On a 144Hz display, rAF fires 144×/sec — if you advance one sim-frame per rAF, your 60fps game runs at 144fps and desyncs from a 60Hz opponent.

- **`setTimeout(fn, 16.667)`:** clamped to ~4ms minimum in background tabs, jittery, not vsync-aligned. Worse than rAF for games.

- **Fixed timestep with accumulator (correct approach):**
  ```
  const FRAME_MS = 1000/60;
  let accumulator = 0;
  let last = performance.now();
  function loop(now) {
    accumulator += now - last;
    last = now;
    let steps = 0;
    while (accumulator >= FRAME_MS && steps < MAX_STEPS) {
      simulate();   // exactly one 60fps frame
      accumulator -= FRAME_MS;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0;  // spiral-of-death guard
    render();
    requestAnimationFrame(loop);
  }
  ```
  This decouples simulation rate from display rate. On a 144Hz monitor, rAF fires 144×/sec but `simulate()` only fires when the accumulator crosses 16.67ms → ~60×/sec. **Your current code advances one frame per rAF with no accumulator — this is a desync source on non-60Hz displays.**

### Tab switching / throttling
- **Background tabs:** rAF is paused (or throttled to 1Hz). `setTimeout`/`setInterval` throttled to ≥1000ms. If a player tabs out, their sim freezes — in lockstep, this stalls *both* players (the tabbed-out client stops sending inputs). 
- **Fix:** detect `document.visibilitychange` → when hidden, either (a) keep simulating via `setTimeout` fallback (burns battery, may still be throttled) or (b) pause the match and show a "Player tabbed out" indicator. Option (b) is cleaner for a fighting game.
- **Throttling on battery / thermal:** even foreground, browsers can slow rAF under load. The accumulator handles this (sim runs multiple steps to catch up), but the `MAX_STEPS` guard prevents infinite catch-up. If a client falls behind by >MAX_STEPS frames, it should signal a stall.

### `performance.now()` vs `Date.now()`
- `performance.now()` is monotonic and high-resolution (sub-ms), but its **epoch is page-load** — not comparable across clients. Use it for local frame timing.
- `Date.now()` is wall-clock (comparable across clients via Cristian sync) but low-resolution (1ms) and can jump if the OS clock is adjusted. Use it *only* for the clock-sync handshake, never for frame timing.
- **Your v2 bug:** mixing these. Fix: use `performance.now()` for the loop accumulator, `Date.now()` (offset-corrected) only for the start-signal handshake.

### Recommendation
Switch the pump to a **fixed-timestep accumulator driven by `performance.now()`**, cap catch-up at `MAX_STEPS = 3`, and handle `visibilitychange` by pausing + notifying the opponent. This alone may resolve a class of drift you're seeing.

---

## 6. Determinism Verification

### Is the engine actually deterministic?
Your doc assumes yes (IEEE 754 floats, no `Math.random` in game logic). The research confirms:

- **WebAssembly float ops ARE deterministic across browsers** for +, −, ×, ÷, sqrt, comparisons, and format conversions. The only documented non-determinism is the **bit pattern of NaN payloads** (the sign/mantissa of a NaN is unspecified). For a fighting game this rarely matters unless NaN propagates into physics — worth a quick audit.
- **Transcendentals (`sin`, `cos`, `tan`, `pow`, `fma`) are NOT in the WASM spec.** They come from the compiler's `libm` (musl, used by Emscripten). `musl`'s libm is bit-deterministic across platforms *for the same musl version*, but if you ever rebuild the WASM with a different Emscripten/musl version, results may change. **Both clients load the same `game.wasm` file** (same build), so they share the same musl → transcendentals are consistent as long as the binary is identical. Verify this: hash the `.wasm` on both clients at match start and compare.
- **Audit needed:** grep the engine for `rand`, `srand`, `time(NULL)`, `clock()`, uninitialized reads. Your doc already lists this. The Dolmexica netplay code (`netplay.h`) suggests the engine was *designed* for deterministic netplay (it has sync-frame tracking), which is encouraging.

### Detecting desyncs without full state serialization

**Yes — and your engine already has the hook.** In `fightnetplay.cpp`:

```cpp
struct FightSyncCheckData { int mLife1; int mLife2; };

static Buffer gatherNetplaySyncCheckData(void*) {
    FightSyncCheckData d;
    d.mLife1 = getPlayerLife(getRootPlayer(0));
    d.mLife2 = getPlayerLife(getRootPlayer(1));
    // ... packs into Buffer
}
```

This is a **desync-check fingerprint** that the engine already computes and the netplay layer already compares via `checkNetplaySyncCheckData`. The problem: **life alone is a weak fingerprint** — positions can drift wildly while life stays equal. 

**Recommended extension** (small C++ change, ~1 hour): expand `FightSyncCheckData` to include positions, velocities, and state numbers:

```cpp
struct FightSyncCheckData {
    int   mLife1, mLife2;
    double mX1, mY1, mX2, mY2;      // getPlayerPositionX/Y
    double mVX1, mVY1, mVX2, mVY2;  // getPlayerVelocityX/Y
    int   mState1, mState2;          // getPlayerSpriteGroup (animation state)
    int   mTimeInState1, mTimeInState2;
};
```

All these getters already exist in `playerdefinition.h` (`getPlayerPositionX`, `getPlayerVelocityX`, etc.). Then expose a new `extern "C"` function:

```cpp
extern "C" int getSyncFingerprint(char* outBuf, int maxLen) {
    // pack the struct, return bytes written (or hash it → 8 bytes)
}
```

Call it from JS every 30–60 frames, hash the bytes (SHA-1 or even a CRC32), send the hash via `relay.sendSyncCheck(frame, hash)`. Compare on the other side. This catches position desyncs that life-only checks miss.

**Fingerprint granularity tradeoff:** positions are `double` — tiny float drift (last-bit) would cause false positives. Round positions to the nearest integer pixel (or 0.1) before hashing to tolerate sub-pixel noise. Fighting games operate in integer-ish pixel space anyway.

### Recommendation
Extend `FightSyncCheckData` with positions/velocities/state, expose `getSyncFingerprint()` to JS, and run the check every 30 frames (0.5s). This is the single highest-value engine change — it turns invisible desync into a detectable, actionable event.

---

## 7. Resync Without Rollback

### The problem
Rollback rewinds and re-simulates to seamlessly correct history. Without state save/restore, you can't rewind. But you *can* **snap-forward** to a corrected present.

### Snap-Resync Protocol (recommended)

When a sync-check hash mismatch is detected:

1. **Both clients pause** the simulation (stop advancing frames, freeze rendering of the sim — show a "Re-syncing..." overlay for ~100–200ms).
2. The **host (slot 1) is authoritative.** It reads its current player positions/states via the getters and sends a `resync_state` message containing: `{frame, p1:{x,y,vx,vy,life,state}, p2:{x,y,vx,vy,life,state}}` (~100 bytes).
3. The guest receives it and **overwrites** the engine's player state. This requires a small new `extern "C"` export:
   ```cpp
   extern "C" void setPlayerSyncState(int playerIndex, double x, double y,
                                      double vx, double vy, int life, int state);
   ```
   Implementation (~30 lines of C++): fetch the `DreamPlayer*` via `getRootPlayer(playerIndex)` and set its position/velocity/life/state fields directly. The getters exist; the setters are the mirror image. This is **far less work** than full `serializeGameState` (you're touching ~8 fields per player, not the entire engine heap).
4. Both clients resume from the host's state, reset their frame counters to the host's frame, clear input buffers, and continue.

### Caveats
- **Visual snap:** players will see characters teleport to corrected positions. If desyncs are rare (every 30s+, caught early when drift is <50px), this is a minor annoyance, not a game-breaker.
- **State depth:** setting position/velocity/life/animation-state covers the *visible* desync but not deeper state (hitboxes already in-flight, combo counters, super meter, projectiles). For a more complete resync, extend `setPlayerSyncState` to include power/super meter and clear transient hit-sparks. Projectiles are the hard part — if the engine has a projectile list, you'd want to clear it on resync. Start with the basic fields; add more if playtesting reveals persistent desync after resync.
- **Combo integrity:** a resync mid-combo may drop the combo. Acceptable for a free, browser-based game. If unacceptable, the only fix is real rollback.
- **Authority:** always trust the host. If the host is the one that desynced, both clients adopt the host's (wrong) state — but then they're at least *consistent*, and the next sync-check will pass. Consistency > correctness for "keep playing."

### When to resync vs. when to give up
- Drift caught early (hash mismatch within 30 frames of last good state): snap-resync, resume.
- Drift is huge (positions differ by >500px) or resync fails to produce matching hashes: pause, show "Connection unstable" for 2s, attempt one more resync, then declare the match invalid if still mismatched.

### Recommendation
Implement snap-resync as your safety net. It's the pragmatic alternative to rollback given no state-save. Combined with frequent desync detection (§6), this keeps matches playable even when the lockstep occasionally slips.

---

## 8. Additional Practical Recommendations

### Binary input encoding (bandwidth)
Your current input strings ("UBFac") are JSON-serialized: `{"type":"input","frame":12345,"data":"UBFac"}` ≈ 60+ bytes per message. At 60fps × 2 players = 120 msg/s, that's ~7KB/s — trivial, but JSON parsing adds latency. Consider:
- Encoding input as a **bitmask** (6 buttons + 4 directions = 10 bits → 2 bytes). Message = `frame(4) + mask(2)` = 6 bytes binary via `RTCDataChannel`... but you're on WebSocket, which can send `ArrayBuffer` too: `ws.send(buf.buffer)`.
- Even simpler: keep JSON but shrink — `{"t":"i","f":12345,"d":1023}` ≈ 28 bytes. The relay forwards as-is.
- This is a nice-to-have, not a blocker. Do it last.

### Relay region selection
Deno Deploy runs in multiple regions with automatic anycast. If both players are in the same city, the relay edge they hit is likely co-located → low relay latency. If cross-region, latency is dominated by geography, not the relay. You can't control this on free tier, but you *can* show both players their RTT before the match starts and warn if it's >150ms ("This connection may be laggy").

### Connection-quality adaptive delay
After measuring RTT via Cristian pings, set input delay dynamically:
```
delay = clamp(round(RTT_ms / 16.67) + 1, 2, 8)
```
20ms RTT → delay 2. 100ms → delay 7. This auto-tunes to connection quality. Your `set_input_delay` relay message and `GameStartMsg.input_delay` already support this — you're just not computing it from RTT yet.

### The engine's existing netplay layer
`netplay.h` exposes `getNetplaySyncFrame()` / `getNetplayLastReceivedFrame()` and sync/desync callbacks. This suggests Dolmexica was *built* with deterministic netplay in mind (for the Dreamcast port). You may be able to lean on this more than your docs assume — worth a deeper read of `netplay.cpp` / `netplay_dc.cpp`. However, the Dreamcast netplay uses raw TCP sockets, not WebSocket, so you'll still drive it from JS via the input-injection (`setExternalPlayerInput`) path you already use.

---

## Summary Matrix

| Approach | Complexity | Desync-fix effectiveness | Constraint fit | Done in browser before? |
|---|---|---|---|---|
| **Cristian clock sync** | Low (1 day) | Enabler for lockstep | ✅ free, relay-based | ✅ yes |
| **Input-delay lockstep** (relay-mediated start) | Medium (2–3 days) | **High** — eliminates the root cause | ✅ | ✅ yes (many web games) |
| **True rollback (GGPO-style)** | Very high (weeks of C++) | Highest | ❌ needs state save/restore | ✅ (GGPO.js exists but needs engine support) |
| **"Lite rollback" (input replay)** | Low | ❌ None (cosmetic) | ✅ | — (honest implementations reject it) |
| **Snap-resync (pause + position overwrite)** | Medium (2 days) | Medium — safety net, not prevention | ✅ needs ~1 small C export | ✅ (RTS games, older fighters) |
| **WebRTC P2P** | High (1 week+) | Low–medium (latency only, not sync) | ⚠️ needs TURN (paid) for reliability | ✅ |
| **Fixed-timestep accumulator** | Low (half day) | Medium — fixes 144Hz-display drift | ✅ | ✅ universal |
| **Extended desync fingerprint** | Low (1 day C++ + JS) | Enabler for resync | ✅ engine has the hook | ✅ |

## Recommended Implementation Order

1. **Fixed-timestep accumulator** in the pump (half day) — fixes non-60Hz-display drift. Independent of everything else.
2. **Cristian clock sync** over relay (1 day) — add server timestamp to pong, compute offset, EMA-filter.
3. **Extended sync fingerprint** (1 day) — add positions to `FightSyncCheckData`, expose `getSyncFingerprint()`.
4. **Input-delay lockstep** with relay-mediated `game_start` (2–3 days) — replace the current free-running pump with the input-gated loop from §2.
5. **Snap-resync** (2 days) — add `setPlayerSyncState()` C export, implement pause/exchange/resume protocol.
6. **Adaptive input delay** from RTT (half day) — polish.
7. *(Optional, later)* Binary input encoding, WebRTC — only if measurements show they're needed.

**Total: ~7–9 days of focused work**, no multi-week engine surgery, stays entirely on free-tier WebSocket relay.
