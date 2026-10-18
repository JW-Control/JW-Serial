// Hierarchical level-of-detail cache. Every BLOCK_SIZE samples a block with
// per-channel min/max (and the samples holding them) is closed; blocks are
// merged pairwise into coarser levels. Drawing a long window then only needs
// the extrema of ~one block group per pixel instead of every sample.

const BLOCK_SIZE = 16;
const physicalIds = [];
const physicalId = (index) => physicalIds[index] || (physicalIds[index] = `val${index}`);

const mergeBlocks = (left, right) => {
  const extrema = new Map(left.extrema);
  right.extrema.forEach((rightExtrema, channelId) => {
    const leftExtrema = extrema.get(channelId);
    if (!leftExtrema) {
      extrema.set(channelId, rightExtrema);
      return;
    }
    extrema.set(channelId, {
      min: Math.min(leftExtrema.min, rightExtrema.min),
      max: Math.max(leftExtrema.max, rightExtrema.max),
      minSample: leftExtrema.min <= rightExtrema.min ? leftExtrema.minSample : rightExtrema.minSample,
      maxSample: leftExtrema.max >= rightExtrema.max ? leftExtrema.maxSample : rightExtrema.maxSample
    });
  });
  return {
    startSequence: left.startSequence,
    endSequence: right.endSequence,
    count: left.count + right.count,
    extrema
  };
};

const updateExtrema = (block, channelId, value, sample) => {
  if (!Number.isFinite(value)) {
    return;
  }
  const current = block.extrema.get(channelId);
  if (!current) {
    block.extrema.set(channelId, { min: value, max: value, minSample: sample, maxSample: sample });
    return;
  }
  if (value < current.min) {
    current.min = value;
    current.minSample = sample;
  }
  if (value > current.max) {
    current.max = value;
    current.maxSample = sample;
  }
};

export class LodCache {
  constructor() {
    this.clear();
  }

  clear() {
    this.levels = [];
    this.current = null;
  }

  append(sample) {
    const sequence = sample.sequence;
    let block = this.current;
    if (!block) {
      block = { startSequence: sequence, endSequence: sequence, count: 0, extrema: new Map() };
      this.current = block;
    }
    const { values, virtualValues } = sample;
    for (let index = 0; index < values.length; index += 1) {
      updateExtrema(block, physicalId(index), values[index], sample);
    }
    if (virtualValues) {
      for (const channelId in virtualValues) {
        updateExtrema(block, channelId, virtualValues[channelId], sample);
      }
    }
    block.endSequence = sequence;
    block.count += 1;
    if (block.count >= BLOCK_SIZE) {
      this.closeBlock(block);
      this.current = null;
    }
  }

  closeBlock(baseBlock) {
    let block = baseBlock;
    let levelIndex = 0;
    while (block) {
      if (!this.levels[levelIndex]) {
        this.levels[levelIndex] = { blocks: [], head: 0, pending: null };
      }
      const level = this.levels[levelIndex];
      level.blocks.push(block);
      if (!level.pending) {
        level.pending = block;
        break;
      }
      block = mergeBlocks(level.pending, block);
      level.pending = null;
      levelIndex += 1;
    }
  }

  rebuild(history) {
    this.clear();
    history.forEach((sample) => this.append(sample));
  }

  /** Drops blocks that end before `oldestSequence` (amortized compaction). */
  trimBefore(oldestSequence) {
    this.levels.forEach((level) => {
      while (level.head < level.blocks.length && level.blocks[level.head].endSequence < oldestSequence) {
        level.head += 1;
      }
      if (level.pending?.endSequence < oldestSequence) {
        level.pending = null;
      }
      if (level.head > 1024 && level.head > level.blocks.length / 2) {
        level.blocks = level.blocks.slice(level.head);
        level.head = 0;
      }
    });
  }

  findRange(level, firstSequence, lastSequence) {
    let low = level.head;
    let high = level.blocks.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (level.blocks[middle].endSequence < firstSequence) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const start = low;
    high = level.blocks.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (level.blocks[middle].startSequence <= lastSequence) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return { start, end: low, count: Math.max(0, low - start) };
  }

