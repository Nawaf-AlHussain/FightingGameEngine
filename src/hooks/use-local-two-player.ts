"use client";

/**
 * useLocalTwoPlayer — captures keyboard input for two players sharing
 * one keyboard and pumps both inputs to the WASM engine at 60fps.
 *
 * Player 1 layout (left side of keyboard):
 *   Movement: W A S D  →  U L D R  →  MUGEN U B D F
 *   Punches:  U I O    →  a b c
 *   Kicks:    J K L    →  x y z
 *   Start:    1
 *
 * Player 2 layout (right side of keyboard):
 *   Movement: Arrow keys  →  U B D F
 *   Punches:  Numpad 8 9 0  →  a b c   (or 8 9 0 on top row)
 *   Kicks:    Numpad 4 5 6  →  x y z   (or M , . on bottom row)
 *   Start:    2
 *
 * Both players' inputs are pumped to the engine via _setExternalPlayerInput
 * every animation frame (~60fps). P1 = controller 0, P2 = controller 1.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { GameInstance } from "@/lib/wasm-loader";

// P1 key map: KeyboardEvent.code → MUGEN input char
const P1_KEY_MAP: Record<string, string> = {
  // Movement (WASD)
  KeyW: "U",
  KeyA: "B", // A = left = Back
  KeyS: "D",
  KeyD: "F", // D = right = Forward
  // Punches (U I O)
  KeyU: "a",
  KeyI: "b",
  KeyO: "c",
  // Kicks (J K L)
  KeyJ: "x",
  KeyK: "y",
  KeyL: "z",
};

// P2 key map
const P2_KEY_MAP: Record<string, string> = {
  // Movement (Arrow keys)
  ArrowUp: "U",
  ArrowLeft: "B",
  ArrowDown: "D",
  ArrowRight: "F",
  // Punches (8 9 0 on top row — easier than numpad on laptops)
  Digit8: "a",
  Digit9: "b",
  Digit0: "c",
  // Kicks (M , .)
  KeyM: "x",
  Comma: "y",
  Period: "z",
};

// Start keys (edge-triggered, not in main maps)
const P1_START_KEYS = ["Digit1"];
const P2_START_KEYS = ["Digit2"];

const P1_GAME_KEYS = new Set([
  ...Object.keys(P1_KEY_MAP),
  ...P1_START_KEYS,
]);
const P2_GAME_KEYS = new Set([
  ...Object.keys(P2_KEY_MAP),
  ...P2_START_KEYS,
]);

function keysToMugenInput(
  activeKeys: Set<string>,
  map: Record<string, string>
): string {
  let input = "";
  // Directions first (canonical U/D/B/F order)
  const directionOrder = ["U", "D", "B", "F"];
  for (const dir of directionOrder) {
    for (const [code, mugen] of Object.entries(map)) {
      if (mugen === dir && activeKeys.has(code)) {
        input += dir;
        break;
      }
    }
  }
  // Then actions (a/b/c/x/y/z)
  const actionOrder = ["a", "b", "c", "x", "y", "z"];
  for (const act of actionOrder) {
    for (const [code, mugen] of Object.entries(map)) {
      if (mugen === act && activeKeys.has(code)) {
        input += act;
        break;
      }
    }
  }
  return input;
}

export interface PlayerInputState {
  current: string;
  startPressed: boolean;
}

export interface LocalTwoPlayerApi {
  p1: PlayerInputState;
  p2: PlayerInputState;
  frameCount: number;
  isPumping: boolean;
  start: () => void;
  stop: () => void;
}

export function useLocalTwoPlayer(
  game: GameInstance | null,
  enabled: boolean,
  p2KeyboardEnabled: boolean = true
): LocalTwoPlayerApi {
  const p1KeysRef = useRef<Set<string>>(new Set());
  const p2KeysRef = useRef<Set<string>>(new Set());
  const p1StartRef = useRef(false);
  const p2StartRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const gameRef = useRef<GameInstance | null>(game);
  const p2KeyboardRef = useRef(p2KeyboardEnabled);
  // Track whether P1 should be pumped. When `enabled` is false (e.g. AI vs AI
  // watch mode), we must NOT call setExternalPlayerInput(0, ...) at all —
  // otherwise the empty string overrides the engine AI that setPlayerAI(0, n)
  // activated. Mirrors the existing p2KeyboardRef pattern.
  const p1KeyboardRef = useRef(enabled);

  useEffect(() => {
    p2KeyboardRef.current = p2KeyboardEnabled;
  }, [p2KeyboardEnabled]);

  useEffect(() => {
    p1KeyboardRef.current = enabled;
  }, [enabled]);

  const [p1, setP1] = useState<PlayerInputState>({ current: "", startPressed: false });
  const [p2, setP2] = useState<PlayerInputState>({ current: "", startPressed: false });
  const [frameCount, setFrameCount] = useState(0);
  const [isPumping, setIsPumping] = useState(false);

  // Keep gameRef synced with prop
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  // Keyboard capture
  useEffect(() => {
    if (!enabled) return;

    const isP1Key = (code: string) => P1_GAME_KEYS.has(code);
    const isP2Key = (code: string) => P2_GAME_KEYS.has(code);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for game keys (arrows scroll page, space scrolls, etc.)
      if (isP1Key(e.code) || isP2Key(e.code)) {
        e.preventDefault();
      }

      // P1
      if (isP1Key(e.code)) {
        if (P1_START_KEYS.includes(e.code)) {
          if (!e.repeat) p1StartRef.current = true;
        } else if (P1_KEY_MAP[e.code]) {
          p1KeysRef.current.add(e.code);
        }
      }
      // P2
      if (isP2Key(e.code)) {
        if (P2_START_KEYS.includes(e.code)) {
          if (!e.repeat) p2StartRef.current = true;
        } else if (P2_KEY_MAP[e.code]) {
          p2KeysRef.current.add(e.code);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (P1_KEY_MAP[e.code]) p1KeysRef.current.delete(e.code);
      if (P2_KEY_MAP[e.code]) p2KeysRef.current.delete(e.code);
      // Start keys are edge-triggered, not cleared on keyup
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled]);

  // Input pump — requestAnimationFrame loop that pushes inputs to engine
  const pump = useCallback(() => {
    const g = gameRef.current;
    if (!g || !g.Module || typeof g.Module.ccall !== "function") {
      rafRef.current = requestAnimationFrame(pump);
      return;
    }

    const p1Input = keysToMugenInput(p1KeysRef.current, P1_KEY_MAP);
    const p2Input = keysToMugenInput(p2KeysRef.current, P2_KEY_MAP);

    // CRITICAL: use ccall, NOT _setExternalPlayerInput directly.
    // The raw WASM export takes (i32, i32) — a string arg gets coerced
    // to ToInt32("Fa") = 0 (NULL pointer). ccall marshals the string
    // onto the WASM heap and passes a real pointer.
    try {
      // Only pump P1 if its keyboard is enabled (in AI vs AI / watch mode,
      // P1 is engine-AI controlled and must not receive external input).
      if (p1KeyboardRef.current) {
        g.Module.ccall('setExternalPlayerInput', 'void', ['number', 'string'], [0, p1Input]);
      }
      // Only pump P2 if keyboard is enabled (AI/dummy handles P2 in single-player)
      if (p2KeyboardRef.current) {
        g.Module.ccall('setExternalPlayerInput', 'void', ['number', 'string'], [1, p2Input]);
      }
    } catch (e) {
      console.error("[Local2P] Failed to inject input:", e);
    }

    // React state updates (throttled — every frame is fine for display)
    setP1({ current: p1Input, startPressed: p1StartRef.current });
    setP2({ current: p2Input, startPressed: p2StartRef.current });
    p1StartRef.current = false;
    p2StartRef.current = false;

    frameRef.current++;
    setFrameCount(frameRef.current);

    rafRef.current = requestAnimationFrame(pump);
  }, []);

  const start = useCallback(() => {
    if (rafRef.current !== null) return;
    setIsPumping(true);
    rafRef.current = requestAnimationFrame(pump);
  }, [pump]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPumping(false);
    // Clear all inputs on stop
    p1KeysRef.current.clear();
    p2KeysRef.current.clear();
    setP1({ current: "", startPressed: false });
    setP2({ current: "", startPressed: false });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return {
    p1,
    p2,
    frameCount,
    isPumping,
    start,
    stop,
  };
}
