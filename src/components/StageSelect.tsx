"use client";

/**
 * StageSelect — pick a stage after both characters are locked in.
 *
 * Mirrors CharacterSelect but simpler (single selector, single selection).
 *
 * Stages come in 3 states:
 * 1. Bundled — in game.data, instant select (green border)
 * 2. Cached — downloaded before, instant select (blue "Downloaded")
 * 3. Downloadable — needs download from CDN, click to download (yellow)
 *
 * Controls:
 *   WASD = navigate
 *   U or Enter = lock in and start the match
 *   Esc = go back to character select
 */

import { useState, useEffect, useCallback } from "react";
import { getBundledStages, type StageInfo } from "@/lib/stage-catalog";
import { getAllStages } from "@/lib/character-manifest";
import { isStageCached, clearStageCache } from "@/lib/stage-cache";
import { downloadStage, type StageDownloadProgress } from "@/lib/stage-downloader";

/** Download state for a stage */
interface DownloadState {
  status: "idle" | "downloading" | "cached" | "error";
  progress?: number; // 0-100
  error?: string;
}

interface StageSelectProps {
  /** Called when the player locks in a stage */
  onLockIn: (stage: StageInfo) => void;
  /** Called when the player presses Escape */
  onCancel: () => void;
}

export default function StageSelect({ onLockIn, onCancel }: StageSelectProps) {
  const [stages, setStages] = useState<StageInfo[]>(getBundledStages());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});

  // Fetch remote manifest on mount, merge with bundled stages
  useEffect(() => {
    (async () => {
      const allStages = await getAllStages(getBundledStages());
      setStages(allStages);

      // Check which remote stages are already cached
      const states: Record<string, DownloadState> = {};
      for (const stage of allStages) {
        if (!stage.bundled && stage.files) {
          const cached = await isStageCached(stage.id, stage.files);
          states[stage.id] = cached
            ? { status: "cached" }
            : { status: "idle" };
        }
      }
      setDownloadStates(states);
    })();
  }, []);

  /**
   * Check if a stage is ready to use (bundled, cached, or downloaded).
   */
  const isStageReady = (stage: StageInfo): boolean => {
    if (stage.bundled) return true;
    const state = downloadStates[stage.id];
    return state?.status === "cached";
  };

  /**
   * Trigger a download for a stage that isn't cached yet.
   */
  const triggerDownload = useCallback(async (stage: StageInfo) => {
    if (!stage.cdnBase || !stage.files) return;
    if (downloadStates[stage.id]?.status === "downloading") return;
    if (downloadStates[stage.id]?.status === "cached") return;

    setDownloadStates((prev) => ({
      ...prev,
      [stage.id]: { status: "downloading", progress: 0 },
    }));

    try {
      const result = await downloadStage(
        stage.id,
        stage.cdnBase,
        stage.files,
        (progress: StageDownloadProgress) => {
          setDownloadStates((prev) => ({
            ...prev,
            [stage.id]: {
              status: "downloading",
              progress: progress.percent,
            },
          }));
        }
      );

      // Cache for next time
      const { cacheStage } = await import("@/lib/stage-cache");
      await cacheStage(stage.id, result.files);

      setDownloadStates((prev) => ({
        ...prev,
        [stage.id]: { status: "cached" },
      }));
    } catch (e) {
      setDownloadStates((prev) => ({
        ...prev,
        [stage.id]: {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }, [downloadStates]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === "Escape" && !e.repeat) {
        e.preventDefault();
        onCancel();
        return;
      }

      // Lock in
      if (
        (e.code === "KeyU" || e.code === "Enter") &&
        !e.repeat
      ) {
        const stage = stages[selectedIndex];
        if (!stage) return;
        if (!isStageReady(stage)) {
          // Auto-trigger download if not ready
          triggerDownload(stage);
          return;
        }
        e.preventDefault();
        onLockIn(stage);
        return;
      }

      // Navigation
      const navigate = (dir: number, vertical: boolean = false) => {
        e.preventDefault();
        const step = vertical ? 2 : 1;
        setSelectedIndex((i) => {
          if (dir < 0) return (i - step + stages.length) % stages.length;
          return (i + step) % stages.length;
        });
      };

      if (e.code === "KeyA") navigate(-1);
      if (e.code === "KeyD") navigate(1);
      if (e.code === "KeyW") navigate(-1, true);
      if (e.code === "KeyS") navigate(1, true);
    },
    [stages, selectedIndex, onLockIn, onCancel, triggerDownload]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <div className="char-select">
      <h1 className="char-select__title">SELECT A STAGE</h1>

      <div className="char-select__grid">
        {stages.map((stage, i) => {
          const isSelected = i === selectedIndex;
          const dlState = downloadStates[stage.id];
          const ready = isStageReady(stage);

          return (
            <button
              key={stage.id}
              className={`char-card ${isSelected ? "char-card--p1" : ""} ${!ready ? "char-card--downloadable" : ""}`}
              onClick={() => {
                setSelectedIndex(i);
                if (!ready) {
                  triggerDownload(stage);
                }
              }}
            >
              <div className="char-card__name">{stage.displayName}</div>
              <div className="char-card__author">by {stage.author}</div>
              <div className="char-card__desc">{stage.description}</div>
              <div className="char-card__indicators">
                {isSelected && (
                  <span className="char-indicator char-indicator--p1">
                    Selected ←
                  </span>
                )}
              </div>
              {/* Download status badge */}
              {!stage.bundled && (
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
                    <span className="badge badge--download">
                      Download ({stage.sizeMB}MB)
                    </span>
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
        <div className={`char-status char-status--locked`}>
          <strong>Stage</strong>: {stages[selectedIndex]?.displayName ?? "—"}
          {" "}
          {isStageReady(stages[selectedIndex])
            ? "✓ READY"
            : "(click to download)"}
        </div>
      </div>

      <div className="char-select__controls">
        <div>
          <strong>Controls:</strong> WASD to navigate, U or Enter to lock in.
          Click a card to download if needed.
        </div>
        <div>
          <button onClick={onCancel} className="btn btn--secondary">
            Back (Esc)
          </button>
          <button
            onClick={async () => {
              if (confirm("Clear all downloaded stage files? They will re-download when selected.")) {
                await clearStageCache();
                // Reset all download states to idle so cards show "Download" again
                const states: Record<string, DownloadState> = {};
                for (const stage of stages) {
                  if (!stage.bundled) {
                    states[stage.id] = { status: "idle" };
                  }
                }
                setDownloadStates(states);
              }
            }}
            className="btn btn--secondary btn--small"
            title="Clear all downloaded stage files from browser cache"
          >
            Clear Cache
          </button>
          <button
            onClick={() => {
              const stage = stages[selectedIndex];
              if (stage && isStageReady(stage)) {
                onLockIn(stage);
              } else if (stage) {
                triggerDownload(stage);
              }
            }}
            className={`btn ${isStageReady(stages[selectedIndex]) ? "btn--primary" : "btn--secondary"}`}
          >
            {isStageReady(stages[selectedIndex])
              ? "Start Match (U or Enter)"
              : "Download Stage"}
          </button>
        </div>
      </div>
    </div>
  );
}
