"use client";

/**
 * Online Multiplayer Page
 *
 * Flow:
 *   1. Lobby — create or join a room
 *   2. Waiting — host waits for guest to join (shows room code to share)
 *   3. Character Select — both players pick characters (synced via relay)
 *   4. Stage Select — host picks stage (guest sees selection)
 *   5. Preparing — download/inject characters + stage into WASM
 *   6. Fight — lockstep input pump (Phase 4.3)
 *
 * The relay server is at wss://fge-relay.syllabai.deno.net/ws
 * (see src/lib/relay-client.ts)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { RelayClient, RELAY_URL } from "@/lib/relay-client";
import type {
  GameStartMsg,
  PlayerJoinedMsg,
  PlayerLeftMsg,
  CharacterSelectedMsg,
  StageSelectedMsg,
  PlayerReadyMsg,
  ErrorMsg,
} from "@/lib/relay-client";
import {
  getBundledCharacters,
  type CharacterInfo,
} from "@/lib/character-catalog";
import { getAllCharacters } from "@/lib/character-manifest";
import { isCharacterCached, cacheCharacter } from "@/lib/character-cache";
import { downloadCharacter, type DownloadProgress } from "@/lib/character-downloader";
import { getBundledStages, type StageInfo } from "@/lib/stage-catalog";
import { getAllStages } from "@/lib/character-manifest";
import { isStageCached, cacheStage } from "@/lib/stage-cache";
import { downloadStage, type StageDownloadProgress } from "@/lib/stage-downloader";
import {
  injectCharacterIntoWasm,
  injectStageIntoWasm,
  isCharacterInWasm,
  isStageInWasm,
} from "@/lib/wasm-asset-injector";
import type { GameInstance } from "@/lib/wasm-loader";
import { useOnlineMultiplayer } from "@/hooks/use-online-multiplayer";

// GameCanvas is dynamically loaded (touches window/Emscripten)
const GameCanvas = dynamic(() => import("@/components/GameCanvas"), {
  ssr: false,
  loading: () => <div className="game-loading"><p>Loading engine...</p></div>,
});

// =============================================================================
// Types
// =============================================================================

type Screen =
  | "lobby"
  | "waiting"
  | "char-select"
  | "stage-select"
  | "preparing"
  | "fight"
  | "rematch"
  | "error";

interface OnlineState {
  relay: RelayClient | null;
  roomCode: string | null;
  mySlot: 1 | 2 | null;
  inputDelay: number;
  remoteCharacter: string | null;
  remoteStage: string | null;
  remoteReady: boolean;
  myCharacter: CharacterInfo | null;
  myStage: StageInfo | null;
  myReady: boolean;
  matchConfig: {
    p1Char: string;
    p2Char: string;
    stage: string;
    inputDelay: number;
    startTime: number;  // Synchronized start timestamp (ms)
    rngSeed: number;    // Shared RNG seed for determinism
  } | null;
}

interface PrepareStatus {
  phase: "checking" | "downloading" | "injecting" | "ready" | "error";
  message: string;
  progress?: number;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// =============================================================================
// Main component
// =============================================================================

export default function OnlinePage() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [state, setState] = useState<OnlineState>({
    relay: null,
    roomCode: null,
    mySlot: null,
    inputDelay: 5,
    remoteCharacter: null,
    remoteStage: null,
    remoteReady: false,
    myCharacter: null,
    myStage: null,
    myReady: false,
    matchConfig: null,
  });
  const [error, setError] = useState<string>("");
  const [joinCode, setJoinCode] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [prepareStatus, setPrepareStatus] = useState<PrepareStatus>({
    phase: "checking",
    message: "Preparing...",
  });
  const [game, setGame] = useState<GameInstance | null>(null);
  const [matchCanStart, setMatchCanStart] = useState(false);
  const [matchKey, setMatchKey] = useState(0);

  const sessionIdRef = useRef<string>(generateSessionId());

  // ===========================================================================
  // Relay event handlers
  // ===========================================================================

  const setupRelayHandlers = useCallback((relay: RelayClient) => {
    relay.on("room_created", (msg) => {
      const m = msg as unknown as { room_code: string; slot: number; input_delay: number };
      setState(s => ({
        ...s,
        relay,
        roomCode: m.room_code,
        mySlot: m.slot as 1 | 2,
        inputDelay: m.input_delay,
      }));
      setScreen("waiting");
    });

    relay.on("room_joined", (msg) => {
      const m = msg as unknown as { room_code: string; slot: number; input_delay: number };
      setState(s => ({
        ...s,
        relay,
        roomCode: m.room_code,
        mySlot: m.slot as 1 | 2,
        inputDelay: m.input_delay,
      }));
      setScreen("char-select");
    });

    relay.on("player_joined", (msg) => {
      setState(s => ({ ...s, relay }));
      setScreen("char-select");
    });

    relay.on("player_left", () => {
      // Show "Opponent Left" regardless of which screen we're on
      setError("Opponent left the match.");
      setScreen("error");
    });

    relay.on("character_selected", (msg) => {
      const m = msg as CharacterSelectedMsg;
      setState(s => {
        // Auto-advance to stage select when both players have selected characters
        // and this player has locked in
        if (s.myReady && s.myCharacter && m.character) {
          setTimeout(() => {
            setState(prev => ({ ...prev, myReady: false, remoteReady: false }));
            setScreen("stage-select");
          }, 300);
        }
        return { ...s, remoteCharacter: m.character };
      });
    });

    relay.on("stage_selected", (msg) => {
      const m = msg as StageSelectedMsg;
      setState(s => {
        // Guest: adopt the host's stage selection so handleStageLockIn can send 'ready'
        const stageId = m.stage.replace(/\.def$/, "");
        if (!s.myStage || s.myStage.id !== stageId) {
          // Create a minimal StageInfo so handleStageLockIn's `s.myStage` check passes
          return {
            ...s,
            remoteStage: m.stage,
            myStage: {
              id: stageId,
              displayName: stageId,
              author: "",
              description: "",
              sizeMB: 0,
              bundled: true, // treat as bundled for prep purposes (host downloads it)
            },
          };
        }
        return { ...s, remoteStage: m.stage };
      });
    });

    relay.on("player_ready", () => {
      // 'ready' is only sent during stage select now (not character select).
      // This means the opponent is ready to start the match.
      setState(s => ({ ...s, remoteReady: true }));
    });

    relay.on("game_start", (msg) => {
      const m = msg as GameStartMsg;
      setState(s => ({
        ...s,
        matchConfig: {
          p1Char: m.p1_char,
          p2Char: m.p2_char,
          stage: m.stage,
          inputDelay: m.input_delay,
          startTime: m.start_time,
          rngSeed: m.rng_seed,
        },
      }));
      // Reset game state for rematch (or first match)
      setGame(null);
      setMatchCanStart(false);
      setMatchKey(k => k + 1); // force GameCanvas to remount
      setScreen("fight");
    });

    relay.on("match_can_start", () => {
      // Both clients finished loading — safe to start the simulation.
      // The OnlineFight component will start the pump when it receives this.
      console.log("[Online] Both clients loading ready — match can start");
      setMatchCanStart(true);
    });

    relay.on("error", (msg) => {
      const m = msg as ErrorMsg;
      setError(`${m.code}: ${m.message}`);
      setScreen("error");
    });
  }, []);

  // ===========================================================================
  // Lobby actions
  // ===========================================================================

  const handleCreateRoom = useCallback(async () => {
    setError("");
    try {
      // Reuse existing relay connection if still connected, otherwise create new
      let relay = state.relay;
      if (!relay || !relay.isConnected()) {
        // Disconnect old relay if it exists but isn't connected
        if (relay) relay.disconnect();
        relay = new RelayClient(RELAY_URL, sessionIdRef.current);
        await relay.connect();
        setupRelayHandlers(relay);
      }
      relay.createRoom();
    } catch (e) {
      setError(`Failed to connect to relay: ${e instanceof Error ? e.message : String(e)}`);
      setScreen("error");
    }
  }, [setupRelayHandlers, state.relay]);

  const handleJoinRoom = useCallback(async (code: string) => {
    if (code.length !== 6) {
      setError("Room code must be 6 characters");
      return;
    }
    setError("");
    try {
      // Reuse existing relay connection if still connected, otherwise create new
      let relay = state.relay;
      if (!relay || !relay.isConnected()) {
        if (relay) relay.disconnect();
        relay = new RelayClient(RELAY_URL, sessionIdRef.current);
        await relay.connect();
        setupRelayHandlers(relay);
      }
      relay.joinRoom(code);
    } catch (e) {
      setError(`Failed to connect to relay: ${e instanceof Error ? e.message : String(e)}`);
      setScreen("error");
    }
  }, [setupRelayHandlers, state.relay]);

  // ===========================================================================
  // Character/stage select
  // ===========================================================================

  const handleCharacterSelect = useCallback((char: CharacterInfo) => {
    setState(s => {
      if (s.relay) s.relay.setCharacter(char.id);
      return { ...s, myCharacter: char, myReady: false };
    });
  }, []);

  // Character lock-in: mark locally ready, but DON'T send 'ready' to relay.
  // The relay 'ready' signal is reserved for stage select (which triggers game_start).
  // When both players have locked in characters locally, we auto-advance to stage select.
  const handleCharacterLockIn = useCallback(() => {
    setState(s => {
      // Auto-advance to stage select when both players have selected characters
      if (s.remoteCharacter && s.myCharacter) {
        // Reset ready flags for stage select phase
        setTimeout(() => {
          setState(prev => ({ ...prev, myReady: false, remoteReady: false }));
          setScreen("stage-select");
        }, 300);
      }
      return { ...s, myReady: true };
    });
  }, []);

  const handleStageSelect = useCallback((stage: StageInfo) => {
    setState(s => {
      if (s.relay) s.relay.setStage(`${stage.id}.def`);
      return { ...s, myStage: stage };
    });
  }, []);

  // Stage lock-in: this is the ONLY place we send 'ready' to the relay.
  // The relay fires game_start when both players are ready.
  // - Host: presses U after picking the stage
  // - Guest: presses U after seeing the host's stage pick
  const handleStageLockIn = useCallback(() => {
    setState(s => {
      if (s.relay && s.myStage) s.relay.sendReady();
      return { ...s, myReady: true };
    });
  }, []);

  // ===========================================================================
  // Exit match (stable callback — avoids re-rendering GameCanvas)
  // ===========================================================================

  const handleExitMatch = useCallback(() => {
    // The WASM engine cannot be cleanly shut down and restarted in-place.
    // Reload the page to get a fresh WASM instance. The relay connection
    // is lost, but the player can create/join a new room on the fresh page.
    if (state.relay) {
      state.relay.leaveRoom();
      state.relay.disconnect();
    }
    window.location.href = "/online";
  }, [state.relay]);

  // ===========================================================================
  // Rematch — both players must press rematch to start a new match
  // ===========================================================================

  const handleRematchRequest = useCallback(() => {
    setState(s => {
      if (s.relay) {
        // Re-send ready to trigger a new game_start when both ready
        s.relay.sendReady();
      }
      return { ...s, myReady: true, remoteReady: false };
    });
    setScreen("rematch");
  }, []);

  const handleRematchCancel = useCallback(() => {
    // Go back to the fight (not exit) — user changed their mind
    setState(s => ({ ...s, myReady: false }));
    setScreen("fight");
  }, []);

  // ===========================================================================
  // Prepare assets
  // ===========================================================================

  const prepareCharacter = useCallback(async (
    char: CharacterInfo,
    gameInstance: GameInstance | null
  ): Promise<boolean> => {
    if (char.bundled) return true;
    if (!char.cdnBase || !char.files) return false;
    if (gameInstance && isCharacterInWasm(gameInstance, char.id)) return true;

    const cached = await isCharacterCached(char.id, char.files);
    let files: Map<string, ArrayBuffer>;

    if (cached) {
      const { getCachedCharacter } = await import("@/lib/character-cache");
      files = await getCachedCharacter(char.id);
    } else {
      setPrepareStatus({
        phase: "downloading",
        message: `Downloading ${char.displayName} (${char.sizeMB}MB)...`,
        progress: 0,
      });
      try {
        const result = await downloadCharacter(
          char.id, char.cdnBase, char.files,
          (progress: DownloadProgress) => {
            setPrepareStatus({
              phase: "downloading",
              message: `Downloading ${char.displayName}... ${progress.percent.toFixed(0)}%`,
              progress: progress.percent,
            });
          }
        );
        files = result.files;
        await cacheCharacter(char.id, files);
      } catch (e) {
        setPrepareStatus({
          phase: "error",
          message: `Failed to download ${char.displayName}: ${e instanceof Error ? e.message : String(e)}`,
        });
        return false;
      }
    }

    if (gameInstance) {
      setPrepareStatus({
        phase: "injecting",
        message: `Loading ${char.displayName} into engine...`,
      });
      const ok = await injectCharacterIntoWasm(gameInstance, char.id, files);
      if (!ok) {
        setPrepareStatus({ phase: "error", message: `Failed to load ${char.displayName}` });
        return false;
      }
    }
    return true;
  }, []);

  const prepareStage = useCallback(async (
    stage: StageInfo,
    gameInstance: GameInstance | null
  ): Promise<boolean> => {
    if (stage.bundled) return true;
    if (!stage.cdnBase || !stage.files) return false;
    if (gameInstance && isStageInWasm(gameInstance, stage.id)) return true;

    const cached = await isStageCached(stage.id, stage.files);
    let files: Map<string, ArrayBuffer>;

    if (cached) {
      const { getCachedStage } = await import("@/lib/stage-cache");
      files = await getCachedStage(stage.id);
    } else {
      setPrepareStatus({
        phase: "downloading",
        message: `Downloading stage ${stage.displayName} (${stage.sizeMB}MB)...`,
        progress: 0,
      });
      try {
        const result = await downloadStage(
          stage.id, stage.cdnBase, stage.files,
          (progress: StageDownloadProgress) => {
            setPrepareStatus({
              phase: "downloading",
              message: `Downloading stage ${stage.displayName}... ${progress.percent.toFixed(0)}%`,
              progress: progress.percent,
            });
          }
        );
        files = result.files;
        await cacheStage(stage.id, files);
      } catch (e) {
        setPrepareStatus({
          phase: "error",
          message: `Failed to download stage: ${e instanceof Error ? e.message : String(e)}`,
        });
        return false;
      }
    }

    if (gameInstance) {
      setPrepareStatus({
        phase: "injecting",
        message: `Loading stage ${stage.displayName} into engine...`,
      });
      const ok = await injectStageIntoWasm(gameInstance, stage.id, files);
      if (!ok) {
        setPrepareStatus({ phase: "error", message: `Failed to load stage` });
        return false;
      }
    }
    return true;
  }, []);

  const handleBeforeStart = useCallback(async (gameInstance: GameInstance) => {
    const myChar = state.myCharacter;
    const matchConfig = state.matchConfig;
    if (!myChar || !matchConfig) return;

    // Set the shared RNG seed BEFORE startDirectMatch — both clients must
    // start with the same seed for determinism (AI, hit sparks, etc.)
    try {
      gameInstance.Module.ccall('setRandomSeedExport', 'void', ['number'], [matchConfig.rngSeed]);
      console.log(`[Online] Set RNG seed: ${matchConfig.rngSeed}`);
    } catch (e) {
      console.warn('[Online] Failed to set RNG seed:', e);
    }

    const opponentCharId = state.mySlot === 1 ? matchConfig.p2Char : matchConfig.p1Char;
    const allChars = await getAllCharacters(getBundledCharacters());
    const opponentChar = allChars.find(c => c.id === opponentCharId);

    const myOk = await prepareCharacter(myChar, gameInstance);
    if (!myOk) throw new Error(`Failed to prepare ${myChar.displayName}`);

    if (opponentChar) {
      const oppOk = await prepareCharacter(opponentChar, gameInstance);
      if (!oppOk) throw new Error(`Failed to prepare opponent ${opponentChar.displayName}`);
    }

    const stageId = matchConfig.stage.replace(/\.def$/, "");
    const allStages = await getAllStages(getBundledStages());
    const stage = allStages.find(s => s.id === stageId);
    if (stage) {
      const stageOk = await prepareStage(stage, gameInstance);
      if (!stageOk) throw new Error(`Failed to prepare stage ${stage.displayName}`);
    }

    // Tell the relay we're done loading. The relay waits for both clients
    // to send loading_ready before broadcasting match_can_start.
    if (state.relay) {
      state.relay.sendLoadingReady();
      console.log("[Online] Sent loading_ready — waiting for opponent to finish loading");
    }
  }, [state.myCharacter, state.matchConfig, state.mySlot, state.relay, prepareCharacter, prepareStage]);

  // ===========================================================================
  // Periodic latency check
  // ===========================================================================

  useEffect(() => {
    if (!state.relay || !state.relay.isConnected()) return;
    const interval = setInterval(async () => {
      const result = await state.relay!.sendPing();
      setLatency(result.rtt >= 0 ? result.rtt : null);
    }, 5000);
    return () => clearInterval(interval);
  }, [state.relay]);

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  useEffect(() => {
    return () => {
      if (state.relay) {
        state.relay.leaveRoom();
        state.relay.disconnect();
      }
    };
  }, [state.relay]);

  // ===========================================================================
  // Auto-advance from preparing to fight when GameCanvas is ready
  // ===========================================================================

  // The "preparing" screen shows while GameCanvas initializes.
  // When GameCanvas is ready (onReady), handleBeforeStart runs, then
  // GameCanvas calls startDirectMatch. The "preparing" screen is just
  // a loading screen — we transition to "fight" when game is ready.

  // ===========================================================================
  // Render
  // ===========================================================================

  if (screen === "lobby") {
    return (
      <OnlineLobby
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        joinCode={joinCode}
        setJoinCode={setJoinCode}
        error={error}
      />
    );
  }

  if (screen === "waiting") {
    return (
      <WaitingRoom
        roomCode={state.roomCode!}
        latency={latency}
        onCancel={() => {
          state.relay?.leaveRoom();
          state.relay?.disconnect();
          setScreen("lobby");
        }}
      />
    );
  }

  if (screen === "char-select") {
    return (
      <OnlineCharacterSelect
        mySlot={state.mySlot!}
        myCharacter={state.myCharacter}
        remoteCharacter={state.remoteCharacter}
        myReady={state.myReady}
        remoteReady={state.remoteReady}
        onSelect={handleCharacterSelect}
        onLockIn={handleCharacterLockIn}
        onCancel={() => {
          state.relay?.leaveRoom();
          state.relay?.disconnect();
          setScreen("lobby");
        }}
        latency={latency}
      />
    );
  }

  if (screen === "stage-select") {
    return (
      <OnlineStageSelect
        mySlot={state.mySlot!}
        myStage={state.myStage}
        remoteStage={state.remoteStage}
        myReady={state.myReady}
        remoteReady={state.remoteReady}
        onSelect={handleStageSelect}
        onLockIn={handleStageLockIn}
        onCancel={() => {
          state.relay?.leaveRoom();
          state.relay?.disconnect();
          setScreen("lobby");
        }}
        latency={latency}
      />
    );
  }

  if (screen === "preparing") {
    // This screen is no longer reached (game_start goes straight to "fight"),
    // but kept as a fallback in case state gets into this screen somehow.
    return <PreparingScreen status={prepareStatus} />;
  }

  if (screen === "fight" && state.matchConfig) {
    const myCharId = state.mySlot === 1 ? state.matchConfig.p1Char : state.matchConfig.p2Char;
    const oppCharId = state.mySlot === 1 ? state.matchConfig.p2Char : state.matchConfig.p1Char;
    return (
      <OnlineFight
        mySlot={state.mySlot!}
        myCharId={myCharId}
        oppCharId={oppCharId}
        stage={state.matchConfig.stage}
        relay={state.relay!}
        inputDelay={state.matchConfig.inputDelay}
        startTime={state.matchConfig.startTime}
        game={game}
        matchCanStart={matchCanStart}
        matchKey={matchKey}
        onBeforeStart={handleBeforeStart}
        onGameReady={setGame}
        onExit={handleExitMatch}
        onRematch={handleRematchRequest}
        latency={latency}
        prepareStatus={prepareStatus}
      />
    );
  }

  if (screen === "rematch") {
    return (
      <div className="char-select">
        <h1 className="char-select__title">REMATCH?</h1>
        <div style={{ textAlign: "center", margin: "40px 0" }}>
          <p style={{ fontSize: "18px", marginBottom: "20px" }}>
            You requested a rematch.
          </p>
          <p className="char-status__sub">
            {state.remoteReady ? "✓ Opponent is ready!" : "Waiting for opponent..."}
          </p>
          <div style={{ marginTop: "20px" }}>
            <button onClick={handleRematchCancel} className="btn btn--secondary">
              Cancel (Esc)
            </button>
          </div>
        </div>
        <EscHandler onEsc={handleRematchCancel} />
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="char-select">
        <h1 className="char-select__title">Error</h1>
        <p style={{ color: "#f88", textAlign: "center", margin: "20px 0" }}>{error}</p>
        <div style={{ textAlign: "center" }}>
          <button
            onClick={() => {
              if (state.relay) {
                state.relay.leaveRoom();
                state.relay.disconnect();
              }
              // Reload the page to get a fresh WASM instance
              window.location.href = "/online";
            }}
            className="btn btn--primary"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// =============================================================================
// Sub-component: OnlineLobby
// =============================================================================

interface OnlineLobbyProps {
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  joinCode: string;
  setJoinCode: (s: string) => void;
  error: string;
}

function OnlineLobby({ onCreateRoom, onJoinRoom, joinCode, setJoinCode, error }: OnlineLobbyProps) {
  const [connectionTest, setConnectionTest] = useState<{
    status: "idle" | "testing" | "ok" | "fail";
    message: string;
    details?: string;
  }>({ status: "idle", message: "" });

  const testConnection = useCallback(async () => {
    setConnectionTest({ status: "testing", message: "Testing connection..." });
    try {
      // Step 1: Health check (HTTP)
      const healthResp = await fetch("https://fge-relay.syllabai.deno.net/", {
        cache: "no-store",
      });
      if (!healthResp.ok) {
        setConnectionTest({
          status: "fail",
          message: `Health check failed: HTTP ${healthResp.status}`,
        });
        return;
      }
      const health = await healthResp.json();
      console.log("[ConnectionTest] Health check OK:", health);

      // Step 2: WebSocket test
      setConnectionTest({ status: "testing", message: "Health OK. Testing WebSocket..." });
      const testRelay = new RelayClient(RELAY_URL, "test-" + Date.now());
      await testRelay.connect();
      testRelay.disconnect();

      setConnectionTest({
        status: "ok",
        message: "✓ Connection successful! Relay is reachable and WebSocket works.",
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setConnectionTest({
        status: "fail",
        message: "✗ Connection failed",
        details: errMsg,
      });
    }
  }, []);

  return (
    <div className="char-select">
      <h1 className="char-select__title">ONLINE MULTIPLAYER</h1>
      <p className="char-status__sub" style={{ textAlign: "center", marginBottom: "20px" }}>
        Play against a friend over the internet. Share your room code to invite.
      </p>

      {/* Connection test */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <button
          onClick={testConnection}
          disabled={connectionTest.status === "testing"}
          className={`btn btn--small ${connectionTest.status === "ok" ? "btn--primary" : "btn--secondary"}`}
        >
          {connectionTest.status === "testing" ? "Testing..." : "Test Connection"}
        </button>
        {connectionTest.status !== "idle" && connectionTest.status !== "testing" && (
          <div style={{ marginTop: "8px" }}>
            <p style={{
              color: connectionTest.status === "ok" ? "#6f6" : "#f88",
              fontSize: "13px",
              margin: "4px 0",
            }}>
              {connectionTest.message}
            </p>
            {connectionTest.details && (
              <pre style={{
                color: "#f88",
                fontSize: "11px",
                textAlign: "left",
                background: "#1a1a1a",
                padding: "8px 12px",
                borderRadius: "4px",
                marginTop: "8px",
                whiteSpace: "pre-wrap",
                maxWidth: "600px",
                margin: "8px auto",
              }}>
                {connectionTest.details}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="char-select__grid" style={{ gridTemplateColumns: "1fr", maxWidth: "500px", margin: "0 auto" }}>
        <button
          className="char-card char-card--p1"
          onClick={onCreateRoom}
          style={{ cursor: "pointer" }}
        >
          <div className="char-card__name">Create Room</div>
          <div className="char-card__desc">
            Start a new match. You&apos;ll get a 6-character code to share with your opponent.
          </div>
        </button>

        <div className="char-card" style={{ cursor: "default" }}>
          <div className="char-card__name">Join Room</div>
          <div className="char-card__desc">
            Enter the 6-character code your opponent shared with you.
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <input
              type="text"
              placeholder="ABC123"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: "18px",
                letterSpacing: "4px",
                textAlign: "center",
                background: "#1a1a1a",
                border: "1px solid #444",
                color: "#fff",
                borderRadius: "4px",
              }}
            />
            <button
              onClick={() => onJoinRoom(joinCode)}
              disabled={joinCode.length !== 6}
              className={`btn ${joinCode.length === 6 ? "btn--primary" : "btn--secondary"}`}
            >
              Join
            </button>
          </div>
        </div>
      </div>

      {error && (
        <pre style={{
          color: "#f88",
          textAlign: "center",
          marginTop: "20px",
          whiteSpace: "pre-wrap",
          fontSize: "13px",
          maxWidth: "600px",
          margin: "20px auto",
        }}>
          {error}
        </pre>
      )}

      <div className="char-select__controls">
        <div>
          <a href="/lobby" className="btn btn--secondary">← Back to Lobby</a>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-component: WaitingRoom
// =============================================================================

interface WaitingRoomProps {
  roomCode: string;
  latency: number | null;
  onCancel: () => void;
}

function WaitingRoom({ roomCode, latency, onCancel }: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomCode]);

  return (
    <div className="char-select">
      <h1 className="char-select__title">WAITING FOR OPPONENT</h1>

      <div style={{ textAlign: "center", margin: "40px 0" }}>
        <p className="char-status__sub">Share this code with your opponent:</p>
        <div
          style={{
            fontSize: "48px",
            fontWeight: "bold",
            letterSpacing: "12px",
            color: "#6f6",
            margin: "20px 0",
            fontFamily: "monospace",
          }}
        >
          {roomCode}
        </div>
        <button onClick={copyCode} className="btn btn--primary">
          {copied ? "✓ Copied!" : "Copy Code"}
        </button>
      </div>

      <div style={{ textAlign: "center", margin: "20px 0" }}>
        <div className="game-loading__spinner" style={{ margin: "0 auto 12px" }} />
        <p className="char-status__sub">Waiting for opponent to join...</p>
        {latency !== null && (
          <p className="char-status__sub">Relay latency: {latency}ms</p>
        )}
      </div>

      <div className="char-select__controls">
        <div>
          <button onClick={onCancel} className="btn btn--secondary">Cancel (Esc)</button>
        </div>
      </div>

      <EscHandler onEsc={onCancel} />
    </div>
  );
}

