"use client";

/**
 * useOnlineMultiplayer — best-possible input-delay netcode (without rollback).
 *
 * DESIGN:
 *
 * Local input is applied IMMEDIATELY (0 delay) for responsiveness.
 * Remote input uses a FIFO queue with a JITTER BUFFER:
 *
 * 1. Remote inputs arrive via WebSocket → pushed to FIFO queue
 * 2. Each frame, we shift (pop) the oldest entry from the queue
 * 3. If queue is empty (input hasn't arrived yet — network jitter):
 *    - GRACE PERIOD: For the FIRST missed frame, use last known input.
 *      This smooths over 1-frame jitter without visible twitching.
 *      The prediction is almost always correct (if the opponent was
 *      holding a direction, they're probably still holding it).
 *    - After 1 missed frame: inject empty (""). The character returns
 *      to neutral. This prevents desync accumulation.
 * 4. If queue has >3 entries (inputs arrived in a burst — catch-up):
 *    - Shift 2 entries per frame to drain the queue faster
 *    - This prevents lag buildup when the connection recovers
 *
 * WHY THIS IS BETTER THAN PURE "INJECT EMPTY":
 * - 1-frame grace period smooths over jitter (most common case)
 * - Character doesn't twitch on minor hiccups
 * - Still prevents permanent desync (empty after 1 frame of prediction)
 *
 * WHY THIS IS BETTER THAN PURE "FREEZE" (always use last known):
 * - Only 1 frame of prediction (not unlimited)
 * - After 1 frame, switches to empty → prevents accumulation
 * - The desync from 1 wrong frame is tiny (1-2 pixels) and caught
 *   by the sync fingerprint
 *
 * QUEUE DEPTH MANAGEMENT:
 * - Target depth: 1-2 entries (smooth, low latency)
 * - Depth 0: grace period → empty (jitter, don't build up)
 * - Depth 1-3: normal (shift 1 per frame)
 * - Depth 4+: catch-up mode (shift 2 per frame to drain)
 *
 * CONTROLS: WASD = move, U/I/O = punch, J/K/L = kick, 1 = start
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { GameInstance } from "@/lib/wasm-loader";
import type { RelayClient } from "@/lib/relay-client";
import { DesyncDetector } from "@/lib/desync-detector";

// =============================================================================
// Key maps
// =============================================================================

const KEY_MAP: Record<string, string> = {
  KeyW: "U", KeyA: "B", KeyS: "D", KeyD: "F",
  KeyU: "a", KeyI: "b", KeyO: "c",
  KeyJ: "x", KeyK: "y", KeyL: "z",
};
const START_KEYS = ["Digit1"];
const GAME_KEYS = new Set([...Object.keys(KEY_MAP), ...START_KEYS]);

function keysToMugenInput(activeKeys: Set<string>): string {
  let input = "";
  const directionOrder = ["U", "D", "B", "F"];
  for (const dir of directionOrder) {
    for (const [code, mugen] of Object.entries(KEY_MAP)) {
      if (mugen === dir && activeKeys.has(code)) { input += dir; break; }
    }
  }
  const actionOrder = ["a", "b", "c", "x", "y", "z"];
  for (const act of actionOrder) {
    for (const [code, mugen] of Object.entries(KEY_MAP)) {
      if (mugen === act && activeKeys.has(code)) { input += act; break; }
    }
  }
  return input;
}

// =============================================================================
// Constants
// =============================================================================

const DISCONNECT_TIMEOUT_MS = 10000;
const FRAME_MS = 1000 / 60;
const MAX_CATCHUP_STEPS = 3;
const MAX_BUFFER_SIZE = 120;
const GRACE_PERIOD_FRAMES = 1;    // Use last-known for 1 frame before switching to empty
const CATCHUP_THRESHOLD = 4;      // If queue has 4+ entries, shift 2 per frame
const STALL_DISPLAY_THRESHOLD_MS = 500; // Show "⚠ LAG" only after 500ms of stalling

// =============================================================================
// Types
// =============================================================================

export interface OnlineMultiplayerState {
  frame: number;
  isPumping: boolean;
  stalled: boolean;
  stallDuration: number | null;
  latency: number | null;
  localInput: string;
  remoteInput: string;
  disconnected: boolean;
  desyncDetected: boolean;
  desyncFrame: number | null;
  queueDepth: number;
  connectionQuality: "good" | "moderate" | "poor" | "unknown";
}

export interface OnlineMultiplayerApi extends OnlineMultiplayerState {
  start: (startTime?: number) => void;
  stop: () => void;
}

// =============================================================================
// Helper: read player state and send resync to guest (host only)
// =============================================================================

function sendResyncState(game: GameInstance, relay: RelayClient) {
  try {
    // Read both players' positions, velocity, life, state, facing
    const p1_x = game.Module.ccall("getPlayerPositionXExport", "number", ["number"], [0]) as number;
    const p1_y = game.Module.ccall("getPlayerPositionYExport", "number", ["number"], [0]) as number;
    const p1_life = game.Module.ccall("getPlayerLifeExport", "number", ["number"], [0]) as number;
    const p1_state = game.Module.ccall("getPlayerStateExport", "number", ["number"], [0]) as number;
    const p1_facing = game.Module.ccall("getPlayerFacingExport", "number", ["number"], [0]) as number;

    const p2_x = game.Module.ccall("getPlayerPositionXExport", "number", ["number"], [1]) as number;
    const p2_y = game.Module.ccall("getPlayerPositionYExport", "number", ["number"], [1]) as number;
    const p2_life = game.Module.ccall("getPlayerLifeExport", "number", ["number"], [1]) as number;
    const p2_state = game.Module.ccall("getPlayerStateExport", "number", ["number"], [1]) as number;
    const p2_facing = game.Module.ccall("getPlayerFacingExport", "number", ["number"], [1]) as number;

    console.log(`[OnlinePump] Sending resync: P1(${p1_x.toFixed(0)},${p1_y.toFixed(0)}) hp=${p1_life} P2(${p2_x.toFixed(0)},${p2_y.toFixed(0)}) hp=${p2_life}`);

    relay.sendResyncState({
      p1_x, p1_y, p1_life, p1_state, p1_facing,
      p2_x, p2_y, p2_life, p2_state, p2_facing,
    });
  } catch (e) {
    console.error("[OnlinePump] Failed to send resync:", e);
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useOnlineMultiplayer(
  game: GameInstance | null,
  relay: RelayClient | null,
  mySlot: 1 | 2,
  _inputDelay: number = 4
): OnlineMultiplayerApi {
  // Refs
  const keysRef = useRef<Set<string>>(new Set());
  const startPressedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const gameRef = useRef<GameInstance | null>(game);
  const relayRef = useRef<RelayClient | null>(relay);
  const mySlotRef = useRef(mySlot);

  // Fixed-timestep accumulator
  const accumulatorRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);

  // Remote input FIFO queue
  const remoteInputQueueRef = useRef<string[]>([]);

  // Grace period tracking
  const consecutiveMissedFramesRef = useRef(0);
  const lastKnownRemoteInputRef = useRef<string>("");

  // Stall tracking
  const stallStartRef = useRef<number | null>(null);
  const lastRemoteInputTimeRef = useRef<number>(0);

  // Queue health tracking (for connection quality indicator)
  const queueDepthHistoryRef = useRef<number[]>([]); // last 60 frames of queue depth

  // Latency
  const latencyRef = useRef<number | null>(null);

  // Desync detector
  const desyncDetectorRef = useRef<DesyncDetector | null>(null);

  // Snap-resync: when desync detected, host sends authoritative state
  const resyncCooldownRef = useRef<number>(0); // timestamp of last resync (cooldown to avoid spamming)
  const RESYNC_COOLDOWN_MS = 3000; // wait 3s between resyncs

  // React state
  const [state, setState] = useState<OnlineMultiplayerState>({
    frame: 0,
    isPumping: false,
    stalled: false,
    stallDuration: null,
    latency: null,
    localInput: "",
    remoteInput: "",
    disconnected: false,
    desyncDetected: false,
    desyncFrame: null,
    queueDepth: 0,
    connectionQuality: "unknown",
  });

  // Keep refs synced
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { relayRef.current = relay; }, [relay]);
  useEffect(() => { mySlotRef.current = mySlot; }, [mySlot]);

  // ===========================================================================
  // Keyboard capture
  // ===========================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        if (START_KEYS.includes(e.code)) {
          if (!e.repeat) startPressedRef.current = true;
        } else if (KEY_MAP[e.code]) {
          keysRef.current.add(e.code);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (KEY_MAP[e.code]) keysRef.current.delete(e.code);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // ===========================================================================
  // Relay message handler — receive remote inputs
  // ===========================================================================

  useEffect(() => {
    if (!relay) return;

    const unsub = relay.on("remote_input", (msg) => {
      const remoteMsg = msg as unknown as { from_slot: number; frame: number; data: string };
      if (remoteMsg.from_slot === mySlotRef.current) return;

      // Push to FIFO queue
      remoteInputQueueRef.current.push(remoteMsg.data);
      if (remoteInputQueueRef.current.length > MAX_BUFFER_SIZE) {
        remoteInputQueueRef.current.shift();
      }
      lastRemoteInputTimeRef.current = Date.now();

      // Update last known remote input
      const clean = remoteMsg.data.replace(/S/g, "");
      lastKnownRemoteInputRef.current = clean;

      // Clear stall
      if (stallStartRef.current !== null) {
        stallStartRef.current = null;
      }
    });

    return () => unsub();
  }, [relay]);

  // ===========================================================================
  // Snap-resync: receive authoritative state from host
  // ===========================================================================

  useEffect(() => {
    if (!relay) return;

    const unsub = relay.on("resync_state", (msg) => {
      const resyncMsg = msg as unknown as {
        type: string;
        p1_x: number; p1_y: number; p1_life: number; p1_state: number; p1_facing: number;
        p2_x: number; p2_y: number; p2_life: number; p2_state: number; p2_facing: number;
        from_slot: number;
      };

      // Only process resync from host (slot 1)
      if (resyncMsg.from_slot !== 1) return;

      const g = gameRef.current;
      if (!g || !g.Module || typeof g.Module.ccall !== "function") return;

      console.log("[OnlinePump] Received resync_state — applying snap-resync");

      try {
        // Apply P1 state
        g.Module.ccall("setPlayerSyncStateExport", "void",
          ["number", "number", "number", "number", "number", "number"],
          [0, resyncMsg.p1_x, resyncMsg.p1_y, resyncMsg.p1_life, resyncMsg.p1_state, resyncMsg.p1_facing]);

        // Apply P2 state
        g.Module.ccall("setPlayerSyncStateExport", "void",
          ["number", "number", "number", "number", "number", "number"],
          [1, resyncMsg.p2_x, resyncMsg.p2_y, resyncMsg.p2_life, resyncMsg.p2_state, resyncMsg.p2_facing]);
      } catch (e) {
        console.error("[OnlinePump] Failed to apply resync:", e);
      }

      // Clear the desync warning (state should now be corrected)
      setState(prev => ({ ...prev, desyncDetected: false, desyncFrame: null }));

      // Clear the remote input queue (stale inputs may have caused the desync)
      remoteInputQueueRef.current = [];
      consecutiveMissedFramesRef.current = 0;
    });

    return () => unsub();
  }, [relay]);

  // ===========================================================================
  // Latency measurement
  // ===========================================================================

  useEffect(() => {
    if (!relay) return;
    const interval = setInterval(async () => {
      const result = await relay.sendPing();
      latencyRef.current = result.rtt >= 0 ? result.rtt : null;
    }, 5000);
    return () => clearInterval(interval);
  }, [relay]);

  // ===========================================================================
  // Simulate one frame — the core netcode logic
  // ===========================================================================

  const simulateOneFrame = useCallback(() => {
    const g = gameRef.current;
    const r = relayRef.current;
    if (!g || !g.Module || typeof g.Module.ccall !== "function") return;

    const slot = mySlotRef.current;
    const localPlayerIndex = slot - 1;
    const remotePlayerIndex = slot === 1 ? 1 : 0;
    const currentFrame = frameRef.current;

    // STEP 1: Capture and inject LOCAL input (immediate, 0 delay)
    let localInput = keysToMugenInput(keysRef.current);
    if (startPressedRef.current) {
      localInput += "S";
      startPressedRef.current = false;
    }
    const localClean = localInput.replace(/S/g, "");

    // Send to relay every frame (60fps)
    if (r && r.isConnected()) {
      r.sendInput(currentFrame, localInput);
    }

    // Inject locally (immediate)
    try {
      g.Module.ccall("setExternalPlayerInput", "void", ["number", "string"], [localPlayerIndex, localClean]);
    } catch (e) {
      console.error("[OnlinePump] Failed to inject local input:", e);
    }

    // STEP 2: Get REMOTE input from FIFO queue (with jitter buffer)
    //
    // Queue depth management:
    // - Depth 0: grace period (1 frame of last-known), then empty
    // - Depth 1-3: normal (shift 1 per frame)
    // - Depth 4+: catch-up mode (shift 2 per frame to drain)
    const now = Date.now();
    const queueLen = remoteInputQueueRef.current.length;
    let remoteClean = "";
    let isPredicting = false;

    if (queueLen >= CATCHUP_THRESHOLD) {
      // CATCH-UP MODE: queue is backed up, shift 2 to drain faster
      // This prevents lag buildup when the connection recovers from a hiccup
      const data1 = remoteInputQueueRef.current.shift()!;
      remoteInputQueueRef.current.shift(); // discard the second (oldest = already late)
      remoteClean = data1.replace(/S/g, "");
      consecutiveMissedFramesRef.current = 0;
      stallStartRef.current = null;
    } else if (queueLen > 0) {
      // NORMAL MODE: shift 1 entry per frame
      const remoteData = remoteInputQueueRef.current.shift()!;
      remoteClean = remoteData.replace(/S/g, "");
      consecutiveMissedFramesRef.current = 0;
      stallStartRef.current = null;
    } else {
      // QUEUE EMPTY: input hasn't arrived yet (network jitter)
      consecutiveMissedFramesRef.current++;

      if (consecutiveMissedFramesRef.current <= GRACE_PERIOD_FRAMES) {
        // GRACE PERIOD: use last known input for 1 frame
        // This smooths over 1-frame jitter without visible twitching.
        // The prediction is almost always correct (if opponent was holding
        // a direction, they're probably still holding it 1 frame later).
        remoteClean = lastKnownRemoteInputRef.current;
        isPredicting = true;
      } else {
        // After grace period: inject empty (character returns to neutral)
        // This prevents desync accumulation.
        remoteClean = "";
      }

      if (stallStartRef.current === null) {
        stallStartRef.current = now;
      }
    }

    // Inject remote input
    try {
      g.Module.ccall("setExternalPlayerInput", "void", ["number", "string"], [remotePlayerIndex, remoteClean]);
    } catch (e) {
      console.error("[OnlinePump] Failed to inject remote input:", e);
    }

    // STEP 3: Check for disconnect
    const timeSinceLastInput = now - lastRemoteInputTimeRef.current;
    if (timeSinceLastInput > DISCONNECT_TIMEOUT_MS) {
      setState(prev => ({
        ...prev,
        stalled: true,
        stallDuration: stallStartRef.current ? now - stallStartRef.current : null,
        disconnected: true,
        isPumping: false,
      }));
      return;
    }

    // STEP 4: Track queue health (for connection quality indicator)
    queueDepthHistoryRef.current.push(queueLen);
    if (queueDepthHistoryRef.current.length > 60) {
      queueDepthHistoryRef.current.shift();
    }

    // STEP 5: Apply smooth resync interpolation (if active)
    try {
      g.Module.ccall("updateResyncInterpolationExport", "void", [], []);
    } catch (e) {
      // Silently ignore
    }

    // STEP 5b: Sync round state — if host detects a round transition
    // (KO → new round), send round number to guest so they can catch up
    // This prevents the "KO on one screen, still fighting on other" bug
    if (mySlotRef.current === 1 && r && r.isConnected()) {
      const roundNum = g.Module.ccall("getRoundNumberExport", "number", [], []) as number;
      const roundState = g.Module.ccall("getRoundStateExport", "number", [], []) as number;
      // Round state: 0=FADE_IN, 1=INTRO, 2=FIGHT, 3=OVER, 4=WIN_POSE
      // Send round state every 30 frames (0.5s) when in OVER or WIN_POSE
      // (these are the critical transition moments)
      if ((roundState === 3 || roundState === 4) && frameRef.current % 30 === 0) {
        r.sendSyncCheck(frameRef.current, `ROUND:${roundNum}:${roundState}`);
      }
    }

    // STEP 6: Advance frame counter
    frameRef.current++;

    // Run desync detector
    if (desyncDetectorRef.current) {
      desyncDetectorRef.current.tick();
    }

    // STEP 6: Update display state (throttled)
    if (frameRef.current % 6 === 0) {
      const stalled = stallStartRef.current !== null &&
        (now - stallStartRef.current) > STALL_DISPLAY_THRESHOLD_MS;
      const stallDuration = stalled ? now - stallStartRef.current! : null;

      // Compute connection quality from queue health
      const history = queueDepthHistoryRef.current;
      const emptyRate = history.filter(d => d === 0).length / Math.max(history.length, 1);
      const avgDepth = history.reduce((s, d) => s + d, 0) / Math.max(history.length, 1);
      let quality: "good" | "moderate" | "poor" | "unknown" = "unknown";
      if (history.length >= 30) {
        if (emptyRate < 0.05 && avgDepth < 3) quality = "good";
        else if (emptyRate < 0.15) quality = "moderate";
        else quality = "poor";
      }

      setState({
        frame: frameRef.current,
        isPumping: true,
        stalled,
        stallDuration,
        latency: latencyRef.current,
        localInput: localClean,
        remoteInput: remoteClean + (isPredicting ? " (pred)" : ""),
        disconnected: false,
        desyncDetected: state.desyncDetected,
        desyncFrame: state.desyncFrame,
        queueDepth: queueLen,
        connectionQuality: quality,
      });
    }
  }, []);

  // ===========================================================================
  // Main pump — fixed-timestep accumulator
  // ===========================================================================

  const pump = useCallback((now: number) => {
    const g = gameRef.current;
    if (!g || !g.Module || typeof g.Module.ccall !== "function") {
      rafRef.current = requestAnimationFrame(pump);
      return;
    }

    if (lastTickTimeRef.current === 0) {
      lastTickTimeRef.current = now;
      rafRef.current = requestAnimationFrame(pump);
      return;
    }

    const elapsed = now - lastTickTimeRef.current;
    lastTickTimeRef.current = now;
    accumulatorRef.current += elapsed;

    const maxAccumulator = FRAME_MS * MAX_CATCHUP_STEPS;
    if (accumulatorRef.current > maxAccumulator) {
      accumulatorRef.current = maxAccumulator;
    }

    let steps = 0;
    while (accumulatorRef.current >= FRAME_MS && steps < MAX_CATCHUP_STEPS) {
      simulateOneFrame();
      accumulatorRef.current -= FRAME_MS;
      steps++;
      if (state.disconnected) return;
    }

    rafRef.current = requestAnimationFrame(pump);
  }, [simulateOneFrame, state.disconnected]);

  // ===========================================================================
  // Start/stop
  // ===========================================================================

  const start = useCallback((_startTime?: number) => {
    if (rafRef.current !== null) return;
    frameRef.current = 0;
    remoteInputQueueRef.current = [];
    consecutiveMissedFramesRef.current = 0;
    lastKnownRemoteInputRef.current = "";
    lastRemoteInputTimeRef.current = Date.now();
    stallStartRef.current = null;
    accumulatorRef.current = 0;
    lastTickTimeRef.current = 0;
    queueDepthHistoryRef.current = [];

    const g = gameRef.current;
    const r = relayRef.current;
    if (g && r) {
      desyncDetectorRef.current = new DesyncDetector(g, r, mySlotRef.current, (result) => {
        if (!result.isSynced) {
          console.warn(`[OnlinePump] DESYNC at frame ${result.frame}: local=${result.localHash} remote=${result.remoteHash}`);
          setState(prev => ({
            ...prev,
            desyncDetected: true,
            desyncFrame: result.frame,
          }));

          // SNAP-RESYNC: Host sends authoritative player states to guest
          // Only the host initiates resync (it's the authority)
          // Cooldown prevents spamming resyncs
          const now = Date.now();
          if (mySlotRef.current === 1 && now - resyncCooldownRef.current > RESYNC_COOLDOWN_MS) {
            resyncCooldownRef.current = now;
            sendResyncState(g, r);
          }
        }
      });
    }

    setState(prev => ({
      ...prev,
      isPumping: true,
      disconnected: false,
      desyncDetected: false,
      desyncFrame: null,
      queueDepth: 0,
      connectionQuality: "unknown",
    }));
    rafRef.current = requestAnimationFrame(pump);
  }, [pump]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    keysRef.current.clear();
    setState(prev => ({ ...prev, isPumping: false }));
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        accumulatorRef.current = 0;
        lastTickTimeRef.current = 0;
      } else {
        lastTickTimeRef.current = 0;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return {
    frame: state.frame,
    isPumping: state.isPumping,
    stalled: state.stalled,
    stallDuration: state.stallDuration,
    latency: state.latency,
    localInput: state.localInput,
    remoteInput: state.remoteInput,
    disconnected: state.disconnected,
    desyncDetected: state.desyncDetected,
    desyncFrame: state.desyncFrame,
    queueDepth: state.queueDepth,
    connectionQuality: state.connectionQuality,
    start,
    stop,
  };
}
