// Rolling average/min/max curves ("curvas de referencia") computed on the raw
// samples. Each curve keeps its sliding window between frames and only
// processes the samples that arrived since the previous frame.

import { SlidingWindow } from "./virtual/slidingWindow.js";

const readers = {
  avg: (window) => window.mean(),
  min: (window) => window.min(),
  max: (window) => window.max()
};

export class RollingStat {
  constructor({ channelId, mode, unit, value }) {
    this.channelId = channelId;
    this.mode = mode;
    this.unit = unit === "seconds" ? "seconds" : "samples";
    this.value = Math.max(this.unit === "seconds" ? 0.001 : 2, Number(value) || 2);
    this.epoch = -1;
  }

  reset(engine) {
    this.epoch = engine.epoch;
    this.window = new SlidingWindow({ unit: this.unit, value: this.value });
    this.capacity = engine.history.capacity;
    this.values = new Float64Array(this.capacity).fill(Number.NaN);
    const first = engine.history.first();
    this.lastSequence = first ? first.sequence - 1 : 0;
  }

  /** Processes the samples appended since the last call. */
  sync(engine) {
    const { history } = engine;
    if (this.epoch !== engine.epoch || this.capacity !== history.capacity) {
      this.reset(engine);
    }
    const last = history.last();
    if (!last || last.sequence <= this.lastSequence) {
      return;
    }
    const pending = last.sequence - this.lastSequence;
    const startIndex = Math.max(0, history.length - pending);
    const read = readers[this.mode];
    for (let index = startIndex; index < history.length; index += 1) {
      const sample = history.at(index);
      this.window.push(sample.timestamp, engine.readValue(sample, this.channelId));
      this.values[sample.sequence % this.capacity] = read(this.window);
    }
    this.lastSequence = last.sequence;
  }

  valueAt(sequence) {
    if (sequence > this.lastSequence || sequence <= this.lastSequence - this.capacity) {
      return Number.NaN;
    }
    return this.values[sequence % this.capacity];
  }
}
