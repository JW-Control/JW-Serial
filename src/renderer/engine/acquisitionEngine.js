// Acquisition engine: owns everything that changes at data rate (sample
// history, LOD cache, link metrics, virtual-function values, monitor log)
// outside React. Components read it directly when drawing, or subscribe to a
// throttled snapshot for the few numbers shown as text.

import { extractFramePayload } from "../../shared/serialProtocol.js";
import { HistoryView, SampleHistory } from "../lib/history.js";
import { LodCache } from "../lib/lod.js";
import { createEmptyRxStats, ReceiveStats } from "./receiveStats.js";
import { VirtualFunctionSet } from "./virtualFunctionSet.js";

const MAX_LOG_LINES = 400;
const MAX_LOG_LINES_PER_FLUSH = 120;
const BUFFER_HEADROOM = 1.25;
const physicalIndexCache = new Map();

const physicalIndex = (channelId) => {
  let index = physicalIndexCache.get(channelId);
  if (index === undefined) {
    const match = /^val(\d+)$/.exec(channelId || "");
    index = match ? Number(match[1]) : -1;
    physicalIndexCache.set(channelId, index);
  }
  return index;
};

export const readSampleValue = (sample, channelId) => {
  if (!sample || !channelId) {
    return undefined;
  }
  const index = physicalIndex(channelId);
  if (index >= 0) {
    return sample.values[index];
  }
  return sample.virtualValues?.[channelId];
};

const now = () => performance.timeOrigin + performance.now();

export class AcquisitionEngine {
  constructor() {
    this.config = {
      channelCount: 0,
      bufferSeconds: 120,
      samplesPerSecond: 100,
      includeTimestamp: false,
      includeSequenceCounter: false
    };
    this.uiIntervalMs = 100;
    this.paused = false;
    this.history = new SampleHistory(this.desiredCapacity(0));
    this.lod = new LodCache();
    this.stats = new ReceiveStats();
    this.virtual = new VirtualFunctionSet([], [], readSampleValue);
    this.virtualDefinitions = [];
    this.virtualChannels = [];
    this.sequence = 0;
    this.dataVersion = 0;
    // Bumped whenever existing samples change or are dropped wholesale, so
    // caches derived from the history know they must rebuild.
    this.epoch = 0;
    this.latestValues = [];
    this.latestVirtualValues = {};
    this.channelStructure = { count: 0, names: [] };
    this.log = [];
    this.logQueue = [];
    this.paintCount = 0;
    this.lastPaintFrame = -1;
    // Renderer-side time of the last ingested frame. Frame timestamps come
    // from the main process clock; staleness checks use this one instead.
    this.lastIngestAt = null;
    this.fps = 0;
    this.listeners = new Set();
    this.structureListeners = new Set();
    this.snapshot = this.buildSnapshot();
    this.flushTimer = null;
    this.lastFlushAt = 0;
    this.fpsTimer = null;
    this.fpsSample = { count: 0, at: performance.now() };
  }

  // ---------------------------------------------------------------- config

  desiredCapacity(measuredSps) {
    const sps = Math.max(1, Number(this.config.samplesPerSecond) || 1, measuredSps || 0);
    return Math.max(2, Math.ceil((Number(this.config.bufferSeconds) || 1) * sps * BUFFER_HEADROOM));
  }

  configure(patch) {
    this.config = { ...this.config, ...patch };
    this.ensureCapacity(this.stats?.measuredRate() || 0, true);
  }

  /**
   * Keeps the ring buffer large enough to cover bufferSeconds at the measured
   * rate. It only shrinks on an explicit configuration change, never because
   * data stopped arriving.
   */
  ensureCapacity(measuredSps, allowShrink = false) {
    const desired = this.desiredCapacity(measuredSps);
    const capacity = this.history.capacity;
    // desiredCapacity() already includes headroom; growing only past it (and
    // then by an extra 20 %) avoids resizing on every small SPS fluctuation.
    const mustGrow = desired > capacity * BUFFER_HEADROOM;
    const mustResize = allowShrink && (desired > capacity || desired < capacity / 2);
    if (mustGrow || mustResize) {
      this.history.setCapacity(mustGrow ? Math.ceil(desired * 1.2) : desired);
      this.epoch += 1;
      if (this.history.length) {
        this.lod.trimBefore(this.history.first().sequence);
      }
    }
  }

  setUiInterval(milliseconds) {
    this.uiIntervalMs = Math.max(100, Math.min(1000, Number(milliseconds) || 100));
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
  }