// =============================================================================
// Sub-component: OnlineCharacterSelect
// =============================================================================

interface OnlineCharacterSelectProps {
  mySlot: 1 | 2;
  myCharacter: CharacterInfo | null;
  remoteCharacter: string | null;
  myReady: boolean;
  remoteReady: boolean;
  onSelect: (char: CharacterInfo) => void;
  onLockIn: () => void;
  onCancel: () => void;
  latency: number | null;
}

function OnlineCharacterSelect({
  mySlot, myCharacter, remoteCharacter, myReady, remoteReady,
  onSelect, onLockIn, onCancel, latency,
}: OnlineCharacterSelectProps) {
  const [characters, setCharacters] = useState<CharacterInfo[]>(getBundledCharacters());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloadStates, setDownloadStates] = useState<Record<string, { status: string; progress?: number }>>({});

  useEffect(() => {
    (async () => {
      const all = await getAllCharacters(getBundledCharacters());
      setCharacters(all);
      const states: Record<string, { status: string }> = {};
      for (const char of all) {
        if (!char.bundled && char.files) {
          const cached = await isCharacterCached(char.id, char.files);
          states[char.id] = { status: cached ? "cached" : "idle" };
        }
      }
      setDownloadStates(states);
    })();
  }, []);

  const isCharReady = (char: CharacterInfo): boolean => {
    if (char.bundled) return true;
    return downloadStates[char.id]?.status === "cached";
  };

  const triggerDownload = useCallback(async (char: CharacterInfo) => {
    if (!char.cdnBase || !char.files) return;
    if (downloadStates[char.id]?.status === "downloading") return;
    if (downloadStates[char.id]?.status === "cached") return;

    setDownloadStates(prev => ({ ...prev, [char.id]: { status: "downloading", progress: 0 } }));
    try {
      const result = await downloadCharacter(char.id, char.cdnBase, char.files, (progress) => {
        setDownloadStates(prev => ({
          ...prev,
          [char.id]: { status: "downloading", progress: progress.percent },
        }));
      });
      await cacheCharacter(char.id, result.files);
      setDownloadStates(prev => ({ ...prev, [char.id]: { status: "cached" } }));
    } catch {
      setDownloadStates(prev => ({ ...prev, [char.id]: { status: "error" } }));
    }
  }, [downloadStates]);

  const remoteCharInfo = characters.find(c => c.id === remoteCharacter);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.code === "Escape" && !e.repeat) {
      e.preventDefault();
      onCancel();
      return;
    }
    if (myReady) return;

    if ((e.code === "KeyU" || e.code === "Enter") && !e.repeat) {
      e.preventDefault();
      const char = characters[selectedIndex];
      if (!char) return;
      if (!isCharReady(char)) {
        triggerDownload(char);
        return;
      }
      onSelect(char);
      onLockIn();
      return;
    }

    const navigate = (dir: number, vertical: boolean = false) => {
      e.preventDefault();
      const step = vertical ? 2 : 1;
      setSelectedIndex(i => {
        if (dir < 0) return (i - step + characters.length) % characters.length;
        return (i + step) % characters.length;
      });
    };

    if (e.code === "KeyA") navigate(-1);
    if (e.code === "KeyD") navigate(1);
    if (e.code === "KeyW") navigate(-1, true);
    if (e.code === "KeyS") navigate(1, true);
  }, [characters, selectedIndex, myReady, onSelect, onLockIn, onCancel, triggerDownload]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <div className="char-select">
      <h1 className="char-select__title">SELECT YOUR CHARACTER</h1>

      <div style={{ textAlign: "center", marginBottom: "12px" }}>
        <span className="char-status__sub">
          You are Player {mySlot} · {latency !== null ? `Latency: ${latency}ms` : "Connecting..."}
        </span>
      </div>

      <div className="char-select__grid">
        {characters.map((char, i) => {
          const isSelected = i === selectedIndex;
          const isMine = myCharacter?.id === char.id;
          const isRemote = remoteCharacter === char.id;
          const dlState = downloadStates[char.id];
          const ready = isCharReady(char);

          return (
            <button
              key={char.id}
              className={`char-card ${isSelected ? "char-card--p1" : ""} ${isMine ? "char-card--both" : ""} ${!ready ? "char-card--downloadable" : ""}`}
              onClick={() => {
                if (!ready) {
                  triggerDownload(char);
                  return;
                }
                setSelectedIndex(i);
                if (!myReady) {
                  onSelect(char);
                }
              }}
            >
              <div className="char-card__name">{char.displayName}</div>
              <div className="char-card__author">by {char.author}</div>
              <div className="char-card__desc">{char.description}</div>
              <div className="char-card__indicators">
                {isSelected && !myReady && (
                  <span className="char-indicator char-indicator--p1">You ←</span>
                )}
                {isMine && (
                  <span className="char-indicator char-indicator--p1">You ✓</span>
                )}
                {isRemote && (
                  <span className="char-indicator char-indicator--p2">Opponent ✓</span>
                )}
              </div>
              {!char.bundled && (
                <div className="char-card__download-badge">
                  {dlState?.status === "cached" && <span className="badge badge--cached">✓ Downloaded</span>}
                  {dlState?.status === "downloading" && (
                    <span className="badge badge--downloading">Downloading... {dlState.progress?.toFixed(0)}%</span>
                  )}
                  {dlState?.status === "error" && <span className="badge badge--error">Download failed</span>}
                  {(!dlState || dlState.status === "idle") && (
                    <span className="badge badge--download">Download ({char.sizeMB}MB)</span>
                  )}
                </div>
              )}
              {dlState?.status === "downloading" && dlState.progress !== undefined && (
                <div className="char-card__progress">
                  <div className="char-card__progress-fill" style={{ width: `${dlState.progress}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="char-select__status">
        <div className={`char-status ${myReady ? "char-status--locked" : ""}`}>
          <strong>You (P{mySlot})</strong>: {myCharacter?.displayName ?? "—"}
          {" "}
          {myReady ? "✓ READY" : "(WASD + U to select)"}
        </div>
        <div className={`char-status ${remoteReady ? "char-status--locked" : ""}`}>
          <strong>Opponent (P{mySlot === 1 ? 2 : 1})</strong>: {remoteCharInfo?.displayName ?? remoteCharacter ?? "—"}
          {" "}
          {remoteReady ? "✓ READY" : "(waiting...)"}
        </div>
      </div>

      <div className="char-select__controls">
        <div>
          <strong>Controls:</strong> WASD to navigate, U or Enter to select + lock in.
          {" "}<span className="char-status__sub">Yellow cards need download — click to start.</span>
        </div>
        <div>
          <button onClick={onCancel} className="btn btn--secondary">Cancel (Esc)</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-component: OnlineStageSelect
// =============================================================================

interface OnlineStageSelectProps {
  mySlot: 1 | 2;
  myStage: StageInfo | null;
  remoteStage: string | null;
  myReady: boolean;
  remoteReady: boolean;
  onSelect: (stage: StageInfo) => void;
  onLockIn: () => void;
  onCancel: () => void;
  latency: number | null;
}

function OnlineStageSelect({
  mySlot, myStage, remoteStage, myReady, remoteReady,
  onSelect, onLockIn, onCancel, latency,
}: OnlineStageSelectProps) {
  const [stages, setStages] = useState<StageInfo[]>(getBundledStages());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloadStates, setDownloadStates] = useState<Record<string, { status: string; progress?: number }>>({});

  const isHost = mySlot === 1;

  useEffect(() => {
    (async () => {
      const all = await getAllStages(getBundledStages());
      setStages(all);
      const states: Record<string, { status: string }> = {};
      for (const stage of all) {
        if (!stage.bundled && stage.files) {
          const cached = await isStageCached(stage.id, stage.files);
          states[stage.id] = { status: cached ? "cached" : "idle" };
        }
      }
      setDownloadStates(states);
    })();
  }, []);

  const isStageReady = (stage: StageInfo): boolean => {
    if (stage.bundled) return true;
    return downloadStates[stage.id]?.status === "cached";
  };

  const triggerDownload = useCallback(async (stage: StageInfo) => {
    if (!stage.cdnBase || !stage.files) return;
    if (downloadStates[stage.id]?.status === "downloading") return;
    if (downloadStates[stage.id]?.status === "cached") return;

    setDownloadStates(prev => ({ ...prev, [stage.id]: { status: "downloading", progress: 0 } }));
    try {
      const result = await downloadStage(stage.id, stage.cdnBase, stage.files, (progress) => {
        setDownloadStates(prev => ({
          ...prev,
          [stage.id]: { status: "downloading", progress: progress.percent },
        }));
      });
      await cacheStage(stage.id, result.files);
      setDownloadStates(prev => ({ ...prev, [stage.id]: { status: "cached" } }));
    } catch {
      setDownloadStates(prev => ({ ...prev, [stage.id]: { status: "error" } }));
    }
  }, [downloadStates]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.code === "Escape" && !e.repeat) {
      e.preventDefault();
      onCancel();
      return;
    }
    if (myReady) return; // Already locked in

    if ((e.code === "KeyU" || e.code === "Enter") && !e.repeat) {
      e.preventDefault();
      // Host: pick stage (if not picked yet) then lock in
      // Guest: just lock in (confirm the host's stage pick)
      if (isHost) {
        const stage = stages[selectedIndex];
        if (!stage) return;
        if (!isStageReady(stage)) {
          triggerDownload(stage);
          return;
        }
        onSelect(stage);
      }
      // Both host and guest call onLockIn (sends 'ready' to relay)
      onLockIn();
      return;
    }

    // Navigation (host only — guest can't change the stage)
    if (!isHost) return;

    const navigate = (dir: number, vertical: boolean = false) => {
      e.preventDefault();
      const step = vertical ? 2 : 1;
      setSelectedIndex(i => {
        if (dir < 0) return (i - step + stages.length) % stages.length;
        return (i + step) % stages.length;
      });
    };

    if (e.code === "KeyA") navigate(-1);
    if (e.code === "KeyD") navigate(1);
    if (e.code === "KeyW") navigate(-1, true);
    if (e.code === "KeyS") navigate(1, true);
  }, [stages, selectedIndex, isHost, myReady, onSelect, onLockIn, onCancel, triggerDownload]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const remoteStageInfo = stages.find(s => `${s.id}.def` === remoteStage);

  return (
    <div className="char-select">
      <h1 className="char-select__title">SELECT A STAGE</h1>

      <div style={{ textAlign: "center", marginBottom: "12px" }}>
        {isHost ? (
          <span className="char-status__sub">
            You are the host — pick the stage · {latency !== null ? `Latency: ${latency}ms` : "Connecting..."}
          </span>
        ) : (
          <span className="char-status__sub">
            Waiting for host to pick a stage · {latency !== null ? `Latency: ${latency}ms` : "Connecting..."}
          </span>
        )}
      </div>

      <div className="char-select__grid">
        {stages.map((stage, i) => {
          const isSelected = i === selectedIndex;
          const isMine = myStage?.id === stage.id;
          const isRemote = remoteStage === `${stage.id}.def`;
          const dlState = downloadStates[stage.id];
          const ready = isStageReady(stage);

          return (
            <button
              key={stage.id}
              className={`char-card ${isSelected ? "char-card--p1" : ""} ${isMine ? "char-card--both" : ""} ${!ready ? "char-card--downloadable" : ""}`}
              disabled={!isHost || myReady}
              onClick={() => {
                if (!isHost || myReady) return;
                if (!ready) {
                  triggerDownload(stage);
                  return;
                }
                setSelectedIndex(i);
                onSelect(stage);
              }}
              style={{ opacity: (!isHost || myReady) ? 0.6 : 1 }}
            >
              <div className="char-card__name">{stage.displayName}</div>
              <div className="char-card__author">by {stage.author}</div>
              <div className="char-card__desc">{stage.description}</div>
              <div className="char-card__indicators">
                {isSelected && isHost && !myReady && (
                  <span className="char-indicator char-indicator--p1">Selected ←</span>
                )}
                {isMine && <span className="char-indicator char-indicator--p1">Host ✓</span>}
                {isRemote && <span className="char-indicator char-indicator--p2">Picked ✓</span>}
              </div>
              {!stage.bundled && (
                <div className="char-card__download-badge">
                  {dlState?.status === "cached" && <span className="badge badge--cached">✓ Downloaded</span>}
                  {dlState?.status === "downloading" && (
                    <span className="badge badge--downloading">Downloading... {dlState.progress?.toFixed(0)}%</span>
                  )}
                  {dlState?.status === "error" && <span className="badge badge--error">Download failed</span>}
                  {(!dlState || dlState.status === "idle") && (
                    <span className="badge badge--download">Download ({stage.sizeMB}MB)</span>
                  )}
                </div>
              )}
              {dlState?.status === "downloading" && dlState.progress !== undefined && (
                <div className="char-card__progress">
                  <div className="char-card__progress-fill" style={{ width: `${dlState.progress}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="char-select__status">
        <div className={`char-status ${myReady ? "char-status--locked" : ""}`}>
          <strong>{isHost ? "Host" : "Guest"}</strong>: {myStage?.displayName ?? (isHost ? "—" : "(host's pick)")}
          {" "}
          {myReady
            ? "✓ READY"
            : isHost
              ? "(WASD + U to pick + ready)"
              : remoteStage
                ? "(U to confirm)"
                : "(waiting for host to pick)"}
        </div>
        <div className={`char-status ${remoteReady ? "char-status--locked" : ""}`}>
          <strong>Opponent</strong>: {remoteStageInfo?.displayName ?? "—"}
          {" "}
          {remoteReady ? "✓ READY" : "(waiting...)"}
        </div>
      </div>

      <div className="char-select__controls">
        <div>
          {isHost ? (
            <span><strong>Controls:</strong> WASD to navigate, U or Enter to pick + ready.</span>
          ) : (
            <span className="char-status__sub">
              {remoteStage
                ? "Host picked a stage. Press U to confirm and start the match."
                : "Waiting for host to pick a stage..."}
            </span>
          )}
        </div>
        <div>
          <button onClick={onCancel} className="btn btn--secondary">Cancel (Esc)</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-component: PreparingScreen
// =============================================================================

interface PreparingScreenProps {
  status: PrepareStatus;
}

function PreparingScreen({ status }: PreparingScreenProps) {
  return (
    <div className="char-select">
      <h1 className="char-select__title">PREPARING MATCH</h1>
      <div style={{ textAlign: "center", margin: "40px 0" }}>
        <div className="game-loading__spinner" style={{ margin: "0 auto 20px" }} />
        <p style={{ fontSize: "18px", marginBottom: "12px" }}>{status.message}</p>
        {status.phase === "downloading" && status.progress !== undefined && (
          <div style={{ maxWidth: "400px", margin: "0 auto" }}>
            <div className="char-card__progress">
              <div className="char-card__progress-fill" style={{ width: `${status.progress}%` }} />
            </div>
            <p className="char-status__sub" style={{ marginTop: "8px" }}>
              {status.progress.toFixed(0)}%
            </p>
          </div>
        )}
        {status.phase === "error" && (
          <p style={{ color: "#f88" }}>{status.message}</p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-component: OnlineFight
// =============================================================================

interface OnlineFightProps {
  mySlot: 1 | 2;
  myCharId: string;
  oppCharId: string;
  stage: string;
  relay: RelayClient;
  inputDelay: number;
  startTime: number;  // Synchronized start timestamp (ms) from relay
  game: GameInstance | null;
  matchCanStart: boolean;  // True when both clients finished loading
  matchKey: number;  // Increments on each match to force GameCanvas remount
  onGameReady: (g: GameInstance) => void;
  onBeforeStart: (game: GameInstance) => Promise<void>;
  onExit: () => void;
  onRematch: () => void;
  latency: number | null;
  prepareStatus: PrepareStatus;
}

function OnlineFight({
  mySlot, myCharId, oppCharId, stage, relay, inputDelay, startTime, game,
  matchCanStart, matchKey, onGameReady, onBeforeStart, onExit, onRematch, latency, prepareStatus,
}: OnlineFightProps) {
  const p1Char = mySlot === 1 ? myCharId : oppCharId;
  const p2Char = mySlot === 1 ? oppCharId : myCharId;

  // Frame-locked lockstep input pump (synchronized via wall-clock start time)
  const onlinePump = useOnlineMultiplayer(game, relay, mySlot, inputDelay);

  // Start the pump when the game instance is ready AND both clients finished loading
  useEffect(() => {
    if (game && matchCanStart && !onlinePump.isPumping && !onlinePump.disconnected) {
      console.log("[OnlineFight] Starting pump — match can start");
      onlinePump.start();
    }
  }, [game, matchCanStart, onlinePump]);

  // Handle disconnect
  useEffect(() => {
    if (onlinePump.disconnected) {
      console.warn("[OnlineFight] Disconnected — opponent not responding");
    }
  }, [onlinePump.disconnected]);

  return (
    <div className="fight">
      <div className="fight__hud">
        <div className="fight__player fight__player--p1">
          <div className="fight__player-name">
            {mySlot === 1 ? "You" : "Opponent"} (P1): {p1Char}
          </div>
          <div className="char-status__sub">
            Input: <code>{mySlot === 1 ? onlinePump.localInput : onlinePump.remoteInput || "—"}</code>
          </div>
        </div>
        <div className="fight__center">
          <div className="fight__mode-label">Online Match</div>
          <div className="fight__frame">
            Frame: {onlinePump.frame}
          </div>
          <div className="fight__frame">
            {/* Connection quality indicator */}
            {onlinePump.latency !== null ? (
              <span style={{
                color: onlinePump.connectionQuality === "good" ? "#6f6"
                  : onlinePump.connectionQuality === "moderate" ? "#ff6" : "#f88",
              }}>
                {onlinePump.connectionQuality === "good" ? "●" : onlinePump.connectionQuality === "moderate" ? "●" : "●"} {onlinePump.latency}ms
              </span>
            ) : "..."}
            {onlinePump.stalled && (
              <span style={{ color: "#f88", marginLeft: "8px" }}>⚠ LAG</span>
            )}
            {onlinePump.desyncDetected && (
              <span style={{ color: "#f44", marginLeft: "8px", fontWeight: "bold" }}>⚠ DESYNC</span>
            )}
          </div>
          <div className="fight__frame" style={{ fontSize: "10px", color: "#888" }}>
            Q:{onlinePump.queueDepth} | F:{onlinePump.frame}
          </div>
          <button onClick={onExit} className="btn btn--secondary btn--small">
            Exit (Esc)
          </button>
        </div>
        <div className="fight__player fight__player--p2">
          <div className="fight__player-name">
            {mySlot === 2 ? "You" : "Opponent"} (P2): {p2Char}
          </div>
          <div className="char-status__sub">
            Input: <code>{mySlot === 2 ? onlinePump.localInput : onlinePump.remoteInput || "—"}</code>
          </div>
        </div>
      </div>

      {/* Disconnect overlay */}
      {onlinePump.disconnected && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0, 0, 0, 0.9)",
            padding: "32px 48px",
            borderRadius: "8px",
            textAlign: "center",
            border: "1px solid #f88",
            zIndex: 20,
          }}
        >
          <h2 style={{ color: "#f88", marginBottom: "12px" }}>Connection Lost</h2>
          <p style={{ marginBottom: "20px" }}>Opponent is not responding.</p>
          <button onClick={onExit} className="btn btn--primary">
            Return to Lobby
          </button>
        </div>
      )}

      {/* Desync warning overlay */}
      {onlinePump.desyncDetected && !onlinePump.disconnected && (
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0, 0, 0, 0.9)",
            padding: "12px 24px",
            borderRadius: "8px",
            textAlign: "center",
            border: "1px solid #f44",
            zIndex: 15,
          }}
        >
          <p style={{ color: "#f44", fontSize: "14px", fontWeight: "bold" }}>
            ⚠ Desync detected — game states may differ
          </p>
          <p className="char-status__sub" style={{ marginTop: "4px" }}>
            Exit and start a new match to resync
          </p>
        </div>
      )}

      <div className="fight__canvas-wrap" style={{ position: "relative" }}>
        <GameCanvas
          key={`match-${matchKey}`}
          onReady={onGameReady}
          onBeforeStart={onBeforeStart}
          p1Char={p1Char}
          p2Char={p2Char}
          stage={stage}
          canStart={matchCanStart}
        />
        {/* Download/inject progress overlay — shown while game is loading */}
        {!game && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(0, 0, 0, 0.85)",
              padding: "24px 32px",
              borderRadius: "8px",
              textAlign: "center",
              minWidth: "320px",
              border: "1px solid #444",
              zIndex: 10,
            }}
          >
            <div className="game-loading__spinner" style={{ margin: "0 auto 16px" }} />
            <p style={{ fontSize: "16px", marginBottom: "12px", color: "#fff" }}>
              {prepareStatus.message}
            </p>
            {prepareStatus.phase === "downloading" && prepareStatus.progress !== undefined && (
              <div style={{ maxWidth: "280px", margin: "0 auto" }}>
                <div className="char-card__progress">
                  <div
                    className="char-card__progress-fill"
                    style={{ width: `${prepareStatus.progress}%` }}
                  />
                </div>
                <p className="char-status__sub" style={{ marginTop: "6px" }}>
                  {prepareStatus.progress.toFixed(0)}%
                </p>
              </div>
            )}
            {prepareStatus.phase === "error" && (
              <p style={{ color: "#f88" }}>{prepareStatus.message}</p>
            )}
          </div>
        )}
        {/* Loading barrier overlay — shown while waiting for opponent to finish loading */}
        {game && !matchCanStart && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(0, 0, 0, 0.85)",
              padding: "24px 32px",
              borderRadius: "8px",
              textAlign: "center",
              minWidth: "320px",
              border: "1px solid #444",
              zIndex: 10,
            }}
          >
            <div className="game-loading__spinner" style={{ margin: "0 auto 16px" }} />
            <p style={{ fontSize: "16px", marginBottom: "12px", color: "#fff" }}>
              Waiting for opponent to finish loading...
            </p>
            <p className="char-status__sub">
              The match will start when both players are ready.
            </p>
          </div>
        )}
      </div>

      <div className="fight__controls-help">
        <div>
          <strong>Controls:</strong> WASD = move, U/I/O = punch, J/K/L = kick, 1 = start
        </div>
        <div className="char-status__sub">
          Input-delay lockstep · {inputDelay}f delay ({(inputDelay * 16.67).toFixed(0)}ms)
          {onlinePump.stalled && " · Predicting (waiting for opponent's input)"}
        </div>
      </div>

      <EscHandler onEsc={onExit} />
    </div>
  );
}

// =============================================================================
// Utility: EscHandler
// =============================================================================

function EscHandler({ onEsc }: { onEsc: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape" && !e.repeat) {
        e.preventDefault();
        onEsc();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEsc]);
  return null;
}