  /**
   * Returns the samples worth drawing for `view` (a HistoryView) on a plot
   * `width` pixels wide: the raw samples when they are few enough, otherwise
   * the first/last samples plus the min/max samples of each block group.
   */
  select(view, channelIds, width) {
    // Each LOD group emits Min + Max, so half a group per CSS pixel already
    // provides roughly one drawable point per pixel and channel.
    const targetGroups = Math.max(256, Math.ceil(width / 2));
    const targetSamples = Math.max(2048, targetGroups * Math.max(1, channelIds.length) * 2);
    // Blocks are only worth it when there are more of them than groups:
    // otherwise each block spans several pixels, only its min/max survive and
    // periodic signals alias badly. In that range the raw samples are few
    // enough for the per-pixel reduction done when drawing.
    if (view.length <= targetSamples || view.length < targetGroups * BLOCK_SIZE * 2) {
      return view.toArray();
    }

    const firstSample = view.at(0);
    const lastSample = view.at(view.length - 1);
    const firstSequence = firstSample.sequence;
    const lastSequence = lastSample.sequence;
    const selected = new Map([
      [firstSequence, firstSample],
      [lastSequence, lastSample]
    ]);

    let selectedLevel = this.levels[0] || { blocks: [], head: 0 };
    let selectedRange = this.findRange(selectedLevel, firstSequence, lastSequence);
    for (let levelIndex = 1; levelIndex < this.levels.length; levelIndex += 1) {
      if (selectedRange.count <= targetGroups) {
        break;
      }
      const candidateLevel = this.levels[levelIndex];
      const candidateRange = this.findRange(candidateLevel, firstSequence, lastSequence);
      if (candidateRange.count > 0) {
        selectedLevel = candidateLevel;
        selectedRange = candidateRange;
      }
    }

    const visibleBlocks = selectedLevel.blocks.slice(selectedRange.start, selectedRange.end);
    const coveredEndSequence = visibleBlocks[visibleBlocks.length - 1]?.endSequence ?? firstSequence - 1;
    const baseLevel = this.levels[0];
    if (baseLevel && selectedLevel !== baseLevel) {
      // Coarse levels lag behind: fill the tail with base-level blocks.
      const tailRange = this.findRange(baseLevel, firstSequence, lastSequence);
      let low = tailRange.start;
      let high = tailRange.end;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (baseLevel.blocks[middle].endSequence <= coveredEndSequence) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }
      for (let index = low; index < tailRange.end; index += 1) {
        visibleBlocks.push(baseLevel.blocks[index]);
      }
    }
    if (this.current?.endSequence >= firstSequence && this.current.startSequence <= lastSequence) {
      visibleBlocks.push(this.current);
    }

    const blocksPerGroup = Math.max(1, Math.ceil(visibleBlocks.length / targetGroups));
    for (let groupStart = 0; groupStart < visibleBlocks.length; groupStart += blocksPerGroup) {
      const groupEnd = Math.min(visibleBlocks.length, groupStart + blocksPerGroup);
      for (const channelId of channelIds) {
        let minValue = Number.POSITIVE_INFINITY;
        let maxValue = Number.NEGATIVE_INFINITY;
        let minSample = null;
        let maxSample = null;
        for (let index = groupStart; index < groupEnd; index += 1) {
          const extrema = visibleBlocks[index].extrema.get(channelId);
          if (extrema?.min < minValue) {
            minValue = extrema.min;
            minSample = extrema.minSample;
          }
          if (extrema?.max > maxValue) {
            maxValue = extrema.max;
            maxSample = extrema.maxSample;
          }
        }
        if (minSample && minSample.sequence >= firstSequence && minSample.sequence <= lastSequence) {
          selected.set(minSample.sequence, minSample);
        }
        if (maxSample && maxSample.sequence >= firstSequence && maxSample.sequence <= lastSequence) {
          selected.set(maxSample.sequence, maxSample);
        }
      }
    }
    return [...selected.values()].sort((left, right) => left.sequence - right.sequence);
  }
}
