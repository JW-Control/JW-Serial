// Incremental statistics over a sliding window of one channel.
//
// Each push is amortized O(1): min/max use monotonic deques, mean/std/rms use
// running sums. Sums are kept relative to a shift value (close to the data)
// to avoid catastrophic cancellation in the variance, and are rebuilt from
// the buffered values once per window length so rounding error never
// accumulates over long sessions.
//
// Windows are either a sample count (`samples`) or a duration (`seconds`,
// measured with the sample timestamps, not with the configured SPS).
// Non-finite values occupy a slot (they count for sample windows) but are
// ignored by every statistic, matching the original behaviour.

const nextPowerOfTwo = (value) => 2 ** Math.ceil(Math.log2(Math.max(2, value)));

class IndexDeque {
  constructor() {
    this.items = [];
    this.head = 0;
  }

  get size() {
    return this.items.length - this.head;
  }

  front() {
    return this.items[this.head];
  }

  back() {
    return this.items[this.items.length - 1];
  }

  push(value) {
    this.items.push(value);
  }

  popBack() {
    this.items.pop();
  }

  popFront() {
    this.head += 1;
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
  }

  clear() {
    this.items = [];
    this.head = 0;
  }
}

export class SlidingWindow {
  constructor({ unit = "samples", value = 1 } = {}) {
    this.unit = unit === "seconds" ? "seconds" : "samples";
    this.size = this.unit === "samples" ? Math.max(1, Math.round(value)) : 0;
    this.durationMs = this.unit === "seconds" ? Math.max(0, value) * 1000 : 0;
    const initialCapacity = this.unit === "samples" ? nextPowerOfTwo(this.size + 1) : 1024;
    this.values = new Float64Array(initialCapacity);
    this.times = new Float64Array(initialCapacity);
    this.mask = initialCapacity - 1;
    this.minDeque = new IndexDeque();
    this.maxDeque = new IndexDeque();
    this.reset();
  }

  reset() {
    this.head = 0; // absolute index of the oldest buffered entry
    this.tail = 0; // absolute index one past the newest entry
    this.firstFinite = -1;
    this.lastFinite = -1;
    this.count = 0;
    this.shift = 0;
    this.sum = 0;
    this.sumSq = 0;
    this.evictionsSinceRebuild = 0;
    this.minDeque.clear();
    this.maxDeque.clear();
  }

  valueAt(absoluteIndex) {
    return this.values[absoluteIndex & this.mask];
  }

  timeAt(absoluteIndex) {
    return this.times[absoluteIndex & this.mask];
  }

  grow() {
    const capacity = (this.mask + 1) * 2;
    const values = new Float64Array(capacity);
    const times = new Float64Array(capacity);
    const mask = capacity - 1;
    for (let index = this.head; index < this.tail; index += 1) {
      values[index & mask] = this.values[index & this.mask];
      times[index & mask] = this.times[index & this.mask];
    }
    this.values = values;
    this.times = times;
    this.mask = mask;
  }

  push(time, value) {
    if (this.tail - this.head > this.mask) {
      this.grow();
    }
    const index = this.tail;
    this.values[index & this.mask] = value;
    this.times[index & this.mask] = time;
    this.tail += 1;

    if (Number.isFinite(value)) {
      if (this.count === 0) {
        this.shift = value;
        this.sum = 0;
        this.sumSq = 0;
      }
      const shifted = value - this.shift;
      this.count += 1;
      this.sum += shifted;
      this.sumSq += shifted * shifted;
      if (this.firstFinite < 0) {
        this.firstFinite = index;
      }
      this.lastFinite = index;
      while (this.minDeque.size && this.valueAt(this.minDeque.back()) >= value) {
        this.minDeque.popBack();
      }
      this.minDeque.push(index);
      while (this.maxDeque.size && this.valueAt(this.maxDeque.back()) <= value) {
        this.maxDeque.popBack();
      }
      this.maxDeque.push(index);
    }

    this.evict(time);
  }

