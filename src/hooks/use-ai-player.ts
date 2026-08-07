"use client";

/**
 * useAIPlayer — Simple TypeScript AI that controls P2.
 *
 * Reads P1's game state via the state query exports and generates
 * appropriate input strings for P2. Three difficulty levels.
 *
 * This is NOT a MUGEN CNS AI — it's a simple web-layer AI that
 * injects inputs via setExternalPlayerInput, same as a human player.
 */

import { useEffect, useRef, useCallback } from "react";
import type { GameInstance } from "@/lib/wasm-loader";
import { getPlayerStateInfo } from "@/lib/wasm-loader";

export type AIDifficulty = "easy" | "normal" | "hard";

interface AISettings {
  difficulty: AIDifficulty;
  enabled: boolean;
}

// AI behavior parameters by difficulty
const AI_PARAMS: Record<AIDifficulty, {
  reactionFrames: number;  // How many frames before AI reacts
  blockChance: number;     // 0-1 chance to block when attacked
  attackChance: number;    // 0-1 chance to attack when in range
  approachChance: number;  // 0-1 chance to approach when far
  retreatChance: number;   // 0-1 chance to retreat when close
}> = {
  easy:   { reactionFrames: 30, blockChance: 0.2, attackChance: 0.15, approachChance: 0.4, retreatChance: 0.2 },
  normal: { reactionFrames: 15, blockChance: 0.5, attackChance: 0.3,  approachChance: 0.6, retreatChance: 0.3 },
  hard:   { reactionFrames: 8,  blockChance: 0.8, attackChance: 0.5,  approachChance: 0.8, retreatChance: 0.4 },
};

// MUGEN state numbers for reference
const STAND = 0;
const WALK_FWD = 20;
const WALK_BACK = 21;
const CROUCH = 11;
const JUMP = 50;
const ATTACK_STATES = [200, 201, 202, 203, 210, 211, 212, 213, 220, 221, 222, 223, 230, 231, 232, 233, 400, 410, 420, 430, 440, 450, 600, 610, 620, 630, 640, 650];

export function useAIPlayer(
  game: GameInstance | null,
  settings: AISettings
) {
  const settingsRef = useRef(settings);
  const rafRef = useRef<number | null>(null);
  const reactionCounterRef = useRef(0);
  const currentActionRef = useRef("");
  const lastP1StateRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const aiTick = useCallback(() => {
    const g = game;
    if (!g || !g.Module || !settingsRef.current.enabled) {
      rafRef.current = requestAnimationFrame(aiTick);
      return;
    }

    const params = AI_PARAMS[settingsRef.current.difficulty];
    const p1 = getPlayerStateInfo(g, 0);
    const p2 = getPlayerStateInfo(g, 1);

    // Don't act if P2 is dead or in an attack state
    if (!p2.alive) {
      rafRef.current = requestAnimationFrame(aiTick);
      return;
    }

    const isP2Attacking = ATTACK_STATES.includes(p2.stateNo);
    if (isP2Attacking) {
      // Let the attack finish — don't interrupt
      currentActionRef.current = "";
      rafRef.current = requestAnimationFrame(aiTick);
      return;
    }

    // Detect if P1 is attacking (state changed to an attack state)
    const isP1Attacking = ATTACK_STATES.includes(p1.stateNo);
    const p1WasAttacking = ATTACK_STATES.includes(lastP1StateRef.current);
    lastP1StateRef.current = p1.stateNo;

    reactionCounterRef.current++;
    if (reactionCounterRef.current < params.reactionFrames) {
      // Still in reaction delay — keep current action
      if (currentActionRef.current) {
        try {
          g.Module.ccall('setExternalPlayerInput', 'void', ['number', 'string'], [1, currentActionRef.current]);
        } catch (_) {}
      }
      rafRef.current = requestAnimationFrame(aiTick);
      return;
    }
    reactionCounterRef.current = 0;

    // Determine action
    let action = "";

    // Priority 1: Block if P1 is attacking
    if (isP1Attacking && Math.random() < params.blockChance) {
      action = "B"; // Hold back (block)
    }
    // Priority 2: Attack if P1 is close and vulnerable
    else if (p1.stateNo === STAND || p1.stateNo === CROUCH || p1.stateNo === WALK_FWD || p1.stateNo === WALK_BACK) {
      if (Math.random() < params.attackChance) {
        // Randomly choose punch or kick
        const r = Math.random();
        if (r < 0.3) action = "a";       // light punch
        else if (r < 0.5) action = "b";  // medium punch
        else if (r < 0.6) action = "c";  // heavy punch
        else if (r < 0.8) action = "x";  // light kick
        else if (r < 0.95) action = "y"; // medium kick
        else action = "z";               // heavy kick
      }
    }

    // Priority 3: Movement
    if (!action) {
      // P2 is on the right, faces left. Forward = left = B for P2.
      // But in our input system, F = forward (relative to facing).
      // P2 faces left, so F = ArrowLeft = "F" in our map.
      // Walking toward P1 = forward for P2.

      if (Math.random() < params.approachChance) {
        action = "F"; // Walk forward (toward P1)
      } else if (Math.random() < params.retreatChance) {
        action = "B"; // Walk back (away from P1)
      } else if (Math.random() < 0.1) {
        action = "U"; // Jump occasionally
      } else if (Math.random() < 0.1) {
        action = "D"; // Crouch occasionally
      } else {
        action = ""; // Stand still
      }
    }

    currentActionRef.current = action;

    // Inject the AI's input
    try {
      g.Module.ccall('setExternalPlayerInput', 'void', ['number', 'string'], [1, action]);
    } catch (_) {}

    rafRef.current = requestAnimationFrame(aiTick);
  }, [game]);

  useEffect(() => {
    if (game && settings.enabled) {
      rafRef.current = requestAnimationFrame(aiTick);
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [game, settings.enabled, aiTick]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  return { stop };
}
