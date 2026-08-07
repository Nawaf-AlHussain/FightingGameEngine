// =============================================================================
// Fighting Game Engine — WebSocket Relay Server (Deno Deploy)
// =============================================================================
// Stateless WebSocket relay that brokers 1v1 online matches.
//
// Two responsibilities:
//   1. Room management — create/join/leave rooms, track ready state
//   2. Input forwarding — relay input strings between the two players each frame
//
// The relay does NOT run the game simulation. Both clients run identical WASM
// engine instances; the relay only synchronizes inputs. This is lockstep
// netcode (input-delay model, no rollback).
//
// Deployed at: https://brave-goat-4580.nawaf-al-hussain.deno.net
//
// Free tier limits (Deno Deploy):
//   - 1M requests/month
//   - 100 GiB egress/month
//   - WebSocket connections count as 1 request each (messages within a
//     connection are free). A 3-min match = 2 connections.
//
// Protocol: see docs/deep-dives/02-deno-relay-protocol.md
// =============================================================================

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Player {
  sessionId: string;
  ws: WebSocket;
  slot: 1 | 2;
  character?: string;
  stage?: string;
  ready: boolean;
  loadingReady: boolean;  // true after assets are downloaded + injected
  lastSeen: number; // timestamp (ms) of last message from this player
}

interface Room {
  code: string;
  players: Map<string, Player>; // keyed by sessionId
  status: "waiting" | "selecting" | "playing" | "finished";
  createdAt: number;
  inputDelay: number; // default 5 frames (83ms — tuned for Bangladesh RTT)
}

// -----------------------------------------------------------------------------
// In-memory storage
//
// Deno Deploy is stateless across isolates, but a single WebSocket connection
// lives on a single isolate for its lifetime. As long as both players connect
// to the same deployment URL, Deno Deploy's sticky routing keeps them on the
// same isolate. (If scale ever becomes an issue, we'd need an external KV
// store — but for a free-tier MVP this is fine.)
// -----------------------------------------------------------------------------

const ROOMS = new Map<string, Room>();
const PLAYER_TO_ROOM = new Map<string, string>(); // sessionId → roomCode

const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — stale rooms auto-cleaned
const STALE_PLAYER_TIMEOUT_MS = 30 * 1000; // 30s without a message = disconnected
const MAX_ROOMS = 1000; // safety valve against abuse

// Rate limiting (per session, per minute)
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  input: { limit: 4800, windowMs: 60_000 }, // 80 msgs/sec for 60s — covers 60fps input
  ping: { limit: 60, windowMs: 60_000 },
  sync_check: { limit: 30, windowMs: 60_000 },  // 30/min (check every 3s = 20/min)
  default: { limit: 120, windowMs: 60_000 },
};

interface RateBucket {
  count: number;
  windowStart: number;
}
const RATE_BUCKETS = new Map<string, Map<string, RateBucket>>(); // sessionId → (msgType → bucket)

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function generateRoomCode(): string {
  // No I/O/0/1 to avoid confusion when sharing codes verbally
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function sendToPlayer(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      console.error("[Relay] Failed to send to player:", e);
    }
  }
}

function broadcastToRoom(room: Room, msg: unknown, excludeSessionId?: string): void {
  for (const [sid, player] of room.players) {
    if (sid !== excludeSessionId) {
      sendToPlayer(player.ws, msg);
    }
  }
}

function checkRateLimit(sessionId: string, msgType: string): boolean {
  const limit = RATE_LIMITS[msgType] || RATE_LIMITS.default;
  if (!RATE_BUCKETS.has(sessionId)) {
    RATE_BUCKETS.set(sessionId, new Map());
  }
  const userBuckets = RATE_BUCKETS.get(sessionId)!;
  const now = Date.now();

  let bucket = userBuckets.get(msgType);
  if (!bucket || now - bucket.windowStart > limit.windowMs) {
    bucket = { count: 0, windowStart: now };
    userBuckets.set(msgType, bucket);
  }
  bucket.count++;
  return bucket.count <= limit.limit;
}

function findRoomBySessionId(sessionId: string): Room | undefined {
  const code = PLAYER_TO_ROOM.get(sessionId);
  return code ? ROOMS.get(code) : undefined;
}

