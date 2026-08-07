"use client";

/**
 * CharacterSelect — grid of characters, each player picks one.
 *
 * Characters come in 3 states:
 * 1. Bundled — in game.data, instant select (green)
 * 2. Cached — downloaded before, instant select (blue "Downloaded")
 * 3. Downloadable — needs download from CDN, click to download (yellow)
 *
 * Modes:
 *   - local2p: P1 uses WASD+U, P2 uses Arrows+0
 *   - vsAI: P1 picks both characters. Use WASD to select P1, press U to lock.
 *           Then use WASD again to select P2 (AI character), press U to lock.
 *   - training: Same as vsAI — P1 picks both characters.
 *   - aivsai: Watch mode. P1 (human) picks both characters; both are then
 *            controlled by the engine AI. Separate difficulty per side.
 */

import { useState, useEffect, useCallback } from "react";
import {
  getBundledCharacters,
  type CharacterInfo,
} from "@/lib/character-catalog";
import { getAllCharacters } from "@/lib/character-manifest";
import { isCharacterCached, cacheCharacter, clearCharacterCache } from "@/lib/character-cache";
import { downloadCharacter, type DownloadProgress } from "@/lib/character-downloader";
import type { AIDifficulty } from "@/hooks/use-ai-player";

export type GameMode = "local2p" | "vsAI" | "training" | "aivsai";

/** Download state for a character */
interface DownloadState {
  status: "idle" | "downloading" | "cached" | "error";
  progress?: number; // 0-100
  error?: string;
}

interface CharacterSelectProps {
  onLockIn: (
    p1: CharacterInfo,
    p2: CharacterInfo,
    mode: GameMode,
    p2Difficulty?: AIDifficulty,
    p1Difficulty?: AIDifficulty
  ) => void;
  onCancel: () => void;
}