  /**
   * Replaces the virtual functions and recomputes their values over the whole
   * history in a single O(N) pass. Returns `{ [id]: errorMessage }`.
   */
  setVirtualFunctions(definitions, channels) {
    this.virtualDefinitions = definitions;
    this.virtualChannels = channels;
    const functionSet = new VirtualFunctionSet(definitions, channels, readSampleValue);
    this.virtual = functionSet;
    let latest = {};
    this.history.forEach((sample) => {
      if (functionSet.isEmpty) {
        sample.virtualValues = undefined;
        return;
      }
      latest = functionSet.evaluate(sample);
      sample.virtualValues = latest;
    });
    this.latestVirtualValues = latest;
    this.lod.rebuild(this.history);
    this.dataVersion += 1;
    this.epoch += 1;
    this.scheduleFlush(true);
    return Object.fromEntries(functionSet.errors);
  }

  // ------------------------------------------------------------- ingestion

  ingestFrames(frames) {
    const { config } = this;
    const payloadOptions = {
      includeTimestamp: config.includeTimestamp,
      includeSequenceCounter: config.includeSequenceCounter
    };
    if (frames.length) {
      this.lastIngestAt = now();
    }
    for (const frame of frames) {
      const payload = extractFramePayload(frame, payloadOptions);
      const timestamp = Number(frame.timestamp) || now();
      // Link metrics keep running while paused so resuming does not report
      // the paused interval as lost samples.
      const sequenceMessage = this.stats.record(
        timestamp,
        config.includeTimestamp ? payload.xValue : null,
        payload.externalSequence
      );
      if (sequenceMessage) {
        this.queueLog(sequenceMessage);
      }
      if (this.paused) {
        continue;
      }
      this.updateChannelStructure(payload);
      this.appendSample(payload, timestamp);
    }
    this.scheduleFlush();
  }

