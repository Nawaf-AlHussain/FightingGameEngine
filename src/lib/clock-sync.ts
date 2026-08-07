/**
 * Clock Synchronization — Cristian's algorithm with NTP-style min-RTT selection.
 *
 * The relay server is the "time reference". Both clients sync their clocks
 * to the relay's clock, so they agree on "what time is it" within ±RTT/2.
 *
 * Algorithm:
 * 1. Take N ping samples (spread over ~2 seconds)
 * 2. For each sample, compute RTT and clock offset
 * 3. Discard the highest-RTT samples (jitter spikes)
 * 4. Use the minimum-RTT sample's offset (closest to true one-way delay)
 * 5. Apply exponential moving average (EMA) to smooth over time
 *
 * Accuracy: ±2-5ms with 10 samples. Sufficient for 60fps (16.67ms/frame).
 *
 * Usage:
 *   const clockSync = new ClockSync(relay);
 *   await clockSync.sync();  // takes ~2 seconds
 *   const serverTime = clockSync.getServerTime();  // Date.now() + offset
 *   const offset = clockSync.getOffset();
 *   const rtt = clockSync.getRTT();
 */

import type { RelayClient } from "@/lib/relay-client";

const NUM_SAMPLES = 10;          // Number of ping samples per sync
const SAMPLE_INTERVAL_MS = 200;  // Spread samples over ~2 seconds
const EMA_ALPHA = 0.3;           // Smoothing factor (0 = no update, 1 = no smoothing)
const MIN_SAMPLES_NEEDED = 3;    // Need at least 3 good samples for a valid estimate

export interface ClockSyncResult {
  offset: number;  // ms — server_time = Date.now() + offset
  rtt: number;     // ms — round-trip time
  samples: number; // number of successful samples
}

export class ClockSync {
  private relay: RelayClient;
  private offset: number = 0;  // smoothed offset (EMA)
  private rtt: number = 0;     // smoothed RTT (EMA)
  private isSyncing: boolean = false;
  private lastSyncTime: number = 0;

  constructor(relay: RelayClient) {
    this.relay = relay;
  }

  /**
   * Run a clock sync cycle. Takes ~2 seconds (10 samples × 200ms).
   * Can be called periodically (e.g., every 30s) to track clock drift.
   */
  async sync(): Promise<ClockSyncResult> {
    if (this.isSyncing) {
      // Already syncing — return current estimate
      return { offset: this.offset, rtt: this.rtt, samples: 0 };
    }
    this.isSyncing = true;

    try {
      const samples: Array<{ rtt: number; offset: number }> = [];

      for (let i = 0; i < NUM_SAMPLES; i++) {
        const result = await this.relay.sendPing();
        if (result.rtt >= 0) {
          samples.push(result);
        }
        // Wait between samples (except after the last one)
        if (i < NUM_SAMPLES - 1) {
          await new Promise(resolve => setTimeout(resolve, SAMPLE_INTERVAL_MS));
        }
      }

      if (samples.length < MIN_SAMPLES_NEEDED) {
        console.warn(`[ClockSync] Only got ${samples.length} samples (need ${MIN_SAMPLES_NEEDED})`);
        return { offset: this.offset, rtt: this.rtt, samples: samples.length };
      }

      // Sort by RTT (ascending) — lowest RTT = closest to true one-way delay
      samples.sort((a, b) => a.rtt - b.rtt);

      // Use the minimum-RTT sample (NTP-style: min RTT is closest to true delay)
      // Average the 3 lowest-RTT samples for stability
      const bestSamples = samples.slice(0, Math.min(3, samples.length));
      const avgOffset = bestSamples.reduce((sum, s) => sum + s.offset, 0) / bestSamples.length;
      const minRtt = bestSamples[0].rtt;

      // Apply EMA smoothing (unless this is the first sync)
      if (this.lastSyncTime === 0) {
        // First sync — use the raw values
        this.offset = avgOffset;
        this.rtt = minRtt;
      } else {
        // Subsequent syncs — smooth with EMA
        this.offset = this.offset * (1 - EMA_ALPHA) + avgOffset * EMA_ALPHA;
        this.rtt = this.rtt * (1 - EMA_ALPHA) + minRtt * EMA_ALPHA;
      }

      this.lastSyncTime = Date.now();

      console.log(`[ClockSync] Synced: offset=${this.offset.toFixed(1)}ms, rtt=${this.rtt.toFixed(1)}ms (${samples.length} samples)`);
      return { offset: this.offset, rtt: this.rtt, samples: samples.length };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Get the current estimated server time.
   * Use this instead of Date.now() when you need a time that's
   * consistent across both clients.
   */
  getServerTime(): number {
    return Date.now() + this.offset;
  }

  /**
   * Get the current estimated clock offset (ms).
   * server_time = Date.now() + offset
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Get the current estimated RTT (ms).
   */
  getRTT(): number {
    return this.rtt;
  }

  /**
   * Check if the clock has been synced at least once.
   */
  isSynced(): boolean {
    return this.lastSyncTime > 0;
  }

  /**
   * Get the accuracy of the sync (±ms).
   * Roughly RTT/2 (assuming symmetric latency).
   */
  getAccuracy(): number {
    return this.rtt / 2;
  }
}
