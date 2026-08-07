/**
 * Room Manager — WebSocket relay room logic
 *
 * Manages rooms, players, and lockstep input forwarding.
 * Each room holds up to 2 players. Inputs are forwarded
 * frame-by-frame for lockstep synchronization.
 */

export interface Player {
  sessionId: string;
  ws: WebSocket;
  slot: number; // 1 or 2
  character?: string;
  ready: boolean;
}

export interface Room {
  code: string;
  players: Map<string, Player>; // keyed by sessionId
  status: "waiting" | "selecting" | "playing" | "finished";
  p1Char?: string;
  p2Char?: string;
  currentFrame: number;
  createdAt: number;
}

const ROOMS = new Map<string, Room>();
const PLAYER_TO_ROOM = new Map<string, string>(); // sessionId → roomCode
const INPUT_BUFFER_TTL = 5000; // 5 seconds

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(sessionId: string, ws: WebSocket): Room {
  let code: string;
  do {
    code = generateRoomCode();
  } while (ROOMS.has(code));

  const room: Room = {
    code,
    players: new Map(),
    status: "waiting",
    currentFrame: 0,
    createdAt: Date.now(),
  };

  const player: Player = {
    sessionId,
    ws,
    slot: 1,
    ready: false,
  };

  room.players.set(sessionId, player);
  ROOMS.set(code, room);
  PLAYER_TO_ROOM.set(sessionId, code);

  return room;
}

export function addPlayerToRoom(
  roomCode: string,
  sessionId: string,
  ws: WebSocket
): { room: Room; player: Player } | { error: string } {
  const room = ROOMS.get(roomCode);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (room.players.size >= 2) return { error: "ROOM_FULL" };
  if (room.players.has(sessionId)) return { error: "ALREADY_IN_ROOM" };

  const slot = room.players.values().next().value?.slot === 1 ? 2 : 1;
  const player: Player = { sessionId, ws, slot, ready: false };

  room.players.set(sessionId, player);
  PLAYER_TO_ROOM.set(sessionId, roomCode);

  return { room, player };
}

export function removePlayer(sessionId: string): void {
  const roomCode = PLAYER_TO_ROOM.get(sessionId);
  if (!roomCode) return;

  const room = ROOMS.get(roomCode);
  if (!room) return;

  room.players.delete(sessionId);
  PLAYER_TO_ROOM.delete(sessionId);

  if (room.players.size === 0) {
    ROOMS.delete(roomCode);
  } else {
    room.status = "waiting";
    // Notify remaining player
    const remaining = room.players.values().next().value!;
    sendToPlayer(remaining.ws, {
      type: "player_left",
      slot: remaining.slot === 1 ? 2 : 1,
    });
  }
}

export function getPlayerRoom(sessionId: string): Room | undefined {
  const code = PLAYER_TO_ROOM.get(sessionId);
  return code ? ROOMS.get(code) : undefined;
}

export function processInput(
  sessionId: string,
  frame: number,
  data: string
): void {
  const room = getPlayerRoom(sessionId);
  if (!room) return;

  const sender = room.players.get(sessionId);
  if (!sender) return;

  // Forward input to the other player(s)
  for (const [id, player] of room.players) {
    if (id !== sessionId) {
      sendToPlayer(player.ws, {
        type: "remote_input",
        frame,
        data,
        from_slot: sender.slot,
      });
    }
  }

  // Track frame progress
  if (frame > room.currentFrame) {
    room.currentFrame = frame;
  }
}

export function setPlayerReady(sessionId: string): void {
  const room = getPlayerRoom(sessionId);
  if (!room) return;

  const player = room.players.get(sessionId);
  if (!player) return;

  player.ready = true;

  // Check if both players are ready
  if (room.players.size === 2) {
    const allReady = Array.from(room.players.values()).every((p) => p.ready);
    if (allReady) {
      room.status = "playing";
      // Notify both players
      const players = Array.from(room.players.values());
      const p1 = players.find((p) => p.slot === 1);
      const p2 = players.find((p) => p.slot === 2);

      for (const p of room.players.values()) {
        sendToPlayer(p.ws, {
          type: "game_start",
          p1_char: p1?.character || "unknown",
          p2_char: p2?.character || "unknown",
        });
      }
    }
  }
}

export function setCharacter(sessionId: string, charName: string): void {
  const room = getPlayerRoom(sessionId);
  if (!room) return;

  const player = room.players.get(sessionId);
  if (!player) return;

  player.character = charName;
  if (player.slot === 1) room.p1Char = charName;
  else room.p2Char = charName;
}

function sendToPlayer(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function getRoomCount(): number {
  return ROOMS.size;
}

export function cleanupStaleRooms(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  let cleaned = 0;
  for (const [code, room] of ROOMS) {
    if (Date.now() - room.createdAt > maxAgeMs) {
      for (const [sid] of room.players) {
        PLAYER_TO_ROOM.delete(sid);
      }
      ROOMS.delete(code);
      cleaned++;
    }
  }
  return cleaned;
}