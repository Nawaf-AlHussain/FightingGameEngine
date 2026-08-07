# Deno Relay — WebSocket Protocol

**Last Updated:** 2026-07-17 (revised — added frame-buffered lockstep, rollback messages)

## Overview

The relay is a stateless WebSocket server (Deno Deploy) that brokers 1v1 matches. Two roles:

1. **Room management** — create/join/leave rooms, track player slots and ready state
2. **Input forwarding with frame buffering** — collect inputs per-frame from both slots, emit `frame_advance` only when both slots have inputs for that frame

The relay does NOT run the game simulation. Both clients run identical WASM instances; the relay only synchronizes inputs. Rollback happens client-side (see `docs/deep-dives/05-rollback-netcode.md`).

## Client → Server Messages

### 1. `create_room`
```json
{ "type": "create_room", "session_id": "abc123" }
```
Response: `room_created` with `room_code` and `slot: 1`.

### 2. `join_room`
```json
{ "type": "join_room", "session_id": "abc123", "room_code": "A1B2C3" }
```
Response: `player_joined` broadcast to existing player; `room_joined` (with slot) sent to joiner.

### 3. `input`
```json
{ "type": "input", "room_code": "A1B2C3", "frame": 42, "data": "Ua" }
```
`data` is a MUGEN input string (e.g. `"U"` = up, `"a"` = light punch, `"Fb"` = forward + medium kick, `""` = neutral).

The relay buffers this input in `room.inputBuffer[frame][slot]`. When both slots have an input for `frame`, the relay emits `frame_advance` to both clients with both inputs. **Inputs are not forwarded individually** — this is the change from the original pure-forward design.

Rate limit: 120 msgs/min sustained, 60-msg burst (FIX-7).

### 4. `ready`
```json
{ "type": "ready", "session_id": "abc123", "room_code": "A1B2C3" }
```
Marks this player as ready. When both players are ready, relay broadcasts `game_start` and resets `room.currentFrame = 0`.

### 5. `sync_check`
```json
{ "type": "sync_check", "room_code": "A1B2C3", "frame": 42, "hash": "deadbeef" }
```
Client sends a hash of its game state at frame N. Relay forwards to the other client as `sync_check` (not acknowledged). Each client compares; on mismatch, the affected client initiates a `resync_request`.

Sent every 60 frames (~1 second) during gameplay.

### 6. `resync_request`
```json
{ "type": "resync_request", "room_code": "A1B2C3", "frame": 42 }
```
Client detected a desync. The other client responds with `resync_state` containing a full state snapshot. Rollback machinery on the requesting client then restores from that snapshot.

### 7. `leave_room`
```json
{ "type": "leave_room", "session_id": "abc123", "room_code": "A1B2C3" }
```

### 8. `set_input_delay`
```json
{ "type": "set_input_delay", "room_code": "A1B2C3", "delay": 4 }
```
Host-only. Sets the input-delay buffer size for both clients. Default 4 frames. Higher = more latency tolerance, worse responsiveness. Valid range 0–10.

### 9. `ping`
```json
{ "type": "ping", "ts": 1752748800000 }
```
Response: `pong` with same `ts`.

## Server → Client Messages

### 1. `room_created`
```json
{ "type": "room_created", "room_code": "A1B2C3", "slot": 1 }
```

### 2. `room_joined`
```json
{ "type": "room_joined", "room_code": "A1B2C3", "slot": 2 }
```
Sent only to the joining client.

### 3. `player_joined`
```json
{ "type": "player_joined", "slot": 2, "session_id": "xyz789" }
```
Broadcast to existing players when a new player joins.

### 4. `player_left`
```json
{ "type": "player_left", "slot": 1 }
```

### 5. `frame_advance` (NEW — replaces `remote_input`)
```json
{
  "type": "frame_advance",
  "frame": 42,
  "inputs": {
    "1": "Ua",
    "2": "Db"
  }
}
```
Emitted by the relay when **both** players have submitted inputs for `frame`. Each client now has both inputs and can advance its local simulation by one frame. This is the core lockstep signal.

If a player's input for frame N is missing, the relay waits up to 200ms (configurable per-room) before falling back to `frame_advance` with the missing slot's last known input + a `predicted: true` flag. The receiving client treats this as a predicted frame and may roll back when the real input arrives later.

