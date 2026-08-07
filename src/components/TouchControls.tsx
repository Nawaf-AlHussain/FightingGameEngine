"use client";
/**
 * Phase 1.5 stub — not yet wired up to any page.
 *
 * Intended use: on-screen touch controls for mobile devices.
 * Currently unused; the local 2P flow uses keyboard only.
 * Kept for future use when mobile support is added.
 */

import { useCallback, useRef } from "react";

/**
 * Virtual touch controls for mobile fighting game input.
 *
 * Layout:
 *   Left side: D-pad (U/D/B/F) in a cross pattern
 *   Right side: 5 action buttons (A/B/C/X/Y) in an arc
 *
 * Multi-touch is supported — each touch is tracked independently.
 */

interface TouchControlsProps {
  /** Called when the input string changes */
  onInputChange: (input: string) => void;
}

const DIRECTIONS = [
  { id: "U", label: "▲", x: 50, y: 0 },    // Up
  { id: "D", label: "▼", x: 50, y: 100 },   // Down
  { id: "B", label: "◀", x: 0, y: 50 },     // Back (left)
  { id: "F", label: "▶", x: 100, y: 50 },   // Forward (right)
];

const ACTIONS = [
  { id: "a", label: "A", x: 0, y: 30 },
  { id: "b", label: "B", x: 50, y: 0 },
  { id: "c", label: "C", x: 100, y: 30 },
  { id: "x", label: "X", x: 15, y: 85 },
  { id: "y", label: "Y", x: 85, y: 85 },
];

export default function TouchControls({ onInputChange }: TouchControlsProps) {
  const activeInputs = useRef<Set<string>>(new Set());

  const updateInput = useCallback(() => {
    let input = "";
    // Directions first
    for (const dir of ["U", "D", "B", "F"]) {
      if (activeInputs.current.has(dir)) input += dir;
    }
    // Then actions
    for (const act of ["a", "b", "c", "x", "y", "z"]) {
      if (activeInputs.current.has(act)) input += act;
    }
    onInputChange(input);
  }, [onInputChange]);

  const handleTouchStart = useCallback(
    (id: string) => (e: React.TouchEvent) => {
      e.preventDefault();
      activeInputs.current.add(id);
      updateInput();
    },
    [updateInput]
  );

  const handleTouchEnd = useCallback(
    (id: string) => (e: React.TouchEvent) => {
      e.preventDefault();
      activeInputs.current.delete(id);
      updateInput();
    },
    [updateInput]
  );

  return (
    <div className="touch-controls">
      {/* D-Pad */}
      <div className="touch-dpad">
        {DIRECTIONS.map((dir) => (
          <button
            key={dir.id}
            className="touch-dpad__btn"
            style={{
              left: `${dir.x}%`,
              top: `${dir.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            onTouchStart={handleTouchStart(dir.id)}
            onTouchEnd={handleTouchEnd(dir.id)}
            onTouchCancel={handleTouchEnd(dir.id)}
          >
            {dir.label}
          </button>
        ))}
        <div className="touch-dpad__center" />
      </div>

      {/* Action Buttons */}
      <div className="touch-actions">
        {ACTIONS.map((act) => (
          <button
            key={act.id}
            className="touch-actions__btn"
            style={{
              left: `${act.x}%`,
              top: `${act.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            onTouchStart={handleTouchStart(act.id)}
            onTouchEnd={handleTouchEnd(act.id)}
            onTouchCancel={handleTouchEnd(act.id)}
          >
            {act.label}
          </button>
        ))}
      </div>
    </div>
  );
}