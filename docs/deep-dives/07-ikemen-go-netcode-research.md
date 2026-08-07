# Ikemen GO Online Multiplayer Netcode — Research Report

> Source analyzed: `ikemen-engine/Ikemen-GO` (branch `develop`) — `src/netplay.go`, `src/rollback.go`, `src/state.go`, `src/state_clone.go`, `src/input.go`, `src/system.go`, `src/config.go`, `src/resources/defaultConfig.ini`, plus the `ikemen-engine/ggpo` library. Cross-referenced with the SuperCombo.gg "From Rollback with Love" interview with the rollback author (Fantasma) and GitHub issue/discussion threads.

---

## TL;DR

Ikemen GO ships **two netcode stacks side by side**, selectable per-session:

| Aspect | Delay-based netplay (`netplay.go`) | Rollback netplay (`rollback.go`) |
|---|---|---|
| **Model** | Input-delay **lockstep** (stall-and-wait) | **GGPO-style rollback** (predict + re-simulate) |
| **Transport** | **TCP** (`net.TCPConn`), port 7500 | **UDP** (GGPO `UdpProtocol`), ports 7550/7600 |
| **Default?** | No — `RollbackNetcode = 1` in `defaultConfig.ini` | **Yes, default** |
| **Input delay** | Adaptive pacing accumulator (`nc.delay`); effective delay ≈ RTT | **Fixed** `FrameDelay` (default **2 frames**), host-synced, not adaptive |
| **Missing remote input** | **Stall** (loop + `sys.await`) — no prediction | **Predict** last-known, then **rollback** on mismatch |
| **Desync detection** | None at runtime (relies on lockstep + shared seed) | Per-frame **CRC32 "LiveChecksum"** of key state → GGPO compares → `EventCodeDesync` |
| **On desync** | N/A (can't desync if it stalls) | **End match** + save replay + show "desync" warning. **No resync.** |
| **Disconnect timeout** | ~60 stalled frames → `NS_End` (~1 s) | `DisconnectTimeout = 3000 ms`, notify at `1000 ms` |

Both paths share the **same pre-match synchronization handshake** (config fingerprint, shared RNG seed, shared `preMatchTime`, frame-0 barrier) and the **same replay file format**.

---

## 1. How does Ikemen GO handle online synchronization?

### Pre-match handshake (shared by both stacks) — `NetConnection.Synchronize()` (`netplay.go:555`)

```
1. synchronizeNetplayConfig(nc)        // exchange config fingerprint (see §4)
2. seed exchange:                      // host = authority
     host:  seed = Random(); writeI32(seed)
     guest: seed = readI32()
     both:  Srand(seed)                // determinism: AI inputs use this seed
3. preMatchTime exchange (host -> guest)
4. frame-0 barrier:
     writeI32(nc.time); tmp = readI32()
     if tmp != nc.time -> "Synchronization error"
5. buf[locIn].reset(nc.time); buf[remIn].reset(nc.time)   // curT=inpT=senT=time
6. st = NS_Playing
7. spawn send goroutine (local -> remote) and recv goroutine (remote -> local)
8. nc.update(...)   // enter the per-frame loop
```

Key point: the **RNG seed is synced from the host** (`Srand(seed)`). This is essential because Ikemen computes **AI inputs locally** (they call `Random()`), so both peers must start with the identical seed or AI behavior diverges immediately (`input.go:2674` "Since AI inputs use random numbers, we handle them locally to avoid desync").

### Loading barrier — `NetConnection.LoadingReady()` (`netplay.go:757`)

Before gameplay, a separate 3-way byte handshake (`netLoadingReadyToken = 0xC7`, `netLoadingAckToken = 0x7C`) ensures **both clients finished loading assets**. Host sends ready → guest echoes ready → host sends ACK → both call `finishLoadingBarrier()` (resets `nc.time = 0`). This prevents one peer from starting frame 0 while the other is still loading characters/stage.

### Rollback-specific sync — `preMatchSetup()` (`rollback.go:89`)

When rollback is active, `runMatch()` calls `s.rollback.hijackRunMatch(s)` (`system.go:3907`), which:
- Calls `InitP1`/`InitP2` to create the GGPO `Peer` (UDP).
- Sets `sys.matchTime = rs.session.netTime` (carries the synced time forward).
- GGPO then runs its own peer-sync protocol, surfaced as events: `EventCodeSynchronizingWithPeer` (progress %) → `EventCodeSynchronizedWithPeer` → `EventCodeRunning` (`rollback.go:732`).

---

## 2. What netcode model does Ikemen GO use?

**Hybrid — both are implemented and both are first-class.**

### (a) Delay-based lockstep — `NetConnection` + `NetBuffer` (`netplay.go`)

- A ring buffer of **`NETBUF_NUM_FRAMES = 32`** frames per player holds `InputBits` (int16: 14 buttons) + 6 analog axes (`NetBuffer`, `netplay.go:127`).
- Three frame counters per buffer: `curT` (frame being consumed), `inpT` (frames written), `senT` (frames sent over the wire).
- The main loop (`NetConnection.update`, `netplay.go:847`) advances `nc.time` only when **both** local and remote have "sent" up to `nc.time`:
  ```go
  foo := Min(nc.buf[nc.locIn].senT, nc.buf[nc.remIn].senT)
  ...
  if nc.time >= foo {
      if sys.esc || !sys.await(sys.gameRenderSpeed()) || nc.st != NS_Playing { break }
      continue                  // <-- STALL: wait for remote
  }
  nc.buf[nc.locIn].curT = nc.time
  nc.buf[nc.remIn].curT = nc.time
  ...
  nc.time++
  ```
  This is textbook **lockstep**: the sim will not advance frame N until the remote's input for frame N has arrived. `sys.await()` sleeps to the next 1/60 deadline while waiting.

### (b) GGPO rollback — `RollbackSystem` + `RollbackSession` (`rollback.go`)

- Built on `github.com/ikemen-engine/ggpo` (a Go port of Tony Cannon's GGPO). Uses `ggpo.NewPeer` (UDP) with `ggpo.NewLocalPlayer` / `ggpo.NewRemotePlayer`.
- The loop (`hijackRunMatch`, `rollback.go:35`):
  ```go
  rs.session.backend.Idle(...)          // pump GGPO network/prediction
  rs.runFrame(s)                        // AddLocalInput -> SyncInput(speculative) -> simulateFrame
  s.renderFrame()
  s.update()
  rs.session.next = now + 1000/60       // 60 fps pacing
  ```
- `runFrame` (`rollback.go:156`): collects local input → `AddLocalInput` → `SyncInput` returns **speculative inputs for ALL players** (local + predicted remote) → `simulateFrame` runs one tick → `AdvanceFrame(LiveChecksum)` reports the state checksum.
- On remote-input mismatch, GGPO invokes the `AdvanceFrame(flags)` callback (`rollback.go:691`) which sets `inRollback = true`, fetches **confirmed** inputs via `SyncInput`, re-runs `simulateFrame`, and re-reports the checksum. `MaxSaveStates = 8` (`state.go:12`) bounds the rollback window.

---

## 3. How does it handle local vs. remote input timing?

### Delay-based — **symmetric lockstep, no early local application**
Both `curT` advance together to `nc.time`. The local player's input is **buffered ahead** (`writeNetBuffer` bumps `inpT`) but the **game does not consume it for frame N until the remote's frame-N input has also arrived**. So local input is effectively delayed by ~½RTT (the stall). There is no "0-delay local" optimization — the asymmetry is avoided by making **both** sides wait.

An **adaptive pacing accumulator** smooths drift (`netplay.go:867`):
```go
tmp := nc.buf[nc.remIn].inpT + nc.delay>>3 - nc.buf[nc.locIn].inpT
if tmp >= 0   { nc.buf[nc.locIn].writeNetBuffer(0); if nc.delay > 0 { nc.delay-- } }  // local behind: catch up
else if tmp < -1 { nc.delay += 4 }                                                    // local ahead: add wait
```
`nc.delay` is a speed-control accumulator (divided by 8 when compared), not a per-frame input-delay knob. It nudges who leads/follows so neither peer's buffer runs dry or overflows the 32-frame ring.

### Rollback — **local input is delayed by `FrameDelay`; remote is predicted**
```go
peer.SetFrameDelay(handle, rs.config.FrameDelay)   // rollback.go:912 / 961
```
- Local input is held `FrameDelay` frames (default **2**) before being committed — this gives remote inputs time to arrive and **reduces how often rollback triggers**.
- Remote input: GGPO feeds the **last known** remote input through `SyncInput` (speculative). When the true input arrives and differs, GGPO rolls back to the last confirmed save state and re-simulates. So local feels near-instant (only `FrameDelay`), remote is masked by prediction.

---

## 4. How does it handle desyncs?

### (a) Pre-match prevention — config & content fingerprint (`netplay.go:1590`)

`synchronizeNetplayConfig` exchanges a JSON `SyncHandshake` containing:
- **`strict` settings** — both peers MUST match exactly (e.g. `Netplay.RollbackNetcode`, gameplay-affecting options). Tagged `sync:"strict"` in `config.go`.
- **`host` settings** — host is authoritative; guest **applies** them via `applySyncSettings` (e.g. `FrameDelay`, `DisconnectTimeout`, `ButtonAssist`, `SOCDResolution`). Tagged `sync:"host"`.
- **`ContentFingerprint`** — a build/content hash; mismatch → `"Content/build mismatch between peers"`.

`validateStrictCompatibility` (`netplay.go:1431`) even normalizes fight aspect ratios (so 1280×720 vs 1920×1080 are treated equal, but a genuinely different aspect is rejected).

### (b) Runtime detection — **only in rollback**, via `LiveChecksum()` (`rollback.go:796`)

A **deliberately lightweight CRC32** over a curated subset of state, computed every frame and handed to GGPO, which compares it against the remote's:
```go
func (rs *RollbackSession) LiveChecksum() uint32 {
    buf := writeI32(sys.randseed)
    buf = append(buf, writeI32(sys.matchTime)...)
    buf = append(buf, writeI32(sys.curRoundTime)...)
    // scorePoints, comboCount (per side)
    if roundState() == 1 {                  // round-start: stage name hash + char name hashes
        stageHash := crc32([]byte(sys.stage.name))
        for c := range chars { nameHash := crc32([]byte(c.name)) }   // NOTE: palette excluded
    }
    if roundState() == 2 || 3 {             // during fight: per-char life/redLife/dizzy/guard/power/animNo
        // positions deliberately EXCLUDED — "float operation errors"
    }
    return crc32.ChecksumIEEE(buf)
}
```
Notable engineering choices:
- **Floats excluded** where they cause cross-peer drift (`c.pos[]` commented out; `scorePoints` is hashed via `math.Float32bits` to make it bit-exact).
- **Palette excluded** ("makes palette modules desync").
- Per-save-state `Checksum()` (`state.go:436`, FNV-32a over a debug string) is **only computed in `DesyncTest` mode**; in production `SaveGameState` returns `ggpo.DefaultChecksum` to save CPU (`rollback.go:656`). The `LiveChecksum` is the real detector.

### (c) What happens on desync — `OnEvent` → `EventCodeDesync` (`rollback.go:759`)
```go
case ggpo.EventCodeDesync:
    if r.config.LogsEnabled { r.log.saveStateLogs() }
    log.Printf("Rollback desync detected")
    sys.esc = true              // -> ends the match
    r.SaveReplay()
    sys.sessionWarning = sys.motif.WarningInfo.Text.Text["desync"]
```
**There is NO mid-match resync.** A desync terminates the match and shows a warning. (Discussion #3655 asks for a more detailed desync screen, confirming this is the current behavior.)

### (d) Offline determinism testing — `DesyncTest` / `InitSyncTest` (`rollback.go:966`)
A `ggpo.NewSyncTest` backend runs **two local players** through GGPO and compares checksums every `DesyncTestFrames`. This is how the developers catch non-deterministic engine behavior (the interview confirms it was instrumental in finding the Lua-state desync bug).

---

## 5. How does it synchronize the "start signal" / frame 0?

- **Shared RNG seed**: host does `seed = Random()` → `writeI32(seed)`; guest reads; both `Srand(seed)`. Ensures AI/randomness are identical.
- **Shared `preMatchTime`**: host sends its `sys.preMatchTime` (local UI frame counter at match start) so both agree on when "round 1" began.
- **Frame-0 barrier**: each side writes its `nc.time` and reads the peer's; equality is enforced (`"Synchronization error"` otherwise). After reset, `nc.time == 0` on both.
- **Loading barrier**: the `0xC7`/`0x7C` token exchange guarantees neither begins ticking until both have finished loading assets (so frame 0 doesn't start while one peer is still reading character files).
- **Rollback path**: GGPO's own `SynchronizingWithPeer` → `SynchronizedWithPeer` events provide the equivalent start barrier; `sys.matchTime = rs.session.netTime` carries the agreed time into the sim.

There is **no clock-sync / NTP / RTT-based time alignment** — they don't try to align wall clocks. They only align **frame counters** by agreeing everyone starts at 0 and ticks at 60 Hz, with GGPO's `EventCodeTimeSync` correcting drift at runtime (see §8).

---

## 6. What input delay does it use? Configurable? Adaptive?

| Path | Delay | Configurable | Adaptive |
|---|---|---|---|
| Rollback | `Rollback.FrameDelay` = **2** frames (`defaultConfig.ini:365`) | Yes — INI + host-synced (`sync:"host"`) | **No** — fixed per session |
| Delay-based | Effective ≈ ½RTT (stall), with an internal `nc.delay` pacing accumulator | No user knob | **Yes** — `nc.delay += 4` / `nc.delay--` reacts to local/remote buffer skew (`netplay.go:867`) |

So: rollback uses a **fixed, host-authoritative** input delay (default 2). The delay-based path is **adaptive** but adapts *frame pacing*, not a user-visible input-delay setting.

---

## 7. How does it handle prediction when remote input hasn't arrived?

- **Delay-based: STALL.** No prediction. The `update()` loop spins on `sys.await()` until `Min(locIn.senT, remIn.senT) > nc.time`. If the remote is slow, the sim freezes (the infamous "PowerPoint presentation" the SuperCombo article describes).
- **Rollback: PREDICT then ROLLBACK.** GGPO's `SyncInput` returns the **last-known remote input** as the speculative value; the frame runs immediately. When the real input arrives and differs, GGPO loads the last confirmed `GameState` save (`LoadGameState`, `rollback.go:662`) and re-simulates forward (`AdvanceFrame`, `rollback.go:691`). Save states are pooled in a `MaxSaveStates + 2 = 10` slot ring (`SaveGameState`, `rollback.go:625`) backed by Go `arena` allocations for the heavy per-character/projectile/explod data.

---

## 8. How does it handle connection issues?

**Rollback (GGPO over UDP):**
- `DisconnectNotifyStart = 1000 ms` — warn the player the peer is stalling.
- `DisconnectTimeout = 3000 ms` — terminate the match (`peer.SetDisconnectTimeout`, `rollback.go:910`).
- **Packet loss / jitter**: GGPO's UDP protocol handles this internally — it keeps sending input acks, predicts through gaps (`EventCodeConnectionInterrupted` → `EventCodeConnectionResumed`), and only fires `EventCodeDisconnectedFromPeer` after the timeout. On disconnect: save replay, `sys.endMatch = true`, show disconnect warning — unless already in post-match (`rollback.go:743`).
- **Clock drift / pacing**: `EventCodeTimeSync(framesAhead)` → `LoopTimer.OnGGPOTimeSyncEvent` (`rollback.go:589`) spreads the catch-up wait over **100 frames** (`NewLoopTimer(60, 100)`) to avoid jarring hitches; during round intros it waits harder to allow asset loading.

**Delay-based (TCP):**
- TCP gives ordered, reliable delivery, so there's no packet-loss logic — but a stalled peer freezes the sim.
- `NS_Stopped` (remote sent the `-1` termination or EOF) increments `stoppedcnt`; after **60 frames** it escalates to `NS_End` (~1 s grace) (`netplay.go:854`).
- Send/recv goroutines set `nc.st = NS_Error` on any I/O failure, which the main loop turns into `sys.esc` (end).

---

## 9. What transport does it use?

- **Delay-based: TCP.** `net.Listen("tcp", …)` / `net.Dial("tcp", …)` (`netplay.go:304, 380`). Default `ListenPort = 7500`. 8-byte `"IKEMENGO"` magic handshake (host writes, guest echoes). Per-frame payload = 1×int16 (digital) + 6×int8 (analog) = **8 bytes/player/frame**, sent from a goroutine that sleeps 1 ms between polls (`netplay.go:659`).
- **Rollback: UDP.** GGPO's `UdpProtocol` (`ikemen-engine/ggpo` `internal/protocol`, `peer.go` references `NewUdp`, `UdpConnectStatus`, `UDPMsgMaxPlayers`). P1 listens on **7600**, P2 on **7550** (crossed `InitP1(2, 7600, 7550, …)` / `InitP2(2, 7550, 7600, …)`). Input size = 8 bytes/player; GGPO input queue = 20 (`NewLocalPlayer(20, …)`).

No WebSocket, no QUIC. (For a browser game this maps naturally to **WebRTC DataChannels**, ideally `unordered + unreliable` to mimic UDP — see §10.)

---

## 10. Key insights & recommendations for a browser-based fighting game

### Architecture lessons to adopt
1. **Default to rollback, keep delay-based as a fallback.** Ikemen made rollback the default (`RollbackNetcode = 1`) for good reason: delay-based lockstep is unplayable cross-continent. Provide a toggle so users on terrible connections can fall back.
2. **Use an established rollback library, don't roll your own.** Ikemen uses a Go port of GGPO. For the browser, use a mature GGPO-style JS/TS implementation (e.g. a port of `ggpo` semantics) or port the algorithm. The protocol (input acks, prediction, rollback window, time-sync events) is subtle.
3. **Transport = unreliable UDP-equivalent.** In the browser that means **WebRTC DataChannel with `ordered: false, maxRetransmits: 0`** for inputs. Keep a reliable ordered channel for the handshake/config/seed exchange (Ikemen effectively does this: TCP-ish handshake, then UDP for inputs).

### Synchronization lessons
4. **Sync the RNG seed from one peer (host).** Any locally-computed randomness (AI, hit-spark variation, screen shake) will desync otherwise. `Srand(seed)` from the host is non-negotiable.
5. **Pre-match config + content fingerprint handshake.** Exchange a strict-must-match set and a host-authoritative set, plus a content/build hash. Reject mismatches before frame 0 — far cheaper than discovering them mid-match.
6. **Frame-0 barrier + loading barrier.** Don't start ticking until both peers explicitly confirm "loaded & ready" (Ikemen's `0xC7`/`0x7C` exchange). One peer starting while the other loads = instant desync.
7. **No wall-clock sync needed.** Only frame counters must agree (start at 0, tick at 60 Hz). Correct drift at runtime with a time-sync event that *spreads* catch-up over many frames (Ikemen uses 100) rather than hitching.

### Input timing lessons
8. **Fixed, host-authoritative input delay (default ~2 frames).** It's predictable, fair, and cuts rollback frequency. Make it configurable and let the host own the value (`sync:"host"`) so both peers use the same number.
9. **Predict remote with last-known input; rollback on mismatch.** This is the whole point — local feels instant, remote is masked. Bound the rollback window (Ikemen: 8 frames) and pool save states aggressively.

### Desync lessons
10. **Per-frame lightweight CRC32 checksum of curated state.** Don't hash everything — pick stable, meaningful values (RNG seed, timers, per-entity life/power/anim, scores). **Exclude floats that drift across implementations** (positions) or hash them via `Float32bits` for bit-exactness. **Exclude cosmetic things that vary by module** (Ikemen excludes palettes).
11. **Skip the heavy save-state checksum in production.** Ikemen returns `ggpo.DefaultChecksum` from `SaveGameState` in production and relies on the cheap `LiveChecksum` per frame. Only the offline `SyncTest` mode computes full checksums to hunt determinism bugs. Do the same: a debug-only "sync test" that runs two local sims and diffs every frame is invaluable.
12. **Design for determinism from day one — this is THE hard problem.** Ikemen's interview is explicit: the engine "was NOT designed for [rollback] AT ALL," and the hardest bugs were (a) **scripting-language state not being rolled back** (they had to fork `gopher-lua` and roll back script Userdata), and (b) **unbounded game state** with "no limitations" on characters, which forced them to use experimental Go `arena` allocations because pooling/preallocation couldn't bound "a few supers in a row." For a browser game: keep your sim in pure deterministic JS/TS (or WASM), avoid non-deterministic APIs inside the sim, snapshot ALL script/VM state, and bound entity counts.

### Resilience lessons
13. **Desync = end match, no resync.** Mid-match resync of a fighting game is essentially impossible (you'd have to reconcile divergent histories). Accept it: save a replay, show a clear message, terminate. (Ikemen users are actively asking for a *more informative* desync screen — discussion #3655 — so make yours diagnostic: log which subsystem's checksum diverged.)
14. **Generous-but-firm disconnect timeouts.** 1 s notify / 3 s kill is a sane default. Predict through short outages; only end the match when the timeout truly expires.
15. **Separate `ReadInputs` / `Simulate` / `Render` functions.** The interview stresses this was the prerequisite for retrofitting rollback into a "rat's nest" loop. If your game loop mixes these, refactor now — rollback needs to call `Simulate` multiple times per visible frame without re-reading inputs or re-rendering.

### Performance lessons
16. **Pool/arena your save states.** Rolling back means frequent alloc/free of large state snapshots. Ikemen uses Go's experimental `arena` + a `GameStatePool` to keep this off the GC. In JS, use typed arrays + a ring of preallocated state buffers and `copy`/`set` rather than object allocation. Avoid `structuredClone` in the hot path.
17. **Input encoding = tiny and fixed-size.** 8 bytes/player/frame (2 digital + 6 analog). Keep your wire format minimal and constant-size so UDP packets stay well under MTU and parsing is allocation-free.

---

## Appendix — key file/line references (branch `develop`)

| Concept | File | Lines |
|---|---|---|
| `NetBuffer` ring (32 frames, `curT/inpT/senT`) | `src/netplay.go` | 127–167 |
| `NetConnection` (TCP, host/guest, delay) | `src/netplay.go` | 174–211 |
| TCP accept/connect + `"IKEMENGO"` handshake | `src/netplay.go` | 303–423 |
| `Synchronize()` (seed, preMatchTime, frame-0 barrier, spawn send/recv) | `src/netplay.go` | 555–721 |
| `LoadingReady()` loading barrier (`0xC7`/`0x7C`) | `src/netplay.go` | 757–839 |
| `update()` lockstep + adaptive `nc.delay` | `src/netplay.go` | 847–924 |
| Config sync + fingerprint validation | `src/netplay.go` | 1237–1505, 1590–1694 |
| `RollbackProperties` (FrameDelay, timeouts, DesyncTest) | `src/rollback.go` | 23–32 |
| `hijackRunMatch` main rollback loop | `src/rollback.go` | 35–87 |
| `runFrame` (AddLocalInput → SyncInput → simulate) | `src/rollback.go` | 156–221 |
| `SaveGameState` / `LoadGameState` (ring of 8+2) | `src/rollback.go` | 625–687 |
| `AdvanceFrame` (re-simulate on rollback) | `src/rollback.go` | 691–730 |
| `OnEvent` (Connected/Disconnected/TimeSync/**Desync**) | `src/rollback.go` | 732–773 |
| `LiveChecksum()` (curated CRC32 desync fingerprint) | `src/rollback.go` | 796–851 |
| `InitP1`/`InitP2` (UDP 7600/7550, `SetFrameDelay`) | `src/rollback.go` | 868–964 |
| `InitSyncTest` (offline determinism test) | `src/rollback.go` | 966–1011 |
| `LoopTimer.OnGGPOTimeSyncEvent` (jitter spread, 100 frames) | `src/rollback.go` | 589–613 |
| `MaxSaveStates = 8`; `GameState` struct | `src/state.go` | 12–69 |
| `GameState.Checksum()` (FNV-32a, debug only) | `src/state.go` | 436–448 |
| `InputBits` int16 (14 buttons) + `KeysToBits`/`BitsToKeys` | `src/input.go` | 356–410 |
| `CommandList.InputUpdate` — single input dispatch (AI/replay/net/rollback/local) | `src/input.go` | 2661–2714 |
| `runMatch` → `synchronize()` → `hijackRunMatch` | `src/system.go` | 1114–1121, 3823–3909 |
| `await()` frame pacing (rollback uses loopTimer) | `src/system.go` | 843–900 |
| Config struct (`Netplay.RollbackNetcode` strict, `Rollback` props) | `src/config.go` | 202–207 |
| Defaults (`RollbackNetcode=1`, `FrameDelay=2`, timeouts 1000/3000, port 7500) | `src/resources/defaultConfig.ini` | 361–377 |
| GGPO transport = UDP (`NewUdp`, `UdpProtocol`, `UdpConnectStatus`) | `ikemen-engine/ggpo` `peer.go`, `internal/protocol` | — |

### Secondary sources
- SuperCombo.gg, "From Rollback with Love – IKEMEN Go" (Feb 2023) — interview with Fantasma (rollback author): GGPO-in-Go origin, Lua-state desync saga, Go `arena` usage, "copy entire game state first, ask questions later."
- GitHub discussion #1135 "Rollback" — implementation/integration thread.
- GitHub discussion #3655 "More detailed rollback desync screen" — confirms desync terminates the match; users want diagnostics.
- Issue #3457 "Rollback replay is not working" — replay/rollback timeline reconciliation is still actively being fixed.
