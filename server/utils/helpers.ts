/** Utility helpers for the server */

export function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Exponential backoff delay for reconnection attempts.
 * Returns milliseconds to wait before the next attempt.
 */
export function backoffDelay(
  attempt: number,
  baseMs: number = 1000,
  maxMs: number = 16000
): number {
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
}

/** Simple frame hash for sync checking (not cryptographically secure) */
export function hashState(state: string): string {
  let hash = 0;
  for (let i = 0; i < state.length; i++) {
    const char = state.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // hash * 31 + char
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}