"use client";

import { useEffect, useRef, useState } from "react";
import { loadGameEngine, type GameInstance } from "@/lib/wasm-loader";

interface GameCanvasProps {
  /** Called once when the WASM engine has finished initializing */
  onReady?: (game: GameInstance) => void;
  /**
   * Called after the engine is ready but BEFORE startDirectMatch.
   * Use this to inject character files into the WASM filesystem
   * before the engine tries to load them. Must return a promise
   * that resolves when injection is complete.
   */
  onBeforeStart?: (game: GameInstance) => Promise<void>;
  /** Player 1 character ID (directory name under chars/) — defaults to "Songoku" */
  p1Char?: string;
  /** Player 2 character ID (directory name under chars/) — defaults to "Vegeta" */
  p2Char?: string;
  /** Stage file name (relative to stages/) — defaults to "uiu_campus_low.def" */
  stage?: string;
  /** P1 AI level (0=human, 1-8=AI difficulty). Set after match starts. Only used in AI vs AI / watch mode. */
  p1AILevel?: number;
  /** P2 AI level (0=human, 1-8=AI difficulty). Set after match starts. */
  p2AILevel?: number;
  /**
   * If true, startDirectMatch is called immediately after onBeforeStart.
   * If false, startDirectMatch is deferred until canStart becomes true.
   * Used by online mode to implement the loading barrier — both clients
   * must finish loading before either starts the simulation.
   * Defaults to true (local mode doesn't need the barrier).
   */
  canStart?: boolean;
}

/**
 * GameCanvas — renders the Emscripten WASM game inside a canvas element.
 *
 * The game.js loader script creates the canvas and initializes SDL.
 * We dynamically load game.js, which sets up Module and attaches
 * the canvas to the DOM.
 *
 * The canvas element has id="canvas" (NOT "game-canvas") because Emscripten's
 * SDL2 module looks for `document.getElementById('canvas')` as its default
 * rendering target. Setting Module.canvas also works; we do both for safety.
 */
