"use client";

import Link from "next/link";

/**
 * Lobby page — main entry point.
 *
 * Shows two options:
 *   1. Local 2P — two players share one keyboard
 *   2. Online Multiplayer — play over the internet via WebSocket relay
 */

export default function LobbyPage() {
  return (
    <main className="lobby">
      <div className="lobby__card">
        <h1 className="lobby__title">FIGHTING GAME ENGINE</h1>
        <p className="lobby__subtitle">
          Browser-based 2D fighting game · MUGEN + WebAssembly
        </p>

        <div className="lobby__section">
          <h2 className="lobby__heading">Play Locally</h2>
          <Link href="/local" className="btn btn--primary btn--large">
            Local 2P (same keyboard)
          </Link>
          <p className="lobby__hint">
            Two players, one keyboard. P1 uses WASD+UIO, P2 uses arrows+890.
            Includes VS AI, Training, and AI vs AI modes.
          </p>
        </div>

        <div className="lobby__section">
          <h2 className="lobby__heading">Play Online</h2>
          <Link href="/online" className="btn btn--primary btn--large">
            Online Multiplayer
          </Link>
          <p className="lobby__hint">
            Play against a friend over the internet. Create a room and share
            the 6-character code. Uses lockstep netcode over a free WebSocket
            relay (Deno Deploy).
          </p>
        </div>

        <div className="lobby__section lobby__section--links">
          <a href="/test/input-bridge.html" className="lobby__link">
            Phase 0.5 Input Bridge Test
          </a>
          <span className="lobby__version">Phase 4 · v0.4.0</span>
        </div>
      </div>
    </main>
  );
}