  updateChannelStructure(payload) {
    const count = this.config.channelCount > 0 ? this.config.channelCount : payload.values.length;
    const values = payload.values.length > count ? payload.values.slice(0, count) : payload.values;
    this.latestValues = values;
    const structure = this.channelStructure;
    let changed = structure.count !== count;
    if (payload.names) {
      for (let index = 0; index < count; index += 1) {
        const name = payload.names[index];
        if (name && structure.names[index] !== name) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      const names = payload.names ? payload.names.slice(0, count) : structure.names.slice(0, count);
      this.channelStructure = { count, names };
      this.structureListeners.forEach((listener) => listener(this.channelStructure));
    }
  }

  appendSample(payload, timestamp) {
    const count = this.channelStructure.count;
    this.sequence += 1;
    const sample = {
      sequence: this.sequence,
      externalSequence: payload.externalSequence,
      timestamp,
      xValue: payload.xValue,
      values: payload.values.length > count ? payload.values.slice(0, count) : payload.values
    };
    if (!this.virtual.isEmpty) {
      sample.virtualValues = this.virtual.evaluate(sample);
      this.latestVirtualValues = sample.virtualValues;
    }
    const evicted = this.history.push(sample);
    this.lod.append(sample);
    if (evicted && this.sequence % 64 === 0) {
      this.lod.trimBefore(this.history.first().sequence);
    }
    this.dataVersion += 1;
  }

  ingestRawLines(payload) {
    const lines = Array.isArray(payload) ? payload : payload?.lines || [];
    for (const line of lines) {
      if (line?.trim()) {
        this.queueLog(`RX > ${line}`);
      }
    }
    if (payload?.dropped) {
      this.queueLog(`SYS > ${payload.dropped} línea(s) no mostradas en el monitor por alta tasa de datos.`);
    }
    this.scheduleFlush();
  }

  queueLog(line) {
    this.logQueue.push(line);
    if (this.logQueue.length > MAX_LOG_LINES) {
      this.logQueue.splice(0, this.logQueue.length - MAX_LOG_LINES);
    }
  }

  /** Adds a monitor line immediately (system/TX/event messages). */
  appendLog(line) {
    this.queueLog(line);
    this.scheduleFlush(true);
  }

  clearLog() {
    this.log = [];
    this.logQueue = [];
    this.scheduleFlush(true);
  }

  clear() {
    this.history.clear();
    this.lod.clear();
    this.stats.reset();
    this.lastIngestAt = null;
    this.virtual = new VirtualFunctionSet(this.virtualDefinitions, this.virtualChannels, readSampleValue);
    this.sequence = 0;
    this.latestValues = [];
    this.latestVirtualValues = {};
    this.log = [];
    this.logQueue = [];
    this.dataVersion += 1;
    this.epoch += 1;
    this.scheduleFlush(true);
  }

  // ---------------------------------------------------------------- reads

  readValue(sample, channelId) {
    return readSampleValue(sample, channelId);
  }

  /** Renderer time of the last received frame (null before any frame). */
  get lastFrameAt() {
    return this.lastIngestAt;
  }

  /** Current time expressed in the main-process clock of frame timestamps. */
  frameClockNow() {
    const { lastFrameAt } = this.stats;
    return lastFrameAt === null || this.lastIngestAt === null ? now() : lastFrameAt + (now() - this.lastIngestAt);
  }

  /** Seconds of data currently kept, capped to the configured buffer. */
  getSpanSeconds() {
    if (this.history.length < 2) {
      return 0;
    }
    const span = (this.history.last().timestamp - this.history.first().timestamp) / 1000;
    return Math.min(span, Number(this.config.bufferSeconds) || span);
  }

  /**
   * Time-based view of the history: the last `windowSeconds` (defaults to
   * the buffer length) ending `offsetSeconds` before the newest sample.
   */
  getView(windowSeconds = this.config.bufferSeconds, offsetSeconds = 0) {
    const { history } = this;
    if (!history.length) {
      return new HistoryView(history, 0, 0);
    }
    const end = history.last().timestamp - Math.max(0, offsetSeconds) * 1000;
    const start = end - Math.max(0, windowSeconds) * 1000;
    const endIndex = offsetSeconds > 0 ? history.lowerBoundByTime(end + 1e-6) : history.length;
    const startIndex = history.lowerBoundByTime(start);
    return new HistoryView(history, startIndex, Math.max(startIndex, endIndex));
  }

  /** Called by every plot after repainting; counts animation frames, not plots. */
  notePaint = (frameTime) => {
    if (frameTime !== this.lastPaintFrame) {
      this.lastPaintFrame = frameTime;
      this.paintCount += 1;
    }
  };

  // -------------------------------------------------------- subscriptions

  subscribe = (listener) => {
    this.listeners.add(listener);
    this.startFpsTimer();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.stopFpsTimer();
      }
    };
  };

  getSnapshot = () => this.snapshot;

  onChannelStructure(listener) {
    this.structureListeners.add(listener);
    return () => this.structureListeners.delete(listener);
  }

  buildSnapshot() {
    return {
      channelValues: this.latestValues,
      virtualValues: this.latestVirtualValues,
      rxStats: this.stats ? this.stats.snapshot(this.frameClockNow()) : createEmptyRxStats(),
      fps: this.fps,
      log: this.log,
      dataVersion: this.dataVersion
    };
  }

  scheduleFlush(immediate = false) {
    if (this.flushTimer) {
      if (!immediate) {
        return;
      }
      clearTimeout(this.flushTimer);
    }
    const elapsed = performance.now() - this.lastFlushAt;
    const delay = immediate ? 0 : Math.max(0, this.uiIntervalMs - elapsed);
    this.flushTimer = setTimeout(this.flush, delay);
  }

  flush = () => {
    this.flushTimer = null;
    this.lastFlushAt = performance.now();
    if (this.logQueue.length) {
      const visible = this.logQueue.length > MAX_LOG_LINES_PER_FLUSH
        ? this.logQueue.slice(-MAX_LOG_LINES_PER_FLUSH)
        : this.logQueue;
      this.log = [...this.log, ...visible].slice(-MAX_LOG_LINES);
      this.logQueue = [];
    }
    this.ensureCapacity(this.stats.measuredRate());
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  };

  startFpsTimer() {
    if (this.fpsTimer) {
      return;
    }
    this.fpsSample = { count: this.paintCount, at: performance.now() };
    this.fpsTimer = setInterval(() => {
      const at = performance.now();
      const elapsedSeconds = Math.max(0.001, (at - this.fpsSample.at) / 1000);
      this.fps = (this.paintCount - this.fpsSample.count) / elapsedSeconds;
      this.fpsSample = { count: this.paintCount, at };
      // Refresh time-dependent metrics (SPS decays to 0 when data stops).
      this.flush();
    }, 1000);
  }

  stopFpsTimer() {
    clearInterval(this.fpsTimer);
    this.fpsTimer = null;
  }
}
