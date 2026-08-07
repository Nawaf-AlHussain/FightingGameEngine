/**
 * WebSocket Relay Client
 *
 * Connects to the Deno Deploy WebSocket relay server for
 * lockstep multiplayer input forwarding.
 *
 * Live relay: wss://fge-relay.syllabai.deno.net/ws
 * Local dev:  ws://localhost:8080/ws
 *
 * Protocol: see server/src/index.ts and docs/deep-dives/02-deno-relay-protocol.md
 */

// Set to true to enable verbose relay logging in the console.
const RELAY_DEBUG = typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("relay-debug");

function relayLog(...args: unknown[]): void {
  if (RELAY_DEBUG) console.log("[Relay]", ...args);
}
function relayWarn(...args: unknown[]): void {
  if (RELAY_DEBUG) console.warn("[Relay]", ...args);
}
function relayError(...args: unknown[]): void {
  // Errors always logged (not gated by RELAY_DEBUG)
  console.error("[Relay]", ...args);
}

// =============================================================================
// Message types
// =============================================================================

export type MessageType =
  // Client → Server
  | "create_room"
  | "join_room"
  | "input"
  | "ready"
  | "sync_check"
  | "leave_room"
  | "set_character"
  | "set_stage"
  | "set_input_delay"
  | "loading_ready"
  | "ping"
  | "resync_request"
  // Server → Client
  | "room_created"
  | "room_joined"
  | "player_joined"
  | "player_left"
  | "player_ready"
  | "remote_input"
  | "character_selected"
  | "stage_selected"
  | "input_delay_set"
  | "game_start"
  | "match_can_start"
  | "game_abandoned"
  | "resync_state"
  | "error"
  | "pong";

export interface RelayMessage {
  type: MessageType;
  [key: string]: unknown;
}

export interface RoomCreatedMsg extends RelayMessage {
  type: "room_created";
  room_code: string;
  slot: number;
  input_delay: number;
}

export interface RoomJoinedMsg extends RelayMessage {
  type: "room_joined";
  room_code: string;
  slot: number;
  input_delay: number;
}

export interface PlayerJoinedMsg extends RelayMessage {
  type: "player_joined";
  slot: number;
  session_id: string;
}

export interface PlayerLeftMsg extends RelayMessage {
  type: "player_left";
  slot: number;
}

export interface PlayerReadyMsg extends RelayMessage {
  type: "player_ready";
  slot: number;
}

export interface RemoteInputMsg extends RelayMessage {
  type: "remote_input";
  frame: number;
  data: string;
  from_slot: number;
}

export interface CharacterSelectedMsg extends RelayMessage {
  type: "character_selected";
  slot: number;
  character: string;
}

export interface StageSelectedMsg extends RelayMessage {
  type: "stage_selected";
  slot: number;
  stage: string;
}

export interface InputDelaySetMsg extends RelayMessage {
  type: "input_delay_set";
  delay: number;
}

export interface GameStartMsg extends RelayMessage {
  type: "game_start";
  p1_char: string;
  p2_char: string;
  stage: string;
  input_delay: number;
  start_time: number;  // Wall-clock timestamp (ms) when frame 0 begins
  start_frame: number;
  rng_seed: number;    // Shared RNG seed for determinism (host-generated)
}

export interface GameAbandonedMsg extends RelayMessage {
  type: "game_abandoned";
  reason: string;
  final_frame: number;
}

export interface ResyncStateMsg extends RelayMessage {
  type: "resync_state";
  p1_x: number; p1_y: number; p1_life: number; p1_state: number; p1_facing: number;
  p2_x: number; p2_y: number; p2_life: number; p2_state: number; p2_facing: number;
  from_slot: number;
}

export interface ErrorMsg extends RelayMessage {
  type: "error";
  code: string;
  message: string;
}

export interface PongMsg extends RelayMessage {
  type: "pong";
  ts: number;          // Client's original timestamp (echoed back)
  server_ts: number;   // Server's timestamp when it sent the pong (for clock sync)
}

type MessageHandler = (msg: RelayMessage) => void;

// =============================================================================
// RelayClient
// =============================================================================

/**
 * The live relay URL. Falls back to localhost for development.
 *
 * The relay is a stateless WebSocket server running on Deno Deploy free tier.
 * See: server/src/index.ts
 */
