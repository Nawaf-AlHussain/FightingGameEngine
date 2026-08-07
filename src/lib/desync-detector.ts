/**
 * Desync Detection — compares game state fingerprints between clients.
 *
 * The engine exposes `getSyncFingerprintExport(out_lo, out_hi)` which returns
 * a 64-bit hash of both players' positions, velocities, life, state, and facing.
 * Both clients should produce the same hash if they're in sync.
 *
 * This module:
 * 1. Reads the fingerprint from the engine every N frames
 * 2. Sends it to the opponent via the relay's sync_check message
 * 3. When a remote fingerprint arrives, compares it with our CURRENT fingerprint
 * 4. Reports desyncs (mismatches) via a callback
 *
 * IMPORTANT: We do NOT compare by frame number — the two clients have
 * independent frame counters that may differ by several frames. Instead,
 * when a remote hash arrives, we immediately compute our current local
 * hash and compare. This is slightly less precise (the states may be
 * from slightly different frames) but it actually works, unlike
 * frame-number-matched comparison which never matches.
 */

import type { GameInstance } from "@/lib/wasm-loader";
import type { RelayClient } from "@/lib/relay-client";

const SYNC_CHECK_INTERVAL_FRAMES = 180;  // Every 180 frames = 3s at 60fps

export interface SyncCheckResult {
  frame: number;
  localHash: string;
  remoteHash: string;
  isSynced: boolean;
}

export type DesyncCallback = (result: SyncCheckResult) => void;

/**
 * Read the 64-bit sync fingerprint from the engine.
 * Returns it as a hex string (easier to compare/transport than 64-bit int).
 */
export function getSyncFingerprint(game: GameInstance): string {
  const module = game.Module as unknown as {
    _getSyncFingerprintExport: (outLo: number, outHi: number) => void;
    _malloc?: (size: number) => number;
    _free?: (ptr: number) => void;
    HEAP32?: Int32Array;
  };

  if (!module._getSyncFingerprintExport) {
    return "no-export";
  }

  try {
    if (module._malloc && module._free && module.HEAP32) {
      const ptr = module._malloc(8);
      module._getSyncFingerprintExport(ptr, ptr + 4);
      const lo = module.HEAP32[ptr >> 2] >>> 0;  // unsigned
      const hi = module.HEAP32[(ptr + 4) >> 2] >>> 0;
      module._free(ptr);
      return lo.toString(16).padStart(8, "0") + hi.toString(16).padStart(8, "0");
    }
  } catch (e) {
    console.error("[SyncCheck] Failed to read fingerprint:", e);
  }

  return "error";
}

/**
 * Desync detector — call every frame; it sends a sync check every
 * SYNC_CHECK_INTERVAL_FRAMES and compares with the opponent's.
 */
export class DesyncDetector {
  private game: GameInstance;
  private relay: RelayClient;
  private mySlot: 1 | 2;
  private frameCount: number = 0;
  private lastLocalHash: string = "";
  private onDesync: DesyncCallback | null;

  constructor(
    game: GameInstance,
    relay: RelayClient,
    mySlot: 1 | 2,
    onDesync?: DesyncCallback
  ) {
    this.game = game;
    this.relay = relay;
    this.mySlot = mySlot;
    this.onDesync = onDesync || null;

    // Listen for sync_check messages from the opponent.
    // When a remote hash arrives, compare it with our CURRENT local hash
    // immediately (don't wait for frame number to match).
    this.relay.on("sync_check", (msg) => {
      const syncMsg = msg as unknown as { frame: number; data: string; from_slot: number };
      if (syncMsg.from_slot === this.mySlot) return;

      const remoteHash = syncMsg.data;
      if (!remoteHash) return;

      // Check for round state sync messages (format: ROUND:roundNum:roundState)
      if (remoteHash.startsWith("ROUND:")) {
        const parts = remoteHash.split(":");
        const hostRoundNum = parseInt(parts[1]);
        const hostRoundState = parseInt(parts[2]);
        const localRoundNum = this.game.Module.ccall("getRoundNumberExport", "number", [], []) as number;
        const localRoundState = this.game.Module.ccall("getRoundStateExport", "number", [], []) as number;

        if (hostRoundNum !== localRoundNum || (hostRoundState === 3 && localRoundState === 2)) {
          console.warn(`[SyncCheck] ROUND DESYNC: host R${hostRoundNum}S${hostRoundState} vs local R${localRoundNum}S${localRoundState}`);
          if (this.onDesync) {
            this.onDesync({ frame: syncMsg.frame, localHash: `R${localRoundNum}S${localRoundState}`, remoteHash, isSynced: false });
          }
        }
        return;
      }

      // Normal fingerprint comparison
      const localHash = getSyncFingerprint(this.game);
      this.lastLocalHash = localHash;

      const isSynced = localHash === remoteHash;

      if (!isSynced) {
        console.warn(`[SyncCheck] DESYNC: local=${localHash} remote=${remoteHash} (remote frame=${syncMsg.frame})`);
      }

      if (this.onDesync) {
        this.onDesync({
          frame: syncMsg.frame,
          localHash,
          remoteHash,
          isSynced,
        });
      }
    });
  }

  /**
   * Call this every frame from the game loop.
   * Sends our fingerprint every SYNC_CHECK_INTERVAL_FRAMES.
   */
  tick(): boolean {
    this.frameCount++;

    if (this.frameCount % SYNC_CHECK_INTERVAL_FRAMES !== 0) {
      return false;
    }

    // Read our local fingerprint
    const localHash = getSyncFingerprint(this.game);
    this.lastLocalHash = localHash;

    // Send to opponent via relay
    this.relay.sendSyncCheck(this.frameCount, localHash);

    return true;
  }

  /**
   * Get the last local hash (for display/debugging).
   */
  getLastLocalHash(): string {
    return this.lastLocalHash;
  }
}
