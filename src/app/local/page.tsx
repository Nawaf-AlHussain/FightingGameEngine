"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import CharacterSelect, { type GameMode } from "@/components/CharacterSelect";
import StageSelect from "@/components/StageSelect";
import { useLocalTwoPlayer } from "@/hooks/use-local-two-player";
import { useFightState } from "@/hooks/use-fight-state";
import type { AIDifficulty } from "@/hooks/use-ai-player";
import type { CharacterInfo } from "@/lib/character-catalog";
import type { StageInfo } from "@/lib/stage-catalog";
import type { GameInstance } from "@/lib/wasm-loader";
import { isCharacterCached, getCachedCharacter, cacheCharacter } from "@/lib/character-cache";
import { downloadCharacter, type DownloadProgress } from "@/lib/character-downloader";
import { injectCharacterIntoWasm, isCharacterInWasm } from "@/lib/wasm-asset-injector";
import { isStageCached, getCachedStage, cacheStage } from "@/lib/stage-cache";
import { downloadStage, type StageDownloadProgress } from "@/lib/stage-downloader";
import { injectStageIntoWasm, isStageInWasm } from "@/lib/wasm-asset-injector";

// GameCanvas is dynamically loaded because it touches `window` (Emscripten)
// and must only render client-side.
const GameCanvas = dynamic(() => import("@/components/GameCanvas"), {
  ssr: false,
  loading: () => <div className="game-loading"><p>Loading engine...</p></div>,
});

type Screen = "select" | "stage-select" | "preparing" | "fight";

/** Download status shown during character preparation */
interface PrepareStatus {
  phase: "checking" | "downloading" | "injecting" | "ready" | "error";
  charId?: string;
  progress?: number;
  message: string;
}

