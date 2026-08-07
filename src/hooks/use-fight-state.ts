"use client";

/**
 * useFightState — Polls the WASM engine for game state and manages
 * the fight state machine (rounds, win conditions, KO detection).
 *
 * This hook bridges the gap between the Dolmexica C++ engine (which
 * handles the actual fight simulation) and the React UI (which needs
 * to display round info, lifebars, and win/lose screens).
 *
 * The engine's internal round state:
 *   0 = FADE_IN (transition)
 *   1 = INTRO (round announcement)
 *   2 = FIGHT (active gameplay)
 *   3 = OVER (KO detected, playing KO animation)
 *   4 = WIN_POSE (winner pose, transitioning to next round)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { GameInstance, PlayerStateInfo, RoundStateInfo } from "@/lib/wasm-loader";
import { getPlayerStateInfo, getRoundInfo } from "@/lib/wasm-loader";

export type FightPhase = "loading" | "intro" | "fighting" | "ko" | "round_over" | "match_over";

export interface FightState {
  phase: FightPhase;
  roundNumber: number;
  p1: PlayerStateInfo;
  p2: PlayerStateInfo;
  roundState: RoundStateInfo;
  /** Which player won the current round (0/1), or -1 if not yet decided */
  roundWinner: number;
  /** Which player won the match (0/1), or -1 if match not over */
  matchWinner: number;
  /** Timer (in frames, 60 = 1 second). -1 = no timer. */
  timerFrames: number;
}

const TIMER_FRAMES = 99 * 60; // 99 seconds at 60fps
const ROUNDS_TO_WIN = 2;

export function useFightState(game: GameInstance | null) {
  const [state, setState] = useState<FightState>({
    phase: "loading",
    roundNumber: 1,
    p1: { life: 1000, lifeMax: 1000, power: 0, alive: true, stateNo: 0, roundsWon: 0 },
    p2: { life: 1000, lifeMax: 1000, power: 0, alive: true, stateNo: 0, roundsWon: 0 },
    roundState: { roundNumber: 1, roundState: 2 },
    roundWinner: -1,
    matchWinner: -1,
    timerFrames: TIMER_FRAMES,
  });

  const rafRef = useRef<number | null>(null);
  const timerRef = useRef(TIMER_FRAMES);
  const lastPhaseRef = useRef<FightPhase>("loading");
  const koDetectedRef = useRef(false);
  const matchOverRef = useRef(false);

  const poll = useCallback(() => {
    if (!game || !game.Module) {
      rafRef.current = requestAnimationFrame(poll);
      return;
    }

    const p1 = getPlayerStateInfo(game, 0);
    const p2 = getPlayerStateInfo(game, 1);
    const roundState = getRoundInfo(game);

    // Determine fight phase
    let phase: FightPhase = "fighting";
    let roundWinner = -1;
    let matchWinner = -1;

    // Check for KO (one player dead)
    if (!p1.alive || !p2.alive) {
      if (!koDetectedRef.current) {
        koDetectedRef.current = true;
        phase = "ko";
        roundWinner = p1.alive ? 0 : 1;
      } else {
        phase = "round_over";
        roundWinner = p1.alive ? 0 : 1;
      }
    }

    // Check if match is over (a player won enough rounds)
    if (p1.roundsWon >= ROUNDS_TO_WIN || p2.roundsWon >= ROUNDS_TO_WIN) {
      matchWinner = p1.roundsWon > p2.roundsWon ? 0 : 1;
      matchOverRef.current = true;
      phase = "match_over";
    }

    // Timer countdown during fighting phase
    if (phase === "fighting" && roundState.roundState === 2) {
      if (lastPhaseRef.current !== "fighting") {
        // Just entered fighting — reset timer
        timerRef.current = TIMER_FRAMES;
      }
      timerRef.current = Math.max(0, timerRef.current - 1);

      // Timer expired — whoever has more life wins
      if (timerRef.current === 0 && !koDetectedRef.current) {
        koDetectedRef.current = true;
        roundWinner = p1.life > p2.life ? 0 : (p2.life > p1.life ? 1 : -1);
        phase = "ko";
      }
    } else if (roundState.roundState === 1) {
      phase = "intro";
      koDetectedRef.current = false;
      timerRef.current = TIMER_FRAMES;
    }

    lastPhaseRef.current = phase;

    setState({
      phase,
      roundNumber: roundState.roundNumber,
      p1,
      p2,
      roundState,
      roundWinner,
      matchWinner,
      timerFrames: timerRef.current,
    });

    if (!matchOverRef.current) {
      rafRef.current = requestAnimationFrame(poll);
    }
  }, [game]);

  useEffect(() => {
    if (game) {
      rafRef.current = requestAnimationFrame(poll);
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [game, poll]);

  return state;
}