export default function CharacterSelect({ onLockIn, onCancel }: CharacterSelectProps) {
  // Start with bundled characters, then merge remote characters after mount
  const [characters, setCharacters] = useState<CharacterInfo[]>(getBundledCharacters());
  const [mode, setMode] = useState<GameMode>("local2p");
  const [difficulty, setDifficulty] = useState<AIDifficulty>("normal");
  const [p1Difficulty, setP1Difficulty] = useState<AIDifficulty>("normal");
  const [p1Index, setP1Index] = useState(0);
  const [p2Index, setP2Index] = useState(1);
  const [p1Locked, setP1Locked] = useState(false);
  const [p2Locked, setP2Locked] = useState(false);

  // Download states: charId → download status
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});

  // Fetch remote manifest on mount, merge with bundled characters
  useEffect(() => {
    (async () => {
      const allChars = await getAllCharacters(getBundledCharacters());
      setCharacters(allChars);

      // Check which remote characters are already cached
      const states: Record<string, DownloadState> = {};
      for (const char of allChars) {
        if (!char.bundled && char.files) {
          const cached = await isCharacterCached(char.id, char.files);
          states[char.id] = cached
            ? { status: "cached" }
            : { status: "idle" };
        }
      }
      setDownloadStates(states);
    })();
  }, []);

  const isSinglePlayer = mode === "vsAI" || mode === "training";
  const isWatchMode = mode === "aivsai";
  const isHumanSelectingBoth = isSinglePlayer || isWatchMode;
  const activeSelector = !p1Locked ? "p1" : (!p2Locked ? "p2" : "done");

  /**
   * Check if a character is ready to use (bundled, cached, or downloaded).
   */
  const isCharReady = (char: CharacterInfo): boolean => {
    if (char.bundled) return true;
    const state = downloadStates[char.id];
    return state?.status === "cached";
  };

  /**
   * Trigger a download for a character that isn't cached yet.
   * Downloads from CDN, caches in IndexedDB, and updates the card's
   * download state so the progress bar fills in live.
   */
  const triggerDownload = useCallback(async (char: CharacterInfo) => {
    if (!char.cdnBase || !char.files) return;
    if (downloadStates[char.id]?.status === "downloading") return;
    if (downloadStates[char.id]?.status === "cached") return;

    setDownloadStates((prev) => ({
      ...prev,
      [char.id]: { status: "downloading", progress: 0 },
    }));

    try {
      const result = await downloadCharacter(
        char.id,
        char.cdnBase,
        char.files,
        (progress: DownloadProgress) => {
          setDownloadStates((prev) => ({
            ...prev,
            [char.id]: {
              status: "downloading",
              progress: progress.percent,
            },
          }));
        }
      );

      // Cache for next time
      await cacheCharacter(char.id, result.files);

      setDownloadStates((prev) => ({
        ...prev,
        [char.id]: { status: "cached" },
      }));
    } catch (e) {
      setDownloadStates((prev) => ({
        ...prev,
        [char.id]: {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }, [downloadStates]);

  /**
   * Try to lock in a character for the given player.
   * If the character isn't ready (not bundled/cached), trigger a
   * download instead of locking in. Once the download completes,
   * the user can press the key again to actually lock in.
   */
  const tryLockIn = useCallback((player: "p1" | "p2", char: CharacterInfo) => {
    if (!isCharReady(char)) {
      triggerDownload(char);
      return;
    }
    if (player === "p1") setP1Locked(true);
    else setP2Locked(true);
  }, [triggerDownload]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const bothReady = p1Locked && p2Locked;
      if (bothReady && (e.code === "KeyU" || e.code === "Digit0" || e.code === "Enter") && !e.repeat) {
        e.preventDefault();
        onLockIn(characters[p1Index], characters[p2Index], mode, difficulty, p1Difficulty);
        return;
      }

      if (e.code === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }

      if (!p1Locked && !p2Locked) {
        if (e.code === "Digit1" && !e.repeat) { setMode("local2p"); return; }
        if (e.code === "Digit2" && !e.repeat) { setMode("vsAI"); return; }
        if (e.code === "Digit3" && !e.repeat) { setMode("training"); return; }
        if (e.code === "Digit4" && !e.repeat) { setMode("aivsai"); return; }
      }

      const navigate = (setter: React.Dispatch<React.SetStateAction<number>>, dir: number, vertical: boolean = false) => {
        e.preventDefault();
        const step = vertical ? 2 : 1;
        setter((i) => {
          if (dir < 0) return (i - step + characters.length) % characters.length;
          return (i + step) % characters.length;
        });
      };

      if (isHumanSelectingBoth) {
        if (activeSelector === "p1") {
          if (e.code === "KeyA") navigate(setP1Index, -1);
          if (e.code === "KeyD") navigate(setP1Index, 1);
          if (e.code === "KeyW") navigate(setP1Index, -1, true);
          if (e.code === "KeyS") navigate(setP1Index, 1, true);
          if (e.code === "KeyU" && !e.repeat) {
            e.preventDefault();
            tryLockIn("p1", characters[p1Index]);
          }
        } else if (activeSelector === "p2") {
          if (e.code === "KeyA") navigate(setP2Index, -1);
          if (e.code === "KeyD") navigate(setP2Index, 1);
          if (e.code === "KeyW") navigate(setP2Index, -1, true);
          if (e.code === "KeyS") navigate(setP2Index, 1, true);
          if (e.code === "KeyU" && !e.repeat) {
            e.preventDefault();
            tryLockIn("p2", characters[p2Index]);
          }
          if (e.code === "Backspace" && !e.repeat) { e.preventDefault(); setP1Locked(false); }
        }
      } else {
        if (!p1Locked) {
          if (e.code === "KeyA") navigate(setP1Index, -1);
          if (e.code === "KeyD") navigate(setP1Index, 1);
          if (e.code === "KeyW") navigate(setP1Index, -1, true);
          if (e.code === "KeyS") navigate(setP1Index, 1, true);
          if (e.code === "KeyU" && !e.repeat) {
            e.preventDefault();
            tryLockIn("p1", characters[p1Index]);
          }
        } else if (e.code === "KeyU" && !e.repeat && !p2Locked) {
          e.preventDefault(); setP1Locked(false);
        }

        if (!p2Locked) {
          if (e.code === "ArrowLeft") navigate(setP2Index, -1);
          if (e.code === "ArrowRight") navigate(setP2Index, 1);
          if (e.code === "ArrowUp") navigate(setP2Index, -1, true);
          if (e.code === "ArrowDown") navigate(setP2Index, 1, true);
          if (e.code === "Digit0" && !e.repeat) {
            e.preventDefault();
            tryLockIn("p2", characters[p2Index]);
          }
        } else if (e.code === "Digit0" && !e.repeat && !p1Locked) {
          e.preventDefault(); setP2Locked(false);
        }
      }
    },
    [p1Locked, p2Locked, characters, p1Index, p2Index, onLockIn, onCancel, mode, difficulty, p1Difficulty, isSinglePlayer, isHumanSelectingBoth, activeSelector, tryLockIn]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  useEffect(() => {
    setP1Locked(false);
    setP2Locked(false);
  }, [mode]);

  const bothReady = p1Locked && p2Locked;
  const p1CharReady = isCharReady(characters[p1Index]);
  const p2CharReady = isCharReady(characters[p2Index]);
  const canStartMatch = bothReady && p1CharReady && p2CharReady;

  return (
    <div className="char-select">
      <h1 className="char-select__title">SELECT YOUR CHARACTER</h1>

      {/* Mode selector */}
      <div className="char-select__mode">
        <button
          className={`btn ${mode === "local2p" ? "btn--primary" : "btn--secondary"} btn--small`}
          onClick={() => setMode("local2p")}
        >
          Local 2P (1)
        </button>
        <button
          className={`btn ${mode === "vsAI" ? "btn--primary" : "btn--secondary"} btn--small`}
          onClick={() => setMode("vsAI")}
        >
          VS AI (2)
        </button>
        <button
          className={`btn ${mode === "training" ? "btn--primary" : "btn--secondary"} btn--small`}
          onClick={() => setMode("training")}
        >
          Training (3)
        </button>
        <button
          className={`btn ${mode === "aivsai" ? "btn--primary" : "btn--secondary"} btn--small`}
          onClick={() => setMode("aivsai")}
        >
          AI vs AI (4)
        </button>
      </div>

      {/* AI difficulty selector — P2 (vsAI and aivsai modes) */}
      {(mode === "vsAI" || mode === "aivsai") && (
        <div className="char-select__difficulty">
          <span>{mode === "aivsai" ? "P2 (Right) AI Difficulty: " : "AI Difficulty: "}</span>
          {(["easy", "normal", "hard"] as AIDifficulty[]).map((d) => (
            <button
              key={d}
              className={`btn ${difficulty === d ? "btn--primary" : "btn--secondary"} btn--small`}
              onClick={() => setDifficulty(d)}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* AI difficulty selector — P1 (aivsai / watch mode only) */}
      {mode === "aivsai" && (
        <div className="char-select__difficulty">
          <span>P1 (Left) AI Difficulty: </span>
          {(["easy", "normal", "hard"] as AIDifficulty[]).map((d) => (
            <button
              key={d}
              className={`btn ${p1Difficulty === d ? "btn--primary" : "btn--secondary"} btn--small`}
              onClick={() => setP1Difficulty(d)}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div className="char-select__grid">
        {characters.map((char, i) => {
          const isP1Here = i === p1Index;
          const isP2Here = i === p2Index;
          const dlState = downloadStates[char.id];
          const ready = isCharReady(char);

          return (
            <button
              key={char.id}
              className={`char-card ${isP1Here ? "char-card--p1" : ""} ${isP2Here ? "char-card--p2" : ""} ${isP1Here && isP2Here ? "char-card--both" : ""} ${!ready ? "char-card--downloadable" : ""}`}
              onClick={() => {
                // Not ready — trigger download instead of selecting.
                // Once download completes, the user can click again to select.
                if (!ready) {
                  triggerDownload(char);
                  return;
                }
                if (isHumanSelectingBoth) {
                  if (activeSelector === "p1") { setP1Index(i); setP1Locked(true); }
                  else if (activeSelector === "p2") { setP2Index(i); setP2Locked(true); }
                } else {
                  setP1Index(i); setP1Locked(true);
                }
              }}
            >
              <div className="char-card__name">{char.displayName}</div>
              <div className="char-card__author">by {char.author}</div>
              <div className="char-card__desc">{char.description}</div>
              <div className="char-card__indicators">
                {isP1Here && <span className="char-indicator char-indicator--p1">{isWatchMode ? "AI1" : "P1"}{p1Locked ? " ✓" : (isHumanSelectingBoth && activeSelector === "p1" ? " ←" : "")}</span>}
                {isP2Here && <span className="char-indicator char-indicator--p2">{isWatchMode ? "AI2" : (isSinglePlayer ? (mode === "vsAI" ? "AI" : "Dummy") : "P2")}{p2Locked ? " ✓" : (isHumanSelectingBoth && activeSelector === "p2" ? " ←" : "")}</span>}
              </div>
              {/* Download status badge */}
              {!char.bundled && (
                <div className="char-card__download-badge">
                  {dlState?.status === "cached" && (
                    <span className="badge badge--cached">✓ Downloaded</span>
                  )}
                  {dlState?.status === "downloading" && (
                    <span className="badge badge--downloading">
                      Downloading... {dlState.progress?.toFixed(0)}%
                    </span>
                  )}
                  {dlState?.status === "error" && (
                    <span className="badge badge--error">Download failed</span>
                  )}
                  {(!dlState || dlState.status === "idle") && (
                    <span className="badge badge--download">Download ({char.sizeMB}MB)</span>
                  )}
                </div>
              )}
              {/* Download progress bar */}
              {dlState?.status === "downloading" && dlState.progress !== undefined && (
                <div className="char-card__progress">
                  <div
                    className="char-card__progress-fill"
                    style={{ width: `${dlState.progress}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="char-select__status">
        <div className={`char-status ${p1Locked ? "char-status--locked" : ""}`}>
          <strong>{isWatchMode ? "AI1" : "P1"}</strong>: {characters[p1Index]?.displayName ?? "—"}
          {" "}
          {p1Locked
            ? (isWatchMode ? `✓ LOCKED [${p1Difficulty}]` : "✓ LOCKED")
            : (isWatchMode ? `(WASD + U) [${p1Difficulty}]` : "(WASD + U)")}
          {!p1CharReady && characters[p1Index] && !characters[p1Index].bundled && (
            <span className="char-status__sub"> — download required</span>
          )}
        </div>
        <div className={`char-status ${p2Locked ? "char-status--locked" : ""}`}>
          <strong>{isWatchMode ? "AI2" : (isSinglePlayer ? (mode === "vsAI" ? "AI" : "Dummy") : "P2")}</strong>: {characters[p2Index]?.displayName ?? "—"}
          {" "}
          {isHumanSelectingBoth
            ? (p2Locked
                ? (isWatchMode ? `✓ LOCKED [${difficulty}]` : "✓ LOCKED")
                : (p1Locked
                    ? (isWatchMode ? `(WASD + U to select) [${difficulty}]` : "(WASD + U to select)")
                    : "(waiting)"))
            : (p2Locked ? "✓ LOCKED" : "(Arrows + 0)")}
          {!p2CharReady && characters[p2Index] && !characters[p2Index].bundled && (
            <span className="char-status__sub"> — download required</span>
          )}
        </div>
      </div>
      <div className="char-select__controls">
        {isHumanSelectingBoth ? (
          <div>
            <strong>Controls:</strong> WASD to navigate, U to lock in.
            {isWatchMode && " (Watch mode — pick both fighters, then sit back and watch.)"}
            {!isWatchMode && activeSelector === "p2" && " (Selecting AI/Dummy character — Backspace to go back)"}
            {" "}<span className="char-status__sub">Yellow cards need download — click or press U to start.</span>
          </div>
        ) : (
          <>
            <div><strong>P1:</strong> WASD to navigate, U to lock in</div>
            <div><strong>P2:</strong> Arrow keys to navigate, 0 to lock in</div>
            <div className="char-status__sub">Yellow cards need download — click to start.</div>
          </>
        )}
        <div>
          <button onClick={onCancel} className="btn btn--secondary">
            Cancel (Esc)
          </button>
          <button
            onClick={async () => {
              if (confirm("Clear all downloaded character files? They will re-download when selected.")) {
                await clearCharacterCache();
                // Reset all download states to idle so cards show "Download" again
                const states: Record<string, DownloadState> = {};
                for (const char of characters) {
                  if (!char.bundled) {
                    states[char.id] = { status: "idle" };
                  }
                }
                setDownloadStates(states);
              }
            }}
            className="btn btn--secondary btn--small"
            title="Clear all downloaded character files from browser cache"
          >
            Clear Cache
          </button>
          {bothReady && !canStartMatch && (
            <button
              disabled
              className="btn btn--secondary"
              title="Waiting for downloads to finish"
            >
              Waiting for downloads…
            </button>
          )}
          {canStartMatch && (
            <button
              onClick={() => onLockIn(characters[p1Index], characters[p2Index], mode, difficulty, p1Difficulty)}
              className="btn btn--primary"
            >
              Start Match (U or Enter)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