export default function LocalPage() {
  const [screen, setScreen] = useState<Screen>("select");
  const [p1Char, setP1Char] = useState<CharacterInfo | null>(null);
  const [p2Char, setP2Char] = useState<CharacterInfo | null>(null);
  const [stage, setStage] = useState<StageInfo | null>(null);
  const [game, setGame] = useState<GameInstance | null>(null);
  const [matchKey, setMatchKey] = useState(0); // increments on each new match to force GameCanvas remount
  const [mode, setMode] = useState<GameMode>("local2p");
  const [difficulty, setDifficulty] = useState<AIDifficulty>("normal");
  const [p1Difficulty, setP1Difficulty] = useState<AIDifficulty>("normal");
  const [prepareStatus, setPrepareStatus] = useState<PrepareStatus>({
    phase: "checking",
    message: "Preparing...",
  });

  /**
   * Ensure a character is available in the WASM filesystem.
   * If bundled, it's already in game.data — skip.
   * If cached in IndexedDB, inject into WASM FS.
   * If not cached, download from CDN, cache, then inject.
   */
  const prepareCharacter = useCallback(async (
    char: CharacterInfo,
    gameInstance: GameInstance | null
  ): Promise<boolean> => {
    // Bundled characters are already in game.data
    if (char.bundled) return true;

    if (!char.cdnBase || !char.files) {
      console.error(`[Prepare] Character ${char.id} has no CDN info`);
      return false;
    }

    // If already in WASM FS (from a previous match), skip
    if (gameInstance && isCharacterInWasm(gameInstance, char.id)) {
      return true;
    }

    // Check if cached in IndexedDB
    const cached = await isCharacterCached(char.id, char.files);
    let files: Map<string, ArrayBuffer>;

    if (cached) {
      setPrepareStatus({
        phase: "injecting",
        charId: char.id,
        message: `Loading ${char.displayName} from cache...`,
      });
      files = await getCachedCharacter(char.id);
    } else {
      // Download from CDN
      setPrepareStatus({
        phase: "downloading",
        charId: char.id,
        progress: 0,
        message: `Downloading ${char.displayName} (${char.sizeMB}MB)...`,
      });

      try {
        const result = await downloadCharacter(
          char.id,
          char.cdnBase,
          char.files,
          (progress: DownloadProgress) => {
            setPrepareStatus({
              phase: "downloading",
              charId: char.id,
              progress: progress.percent,
              message: `Downloading ${char.displayName}... ${progress.percent.toFixed(0)}%`,
            });
          }
        );
        files = result.files;

        // Cache for next time
        setPrepareStatus({
          phase: "injecting",
          charId: char.id,
          message: `Caching ${char.displayName}...`,
        });
        await cacheCharacter(char.id, files);
      } catch (e) {
        setPrepareStatus({
          phase: "error",
          charId: char.id,
          message: `Failed to download ${char.displayName}: ${e instanceof Error ? e.message : String(e)}`,
        });
        return false;
      }
    }

    // Inject into WASM filesystem (if game instance is available)
    if (gameInstance) {
      setPrepareStatus({
        phase: "injecting",
        charId: char.id,
        message: `Loading ${char.displayName} into engine...`,
      });
      const success = await injectCharacterIntoWasm(gameInstance, char.id, files);
      if (!success) {
        setPrepareStatus({
          phase: "error",
          charId: char.id,
          message: `Failed to load ${char.displayName} into engine`,
        });
        return false;
      }
    }

    return true;
  }, []);

  const handleLockIn = useCallback((
    p1: CharacterInfo,
    p2: CharacterInfo,
    m: GameMode,
    p2Diff?: AIDifficulty,
    p1Diff?: AIDifficulty
  ) => {
    setP1Char(p1);
    setP2Char(p2);
    setMode(m);
    if (p2Diff) setDifficulty(p2Diff);
    if (p1Diff) setP1Difficulty(p1Diff);
    // Move to stage selection screen
    setScreen("stage-select");
  }, []);

  const handleStageLockIn = useCallback((selectedStage: StageInfo) => {
    setStage(selectedStage);
    setScreen("fight");
  }, []);

  const handleStageCancel = useCallback(() => {
    // Go back to character select
    setScreen("select");
    setP1Char(null);
    setP2Char(null);
  }, []);

  const handleCancel = useCallback(() => {
    window.location.href = "/lobby";
  }, []);

  const handleExitMatch = useCallback(() => {
    // The WASM engine cannot be cleanly shut down and restarted in-place
    // (SDL/audio callbacks keep running on the old heap, causing "memory
    // access out of bounds" on reinit). The simplest fix is to reload the
    // page, which gives a fresh WASM instance. This is standard for
    // browser-based WASM games.
    window.location.href = "/local";
  }, []);

  /**
   * Ensure a stage is available in the WASM filesystem.
   * If bundled, it's already in game.data — skip.
   * If cached in IndexedDB, inject into WASM FS.
   * If not cached, download from CDN, cache, then inject.
   */
  const prepareStage = useCallback(async (
    selectedStage: StageInfo,
    gameInstance: GameInstance | null
  ): Promise<boolean> => {
    if (selectedStage.bundled) return true;

    if (!selectedStage.cdnBase || !selectedStage.files) {
      console.error(`[Prepare] Stage ${selectedStage.id} has no CDN info`);
      return false;
    }

    // If already in WASM FS (from a previous match), skip
    if (gameInstance && isStageInWasm(gameInstance, selectedStage.id)) {
      return true;
    }

    // Check if cached in IndexedDB
    const cached = await isStageCached(selectedStage.id, selectedStage.files);
    let files: Map<string, ArrayBuffer>;

    if (cached) {
      setPrepareStatus({
        phase: "injecting",
        charId: selectedStage.id,
        message: `Loading stage ${selectedStage.displayName} from cache...`,
      });
      files = await getCachedStage(selectedStage.id);
    } else {
      setPrepareStatus({
        phase: "downloading",
        charId: selectedStage.id,
        progress: 0,
        message: `Downloading stage ${selectedStage.displayName} (${selectedStage.sizeMB}MB)...`,
      });

      try {
        const result = await downloadStage(
          selectedStage.id,
          selectedStage.cdnBase,
          selectedStage.files,
          (progress: StageDownloadProgress) => {
            setPrepareStatus({
              phase: "downloading",
              charId: selectedStage.id,
              progress: progress.percent,
              message: `Downloading stage ${selectedStage.displayName}... ${progress.percent.toFixed(0)}%`,
            });
          }
        );
        files = result.files;

        setPrepareStatus({
          phase: "injecting",
          charId: selectedStage.id,
          message: `Caching stage ${selectedStage.displayName}...`,
        });
        await cacheStage(selectedStage.id, files);
      } catch (e) {
        setPrepareStatus({
          phase: "error",
          charId: selectedStage.id,
          message: `Failed to download stage ${selectedStage.displayName}: ${e instanceof Error ? e.message : String(e)}`,
        });
        return false;
      }
    }

    if (gameInstance) {
      setPrepareStatus({
        phase: "injecting",
        charId: selectedStage.id,
        message: `Loading stage ${selectedStage.displayName} into engine...`,
      });
      const success = await injectStageIntoWasm(gameInstance, selectedStage.id, files);
      if (!success) {
        setPrepareStatus({
          phase: "error",
          charId: selectedStage.id,
          message: `Failed to load stage ${selectedStage.displayName} into engine`,
        });
        return false;
      }
    }

    return true;
  }, []);

  /**
   * onBeforeStart callback — called by GameCanvas AFTER the engine is ready
   * but BEFORE startDirectMatch. This is where we download and inject
   * character AND stage files into the WASM filesystem so the engine can
   * load them.
   */
  const handleBeforeStart = useCallback(async (gameInstance: GameInstance) => {
    if (!p1Char || !p2Char || !stage) return;

    // Prepare both characters
    const p1Ok = await prepareCharacter(p1Char, gameInstance);
    if (!p1Ok) {
      throw new Error(`Failed to prepare ${p1Char.displayName}`);
    }

    const p2Ok = await prepareCharacter(p2Char, gameInstance);
    if (!p2Ok) {
      throw new Error(`Failed to prepare ${p2Char.displayName}`);
    }

    // Prepare the stage
    const stageOk = await prepareStage(stage, gameInstance);
    if (!stageOk) {
      throw new Error(`Failed to prepare stage ${stage.displayName}`);
    }
  }, [p1Char, p2Char, stage, prepareCharacter, prepareStage]);

  if (screen === "select") {
    return (
      <main className="local-page">
        <CharacterSelect onLockIn={handleLockIn} onCancel={handleCancel} />
      </main>
    );
  }

  if (screen === "stage-select") {
    return (
      <main className="local-page">
        <StageSelect onLockIn={handleStageLockIn} onCancel={handleStageCancel} />
      </main>
    );
  }

  return (
    <main className="local-page local-page--fight">
      <FightScreen
        p1Char={p1Char!}
        p2Char={p2Char!}
        stage={stage!}
        mode={mode}
        difficulty={difficulty}
        p1Difficulty={p1Difficulty}
        onGameReady={setGame}
        onExit={handleExitMatch}
        game={game}
        matchKey={matchKey}
        onBeforeStart={handleBeforeStart}
      />
    </main>
  );
}

