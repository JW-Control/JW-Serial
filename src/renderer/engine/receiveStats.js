// Link metrics computed by the software: samples per second, period, jitter
// and sequence-counter integrity.
//
// - SPS and period come from host receive times over the last 5 s. Frames are
//   counted individually, so USB chunking does not bias the average.
// - Jitter needs the device's own timestamp (enable "Incluye timestamp"):
//   host receive times reflect USB/OS scheduling, not the sampling clock, so
//   no host-based jitter is reported.

import { SlidingWindow } from "../lib/virtual/slidingWindow.js";

const STATS_WINDOW_SECONDS = 5;

export const createEmptyRxStats = () => ({
  frames: 0,
  sps: 0,
  avgMs: 0,
  jitterMs: null,
  devicePeriodMs: null,
  lastFrameAt: null,
  seqLost: 0,
  seqGaps: 0,
  seqResets: 0,
  seqLast: null
});

const isCounterWrap = (previous, next) => {
  // e.g. uint8/uint16/uint32 counters rolling over: 255 -> 0, 65535 -> 3.
  const modulus = previous + 1;
  return modulus >= 256 && (modulus & (modulus - 1)) === 0 && next >= 0 && next < modulus / 2;
};

export class ReceiveStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.frames = 0;
    this.arrivals = new SlidingWindow({ unit: "seconds", value: STATS_WINDOW_SECONDS });
    this.deviceIntervals = new SlidingWindow({ unit: "seconds", value: STATS_WINDOW_SECONDS });
    this.lastDeviceTime = null;
    this.lastFrameAt = null;
    this.sequence = { last: null, lost: 0, gaps: 0, resets: 0 };
  }

  /** Registers a received frame. Returns a log message for sequence anomalies. */
  record(hostTime, deviceTime, externalSequence) {
    this.frames += 1;
    this.lastFrameAt = hostTime;
    this.arrivals.push(hostTime, hostTime);

    if (Number.isFinite(deviceTime)) {
      if (this.lastDeviceTime !== null && deviceTime > this.lastDeviceTime) {
        this.deviceIntervals.push(hostTime, deviceTime - this.lastDeviceTime);
      }
      this.lastDeviceTime = deviceTime;
    }

    return Number.isFinite(externalSequence) ? this.recordSequence(externalSequence) : null;
  }

  recordSequence(value) {
    const state = this.sequence;
    const previous = state.last;
    state.last = value;
    if (previous === null) {
      return null;
    }
    const delta = value - previous;
    if (delta === 1) {
      return null;
    }
    if (delta > 1) {
      const missing = delta - 1;
      state.lost += missing;
      state.gaps += 1;
      return `SYS > Hueco de secuencia: faltan ${missing} muestra(s), ${previous} -> ${value}`;
    }
    if (isCounterWrap(previous, value)) {
      if (value > 0) {
        state.lost += value;
        state.gaps += 1;
        return `SYS > Hueco de secuencia tras desborde del contador: faltan ${value} muestra(s), ${previous} -> ${value}`;
      }
      return null;
    }
    state.resets += 1;
    return `SYS > Secuencia reiniciada o repetida: ${previous} -> ${value}`;
  }

  /** Frames per second over the stats window, regardless of staleness. */
  measuredRate() {
    const count = this.arrivals.count;
    const spanSeconds = count >= 2 ? (this.arrivals.lastTime() - this.arrivals.firstTime()) / 1000 : 0;
    return spanSeconds > 0 ? (count - 1) / spanSeconds : 0;
  }

  snapshot(now) {
    const isStale = this.lastFrameAt === null || now - this.lastFrameAt > STATS_WINDOW_SECONDS * 1000;
    const sps = isStale ? 0 : this.measuredRate();
    const hasDeviceTiming = this.deviceIntervals.count >= 2 && !isStale;
    return {
      frames: this.frames,
      sps,
      avgMs: sps > 0 ? 1000 / sps : 0,
      devicePeriodMs: hasDeviceTiming ? this.deviceIntervals.mean() : null,
      jitterMs: hasDeviceTiming ? this.deviceIntervals.std() : null,
      lastFrameAt: this.lastFrameAt,
      seqLost: this.sequence.lost,
      seqGaps: this.sequence.gaps,
      seqResets: this.sequence.resets,
      seqLast: this.sequence.last
    };
  }
}