function playerCount(room: Room): number {
  return room.players.size;
}

function bothPlayersIn(room: Room): boolean {
  return playerCount(room) === 2;
}

function bothReady(room: Room): boolean {
  if (!bothPlayersIn(room)) return false;
  for (const p of room.players.values()) {
    if (!p.ready) return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// Room operations
// -----------------------------------------------------------------------------

function createRoom(sessionId: string, ws: WebSocket): Room {
  if (ROOMS.size >= MAX_ROOMS) {
    // Evict the oldest room to make space
    let oldestCode: string | null = null;
    let oldestTime = Infinity;
    for (const [code, room] of ROOMS) {
      if (room.createdAt < oldestTime) {
        oldestTime = room.createdAt;
        oldestCode = code;
      }
    }
    if (oldestCode) {
      const oldRoom = ROOMS.get(oldestCode);
      if (oldRoom) {
        for (const [sid] of oldRoom.players) {
          PLAYER_TO_ROOM.delete(sid);
        }
      }
      ROOMS.delete(oldestCode);
    }
  }

  let code: string;
  do {
    code = generateRoomCode();
  } while (ROOMS.has(code));

  const room: Room = {
    code,
    players: new Map(),
    status: "waiting",
    createdAt: Date.now(),
    inputDelay: 5, // 5 frames = 83ms — good default for Bangladesh (~150ms RTT)
  };

  const player: Player = {
    sessionId,
    ws,
    slot: 1,
    ready: false,
    loadingReady: false,
    lastSeen: Date.now(),
  };

  room.players.set(sessionId, player);
  ROOMS.set(code, room);
  PLAYER_TO_ROOM.set(sessionId, code);

  return room;
}

function joinRoom(
  roomCode: string,
  sessionId: string,
  ws: WebSocket
): { ok: true; room: Room; player: Player } | { ok: false; error: string } {
  const room = ROOMS.get(roomCode.toUpperCase());
  if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
  if (room.players.size >= 2) return { ok: false, error: "ROOM_FULL" };
  if (room.players.has(sessionId)) return { ok: false, error: "ALREADY_IN_ROOM" };

  const player: Player = {
    sessionId,
    ws,
    slot: 2,
    ready: false,
    loadingReady: false,
    lastSeen: Date.now(),
  };

  room.players.set(sessionId, player);
  PLAYER_TO_ROOM.set(sessionId, room.code);
  room.status = "selecting";

  return { ok: true, room, player };
}

function leaveRoom(sessionId: string): void {
  const room = findRoomBySessionId(sessionId);
  if (!room) return;

  room.players.delete(sessionId);
  PLAYER_TO_ROOM.delete(sessionId);

  if (room.players.size === 0) {
    ROOMS.delete(room.code);
  } else {
    room.status = "waiting";
    // Notify remaining player
    broadcastToRoom(room, {
      type: "player_left",
      slot: room.players.values().next().value?.slot === 1 ? 2 : 1,
    });
  }
}

// -----------------------------------------------------------------------------
// Message handlers
// -----------------------------------------------------------------------------

interface IncomingMessage {
  type: string;
  session_id?: string;
  room_code?: string;
  frame?: number;
  data?: string;
  character?: string;
  stage?: string;
  delay?: number;
  ts?: number;
}

function handleMessage(sessionId: string, ws: WebSocket, raw: string): void {
  let msg: IncomingMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendToPlayer(ws, { type: "error", code: "INVALID_JSON", message: "Could not parse JSON" });
    return;
  }

  // Rate limit
  if (!checkRateLimit(sessionId, msg.type)) {
    sendToPlayer(ws, {
      type: "error",
      code: "RATE_LIMITED",
      message: `Rate limit exceeded for ${msg.type}`,
    });
    return;
  }

  // Update lastSeen for the player (any message counts as activity)
  const room = findRoomBySessionId(sessionId);
  if (room) {
    const p = room.players.get(sessionId);
    if (p) p.lastSeen = Date.now();
  }

  switch (msg.type) {
    case "create_room":
      handleCreateRoom(sessionId, ws);
      break;
    case "join_room":
      handleJoinRoom(sessionId, ws, msg.room_code || "");
      break;
    case "input":
      handleInput(sessionId, msg.frame || 0, msg.data || "");
      break;
    case "ready":
      handleReady(sessionId);
      break;
    case "set_character":
      handleSetCharacter(sessionId, msg.character || "");
      break;
    case "set_stage":
      handleSetStage(sessionId, msg.stage || "");
      break;
    case "leave_room":
      leaveRoom(sessionId);
      break;
    case "loading_ready":
      handleLoadingReady(sessionId);
      break;
    case "resync_request": {
      // Host sends authoritative player states — forward to guest as resync_state
      const room = findRoomBySessionId(sessionId);
      if (!room) break;
      const sender = room.players.get(sessionId);
      if (!sender) break;
      broadcastToRoom(room, {
        type: "resync_state",
        p1_x: msg.p1_x, p1_y: msg.p1_y, p1_life: msg.p1_life, p1_state: msg.p1_state, p1_facing: msg.p1_facing,
        p2_x: msg.p2_x, p2_y: msg.p2_y, p2_life: msg.p2_life, p2_state: msg.p2_state, p2_facing: msg.p2_facing,
        from_slot: sender.slot,
      }, sessionId);
      break;
    }
    case "set_input_delay":
      handleSetInputDelay(sessionId, msg.delay || 5);
      break;
    case "ping":
      // Cristian's clock sync: include server timestamp so client can compute
      // clock offset = server_time - (client_send_time + RTT/2)
      sendToPlayer(ws, { type: "pong", ts: msg.ts, server_ts: Date.now() });
      break;
    case "sync_check":
      handleSyncCheck(sessionId, msg.frame || 0, msg.data || "");
      break;
    default:
      sendToPlayer(ws, { type: "error", code: "UNKNOWN_TYPE", message: `Unknown message type: ${msg.type}` });
  }
}

function handleCreateRoom(sessionId: string, ws: WebSocket): void {
  // If already in a room, leave it first
  if (findRoomBySessionId(sessionId)) {
    leaveRoom(sessionId);
  }
  const room = createRoom(sessionId, ws);
  console.log(`[Relay] Room ${room.code} created by ${sessionId.slice(0, 8)}`);
  sendToPlayer(ws, {
    type: "room_created",
    room_code: room.code,
    slot: 1,
    input_delay: room.inputDelay,
  });
}

function handleJoinRoom(sessionId: string, ws: WebSocket, roomCode: string): void {
  if (findRoomBySessionId(sessionId)) {
    leaveRoom(sessionId);
  }
  const result = joinRoom(roomCode, sessionId, ws);
  if (!result.ok) {
    sendToPlayer(ws, { type: "error", code: result.error, message: errorMessage(result.error) });
    return;
  }
  console.log(`[Relay] ${sessionId.slice(0, 8)} joined room ${result.room.code}`);
  // Notify joiner
  sendToPlayer(ws, {
    type: "room_joined",
    room_code: result.room.code,
    slot: result.player.slot,
    input_delay: result.room.inputDelay,
  });
  // Notify existing player
  broadcastToRoom(result.room, {
    type: "player_joined",
    slot: result.player.slot,
    session_id: sessionId,
  }, sessionId);
}

function handleInput(sessionId: string, frame: number, data: string): void {
  const room = findRoomBySessionId(sessionId);
  if (!room || room.status !== "playing") return;
  const sender = room.players.get(sessionId);
  if (!sender) return;

  // Forward input to the other player(s)
  broadcastToRoom(room, {
    type: "remote_input",
    frame,
    data,
    from_slot: sender.slot,
  }, sessionId);
}

function handleReady(sessionId: string): void {
  const room = findRoomBySessionId(sessionId);
  if (!room) return;
  const player = room.players.get(sessionId);
  if (!player) return;

  player.ready = true;

  // Notify the other player that this one is ready
  broadcastToRoom(room, {
    type: "player_ready",
    slot: player.slot,
  }, sessionId);

  if (bothReady(room)) {
    // Reset ready flags for next rematch
    for (const p of room.players.values()) {
      p.ready = false;
      p.loadingReady = false;
    }
    room.status = "playing";
    // Get character selections
    const players = Array.from(room.players.values());
    const p1 = players.find((p) => p.slot === 1);
    const p2 = players.find((p) => p.slot === 2);

    // Synchronized start timestamp — both clients use this to align their
    // frame counters. We add 2 seconds (2000ms) to give both clients time
    // to receive the message and set up their game instances.
    // Frame N = floor((now - start_time) / 16.67ms)
    const startTime = Date.now() + 2000;

    // RNG seed — both clients MUST start with the same random seed, otherwise
    // any engine randomness (AI behavior, hit sparks, palette selection, screen
    // shake) will diverge and cause desyncs. The host (relay) generates the seed.
    const rngSeed = Math.floor(Math.random() * 0xFFFFFFFF);

    // Broadcast game_start to both players
    for (const p of room.players.values()) {
      sendToPlayer(p.ws, {
        type: "game_start",
        p1_char: p1?.character || "Songoku",
        p2_char: p2?.character || "Vegeta",
        stage: p1?.stage || p2?.stage || "uiu_campus_low.def",
        input_delay: room.inputDelay,
        start_time: startTime,
        start_frame: 0,
        rng_seed: rngSeed,
      });
    }
    console.log(`[Relay] Match started in room ${room.code}: ${p1?.character} vs ${p2?.character} (start_time=${startTime}, rng_seed=${rngSeed})`);
  }
}

function handleLoadingReady(sessionId: string): void {
  const room = findRoomBySessionId(sessionId);
  if (!room) return;
  const player = room.players.get(sessionId);
  if (!player) return;

  player.loadingReady = true;
  console.log(`[Relay] ${sessionId.slice(0, 8)} loading ready in room ${room.code}`);

  // Check if both players are loading ready
  let bothLoadingReady = true;
  for (const p of room.players.values()) {
    if (!p.loadingReady) { bothLoadingReady = false; break; }
  }

  if (bothLoadingReady && room.players.size === 2) {
    // Both clients finished loading — broadcast match_can_start
    broadcastToRoom(room, { type: "match_can_start" });
    console.log(`[Relay] Both loading ready in room ${room.code} — match_can_start`);
  }
}

function handleSetCharacter(sessionId: string, character: string): void {
  const room = findRoomBySessionId(sessionId);
  if (!room) return;
  const player = room.players.get(sessionId);
  if (!player) return;
  player.character = character;
  // Notify the other player of the selection
  broadcastToRoom(room, {
    type: "character_selected",
    slot: player.slot,
    character,
  }, sessionId);
}

function handleSetStage(sessionId: string, stage: string): void {
  const room = findRoomBySessionId(sessionId);
  if (!room) return;
  const player = room.players.get(sessionId);
  if (!player) return;
  player.stage = stage;
  // Notify the other player of the selection
  broadcastToRoom(room, {
    type: "stage_selected",
    slot: player.slot,
    stage,
  }, sessionId);
}

function handleSetInputDelay(sessionId: string, delay: number): void {
  const room = findRoomBySessionId(sessionId);
  if (!room) return;
  const player = room.players.get(sessionId);
  if (!player || player.slot !== 1) {
    // Only host (slot 1) can set input delay
    return;
  }
  const clamped = Math.max(0, Math.min(10, Math.floor(delay)));
  room.inputDelay = clamped;
  // Notify both players
  broadcastToRoom(room, {
    type: "input_delay_set",
    delay: clamped,
  });
}

function handleSyncCheck(sessionId: string, frame: number, hash: string): void {
  const room = findRoomBySessionId(sessionId);
  if (!room) return;
  const sender = room.players.get(sessionId);
  if (!sender) return;
  // Forward to the other player — use "data" field (consistent with client)
  broadcastToRoom(room, {
    type: "sync_check",
    frame,
    data: hash,
    from_slot: sender.slot,
  }, sessionId);
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    ROOM_NOT_FOUND: "Room not found. Check the code and try again.",
    ROOM_FULL: "Room is full (2 players already).",
    ALREADY_IN_ROOM: "You are already in a room. Leave it first.",
    NOT_IN_ROOM: "You are not in a room.",
    RATE_LIMITED: "You are sending messages too fast. Slow down.",
    INVALID_INPUT: "Invalid input data.",
    NOT_HOST: "Only the host (slot 1) can do this.",
  };
  return messages[code] || code;
}