export const RELAY_URL =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "ws://localhost:8080/ws"  // Dev: local relay
    : "wss://fge-relay.syllabai.deno.net/ws";  // Prod: live relay (new account)

export class RelayClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private roomCode: string | null = null;
  private handlers = new Map<MessageType, Set<MessageHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private relayUrl: string;
  private intentionalDisconnect = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(relayUrl: string = RELAY_URL, sessionId: string) {
    this.relayUrl = relayUrl;
    this.sessionId = sessionId;
  }

  /**
   * Connect to the relay server. Returns a promise that resolves when
   * the WebSocket is open. Safe to call multiple times — subsequent calls
   * return the existing connection promise.
   */
  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectionPromise) return this.connectionPromise;

    this.intentionalDisconnect = false;
    this.reconnectAttempts = 0;

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      const url = `${this.relayUrl}?session_id=${this.sessionId}`;
      console.log("[Relay] Connecting to:", url);

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        reject(new Error(`Failed to create WebSocket: ${e instanceof Error ? e.message : String(e)}`));
        return;
      }

      // Set a connection timeout (10 seconds)
      const timeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          relayError("Connection timeout (10s)");
          try { this.ws.close(); } catch {}
          this.ws = null;
          this.connectionPromise = null;
          reject(new Error("Connection timeout — relay server did not respond within 10 seconds. This could be a network issue (firewall, ISP blocking WebSocket) or the relay is down."));
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log("[Relay] ✓ Connected");
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as RelayMessage;
          this.dispatch(msg);
        } catch (e) {
          relayError("Failed to parse message:", e);
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        clearTimeout(timeout);
        console.log(`[Relay] Disconnected (code=${event.code}, reason="${event.reason}")`);
        this.connectionPromise = null;
        if (!this.intentionalDisconnect) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        relayError("WebSocket error:", err);
        // Don't reject here — onclose will fire after onerror and handle cleanup.
        // But if onclose doesn't fire within 1s, reject with a helpful message.
        setTimeout(() => {
          if (this.connectionPromise) {
            this.connectionPromise = null;
            reject(new Error(
              "WebSocket connection failed. Possible causes:\n" +
              "• Your network/ISP is blocking WebSocket connections\n" +
              "• A firewall or antivirus is blocking the connection\n" +
              "• The relay server is down (check: https://fge-relay.syllabai.deno.net/)\n" +
              "• Your browser doesn't support WebSocket\n" +
              "URL: " + url
            ));
          }
        }, 1000);
      };
    });

    return this.connectionPromise;
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.connectionPromise = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  on(type: MessageType, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  // ===========================================================================
  // Client → Server message senders
  // ===========================================================================

  createRoom(): void {
    this.send({ type: "create_room", session_id: this.sessionId });
  }

  joinRoom(code: string): void {
    this.roomCode = code.toUpperCase();
    this.send({
      type: "join_room",
      session_id: this.sessionId,
      room_code: this.roomCode,
    });
  }

  leaveRoom(): void {
    this.send({
      type: "leave_room",
      session_id: this.sessionId,
      room_code: this.roomCode,
    });
    this.roomCode = null;
  }

  sendInput(frame: number, data: string): void {
    this.send({
      type: "input",
      room_code: this.roomCode,
      frame,
      data,
    });
  }

  sendReady(): void {
    this.send({
      type: "ready",
      session_id: this.sessionId,
      room_code: this.roomCode,
    });
  }

  /**
   * Tell the relay that this client has finished downloading and injecting
   * all character/stage assets. The relay waits for both clients to send
   * this before broadcasting match_can_start. This is the "loading barrier" —
   * it ensures neither client starts the simulation before the other is ready.
   */
  sendLoadingReady(): void {
    this.send({
      type: "loading_ready",
      session_id: this.sessionId,
      room_code: this.roomCode,
    });
  }

  /**
   * Send a resync request (host → guest) with authoritative player states.
   * Called when desync is detected — the host sends its positions/life/state,
   * and the guest snaps to them.
   */
  sendResyncState(data: {
    p1_x: number; p1_y: number; p1_life: number; p1_state: number; p1_facing: number;
    p2_x: number; p2_y: number; p2_life: number; p2_state: number; p2_facing: number;
  }): void {
    this.send({
      type: "resync_request",
      room_code: this.roomCode,
      ...data,
    });
  }

  setCharacter(character: string): void {
    this.send({
      type: "set_character",
      session_id: this.sessionId,
      room_code: this.roomCode,
      character,
    });
  }

  setStage(stage: string): void {
    this.send({
      type: "set_stage",
      session_id: this.sessionId,
      room_code: this.roomCode,
      stage,
    });
  }

  setInputDelay(delay: number): void {
    this.send({
      type: "set_input_delay",
      room_code: this.roomCode,
      delay,
    });
  }

  /**
   * Send a ping and measure RTT + clock offset (Cristian's algorithm).
   *
   * The relay responds with its server timestamp. We compute:
   *   RTT = now - client_send_time
   *   clock_offset = server_time - (client_send_time + RTT/2)
   *
   * The clock offset is how much the server's clock is ahead of (or behind)
   * the client's clock. With this, the client can compute "server time" as:
   *   server_time = Date.now() + clock_offset
   *
   * This is needed for frame-locked lockstep: both clients use the server's
   * clock as a common reference, so they agree on "what time is it" within
   * ±RTT/2 accuracy.
   *
   * @returns { rtt: number, offset: number } in ms, or { rtt: -1, offset: 0 } on timeout
   */
  sendPing(): Promise<{ rtt: number; offset: number }> {
    const ts = Date.now();
    this.send({ type: "ping", ts });
    return new Promise((resolve) => {
      const unsub = this.on("pong", (msg) => {
        const pong = msg as PongMsg;
        if (pong.ts === ts) {
          const rtt = Date.now() - ts;
          // Cristian's algorithm: offset = server_time - (send_time + RTT/2)
          // Assumes symmetric latency (forward == backward)
          const offset = pong.server_ts - (ts + rtt / 2);
          resolve({ rtt, offset });
          unsub();
        }
      });
      // Timeout after 5s
      setTimeout(() => {
        unsub();
        resolve({ rtt: -1, offset: 0 });
      }, 5000);
    });
  }

  sendSyncCheck(frame: number, hash: string): void {
    this.send({
      type: "sync_check",
      room_code: this.roomCode,
      frame,
      data: hash,
    });
  }

  // ===========================================================================
  // Accessors
  // ===========================================================================

  getRoomCode(): string | null {
    return this.roomCode;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private send(msg: RelayMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      relayWarn("Cannot send — not connected:", msg.type);
    }
  }

  private dispatch(msg: RelayMessage): void {
    const typeHandlers = this.handlers.get(msg.type);
    if (typeHandlers) {
      typeHandlers.forEach((handler) => handler(msg));
    }

    // Auto-track room code from server responses
    if (msg.type === "room_created") {
      this.roomCode = (msg as RoomCreatedMsg).room_code;
    } else if (msg.type === "room_joined") {
      this.roomCode = (msg as RoomJoinedMsg).room_code;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      relayError("Max reconnect attempts reached");
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
    relayLog(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => {
      if (!this.intentionalDisconnect) {
        this.connect().catch(() => {});
      }
    }, delay);
  }
}

// =============================================================================
// Helper: wire up relay to the game engine
// =============================================================================

/**
 * Connect the relay client to the WASM game engine.
 * When a remote_input message arrives, inject it into WASM.
 *
 * @param relay The RelayClient instance
 * @param injectFn Function that calls setExternalPlayerInput(playerIndex, input)
 * @param mySlot This player's slot (1 or 2). Messages from our own slot are filtered.
 * @returns Cleanup function that unsubscribes all handlers.
 */
export function connectRelayToGame(
  relay: RelayClient,
  injectFn: (playerIndex: number, inputString: string) => void,
  mySlot: number
): () => void {
  const unsub = relay.on("remote_input", (msg) => {
    const remoteMsg = msg as RemoteInputMsg;
    // Filter out messages from our own slot (echo protection)
    if (remoteMsg.from_slot === mySlot) {
      return;
    }
    // Relay protocol uses 1-indexed slots (1, 2), WASM API is 0-indexed (0, 1).
    injectFn(remoteMsg.from_slot - 1, remoteMsg.data);
  });

  const unsubStart = relay.on("game_start", (msg) => {
    const startMsg = msg as GameStartMsg;
    relayLog(`Starting: ${startMsg.p1_char} vs ${startMsg.p2_char} on ${startMsg.stage}`);
  });

  return () => {
    unsub();
    unsubStart();
  };
}