  evict(now) {
    if (this.unit === "samples") {
      while (this.tail - this.head > this.size) {
        this.evictOldest();
      }
    } else {
      const cutoff = now - this.durationMs;
      // Keep at least the newest entry so a window shorter than the sample
      // period still reports the current value.
      while (this.tail - this.head > 1 && this.timeAt(this.head) <= cutoff) {
        this.evictOldest();
      }
    }
    if (this.evictionsSinceRebuild >= Math.max(1024, this.tail - this.head)) {
      this.rebuildSums();
    }
  }

  evictOldest() {
    const index = this.head;
    const value = this.valueAt(index);
    this.head += 1;
    if (!Number.isFinite(value)) {
      return;
    }
    this.count -= 1;
    const shifted = value - this.shift;
    this.sum -= shifted;
    this.sumSq -= shifted * shifted;
    this.evictionsSinceRebuild += 1;
    if (this.minDeque.size && this.minDeque.front() === index) {
      this.minDeque.popFront();
    }
    if (this.maxDeque.size && this.maxDeque.front() === index) {
      this.maxDeque.popFront();
    }
    if (this.count === 0) {
      this.firstFinite = -1;
      this.lastFinite = -1;
      return;
    }
    if (this.firstFinite === index) {
      let next = index + 1;
      while (next < this.tail && !Number.isFinite(this.valueAt(next))) {
        next += 1;
      }
      this.firstFinite = next;
    }
  }

  rebuildSums() {
    this.evictionsSinceRebuild = 0;
    if (this.count === 0) {
      this.sum = 0;
      this.sumSq = 0;
      return;
    }
    this.shift = this.valueAt(this.firstFinite);
    let sum = 0;
    let sumSq = 0;
    for (let index = this.firstFinite; index < this.tail; index += 1) {
      const value = this.valueAt(index);
      if (Number.isFinite(value)) {
        const shifted = value - this.shift;
        sum += shifted;
        sumSq += shifted * shifted;
      }
    }
    this.sum = sum;
    this.sumSq = sumSq;
  }

  first() {
    return this.count ? this.valueAt(this.firstFinite) : Number.NaN;
  }

  firstTime() {
    return this.count ? this.timeAt(this.firstFinite) : Number.NaN;
  }

  lastTime() {
    return this.count ? this.timeAt(this.lastFinite) : Number.NaN;
  }

  last() {
    return this.count ? this.valueAt(this.lastFinite) : Number.NaN;
  }

  min() {
    return this.minDeque.size ? this.valueAt(this.minDeque.front()) : Number.NaN;
  }

  max() {
    return this.maxDeque.size ? this.valueAt(this.maxDeque.front()) : Number.NaN;
  }

  mean() {
    return this.count ? this.shift + this.sum / this.count : Number.NaN;
  }

  delta() {
    return this.count >= 2 ? this.last() - this.first() : Number.NaN;
  }

  /** Units per second for time windows, per sample for sample windows. */
  slope() {
    if (this.count < 2) {
      return Number.NaN;
    }
    if (this.unit === "seconds") {
      const elapsedSeconds = (this.timeAt(this.lastFinite) - this.timeAt(this.firstFinite)) / 1000;
      return elapsedSeconds > 0 ? this.delta() / elapsedSeconds : Number.NaN;
    }
    return this.delta() / (this.count - 1);
  }

  /** Population standard deviation (divides by N). */
  std() {
    if (!this.count) {
      return Number.NaN;
    }
    const meanShifted = this.sum / this.count;
    return Math.sqrt(Math.max(0, this.sumSq / this.count - meanShifted * meanShifted));
  }

  rms() {
    if (!this.count) {
      return Number.NaN;
    }
    const meanSquare = (this.sumSq + 2 * this.shift * this.sum) / this.count + this.shift * this.shift;
    return Math.sqrt(Math.max(0, meanSquare));
  }
}