### 6. `sync_check` (forwarded)
```json
{ "type": "sync_check", "frame": 42, "hash": "deadbeef", "from_slot": 1 }
```

### 7. `resync_state`
```json
{ "type": "resync_state", "frame": 42, "state_base64": "...", "from_slot": 2 }
```
Full state snapshot in response to `resync_request`. Large message (~30MB heap dump), sent only on confirmed desync. Client applies via `restoreGameState()`.

### 8. `game_start`
```json
{ "type": "game_start", "p1_char": "KnightmareSuperman", "p2_char": "Nightwing", "input_delay": 4, "start_frame": 0 }
```
Both clients reset their local frame counter to `start_frame` and begin the input pump.

### 9. `game_abandoned` (NEW — FIX-8)
```json
{ "type": "game_abandoned", "reason": "opponent_left", "final_frame": 312 }
```
Sent when the opponent disconnects mid-game. The remaining client decides whether to keep the simulation running (training mode) or return to lobby. **This replaces the old silent reset-to-waiting behavior.**

### 10. `error`
```json
{ "type": "error", "code": "ROOM_FULL", "message": "Room is full" }
```
Error codes: `ROOM_NOT_FOUND`, `ROOM_FULL`, `ALREADY_IN_ROOM`, `NOT_IN_ROOM`, `RATE_LIMITED`, `INVALID_INPUT`, `NOT_HOST`.

### 11. `pong`
```json
{ "type": "pong", "ts": 1752748800000 }
```

## Lockstep Logic (revised — actual implementation)

```
Frame N:
  1. Client A sends { type: "input", frame: N, data: "Ua" }
  2. Client B sends { type: "input", frame: N, data: "Db" }
  3. Relay buffers: room.inputBuffer[N][1] = "Ua", room.inputBuffer[N][2] = "Db"
  4. Both slots filled for frame N → relay emits frame_advance to both clients
  5. Both clients advance simulation by 1 frame using both inputs
  6. Relay deletes inputBuffer[N] to free memory
```

### Late input handling (rollback trigger)

```
Frame N, 200ms timeout:
  - Only slot 1's input has arrived
  - Relay emits frame_advance with predicted: true, inputs: { "1": "Ua", "2": <last known> }
  - Client A advances with predicted input
  - Later, slot 2's real input arrives at the relay for frame N
  - Relay emits input_correction: { frame: N, slot: 2, data: "Db" }
  - Client A rolls back to frame N, restores state, resimulates with corrected input
```

### Reconnect behavior (FIX-5)

When a client's WebSocket drops and reconnects:
1. Client opens new WebSocket with `?session_id=<old_sid>`
2. Relay recognizes session_id, re-attaches to existing room
3. Client re-sends `join_room` with old room_code (RelayClient does this automatically on `onopen`)
4. Relay responds with `room_joined` and the current `frame` so the client can resync

## WASM Input Bridge API

The C function exposed to JavaScript:
```c
void setExternalPlayerInput(int playerIndex, const char* inputString);
```

Called via Emscripten:
```js
Module._setExternalPlayerInput(1, "Db");  // 0-indexed: 0 = P1, 1 = P2
```

**Important (FIX-1):** the relay protocol uses 1-indexed slots (`slot: 1` or `slot: 2`), but the WASM API is 0-indexed (`playerIndex: 0` or `playerIndex: 1`). Translation happens at the JS boundary in `connectRelayToGame`:

```ts
injectFn(remoteMsg.from_slot - 1, remoteMsg.data);  // 1-indexed → 0-indexed
```

For rollback, two additional functions are required (Phase 1.5):
```c
int saveGameState(int slot);     // slot 0-7, returns 0 on success
int restoreGameState(int slot);  // restores from saved slot
```

See `docs/deep-dives/05-rollback-netcode.md` for the full rollback architecture.

## Rate Limiting

Per-session WebSocket message rate limits (FIX-7):

| Message type | Limit | Notes |
|---|---|---|
| `input` | 120/min sustained, 60 burst | 60fps = 3600/min, but we batch via frame_advance so actual rate is much lower |
| `ping` | 30/min | |
| `sync_check` | 2/min | Every 60 frames at 60fps |
| All others | 60/min | Room management, ready, etc. |

On violation: relay sends `error` with `code: "RATE_LIMITED"` and closes the socket.
