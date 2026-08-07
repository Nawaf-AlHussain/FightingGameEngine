"use client";
/**
 * Phase 1.5 stub — not yet wired up to any page.
 *
 * Intended use: single-player game input hook (keyboard + touch).
 * Currently the local 2P flow uses useLocalTwoPlayer instead.
 * Kept for future use when single-player modes are added.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { keyboardToInputString, START_KEYS } from "@/lib/wasm-loader";

/**
 * React hook that tracks currently pressed keys and converts them
 * to MUGEN input strings. Supports subscription pattern so
 * multiple consumers (local play + relay) can react to inputs.
 *
 * FIX-4: Start (Q/Enter) is edge-triggered, not held. MUGEN's Start
 * button is an event (round start, pause toggle), so sending it every
 * frame while held would cause repeated triggers. Use consumeStart()
 * to read and clear the Start flag.
 */

type InputSubscriber = (input: string, frame: number) => void;

export function useGameInput() {
  const activeKeysRef = useRef<Set<string>>(new Set());
  const subscribersRef = useRef<Set<InputSubscriber>>(new Set());
  const frameRef = useRef(0);
  const startPressedRef = useRef(false); // FIX-4: edge-triggered Start flag
  const [lastInput, setLastInput] = useState("");

  const subscribe = useCallback((fn: InputSubscriber) => {
    subscribersRef.current.add(fn);
    return () => {
      subscribersRef.current.delete(fn);
    };
  }, []);

  const getCurrentInput = useCallback((): string => {
    return keyboardToInputString(activeKeysRef.current);
  }, []);

  /** FIX-4: Read and clear the Start flag. Returns true once per Start press. */
  const consumeStart = useCallback((): boolean => {
    if (startPressedRef.current) {
      startPressedRef.current = false;
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    const isGameKey = (code: string): boolean => {
      return code.startsWith("Arrow") ||
        ["KeyZ", "KeyX", "KeyC", "KeyA", "KeyS", "KeyD", "KeyQ", "Enter"].includes(code);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for game keys (arrows, etc.)
      if (isGameKey(e.code)) {
        e.preventDefault();
      }

      // FIX-4: Start is edge-triggered — only fire on initial keydown, not auto-repeat.
      // KeyboardEvent.repeat is true for auto-repeated keydown events.
      if (START_KEYS.includes(e.code) && !e.repeat) {
        startPressedRef.current = true;
      }

      // Don't add Start keys to activeKeysRef — they're not part of MUGEN input string
      if (!START_KEYS.includes(e.code)) {
        activeKeysRef.current.add(e.code);
      }

      const input = keyboardToInputString(activeKeysRef.current);
      setLastInput(input);
      subscribersRef.current.forEach((fn) => fn(input, frameRef.current));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Start keys are not in activeKeysRef, but we still preventDefault
      if (!START_KEYS.includes(e.code)) {
        activeKeysRef.current.delete(e.code);
      }

      const input = keyboardToInputString(activeKeysRef.current);
      setLastInput(input);
      subscribersRef.current.forEach((fn) => fn(input, frameRef.current));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return {
    /** Current MUGEN input string (reactive, excludes Start) */
    lastInput,
    /** Get current input without subscribing */
    getCurrentInput,
    /** Subscribe to input changes. Returns unsubscribe function. */
    subscribe,
    /** FIX-4: Check if Start was pressed since last call. Returns true once per press. */
    consumeStart,
    /** Advance the frame counter (call each engine tick) */
    advanceFrame: () => {
      frameRef.current++;
    },
    /** Reset frame counter */
    resetFrame: () => {
      frameRef.current = 0;
    },
  };
}