interface FightScreenProps {
  p1Char: CharacterInfo;
  p2Char: CharacterInfo;
  stage: StageInfo;
  mode: GameMode;
  difficulty: AIDifficulty;
  p1Difficulty: AIDifficulty;
  game: GameInstance | null;
  matchKey: number;
  onGameReady: (g: GameInstance) => void;
  onExit: () => void;
  onBeforeStart?: (game: GameInstance) => Promise<void>;
}

function FightScreen({ p1Char, p2Char, stage, mode, difficulty, p1Difficulty, game, matchKey, onGameReady, onExit, onBeforeStart }: FightScreenProps) {
  const isSinglePlayer = mode === "vsAI" || mode === "training";
  const isWatchMode = mode === "aivsai";
  // In watch mode, neither player uses the keyboard — both are engine-AI controlled.
  // In single-player (vsAI/training), P1 keyboard is enabled, P2 keyboard is disabled.
  // In local 2P, both keyboards are enabled.
  const p1KeyboardEnabled = !isWatchMode;
  const p2KeyboardEnabled = !isSinglePlayer && !isWatchMode;
  const twoPlayer = useLocalTwoPlayer(game, p1KeyboardEnabled, p2KeyboardEnabled);
  const fightState = useFightState(game);

  // Map difficulty to MUGEN AI level (1-8)
  const aiLevelMap: Record<AIDifficulty, number> = { easy: 2, normal: 5, hard: 8 };
  const p2AILevel = (mode === "vsAI" || isWatchMode) ? aiLevelMap[difficulty] : 0;
  const p1AILevel = isWatchMode ? aiLevelMap[p1Difficulty] : 0;

  // For training mode AND vsAI mode, feed empty input to P2 every frame.
  // This does TWO things:
  //   1. Training mode: keeps P2 standing still (empty input = no movement)
  //   2. vsAI mode: activates P2's external input flag so that
  //      updateInputMaskGeneral() clears the SDL keyboard bits for P2.
  //      Without this, P2's SDL keyboard mapping (U/I/J/K/H/Y keys)
  //      picks up P1's key presses (U/I/J/K) and causes P2 to act.
  //      The engine AI uses mOverrideMask (OR'd in after external input
  //      clearing), so this doesn't interfere with AI control.
  useEffect(() => {
    if (game && (mode === "training" || mode === "vsAI")) {
      const interval = setInterval(() => {
        try {
          game.Module.ccall('setExternalPlayerInput', 'void', ['number', 'string'], [1, '']);
        } catch (_) {}
      }, 16);
      return () => clearInterval(interval);
    }
  }, [game, mode]);

  // Auto-start the input pump when game becomes available
  useEffect(() => {
    if (game && !twoPlayer.isPumping) {
      twoPlayer.start();
    }
  }, [game, twoPlayer]);

  // Exit on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape" && !e.repeat) {
        e.preventDefault();
        onExit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit]);

  const timerSeconds = Math.ceil(fightState.timerFrames / 60);
  const modeLabel = isWatchMode
    ? `AI vs AI (${p1Difficulty} vs ${difficulty})`
    : mode === "vsAI"
      ? `VS AI (${difficulty})`
      : mode === "training"
        ? "Training"
        : "Local 2P";

  // P1 display label: "AI1" in watch mode, "P1" otherwise. Suffix tags for vsAI/training.
  const p1Label = isWatchMode ? "AI1" : "P1";
  const p2Label = isWatchMode ? "AI2" : "P2";
  const p1InputDisplay = isWatchMode ? "(auto)" : (twoPlayer.p1.current || "—");
  const p2InputDisplay = isWatchMode ? "(auto)" : (mode === "local2p" ? (twoPlayer.p2.current || "—") : "(auto)");

  return (
    <div className="fight">
      <div className="fight__hud">
        <div className="fight__player fight__player--p1">
          <div className="fight__player-name">
            {p1Label}: {p1Char.displayName}
            {isWatchMode && ` (AI ${p1Difficulty})`}
          </div>
          <div className="fight__lifebar">
            <div
              className="fight__lifebar-fill fight__lifebar-fill--p1"
              style={{ width: `${(fightState.p1.life / fightState.p1.lifeMax) * 100}%` }}
            />
          </div>
          <div className="fight__player-stats">
            HP: {fightState.p1.life}/{fightState.p1.lifeMax} | Power: {fightState.p1.power} | Wins: {fightState.p1.roundsWon}
          </div>
          <div className="fight__player-input">Input: <code>{p1InputDisplay}</code></div>
        </div>

        <div className="fight__center">
          <div className="fight__mode-label">{modeLabel}</div>
          <div className="fight__round">Round {fightState.roundNumber}</div>
          <div className="fight__timer">{timerSeconds}</div>
          <div className="fight__phase">
            {fightState.phase === "intro" && "Ready?"}
            {fightState.phase === "fighting" && "Fight!"}
            {fightState.phase === "ko" && "K.O.!"}
            {fightState.phase === "round_over" && `${fightState.roundWinner === 0 ? p1Label : p2Label} wins!`}
            {fightState.phase === "match_over" && `${fightState.matchWinner === 0 ? p1Label : p2Label} WINS THE MATCH!`}
          </div>
          <div className="fight__frame">Frame: {twoPlayer.frameCount}</div>
          <button onClick={onExit} className="btn btn--secondary btn--small">
            Exit (Esc)
          </button>
        </div>

        <div className="fight__player fight__player--p2">
          <div className="fight__player-name">
            {p2Label}: {p2Char.displayName}
            {isWatchMode && ` (AI ${difficulty})`}
            {mode === "vsAI" && " (AI)"}
            {mode === "training" && " (Dummy)"}
          </div>
          <div className="fight__lifebar">
            <div
              className="fight__lifebar-fill fight__lifebar-fill--p2"
              style={{ width: `${(fightState.p2.life / fightState.p2.lifeMax) * 100}%` }}
            />
          </div>
          <div className="fight__player-stats">
            HP: {fightState.p2.life}/{fightState.p2.lifeMax} | Power: {fightState.p2.power} | Wins: {fightState.p2.roundsWon}
          </div>
          <div className="fight__player-input">
            Input: <code>{p2InputDisplay}</code>
          </div>
        </div>
      </div>

      <div className="fight__canvas-wrap">
        <GameCanvas key={`match-${matchKey}`} onReady={onGameReady} onBeforeStart={onBeforeStart} p1Char={p1Char.id} p2Char={p2Char.id} stage={`${stage.id}.def`} p1AILevel={p1AILevel} p2AILevel={p2AILevel} />
      </div>

      <div className="fight__controls-help">
        {isWatchMode ? (
          <>
            <div><strong>AI vs AI:</strong> Sit back and watch. P1 AI: {p1Difficulty}, P2 AI: {difficulty}.</div>
            <div>Press <strong>Esc</strong> to exit.</div>
          </>
        ) : (
          <>
            <div><strong>P1:</strong> WASD = move, U/I/O = punch, J/K/L = kick, 1 = start</div>
            {mode === "local2p" && (
              <div><strong>P2:</strong> Arrows = move, 8/9/0 = punch, M/,/. = kick, 2 = start</div>
            )}
            {mode === "vsAI" && (
              <div><strong>AI:</strong> Difficulty: {difficulty} — AI controls P2 automatically</div>
            )}
            {mode === "training" && (
              <div><strong>Training:</strong> P2 stands still. Practice your moves freely.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