// -----------------------------------------------------------------------------
// Connection lifecycle
// -----------------------------------------------------------------------------

function handleDisconnect(sessionId: string): void {
  const room = findRoomBySessionId(sessionId);
  if (!room) return;

  console.log(`[Relay] ${sessionId.slice(0, 8)} disconnected from room ${room.code}`);

  room.players.delete(sessionId);
  PLAYER_TO_ROOM.delete(sessionId);
  RATE_BUCKETS.delete(sessionId);

  if (room.players.size === 0) {
    ROOMS.delete(room.code);
    console.log(`[Relay] Room ${room.code} deleted (empty)`);
  } else {
    room.status = "waiting";
    // Notify remaining player
    broadcastToRoom(room, {
      type: "player_left",
      slot: room.players.values().next().value?.slot === 1 ? 2 : 1,
    });
  }
}

// -----------------------------------------------------------------------------
// Stale room cleanup (runs periodically)
// -----------------------------------------------------------------------------

function cleanupStaleRooms(): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [code, room] of ROOMS) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      for (const [sid] of room.players) {
        PLAYER_TO_ROOM.delete(sid);
      }
      ROOMS.delete(code);
      cleaned++;
    } else {
      // Also check for stale players (no message in 30s during playing)
      if (room.status === "playing") {
        for (const [sid, p] of room.players) {
          if (now - p.lastSeen > STALE_PLAYER_TIMEOUT_MS) {
            // Treat as disconnected
            console.log(`[Relay] ${sid.slice(0, 8)} stale in room ${code}, evicting`);
            room.players.delete(sid);
            PLAYER_TO_ROOM.delete(sid);
            // Notify remaining player
            broadcastToRoom(room, {
              type: "player_left",
              slot: p.slot === 1 ? 1 : 2,
            });
          }
        }
        if (room.players.size === 0) {
          ROOMS.delete(code);
          cleaned++;
        }
      }
    }
  }
  if (cleaned > 0) {
    console.log(`[Relay] Cleaned up ${cleaned} stale rooms`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupStaleRooms, 5 * 60 * 1000);

// -----------------------------------------------------------------------------
// HTTP / WebSocket entry point
// -----------------------------------------------------------------------------

const PORT = Deno.env.get("PORT") || "8080";

Deno.serve({ port: parseInt(PORT) }, (req: Request) => {
  const url = new URL(req.url);

  // Health check
  if (url.pathname === "/" || url.pathname === "/health") {
    return new Response(
      JSON.stringify({
        status: "ok",
        rooms: ROOMS.size,
        uptime: "live",
        version: "1.0.0",
      }),
      {
        headers: { "content-type": "application/json" },
      }
    );
  }

  // CORS preflight for the health check (not needed for WebSocket, but doesn't hurt)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "*",
      },
    });
  }

  // WebSocket upgrade
  if (url.pathname === "/ws") {
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      return new Response("Missing session_id", { status: 400 });
    }

    // Upgrade to WebSocket
    const upgrade = req.headers.get("upgrade") || "";
    if (!upgrade.toLowerCase().includes("websocket")) {
      return new Response("Expected WebSocket upgrade", { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req, {
      idleTimeout: 0, // never timeout — we handle staleness ourselves
    });

    socket.onopen = () => {
      console.log(`[Relay] WebSocket connected: ${sessionId.slice(0, 8)}`);
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        handleMessage(sessionId, socket, event.data as string);
      } catch (e) {
        console.error(`[Relay] Error handling message from ${sessionId.slice(0, 8)}:`, e);
      }
    };

    socket.onclose = () => {
      handleDisconnect(sessionId);
    };

    socket.onerror = (e: Event) => {
      console.error(`[Relay] WebSocket error from ${sessionId.slice(0, 8)}:`, e);
      handleDisconnect(sessionId);
    };

    return response;
  }

  return new Response("Not found", { status: 404 });
});

console.log(`[Relay] Server starting on port ${PORT}`);