export default function GameCanvas({ onReady, onBeforeStart, p1Char = "Songoku", p2Char = "Vegeta", stage = "uiu_campus_low.def", p1AILevel = 0, p2AILevel = 0, canStart = true }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  // Ref to track canStart prop changes (for loading barrier in online mode)
  const canStartRef = useRef(canStart);
  useEffect(() => { canStartRef.current = canStart; }, [canStart]);
  const gameRef = useRef<GameInstance | null>(null);

  useEffect(() => {
    let destroyed = false;
    let gamePromise: Promise<GameInstance> | null = null;
    // Hoist timer IDs so the cleanup function can clear them if the
    // component unmounts before the AI poll fires. Without this, the
    // interval keeps running for up to 60s after unmount, calling
    // game.Module.ccall on a destroyed canvas.
    let aiPoll: ReturnType<typeof setInterval> | null = null;
    let aiPollTimeout: ReturnType<typeof setTimeout> | null = null;

    async function init() {
      try {
        setStatus("loading");

        // Set Module.canvas BEFORE loading game.js so SDL2 finds it.
        // Emscripten's SDL2 module looks for Module.canvas first, then
        // falls back to document.getElementById('canvas').
        if (canvasRef.current) {
          const w = window as unknown as { Module?: { canvas?: HTMLCanvasElement } };
          if (!w.Module) w.Module = {} as { canvas?: HTMLCanvasElement };
          w.Module.canvas = canvasRef.current;
        }

        // FIX-2: Set up the onRuntimeInitialized callback BEFORE loading
        // game.js. Emscripten picks up window.Module if set before the script
        // boots, and calls onRuntimeInitialized when the WASM runtime is ready.
        // This replaces the old setTimeout(100) race condition that failed on
        // mobile browsers where init takes seconds.
        gamePromise = loadGameEngine();

        const script = document.createElement("script");
        // H2 fix: use deploy-stable version (git SHA) for cache-busting.
        // Date.now() would re-fetch 13MB on every page load; git SHA lets the
        // browser cache until a new deploy changes the SHA.
        const assetVersion = process.env.GAME_ASSET_VERSION || "dev";
        script.src = `/game/game.js?v=${assetVersion}`;
        script.async = true;

        script.onerror = () => {
          if (!destroyed) {
            setError("Failed to load game.js — WASM build may be missing. Run: npm run build:wasm");
            setStatus("error");
          }
        };

        document.head.appendChild(script);

        try {
          const game = await gamePromise;
          if (destroyed) return;
          gameRef.current = game;
          setStatus("ready");
          // Call onBeforeStart BEFORE startDirectMatch — this injects downloaded
          // character files into the WASM filesystem so the engine can load them.
          if (onBeforeStart) {
            try {
              await onBeforeStart(game);
            } catch (e) {
              console.error("[GameCanvas] onBeforeStart failed:", e);
            }
          }

          // Loading barrier: if canStart is false (online mode), wait for it
          // to become true before starting the match. This ensures both clients
          // have finished loading before either starts the simulation.
          if (!canStartRef.current) {
            console.log("[GameCanvas] Waiting for canStart (loading barrier)...");
            await new Promise<void>((resolve) => {
              const checkInterval = setInterval(() => {
                if (destroyed) {
                  clearInterval(checkInterval);
                  resolve();
                  return;
                }
                if (canStartRef.current) {
                  console.log("[GameCanvas] canStart is true — proceeding with startDirectMatch");
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 100);
            });
          }

          // Start the engine with a direct match (bypasses text-dependent menu screens)
          try {
            game.Module.ccall('startDirectMatch', 'void', ['string', 'string', 'string'], [p1Char, p2Char, stage]);
          } catch (e) {
            console.error("[GameCanvas] _startDirectMatch() threw:", e);
          }

          // Font loading diagnostic — check if fonts loaded successfully
          setTimeout(() => {
            try {
              const fontCount = game.Module.ccall('getLoadedFontCountExport', 'number', [], []) as number;
              const hasFont0 = game.Module.ccall('hasMugenFontExport', 'number', ['number'], [0]) as number;
              console.log(`[FontDiag] Loaded fonts: ${fontCount}, hasFont0: ${hasFont0}`);
            } catch (e) {
              console.error("[FontDiag] Failed to query fonts:", e);
            }
          }, 5000);
          // Set AI levels if specified (non-zero = AI controlled)
          // Poll until fight is active (roundState >= 2), then call setPlayerAI.
          // P1 AI is used in AI-vs-AI / watch mode; P2 AI is used in vsAI and aivsai.
          if (p1AILevel > 0 || p2AILevel > 0) {
            aiPoll = setInterval(() => {
              if (destroyed) {
                if (aiPoll) clearInterval(aiPoll);
                return;
              }
              try {
                const rs = game.Module._getRoundStateExport ? game.Module._getRoundStateExport() : 0;
                if (rs >= 2) {
                  if (p1AILevel > 0) {
                    game.Module.ccall('setPlayerAI', 'void', ['number', 'number'], [0, p1AILevel]);
                  }
                  if (p2AILevel > 0) {
                    game.Module.ccall('setPlayerAI', 'void', ['number', 'number'], [1, p2AILevel]);
                  }
                  if (aiPoll) clearInterval(aiPoll);
                  aiPoll = null;
                }
              } catch (_) {}
            }, 500);
            aiPollTimeout = setTimeout(() => {
              if (aiPoll) {
                clearInterval(aiPoll);
                aiPoll = null;
              }
            }, 60000);
          }
          onReady?.(game);
        } catch (e) {
          if (!destroyed) {
            setError((e as Error).message);
            setStatus("error");
          }
        }
      } catch (e) {
        if (!destroyed) {
          setError((e as Error).message);
          setStatus("error");
        }
      }
    }

    init();

    return () => {
      destroyed = true;
      // Clear the AI poll interval + its safety timeout so they don't
      // keep firing after the component unmounts.
      if (aiPoll) clearInterval(aiPoll);
      if (aiPollTimeout) clearTimeout(aiPollTimeout);
      // NOTE: Do NOT delete window.Module or remove script tags.
      // The old WASM instance's SDL/audio callbacks are still running
      // on the old heap. Deleting Module breaks the JS bindings but
      // leaves the WASM instance alive → "memory access out of bounds".
      // Instead, the matchKey prop forces React to unmount/remount
      // GameCanvas, and loadGameEngine() creates a fresh Module.
    };
  }, [onReady, p1Char, p2Char, stage]);

  return (
    <div ref={containerRef} className="game-container">
      {status === "loading" && (
        <div className="game-loading">
          <div className="game-loading__spinner" />
          <p>Loading game engine...</p>
        </div>
      )}

      {status === "error" && (
        <div className="game-error">
          <p>Error: {error}</p>
          <p className="game-error__hint">
            Run <code>npm run build:wasm</code> to build the game engine.
          </p>
        </div>
      )}

      {/* Canvas with id="canvas" — what Emscripten/SDL2 looks for by default.
          We also set Module.canvas to this element in init() for redundancy.
          Width/height are set explicitly so SDL2 can initialize even when
          the canvas is display:none during loading. The engine's
          setScreenSize(320, 240) will resize if needed. */}
      <canvas
        ref={canvasRef}
        id="canvas"
        className="game-canvas"
        width={320}
        height={240}
      />
    </div>
  );
}
