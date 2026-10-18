// Cursor, tooltip and measurement helpers working on a computed plot frame.
//
// Cursors are anchored to data, not to pixels: with the default index X axis
// they store the absolute sample sequence, so they stay on the same sample
// while the plot scrolls. With a value X axis (timestamp or channel) they
// store the X value.

const pxToX = (frame, px) => {
  const { xTicks, plotArea } = frame;
  return xTicks.min + ((px - plotArea.left) / plotArea.width) * (xTicks.max - xTicks.min || 1);
};

export const xToPx = (frame, x) => {
  const { xTicks, plotArea } = frame;
  return plotArea.left + ((x - xTicks.min) / (xTicks.max - xTicks.min || 1)) * plotArea.width;
};

const yToPx = (frame, value, axis) => {
  const ticks = axis === "y2" ? frame.y2Ticks : frame.y1Ticks;
  const { plotArea } = frame;
  return plotArea.top + plotArea.height - ((value - ticks.min) / (ticks.max - ticks.min || 1)) * plotArea.height;
};

export const isInsidePlotArea = (frame, px, py) => {
  const { plotArea } = frame;
  return px >= plotArea.left && px <= plotArea.left + plotArea.width && py >= plotArea.top && py <= plotArea.top + plotArea.height;
};

export const anchorFromPx = (frame, px) => {
  const x = pxToX(frame, px);
  return frame.xKind === "index"
    ? { kind: "index", sequence: Math.round(x + frame.firstRawSequence) }
    : { kind: "value", x };
};

export const anchorToX = (frame, anchor) => {
  if (!anchor) {
    return Number.NaN;
  }
  if (anchor.kind === "index") {
    return frame.xKind === "index" ? anchor.sequence - frame.firstRawSequence : Number.NaN;
  }
  return frame.xKind === "value" ? anchor.x : Number.NaN;
};

/** Index of the frame sample closest to `x` (binary search when X increases). */
const nearestSampleIndex = (frame, x) => {
  const { xValues } = frame;
  const count = xValues.length;
  if (!count) {
    return -1;
  }
  if (frame.xKind === "index") {
    let low = 0;
    let high = count - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (xValues[middle] < x) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    if (low > 0 && Math.abs(xValues[low - 1] - x) <= Math.abs(xValues[low] - x)) {
      return low - 1;
    }
    return low;
  }
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const distance = Math.abs(xValues[index] - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
};

/** Values of every visible series at the hovered pixel. */
export const computeHover = (engine, frame, px) => {
  const index = nearestSampleIndex(frame, pxToX(frame, px));
  if (index < 0) {
    return null;
  }
  const sample = frame.samples[index];
  const x = frame.xValues[index];
  return {
    px: xToPx(frame, x),
    x,
    timestamp: sample.timestamp,
    rows: frame.yAssignments.map((assignment) => {
      const value = engine.readValue(sample, assignment.channelId);
      return {
        name: assignment.name,
        color: assignment.color,
        value,
        py: Number.isFinite(value) ? yToPx(frame, value, assignment.axis) : Number.NaN
      };
    })
  };
};

/** Raw samples (and their X) between two X values, from the full-resolution view. */
const rawSamplesBetween = (frame, xFrom, xTo) => {
  const { view } = frame;
  const low = Math.min(xFrom, xTo);
  const high = Math.max(xFrom, xTo);
  const result = [];
  if (!view.length) {
    return result;
  }
  if (frame.xKind === "index") {
    const firstSequence = view.at(0).sequence;
    const start = Math.max(0, Math.ceil(low + frame.firstRawSequence - firstSequence));
    const end = Math.min(view.length - 1, Math.floor(high + frame.firstRawSequence - firstSequence));
    for (let index = start; index <= end; index += 1) {
      result.push(view.at(index));
    }
    return result;
  }
  for (let index = 0; index < view.length; index += 1) {
    const sample = view.at(index);
    const x = frame.xOf(sample, index);
    if (x >= low && x <= high) {
      result.push(sample);
    }
  }
  return result;
};

/**
 * Measurement between cursors A and B: Δx, Δt and, per visible series, the
 * values at each cursor and min/max/mean/std/peak-to-peak of the samples in
 * between (full resolution, not the decimated drawing).
 */
export const computeMeasurement = (engine, frame, anchorA, anchorB) => {
  const xa = anchorToX(frame, anchorA);
  const xb = anchorToX(frame, anchorB);
  if (!Number.isFinite(xa) || !Number.isFinite(xb)) {
    return null;
  }
  const samples = rawSamplesBetween(frame, xa, xb);
  if (!samples.length) {
    return { dx: xb - xa, dt: null, count: 0, rows: [] };
  }
  const ordered = xa <= xb;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const sampleA = ordered ? first : last;
  const sampleB = ordered ? last : first;
  const rows = frame.yAssignments.map((assignment) => {
    let count = 0;
    let sum = 0;
    let sumSq = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const shift = engine.readValue(first, assignment.channelId);
    const offset = Number.isFinite(shift) ? shift : 0;
    for (const sample of samples) {
      const value = engine.readValue(sample, assignment.channelId);
      if (!Number.isFinite(value)) {
        continue;
      }
      const shifted = value - offset;
      count += 1;
      sum += shifted;
      sumSq += shifted * shifted;
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
    }
    const meanShifted = count ? sum / count : Number.NaN;
    const valueA = engine.readValue(sampleA, assignment.channelId);
    const valueB = engine.readValue(sampleB, assignment.channelId);
    return {
      name: assignment.name,
      color: assignment.color,
      valueA,
      valueB,
      delta: valueB - valueA,
      count,
      min: count ? min : Number.NaN,
      max: count ? max : Number.NaN,
      mean: count ? offset + meanShifted : Number.NaN,
      std: count ? Math.sqrt(Math.max(0, sumSq / count - meanShifted * meanShifted)) : Number.NaN,
      peakToPeak: count ? max - min : Number.NaN
    };
  });
  return {
    dx: xb - xa,
    dt: (sampleB.timestamp - sampleA.timestamp) / 1000,
    count: samples.length,
    rows
  };
};

/** Compact number formatting for readouts (6 significant digits). */
export const formatReadout = (value) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (value === 0) {
    return "0";
  }
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-4) {
    return value.toExponential(4);
  }
  return String(Number(value.toPrecision(6)));
};
