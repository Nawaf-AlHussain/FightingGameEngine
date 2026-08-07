/**
 * Database Query Stubs
 *
 * These functions will be implemented with Neon's serverless driver (@neondatabase/serverless).
 * For now, they define the interface and return mock data.
 */

export interface User {
  id: string;
  session_id: string;
  username: string | null;
  created_at: Date;
}

export interface Character {
  id: string;
  name: string;
  def_file: string;
  sff_file: string;
  snd_file: string;
  file_size: number;
  is_active: boolean;
  created_at: Date;
}

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: "waiting" | "playing" | "finished";
  p1_char_id: string | null;
  p2_char_id: string | null;
  stage_id: string | null;
  created_at: Date;
  finished_at: Date | null;
}

export interface MatchHistory {
  id: string;
  room_id: string;
  winner_slot: number | null;
  p1_char_id: string;
  p2_char_id: string;
  duration_ms: number;
  played_at: Date;
}

// --- Users ---

export async function createUser(sessionId: string): Promise<User> {
  // TODO: INSERT INTO users (session_id) VALUES ($1) RETURNING *
  return {
    id: "mock-uuid",
    session_id: sessionId,
    username: null,
    created_at: new Date(),
  };
}

export async function getUserBySession(sessionId: string): Promise<User | null> {
  // TODO: SELECT * FROM users WHERE session_id = $1
  return null;
}

// --- Characters ---

export async function getActiveCharacters(): Promise<Character[]> {
  // TODO: SELECT * FROM characters WHERE is_active = true
  return [];
}

export async function getCharacterById(id: string): Promise<Character | null> {
  // TODO: SELECT * FROM characters WHERE id = $1
  return null;
}

export async function addCharacter(data: {
  name: string;
  def_file: string;
  sff_file: string;
  snd_file: string;
  file_size: number;
}): Promise<Character> {
  // TODO: INSERT INTO characters (name, def_file, sff_file, snd_file, file_size)
  //       VALUES ($1, $2, $3, $4, $5) RETURNING *
  return {
    id: "mock-uuid",
    ...data,
    is_active: true,
    created_at: new Date(),
  };
}

// --- Rooms ---

export async function createRoom(
  hostId: string,
  code: string
): Promise<Room> {
  // TODO: INSERT INTO rooms (host_id, code) VALUES ($1, $2) RETURNING *
  return {
    id: "mock-uuid",
    code,
    host_id: hostId,
    status: "waiting",
    p1_char_id: null,
    p2_char_id: null,
    stage_id: null,
    created_at: new Date(),
    finished_at: null,
  };
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  // TODO: SELECT * FROM rooms WHERE code = $1
  return null;
}

export async function updateRoomStatus(
  code: string,
  status: Room["status"]
): Promise<void> {
  // TODO: UPDATE rooms SET status = $2 WHERE code = $1
}

// --- Match History ---

export async function recordMatch(data: {
  room_id: string;
  winner_slot: number | null;
  p1_char_id: string;
  p2_char_id: string;
  duration_ms: number;
}): Promise<MatchHistory> {
  // TODO: INSERT INTO match_history (room_id, winner_slot, p1_char_id, p2_char_id, duration_ms)
  //       VALUES ($1, $2, $3, $4, $5) RETURNING *
  return {
    id: "mock-uuid",
    ...data,
    played_at: new Date(),
  };
}

export async function getMatchHistory(limit = 20): Promise<MatchHistory[]> {
  // TODO: SELECT * FROM match_history ORDER BY played_at DESC LIMIT $1
  return [];
}