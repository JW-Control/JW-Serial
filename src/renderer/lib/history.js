// Fixed-capacity ring buffer for the sample history, plus lightweight
// read-only windows over it. Access goes through `at(index)` (no Proxy, no
// copies) so hot loops stay cheap.

export class SampleHistory {
  constructor(capacity = 1) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.storage = new Array(this.capacity);
    this.start = 0;
    this.length = 0;
  }

  setCapacity(nextCapacity) {
    const capacity = Math.max(1, Math.floor(nextCapacity || 1));
    if (capacity === this.capacity) {
      return;
    }
    const keep = Math.min(this.length, capacity);
    const offset = this.length - keep;
    const storage = new Array(capacity);
    for (let index = 0; index < keep; index += 1) {
      storage[index] = this.at(offset + index);
    }
    this.storage = storage;
    this.capacity = capacity;
    this.start = 0;
    this.length = keep;
  }

  push(value) {
    if (this.length < this.capacity) {
      this.storage[(this.start + this.length) % this.capacity] = value;
      this.length += 1;
      return undefined;
    }
    const evicted = this.storage[this.start];
    this.storage[this.start] = value;
    this.start = (this.start + 1) % this.capacity;
    return evicted;
  }

  at(index) {
    const normalized = index < 0 ? this.length + index : index;
    if (normalized < 0 || normalized >= this.length) {
      return undefined;
    }
    return this.storage[(this.start + normalized) % this.capacity];
  }

  first() {
    return this.at(0);
  }

  last() {
    return this.at(this.length - 1);
  }

  forEach(callback) {
    for (let index = 0; index < this.length; index += 1) {
      callback(this.at(index), index);
    }
  }

  /** First index whose sample.timestamp >= time (history is time-ordered). */
  lowerBoundByTime(time) {
    let low = 0;
    let high = this.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.at(middle).timestamp < time) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  clear() {
    this.storage = new Array(this.capacity);
    this.start = 0;
    this.length = 0;
  }
}

/** Read-only window [start, end) over a SampleHistory. */
export class HistoryView {
  constructor(history, start, end) {
    this.history = history;
    this.offset = Math.max(0, Math.min(history.length, start));
    this.length = Math.max(0, Math.min(history.length, end) - this.offset);
  }

  at(index) {
    const normalized = index < 0 ? this.length + index : index;
    return normalized >= 0 && normalized < this.length
      ? this.history.at(this.offset + normalized)
      : undefined;
  }

  forEach(callback) {
    for (let index = 0; index < this.length; index += 1) {
      callback(this.history.at(this.offset + index), index);
    }
  }

  map(callback) {
    const result = new Array(this.length);
    for (let index = 0; index < this.length; index += 1) {
      result[index] = callback(this.history.at(this.offset + index), index);
    }
    return result;
  }

  toArray() {
    return this.map((sample) => sample);
  }
}
