import React, { useEffect, useMemo, useRef, useState } from "react";

const channelPalette = ["#ef4444", "#d97706", "#c0ca33", "#65a30d", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b"];
const virtualPalette = ["#2563eb", "#9333ea", "#0891b2", "#db2777", "#16a34a", "#ea580c"];

const virtualOperations = [
  { id: "current", label: "Actual", needsWindow: false, formula: (name) => `actual([${name}])` },
  { id: "initial", label: "Inicial", needsWindow: true, formula: (name, windowText) => `inicial([${name}], ${windowText})` },
  { id: "min", label: "Min", needsWindow: true, formula: (name, windowText) => `min([${name}], ${windowText})` },
  { id: "max", label: "Max", needsWindow: true, formula: (name, windowText) => `max([${name}], ${windowText})` },
  { id: "avg", label: "Prom", needsWindow: true, formula: (name, windowText) => `prom([${name}], ${windowText})` },
  { id: "rangeAbs", label: "|Max-Min|", needsWindow: true, formula: (name, windowText) => `abs(max([${name}], ${windowText}) - min([${name}], ${windowText}))` },
  { id: "delta", label: "Delta", needsWindow: true, formula: (name, windowText) => `delta([${name}], ${windowText})` },
  { id: "slope", label: "Pend", needsWindow: true, formula: (name, windowText) => `pend([${name}], ${windowText})` },
  { id: "std", label: "Std", needsWindow: true, formula: (name, windowText) => `std([${name}], ${windowText})` },
  { id: "rms", label: "RMS", needsWindow: true, formula: (name, windowText) => `rms([${name}], ${windowText})` }
];

const functionBlockOperations = [
  { id: "current", label: "Actual", kind: "window", needsWindow: false },
  { id: "initial", label: "Inicial", kind: "window", needsWindow: true },
  { id: "min", label: "Min", kind: "window", needsWindow: true },
  { id: "max", label: "Max", kind: "window", needsWindow: true },
  { id: "avg", label: "Prom", kind: "window", needsWindow: true },
  { id: "rangeAbs", label: "|Max-Min|", kind: "window", needsWindow: true },
  { id: "delta", label: "Delta", kind: "window", needsWindow: true },
  { id: "slope", label: "Pend", kind: "window", needsWindow: true },
  { id: "std", label: "Std", kind: "window", needsWindow: true },
  { id: "rms", label: "RMS", kind: "window", needsWindow: true },
  { id: "abs", label: "Abs", kind: "unary" },
  { id: "sqrt", label: "Sqrt", kind: "unary" },
  { id: "round", label: "Round", kind: "unary" },
  { id: "add", label: "+", kind: "binary", symbol: "+" },
  { id: "subtract", label: "-", kind: "binary", symbol: "-" },
  { id: "multiply", label: "*", kind: "binary", symbol: "*" },
  { id: "divide", label: "/", kind: "binary", symbol: "/" },
  { id: "power", label: "^", kind: "binary", symbol: "^" },
  { id: "gt", label: ">", kind: "binary", symbol: ">" },
  { id: "lt", label: "<", kind: "binary", symbol: "<" },
  { id: "gte", label: ">=", kind: "binary", symbol: ">=" },
  { id: "lte", label: "<=", kind: "binary", symbol: "<=" }
];

const binaryBlockSymbols = {
  add: "+",
  subtract: "-",
  multiply: "*",
  divide: "/",
  power: "^",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<="
};

const binaryExpressionFunctions = {
  gt: "gt",
  lt: "lt",
  gte: "gte",
  lte: "lte"
};

const unaryExpressionFunctions = {
  abs: "abs",
  sqrt: "sqrt",
  round: "round"
};

const windowExpressionFunctions = {
  current: "actual",
  initial: "inicial",
  min: "min",
  max: "max",
  avg: "prom",
  delta: "delta",
  slope: "pend",
  std: "std",
  rms: "rms"
};

const createDefaultChannels = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `val${index}`,
    name: `val${index}`,
    color: channelPalette[index % channelPalette.length],
    lineStyle: "solid",
    thickness: 2,
    value: 0
  }));

const createPlot = (index) => ({
  id: `plot-${index}`,
  title: `Plot ${index}`,
  assignments: [],
  height: 320,
  statsWindowUnit: "samples",
  statsWindowValue: 400,
  xMode: "auto",
  y1Mode: "auto",
  y2Mode: "auto",
  xManualMin: 0,
  xManualMax: 100,
  xWindowSize: 10,
  y1ManualMin: 0,
  y1ManualMax: 1,
  y2ManualMin: 0,
  y2ManualMax: 1,
  statAvgTargets: [],
  statMinTargets: [],
  statMaxTargets: []
});

const defaultPlots = [createPlot(1), createPlot(2)];
const defaultCaptureConfig = {
  enabled: false,
  intervalMinutes: 10,
  directory: "",
  label: "",
  usePrefix: false,
  useSubfolder: false
};

const defaultAppSettings = {
  serialTimeoutSeconds: 10,
  sessionRestoreMode: "ask",
  serialFilterMode: "none",
  serialFilterPatterns: ""
};

const appSettingsStorageKey = "jwSerialAppSettings";
const lastSessionStorageKey = "jwSerialLastSession";

const readJsonStorage = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch (_error) {
    return fallback;
  }
};

const normalizeSerialFilterPatterns = (patterns) =>
  String(patterns || "")
    .split(/\r?\n/)
    .map((pattern) => pattern.trim())
    .filter(Boolean);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matchesSerialFilterPattern = (line, pattern) => {
  if (!pattern) {
    return false;
  }

  if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
    try {
      return new RegExp(pattern.slice(1, -1)).test(line);
    } catch (_error) {
      return false;
    }
  }

  if (pattern.includes("*")) {
    const expression = pattern
      .split("*")
      .map(escapeRegExp)
      .join(".*");
    return new RegExp(expression).test(line);
  }

  return line.startsWith(pattern);
};

const shouldAcceptSerialLine = (line, mode, patternsText) => {
  const patterns = normalizeSerialFilterPatterns(patternsText);

  if ((mode || "none") === "none" || patterns.length === 0) {
    return true;
  }

  const normalizedLine = String(line || "").trim();
  const matches = patterns.some((pattern) => matchesSerialFilterPattern(normalizedLine, pattern));
  return mode === "accept" ? matches : !matches;
};

const commonBaudRates = [
  300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 31250, 38400, 57600,
  74880, 115200, 128000, 230400, 250000, 460800, 500000, 921600, 1000000,
  1500000, 2000000
];

const esp32Ch340HighSpeedProfile = {
  baudRate: 921600,
  channelCount: 2,
  samplesPerSecond: 2000,
  periodMs: 0.5,
  bufferSeconds: 60,
  refreshMs: 50,
  plotMode: "minmax",
  xWindowSize: 10,
  serialTimeoutSeconds: 3
};

const normalizeChannels = (count, previous) => {
  const safeCount = Math.max(1, count);
  const base = createDefaultChannels(safeCount);
  return base.map((item, index) => {
    const prev = previous[index];
    return prev ? { ...item, ...prev, id: item.id } : item;
  });
};

const channelIndex = (channelId) => Number(channelId.replace("val", ""));
const isPhysicalChannelId = (channelId) => /^val\d+$/.test(channelId || "");
const isSystemChannelId = (channelId) => /^sys[A-Z]/.test(channelId || "");

const axisLabels = {
  x: "X",
  y1: "Y1",
  y2: "Y2"
};

const buildPath = (points) =>
  points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

const minStep = 0.05;

const pickStep = (range, targetTicks = 6) => {
  if (range <= 0 || Number.isNaN(range)) {
    return minStep;
  }

  const target = Math.max(minStep, range / targetTicks);
  const exponent = Math.floor(Math.log10(target));
  const base = 10 ** exponent;
  const candidates = [5 * base, 10 * base].filter((step) => step >= minStep);

  for (const candidate of candidates) {
    if (candidate >= target) {
      return candidate;
    }
  }

  return Math.max(minStep, 5 * 10 ** (exponent + 1));
};

const getStepDivisionBase = (step) => {
  if (!Number.isFinite(step) || step <= 0) {
    return 10;
  }

  const exponent = Math.floor(Math.log10(step));
  const normalized = step / 10 ** exponent;
  return Math.abs(normalized - 5) < 1e-9 ? 5 : 10;
};

const makeTicks = (minValue, maxValue, targetTicks = 6) => {
  const min = Number.isFinite(minValue) ? minValue : 0;
  const max = Number.isFinite(maxValue) ? maxValue : min + 1;
  const safeMax = max === min ? min + 1 : max;
  const step = pickStep(safeMax - min, targetTicks);
  const start = Math.floor(min / step) * step;
  const ticks = [];

  for (let tick = start; tick <= safeMax + step; tick += step) {
    if (tick >= min && tick <= safeMax) {
      ticks.push(Number(tick.toFixed(6)));
    }
  }

  if (ticks.length < 2) {
    ticks.push(Number((start + step).toFixed(6)));
  }

  return { ticks, min, max: safeMax, step };
};

const makeMinorTicks = (ticksData, divisions = 10) => {
  if (!ticksData?.ticks?.length || !Number.isFinite(ticksData.step) || divisions <= 1) {
    return [];
  }

  const minorStep = ticksData.step / divisions;
  const start = Math.floor(ticksData.min / ticksData.step) * ticksData.step;
  const end = ticksData.max;
  const values = [];

  for (let tick = start; tick <= end + minorStep * 0.5; tick += minorStep) {
    const rounded = Number(tick.toFixed(6));
    const isMajor = ticksData.ticks.some((major) => Math.abs(major - rounded) < minorStep * 0.2);
    if (!isMajor && rounded >= ticksData.min && rounded <= ticksData.max) {
      values.push(rounded);
    }
  }

  return values;
};

const makeXTicks = (minValue, maxValue, targetTicks = 8) => {
  const min = Number.isFinite(minValue) ? minValue : 0;
  const max = Number.isFinite(maxValue) ? maxValue : min + 1;
  const safeMax = max <= min ? min + 1 : max;
  const step = pickStep(safeMax - min, targetTicks);
  const start = Math.ceil(min / step) * step;
  const ticks = [];

  for (let tick = start; tick <= safeMax + step * 0.0001; tick += step) {
    if (tick >= min && tick <= safeMax) {
      ticks.push(Number(tick.toFixed(6)));
    }
  }

  if (ticks.length === 0) {
    ticks.push(Number((Math.round(min / step) * step).toFixed(6)));
  }

  return { ticks, min, max: safeMax, step };
};

const makeYAxisTicks = (minValue, maxValue, pixelHeight) => {
  const span = Math.max(1, maxValue - minValue);
  const targetTicks = clamp(Math.floor(pixelHeight / 28), 5, 16);

  if (targetTicks <= 2) {
    const step = pickStep(span, 2);
    const centered = Number((Math.round(((minValue + maxValue) * 0.5) / step) * step).toFixed(6));
    return { ticks: [centered], min: minValue, max: maxValue, step };
  }

  return makeTicks(minValue, maxValue, targetTicks);
};

const makeTicksFromStepRange = (minValue, maxValue, step) => {
  const safeStep = Number.isFinite(step) && step > 0 ? step : minStep;
  const min = Number.isFinite(minValue) ? minValue : 0;
  const max = Number.isFinite(maxValue) && maxValue > min ? maxValue : min + safeStep;
  const start = Math.ceil(min / safeStep) * safeStep;
  const ticks = [];

  for (let tick = start; tick <= max + safeStep * 0.0001; tick += safeStep) {
    ticks.push(Number(tick.toFixed(6)));
  }

  if (ticks.length < 2) {
    ticks.push(Number((start + safeStep).toFixed(6)));
  }

  return {
    ticks,
    min: Number(min.toFixed(6)),
    max: Number(max.toFixed(6)),
    step: safeStep
  };
};

const makeYAxisTicksFollowingReference = (referenceTicksData, targetStats, targetStep, previousState) => {
  const referenceStep = referenceTicksData.step || 1;
  const referenceSpan = referenceTicksData.max - referenceTicksData.min || referenceStep;
  const targetSpan = (referenceSpan / referenceStep) * targetStep;
  const firstReferenceTick = referenceTicksData.ticks[0] ?? referenceTicksData.min;
  const referenceTickOffset = (firstReferenceTick - referenceTicksData.min) / referenceStep;
  const targetMid = (targetStats.min + targetStats.max) * 0.5;
  const targetHasZero = Number.isFinite(targetStats.min)
    && Number.isFinite(targetStats.max)
    && targetStats.min <= 0
    && targetStats.max >= 0;
  const alignTargetValueToReferenceTick = (firstTick, targetValue) => {
    const nearestIndex = Math.round((targetValue - firstTick) / targetStep);
    const boundedIndex = Math.min(
      Math.max(nearestIndex, 0),
      Math.max(referenceTicksData.ticks.length - 1, 0)
    );
    return Number((targetValue - boundedIndex * targetStep).toFixed(6));
  };
  let firstTargetTick;

  if (previousState && previousState.step === targetStep && Number.isFinite(previousState.firstTargetTick)) {
    const referenceDeltaTicks = (firstReferenceTick - previousState.firstReferenceTick) / (previousState.referenceStep || referenceStep);
    firstTargetTick = previousState.firstTargetTick + referenceDeltaTicks * targetStep;
  } else {
    const approximateFirstTick = targetMid - targetSpan * 0.5 + referenceTickOffset * targetStep;
    firstTargetTick = Math.round(approximateFirstTick / targetStep) * targetStep;
  }

  if (targetHasZero) {
    firstTargetTick = alignTargetValueToReferenceTick(firstTargetTick, 0);
  }

  let min = firstTargetTick - referenceTickOffset * targetStep;
  let max = min + targetSpan;

  while (targetStats.min < min) {
    firstTargetTick -= targetStep;
    min -= targetStep;
    max -= targetStep;
  }
  while (targetStats.max > max) {
    firstTargetTick += targetStep;
    min += targetStep;
    max += targetStep;
  }

  const ticks = referenceTicksData.ticks.map((_, index) =>
    Number((firstTargetTick + index * targetStep).toFixed(6))
  );

  return {
    ticks,
    min: Number(min.toFixed(6)),
    max: Number(max.toFixed(6)),
    step: targetStep,
    state: {
      firstReferenceTick,
      firstTargetTick,
      referenceStep,
      step: targetStep
    }
  };
};

const filterTicksByPixelGap = (ticks, toPx, minGap = 22) => {
  const ordered = [...ticks].sort((a, b) => toPx(a) - toPx(b));
  const kept = [];

  ordered.forEach((tick) => {
    const px = toPx(tick);
    const prev = kept[kept.length - 1];
    if (!prev || Math.abs(px - toPx(prev)) >= minGap) {
      kept.push(tick);
    }
  });

  return kept;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const findFiniteRange = (values) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  values.forEach((value) => {
    if (!Number.isFinite(value)) {
      return;
    }

    min = Math.min(min, value);
    max = Math.max(max, value);
  });

  return Number.isFinite(min) ? { min, max } : null;
};

const normalizeAxisRange = (minValue, maxValue) => {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 1 };
  }

  if (minValue === maxValue) {
    const pad = Math.max(Math.abs(minValue) * 0.08, 1);
    return { min: minValue - pad, max: maxValue + pad };
  }

  const span = maxValue - minValue;
  const pad = span * 0.12;
  return { min: minValue - pad, max: maxValue + pad };
};

const normalizeYAxisRange = (minValue, maxValue) => {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 1 };
  }

  if (minValue === maxValue) {
    const pad = Math.max(Math.abs(minValue) * 0.05, 0.1);
    return { min: minValue - pad, max: maxValue + pad };
  }

  const span = maxValue - minValue;
  const pad = Math.max(span * 0.06, 0.05);
  return { min: minValue - pad, max: maxValue + pad };
};

const formatTick = (value, step) => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Number(value.toFixed(6));
  if (step >= 1) {
    const nearestInt = Math.round(rounded);
    if (Math.abs(rounded - nearestInt) < 1e-3) {
      return nearestInt.toString();
    }
    return rounded.toFixed(1).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (step >= 0.5) {
    return rounded.toFixed(1).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (step >= 0.1) {
    return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  return rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
};

const downsamplePointsByPixel = (points) => {
  if (points.length <= 2) {
    return points;
  }

  const buckets = new Map();
  points.forEach((point) => {
    const key = Math.floor(point.x);
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, { first: point, last: point, min: point, max: point });
      return;
    }

    current.last = point;
    if (point.y < current.min.y) {
      current.min = point;
    }
    if (point.y > current.max.y) {
      current.max = point;
    }
  });

  const reduced = [];
  [...buckets.keys()].sort((a, b) => a - b).forEach((key) => {
    const bucket = buckets.get(key);
    [bucket.first, bucket.min, bucket.max, bucket.last]
      .sort((a, b) => a.x - b.x)
      .forEach((point) => {
        const prev = reduced[reduced.length - 1];
        if (!prev || prev.x !== point.x || prev.y !== point.y) {
          reduced.push(point);
        }
      });
  });

  return reduced.length >= 2 ? reduced : points;
};

const buildSeriesPoints = (
  samples,
  xValues,
  channelId,
  getSampleValue,
  minY,
  maxY,
  height,
  width,
  padding,
  minX,
  maxX,
  plotMode = "normal"
) => {
  if (samples.length <= 1) {
    return [];
  }

  const spreadX = maxX - minX || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const toPoint = (sample, sampleIndex) => {
    const xValue = xValues[sampleIndex];
    const value = getSampleValue(sample, channelId);
    if (!Number.isFinite(value) || !Number.isFinite(xValue) || xValue < minX || xValue > maxX) {
      return null;
    }
    const normalizedX = (xValue - minX) / spreadX;
    const normalizedY = clamp((value - minY) / (maxY - minY || 1), 0, 1);
    return {
      x: padding.left + normalizedX * plotWidth,
      y: height - padding.bottom - normalizedY * plotHeight
    };
  };

  if (plotMode === "minmax") {
    const bucketCount = Math.max(1, Math.ceil(plotWidth) + 1);
    const bucketMinY = new Float32Array(bucketCount);
    const bucketMaxY = new Float32Array(bucketCount);
    bucketMinY.fill(Number.POSITIVE_INFINITY);
    bucketMaxY.fill(Number.NEGATIVE_INFINITY);
    samples.forEach((sample, sampleIndex) => {
      const xValue = xValues[sampleIndex];
      const value = getSampleValue(sample, channelId);
      if (!Number.isFinite(value) || !Number.isFinite(xValue) || xValue < minX || xValue > maxX) {
        return;
      }
      const key = clamp(Math.floor(((xValue - minX) / spreadX) * plotWidth), 0, bucketCount - 1);
      const normalizedY = clamp((value - minY) / (maxY - minY || 1), 0, 1);
      const y = height - padding.bottom - normalizedY * plotHeight;
      bucketMinY[key] = Math.min(bucketMinY[key], y);
      bucketMaxY[key] = Math.max(bucketMaxY[key], y);
    });

    const coordinates = new Float32Array(bucketCount * 4);
    let coordinateIndex = 0;
    for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
      if (!Number.isFinite(bucketMinY[bucketIndex])) {
        continue;
      }
      const x = padding.left + bucketIndex + 0.5;
      coordinates[coordinateIndex++] = x;
      coordinates[coordinateIndex++] = bucketMinY[bucketIndex];
      coordinates[coordinateIndex++] = x;
      coordinates[coordinateIndex++] = bucketMaxY[bucketIndex];
    }
    return coordinateIndex >= 4 ? coordinates.subarray(0, coordinateIndex) : [];
  }

  const points = samples.map((sample, sampleIndex) => {
    return toPoint(sample, sampleIndex);
  }).filter(Boolean);

  if (points.length < 2) {
    return [];
  }

  const reducedPoints = downsamplePointsByPixel(points);
  const coordinates = new Float32Array(reducedPoints.length * 2);
  reducedPoints.forEach((point, index) => {
    coordinates[index * 2] = point.x;
    coordinates[index * 2 + 1] = point.y;
  });
  return coordinates;
};

const PlotSeriesCanvas = ({ width, height, padding, series }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.max(1, Math.round(width * pixelRatio));
    const verticalCssPixels = Math.min(height, 420);
    const backingHeight = Math.max(1, Math.round(verticalCssPixels * pixelRatio));
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    const context = canvas.getContext("2d");
    context.setTransform(
      backingWidth / width,
      0,
      0,
      backingHeight / height,
      0,
      0
    );
    context.clearRect(0, 0, width, height);
    context.save();
    context.beginPath();
    context.rect(
      padding.left,
      padding.top,
      width - padding.left - padding.right,
      height - padding.top - padding.bottom
    );
    context.clip();

    series.forEach(({ points, color, thickness, style }) => {
      if (points.length < 4) {
        return;
      }
      context.beginPath();
      context.moveTo(points[0], points[1]);
      for (let index = 2; index < points.length; index += 2) {
        context.lineTo(points[index], points[index + 1]);
      }
      context.strokeStyle = color;
      context.lineWidth = thickness;
      context.globalAlpha = 0.95;
      context.setLineDash(style === "dashed" ? [8, 4] : style === "dotted" ? [2, 4] : []);
      context.stroke();
    });
    context.restore();
  }, [height, padding, series, width]);

  return (
    <canvas
      ref={canvasRef}
      className="plot__series-canvas"
      style={{ height: `${height}px` }}
      aria-hidden="true"
    />
  );
};

const basePlotTicks = {
  x: { ticks: [0, 1, 2, 3, 4, 5], min: 0, max: 5, step: 1 },
  y1: { ticks: [0, 0.25, 0.5, 0.75, 1], min: 0, max: 1, step: 0.25 },
  y2: { ticks: [-1, -0.5, 0, 0.5, 1], min: -1, max: 1, step: 0.5 }
};

const templateStorageKey = "jwSerialTemplates";

const createCircularHistory = (initialCapacity = 1) => {
  const state = {
    storage: new Array(Math.max(1, initialCapacity)),
    capacity: Math.max(1, initialCapacity),
    start: 0,
    size: 0,
    setCapacity(nextCapacity) {
      const capacity = Math.max(1, Math.floor(nextCapacity || 1));
      if (capacity === this.capacity) {
        return;
      }
      const nextStorage = new Array(capacity);
      const keep = Math.min(this.size, capacity);
      const offset = this.size - keep;
      for (let index = 0; index < keep; index += 1) {
        nextStorage[index] = this.at(offset + index);
      }
      this.storage = nextStorage;
      this.capacity = capacity;
      this.start = 0;
      this.size = keep;
    },
    push(value, capacity = this.capacity) {
      this.setCapacity(capacity);
      if (this.size < this.capacity) {
        this.storage[(this.start + this.size) % this.capacity] = value;
        this.size += 1;
        return;
      }
      this.storage[this.start] = value;
      this.start = (this.start + 1) % this.capacity;
    },
    at(index) {
      const normalized = index < 0 ? this.size + index : index;
      if (normalized < 0 || normalized >= this.size) {
        return undefined;
      }
      return this.storage[(this.start + normalized) % this.capacity];
    },
    slice(start = 0, end = this.size) {
      const from = Math.max(0, start < 0 ? this.size + start : start);
      const to = Math.min(this.size, end < 0 ? this.size + end : end);
      const result = new Array(Math.max(0, to - from));
      for (let index = from; index < to; index += 1) {
        result[index - from] = this.at(index);
      }
      return result;
    },
    map(callback) {
      const result = new Array(this.size);
      for (let index = 0; index < this.size; index += 1) {
        result[index] = callback(this.at(index), index, proxy);
      }
      return result;
    },
    forEach(callback) {
      for (let index = 0; index < this.size; index += 1) {
        callback(this.at(index), index, proxy);
      }
    },
    filter(callback) {
      const result = [];
      for (let index = 0; index < this.size; index += 1) {
        const value = this.at(index);
        if (callback(value, index, proxy)) {
          result.push(value);
        }
      }
      return result;
    },
    replace(values) {
      const keep = Math.min(values.length, this.capacity);
      this.start = 0;
      this.size = keep;
      for (let index = 0; index < keep; index += 1) {
        this.storage[index] = values[values.length - keep + index];
      }
    },
    clear() {
      this.storage.fill(undefined);
      this.start = 0;
      this.size = 0;
    }
  };
  const proxy = new Proxy(state, {
    get(target, property, receiver) {
      if (property === "length") {
        return target.size;
      }
      if (typeof property === "string" && /^\d+$/.test(property)) {
        return target.at(Number(property));
      }
      return Reflect.get(target, property, receiver);
    }
  });
  return proxy;
};

const readTemplateStore = () => {
  try {
    return JSON.parse(localStorage.getItem(templateStorageKey) || "{}");
  } catch (_error) {
    return {};
  }
};

const getTemplateNames = (templates = readTemplateStore()) =>
  Object.keys(templates).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("jwSerialTheme") || "light");
  const [plots, setPlots] = useState(defaultPlots);
  const [plotDrafts, setPlotDrafts] = useState({});
  const [channels, setChannels] = useState(createDefaultChannels(10));
  const [virtualFunctions, setVirtualFunctions] = useState([]);
  const [functionDraft, setFunctionDraft] = useState(null);
  const [functionMessage, setFunctionMessage] = useState("");
  const [functionModalWidth, setFunctionModalWidth] = useState(() => {
    const savedWidth = Number(localStorage.getItem("jwSerialFunctionModalWidth"));
    return Number.isFinite(savedWidth) && savedWidth >= 760 ? savedWidth : 920;
  });
  const functionModalRef = useRef(null);
  const [activeTab, setActiveTab] = useState("plotter");
  const [modal, setModal] = useState(null);
  const [terminator, setTerminator] = useState("none");
  const [monitorMessage, setMonitorMessage] = useState("");
  const [monitorLog, setMonitorLog] = useState([]);
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [manualPort, setManualPort] = useState("COM3");
  const [baudRate, setBaudRate] = useState(115200);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [isPaused, setIsPaused] = useState(false);
  const [appSettings, setAppSettings] = useState(() =>
    readJsonStorage(appSettingsStorageKey, defaultAppSettings)
  );
  const [configText, setConfigText] = useState("");
  const [configMessage, setConfigMessage] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [templateNames, setTemplateNames] = useState(() => getTemplateNames());
  const [templateMessage, setTemplateMessage] = useState("");
  const [templateConfirm, setTemplateConfirm] = useState(null);
  const [eventText, setEventText] = useState("");
  const [rxStats, setRxStats] = useState({ frames: 0, sps: 0, avgMs: 0, jitterMs: 0, lastFrameMs: null });
  const [plotFps, setPlotFps] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const [plotResize, setPlotResize] = useState(null);
  const [variableMenu, setVariableMenu] = useState(null);
  const [hoverAxisByPlot, setHoverAxisByPlot] = useState({});
  const [axisDrag, setAxisDrag] = useState(null);
  const [plotWidths, setPlotWidths] = useState({});
  const [assignmentPrompt, setAssignmentPrompt] = useState(null);
  const [startupRestorePrompt, setStartupRestorePrompt] = useState(null);
  const [connectIdentifierPrompt, setConnectIdentifierPrompt] = useState(null);
  const [captureConfig, setCaptureConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("jwSerialCaptureConfig");
      return saved ? { ...defaultCaptureConfig, ...JSON.parse(saved) } : defaultCaptureConfig;
    } catch (_error) {
      return defaultCaptureConfig;
    }
  });
  const [captureMessage, setCaptureMessage] = useState("");
  const [nextCaptureAt, setNextCaptureAt] = useState(null);
  const [captureTimerNow, setCaptureTimerNow] = useState(Date.now());
  const menuRef = useRef(null);
  const variableMenuRef = useRef(null);
  const plotsRef = useRef(null);
  const plotElementRefs = useRef(new Map());
  const plotRefCallbacks = useRef(new Map());
  const plotResizeObservers = useRef(new Map());
  const captureInProgressRef = useRef(false);
  const y2FollowStateRef = useRef(new Map());
  const historyRef = useRef(createCircularHistory());
  const lodBlocksRef = useRef({ levels: [], current: null });
  const virtualFunctionsRef = useRef([]);
  const rxStatsWindowRef = useRef({ times: [], head: 0, intervalSum: 0, intervalSquareSum: 0 });
  const totalFramesRef = useRef(0);
  const latestRxStatsRef = useRef(rxStats);
  const latestPlotFpsRef = useRef(plotFps);
  const latestChannelsRef = useRef(channels);
  const latestVirtualValuesRef = useRef({});
  const rawLogQueueRef = useRef([]);
  const uiFlushTimerRef = useRef(null);
  const lastUiFlushAtRef = useRef(0);
  const plotPaintCountRef = useRef(0);
  const pendingDataRefreshRef = useRef(false);
  const pendingChannelRefreshRef = useRef(false);
  const pendingVirtualRefreshRef = useRef(false);
  const lastValidFrameAtRef = useRef(null);
  const restoreReadyRef = useRef(false);

  const [basicConfig, setBasicConfig] = useState({
    channelCount: 0,
    samplesPerSecond: 80,
    periodMs: 12.5,
    bufferSeconds: 36000,
    refreshMs: 100,
    plotMode: "normal",
    includeTimestamp: false,
    minValidFrames: 1
  });

  const [advancedConfig, setAdvancedConfig] = useState({
    dataBits: 8,
    parity: "none",
    stopBits: 1
  });

  const persistFunctionModalWidth = (width) => {
    const maxWidth = Math.round(window.innerWidth * 0.96);
    const minWidth = Math.min(760, maxWidth);
    const clampedWidth = Math.min(Math.max(Math.round(width), minWidth), maxWidth);
    setFunctionModalWidth(clampedWidth);
    localStorage.setItem("jwSerialFunctionModalWidth", String(clampedWidth));
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("jwSerialTheme", theme);
  }, [theme]);

  useEffect(() => {
    virtualFunctionsRef.current = virtualFunctions;
  }, [virtualFunctions]);

  useEffect(() => {
    latestPlotFpsRef.current = plotFps;
  }, [plotFps]);

  useEffect(() => {
    if (!pendingChannelRefreshRef.current) {
      latestChannelsRef.current = channels;
    }
  }, [channels]);

  useEffect(() => () => {
    if (uiFlushTimerRef.current) {
      window.clearTimeout(uiFlushTimerRef.current);
      uiFlushTimerRef.current = null;
    }
  }, []);

  const visibleChannels = useMemo(() => {
    if (basicConfig.channelCount <= 0) {
      return channels;
    }
    return channels.slice(0, basicConfig.channelCount);
  }, [basicConfig.channelCount, channels]);

  const systemChannels = useMemo(() => [
    {
      id: "sysSps",
      name: "SPS",
      color: "#0f766e",
      lineStyle: "solid",
      thickness: 2,
      value: Number(rxStats.sps || 0),
      system: true
    },
    {
      id: "sysFps",
      name: "FPS",
      color: "#7c3aed",
      lineStyle: "solid",
      thickness: 2,
      value: Number(plotFps || 0),
      system: true
    }
  ], [plotFps, rxStats.sps]);

  const virtualChannels = useMemo(() =>
    virtualFunctions
      .filter((item) => item.enabled !== false)
      .map((item) => ({
        id: item.id,
        name: item.name,
        color: item.color,
        lineStyle: item.lineStyle || "solid",
        thickness: item.thickness || 2,
        value: Number(item.value || 0),
        virtual: true
      })),
    [virtualFunctions]
  );

  const sourceChannels = useMemo(() => [...visibleChannels, ...systemChannels], [visibleChannels, systemChannels]);
  const allChannels = useMemo(() => [...sourceChannels, ...virtualChannels], [sourceChannels, virtualChannels]);

  const virtualFunctionSnapshotKey = useMemo(() =>
    JSON.stringify(virtualFunctions.map(({ value: _value, ...definition }) => definition)),
    [virtualFunctions]
  );

  const serialThroughputEstimate = useMemo(() => {
    const baud = Math.max(1, Number(baudRate) || 1);
    const samplesPerSecond = Math.max(1, Number(basicConfig.samplesPerSecond) || 1);
    const bytesPerSecond = baud / 10;
    const bytesPerSample = bytesPerSecond / samplesPerSecond;
    const bufferSamples = Math.max(1, Math.round((Number(basicConfig.bufferSeconds) || 1) * samplesPerSecond));
    return {
      bytesPerSecond,
      bytesPerSample,
      bufferSamples
    };
  }, [baudRate, basicConfig.bufferSeconds, basicConfig.samplesPerSecond]);

  const getChannelById = (channelId) => allChannels.find((channel) => channel.id === channelId);

  const getSampleValue = (sample, channelId) => {
    if (!sample || !channelId) {
      return undefined;
    }
    if (isPhysicalChannelId(channelId)) {
      return sample.values?.[channelIndex(channelId)];
    }
    if (isSystemChannelId(channelId)) {
      if (channelId === "sysSps") {
        return sample.sysSps ?? sample.systemValues?.sysSps;
      }
      if (channelId === "sysFps") {
        return sample.sysFps ?? sample.systemValues?.sysFps;
      }
      return undefined;
    }
    return sample.virtualValues?.[channelId];
  };

  const isSerialConnected = connectionStatus === "connected";

  const captureCountdown = useMemo(() => {
    const intervalMs = Math.max(1, Number(captureConfig.intervalMinutes) || 10) * 60 * 1000;
    const remainingMs = nextCaptureAt ? Math.max(0, nextCaptureAt - captureTimerNow) : intervalMs;
    const progress = captureConfig.enabled && isSerialConnected && captureConfig.directory && nextCaptureAt
      ? clamp(1 - remainingMs / intervalMs, 0, 1)
      : 0;
    let label = "Capturar plots";
    if (captureConfig.enabled && isSerialConnected && captureConfig.directory && nextCaptureAt) {
      const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      label = `Capturar plots - ${minutes}:${seconds.toString().padStart(2, "0")}`;
    } else if (captureConfig.enabled && !isSerialConnected) {
      label = "Capturar plots - sin COM";
    } else if (captureConfig.enabled && !captureConfig.directory) {
      label = "Capturar plots - sin carpeta";
    }
    return { label, progress };
  }, [captureConfig.enabled, isSerialConnected, captureConfig.directory, captureConfig.intervalMinutes, captureTimerNow, nextCaptureAt]);

    const statusTone = isPaused
    ? "paused"
    : connectionStatus === "connected"
      ? "connected"
      : connectionStatus === "error"
        ? "error"
        : "disconnected";

  const buildConfigSnapshot = () => ({
    basicConfig,
    advancedConfig,
    appSettings,
    baudRate,
    selectedPort,
    manualPort,
    terminator,
    activeTab,
    channels: channels.map(({ id, name, color, lineStyle, thickness }) => ({
      id,
      name,
      color,
      lineStyle,
      thickness
    })),
    virtualFunctions: virtualFunctions.map(({ id, name, sourceId, operation, expression, block, windowUnit, windowValue, color, lineStyle, thickness, enabled }) => ({
      id,
      name,
      sourceId,
      operation,
      expression,
      block,
      windowUnit,
      windowValue,
      color,
      lineStyle,
      thickness,
      enabled
    })),
    plots,
    captureConfig
  });

  const appendLog = (message) => {
    setMonitorLog((prev) => [...prev.slice(-399), message]);
  };

  const flushPendingUiUpdates = () => {
    uiFlushTimerRef.current = null;
    lastUiFlushAtRef.current = performance.now();

    if (rawLogQueueRef.current.length) {
      const queuedLogs = rawLogQueueRef.current.splice(0);
      const visibleLogs = queuedLogs.slice(-120);
      setMonitorLog((prev) => [...prev, ...visibleLogs].slice(-400));
    }

    if (pendingChannelRefreshRef.current && latestChannelsRef.current.length) {
      pendingChannelRefreshRef.current = false;
      setChannels(latestChannelsRef.current);
    }

    if (pendingVirtualRefreshRef.current) {
      pendingVirtualRefreshRef.current = false;
      const latestVirtualValues = latestVirtualValuesRef.current;
      setVirtualFunctions((prev) =>
        prev.map((definition) => ({
          ...definition,
          value: Number.isFinite(latestVirtualValues[definition.id])
            ? latestVirtualValues[definition.id]
            : definition.value || 0
        }))
      );
    }

    setRxStats(latestRxStatsRef.current);

    if (pendingDataRefreshRef.current) {
      pendingDataRefreshRef.current = false;
      setDataVersion((prev) => prev + 1);
    }
  };

  const scheduleUiFlush = () => {
    if (uiFlushTimerRef.current) {
      return;
    }

    const refreshMs = clamp(Number(basicConfig.refreshMs) || 100, 16, 1000);
    const elapsedMs = performance.now() - lastUiFlushAtRef.current;
    const delayMs = Math.max(0, refreshMs - elapsedMs);
    uiFlushTimerRef.current = window.setTimeout(flushPendingUiUpdates, delayMs);
  };

  const sessionLoggingEnabled = () =>
    Boolean(captureConfig.directory && captureConfig.label?.trim() && captureConfig.useSubfolder);

  const appendSessionEvent = async (type, detail = "", extras = {}) => {
    if (!sessionLoggingEnabled() || !window.jwSerial?.appendSessionEvent) {
      return;
    }

    try {
      await window.jwSerial.appendSessionEvent({
        directory: captureConfig.directory,
        label: captureConfig.label,
        useSubfolder: captureConfig.useSubfolder,
        type,
        detail,
        port: selectedPort || manualPort,
        baudRate,
        frames: rxStats.frames,
        sps: rxStats.sps.toFixed(2),
        lastFrameMs: rxStats.lastFrameMs ?? "",
        ...extras
      });
    } catch (_error) {
      // Session logging should never interrupt acquisition.
    }
  };

  const getDraft = (plotId) =>
    plotDrafts[plotId] || {
      axis: "y1",
      removeKey: ""
    };

  const setDraft = (plotId, nextDraft) => {
    setPlotDrafts((prev) => ({
      ...prev,
      [plotId]: {
        ...getDraft(plotId),
        ...nextDraft
      }
    }));
  };

  const updateReceiveStats = (timestamp, frameCount) => {
    const now = Number(timestamp) || Date.now();
    const windowMs = 5000;
    const window = rxStatsWindowRef.current;
    const previous = window.times[window.times.length - 1];
    if (previous !== undefined) {
      const interval = now - previous;
      window.intervalSum += interval;
      window.intervalSquareSum += interval * interval;
    }
    window.times.push(now);

    while (window.head + 1 < window.times.length && now - window.times[window.head] > windowMs) {
      const expiredInterval = window.times[window.head + 1] - window.times[window.head];
      window.intervalSum -= expiredInterval;
      window.intervalSquareSum -= expiredInterval * expiredInterval;
      window.head += 1;
    }
    if (window.head > 8192 && window.head > window.times.length / 2) {
      window.times = window.times.slice(window.head);
      window.head = 0;
    }

    const sampleCount = window.times.length - window.head;
    const intervalCount = Math.max(0, sampleCount - 1);
    const avgMs = intervalCount ? window.intervalSum / intervalCount : 0;
    const variance = intervalCount
      ? Math.max(0, window.intervalSquareSum / intervalCount - avgMs * avgMs)
      : 0;
    const jitterMs = Math.sqrt(variance);
    const spanSeconds = intervalCount ? (now - window.times[window.head]) / 1000 : 1;
    const nextStats = {
      frames: Math.max(0, Number(frameCount) || 0),
      sps: intervalCount ? intervalCount / Math.max(0.001, spanSeconds) : 0,
      avgMs,
      jitterMs,
      lastFrameMs: Date.now() - now
    };
    latestRxStatsRef.current = nextStats;
    return nextStats;
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const closeVariableMenu = () => {
    setVariableMenu(null);
  };

  const updateChannel = (channelId, patch) => {
    latestChannelsRef.current = latestChannelsRef.current.map((channel) =>
      channel.id === channelId ? { ...channel, ...patch } : channel
    );
    setChannels((prev) =>
      prev.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel))
    );
  };

  const updateVirtualFunction = (functionId, patch) => {
    setVirtualFunctions((prev) =>
      prev.map((item) => (item.id === functionId ? { ...item, ...patch } : item))
    );
  };

  const parseFunctionWindow = (windowArg, fallbackDefinition = null) => {
    if (typeof windowArg === "string") {
      const match = windowArg.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(s|seg|segundos|m|muestras|n)?$/);
      if (match) {
        return {
          value: Math.max(1, Number(match[1]) || 1),
          unit: ["s", "seg", "segundos"].includes(match[2]) ? "seconds" : "samples"
        };
      }
    }

    if (Number.isFinite(Number(windowArg))) {
      return { value: Math.max(1, Number(windowArg) || 1), unit: "samples" };
    }

    return {
      value: Math.max(1, Number(fallbackDefinition?.windowValue) || 1),
      unit: fallbackDefinition?.windowUnit || "samples"
    };
  };

  const getFunctionWindowSize = (definition, windowArg = null) => {
    const parsedWindow = windowArg === null
      ? { value: Math.max(1, Number(definition.windowValue) || 1), unit: definition.windowUnit }
      : parseFunctionWindow(windowArg, definition);
    if (parsedWindow.unit === "seconds") {
      return Math.max(1, Math.round(parsedWindow.value * Math.max(1, Number(basicConfig.samplesPerSecond) || 1)));
    }
    return Math.max(1, Math.round(parsedWindow.value));
  };

  const getFunctionWindowLabel = (definition) => {
    const windowValue = Math.max(1, Number(definition.windowValue) || 1);
    if (definition.windowUnit === "seconds") {
      return `${windowValue}s`;
    }
    return `${windowValue}m`;
  };
  const createFunctionBlock = (type = "rangeAbs", sourceId = null) => {
    const baseWindow = {
      type,
      sourceId,
      windowUnit: "seconds",
      windowValue: 200
    };

    if (["current", "initial", "min", "max", "avg", "rangeAbs", "delta", "slope", "std", "rms"].includes(type)) {
      return baseWindow;
    }
    if (["abs", "sqrt", "round"].includes(type)) {
      return { type, input: null };
    }
    if (binaryBlockSymbols[type]) {
      return {
        type,
        left: null,
        right: null
      };
    }
    if (type === "number") {
      return { type: "number", value: 0 };
    }
    if (type === "variable") {
      return { type: "variable", sourceId };
    }
    return { type: "current", sourceId };
  };

  const getBlockWindowLabel = (block) => {
    const windowValue = Math.max(1, Number(block?.windowValue) || 1);
    return block?.windowUnit === "seconds" ? `${windowValue}s` : `${windowValue}m`;
  };

  const getBlockChannelName = (sourceId) =>
    sourceChannels.find((channel) => channel.id === sourceId)?.name || "variable";

  const blockToExpression = (block) => {
    if (!block) {
      return "";
    }

    if (block.type === "number") {
      return String(Number(block.value) || 0);
    }

    if (block.type === "variable") {
      return block.sourceId ? `actual([${getBlockChannelName(block.sourceId)}])` : "";
    }

    if (unaryExpressionFunctions[block.type]) {
      return `${unaryExpressionFunctions[block.type]}(${blockToExpression(block.input)})`;
    }

    if (binaryExpressionFunctions[block.type]) {
      return `${binaryExpressionFunctions[block.type]}(${blockToExpression(block.left)}, ${blockToExpression(block.right)})`;
    }

    if (binaryBlockSymbols[block.type]) {
      return `(${blockToExpression(block.left)} ${binaryBlockSymbols[block.type]} ${blockToExpression(block.right)})`;
    }

    const channelName = block.sourceId ? getBlockChannelName(block.sourceId) : "";
    const variableText = channelName ? `[${channelName}]` : "";
    const windowText = getBlockWindowLabel(block);

    if (block.type === "rangeAbs") {
      return `abs(max(${variableText}, ${windowText}) - min(${variableText}, ${windowText}))`;
    }

    if (windowExpressionFunctions[block.type]) {
      const fnName = windowExpressionFunctions[block.type];
      return block.type === "current" ? `${fnName}(${variableText})` : `${fnName}(${variableText}, ${windowText})`;
    }

    return `actual(${variableText})`;
  };

  const validateFunctionBlock = (block) => {
    if (!block) {
      return "Arma un bloque principal.";
    }
    if (block.type === "number") {
      return Number.isFinite(Number(block.value)) ? "" : "Un bloque numérico tiene un valor inválido.";
    }
    if (block.type === "variable") {
      return sourceChannels.some((channel) => channel.id === block.sourceId) ? "" : "Selecciona una variable válida.";
    }
    if (unaryExpressionFunctions[block.type]) {
      return validateFunctionBlock(block.input);
    }
    if (binaryBlockSymbols[block.type]) {
      return validateFunctionBlock(block.left) || validateFunctionBlock(block.right);
    }
    if (!sourceChannels.some((channel) => channel.id === block.sourceId)) {
      return "Selecciona una variable válida.";
    }
    const operation = functionBlockOperations.find((item) => item.id === block.type);
    if (operation?.needsWindow && (!Number.isFinite(Number(block.windowValue)) || Number(block.windowValue) <= 0)) {
      return "La ventana debe ser mayor a 0.";
    }
    return "";
  };

  const draftExpression = (definition) =>
    definition?.block ? blockToExpression(definition.block) : normalizeFunctionExpression(definition);


  const getWindowValuesForChannel = (channelId, samples = historyRef.current, windowArg = null, definition = null) => {
    const selectedSamples = samples.slice(-getFunctionWindowSize(definition || {}, windowArg));
    return selectedSamples
      .map((sample) => getSampleValue(sample, channelId))
      .filter((value) => Number.isFinite(value));
  };

  const buildFunctionFormula = (definition) => {
    if (definition?.block) {
      return blockToExpression(definition.block);
    }
    const source = sourceChannels.find((channel) => channel.id === definition.sourceId);
    const operation = virtualOperations.find((item) => item.id === definition.operation) || virtualOperations[0];
    const windowText = getFunctionWindowLabel(definition);
    return operation.formula(source?.name || "variable", windowText);
  };

  const normalizeFunctionExpression = (definition) =>
    (definition.expression || buildFunctionFormula(definition)).trim();

  const insertFunctionText = (text) => {
    setFunctionDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const expression = normalizeFunctionExpression(prev);
      return {
        ...prev,
        expression: `${expression}${expression ? " " : ""}${text}`
      };
    });
    setFunctionMessage("");
  };

  const expressionToJs = (definition) => {
    let expression = draftExpression(definition);
    const channelsByName = new Map(sourceChannels.map((channel) => [channel.name, channel.id]));
    expression = expression.replace(/\[([^\]]+)\]/g, (_match, name) => {
      const channelId = channelsByName.get(name.trim());
      if (!channelId) {
        throw new Error(`Variable no encontrada: ${name}`);
      }
      return `token("${channelId}")`;
    });
    expression = expression.replace(/\b(\d+(?:\.\d+)?)\s*(s|seg|segundos|m|muestras|n)\b/gi, (_match, value, unit) =>
      `"${value}${unit.toLowerCase().startsWith("s") ? "s" : "m"}"`
    );
    expression = expression.replace(/\^/g, "**");

    if (!/^[\d\s+\-*/().,"_*A-Za-z]+$/.test(expression)) {
      throw new Error("La fórmula contiene caracteres no permitidos.");
    }

    const expressionWithoutStrings = expression.replace(/"[^"]*"/g, "");
    const names = expressionWithoutStrings.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    const allowedNames = new Set(["token", "actual", "inicial", "min", "max", "prom", "abs", "sqrt", "round", "delta", "pend", "std", "rms", "gt", "lt", "gte", "lte"]);
    const invalidName = names.find((name) => !allowedNames.has(name));
    if (invalidName) {
      throw new Error(`Función no permitida: ${invalidName}`);
    }

    return expression;
  };

  const evaluateVirtualFunction = (definition, samples = historyRef.current) => {
    const expression = expressionToJs(definition);
    const evaluator = new Function("token", "actual", "inicial", "min", "max", "prom", "abs", "sqrt", "round", "delta", "pend", "std", "rms", "gt", "lt", "gte", "lte", `"use strict"; return (${expression});`);

    if (!samples.length) {
      return undefined;
    }

    const currentValue = (channelId) => getSampleValue(samples[samples.length - 1], channelId);
    const token = (channelId) => ({
      channelId,
      valueOf: () => {
        const value = currentValue(channelId);
        return Number.isFinite(value) ? value : Number.NaN;
      },
      toString: () => String(currentValue(channelId) ?? "")
    });
    const tokenId = (input) => input?.channelId || null;
    const valuesFor = (input, windowArg) => {
      const channelId = tokenId(input);
      if (!channelId) {
        const value = Number(input);
        return Number.isFinite(value) ? [value] : [];
      }
      return getWindowValuesForChannel(channelId, samples, windowArg, definition);
    };
    const actual = (input) => {
      const channelId = tokenId(input);
      if (!channelId) {
        return Number(input);
      }
      const value = currentValue(channelId);
      return Number.isFinite(value) ? value : Number.NaN;
    };
    const inicial = (input, windowArg) => {
      const values = valuesFor(input, windowArg);
      return values.length ? values[0] : Number.NaN;
    };
    const min = (input, windowArg) => {
      const values = valuesFor(input, windowArg);
      return values.length ? Math.min(...values) : Number.NaN;
    };
    const max = (input, windowArg) => {
      const values = valuesFor(input, windowArg);
      return values.length ? Math.max(...values) : Number.NaN;
    };
    const prom = (input, windowArg) => {
      const values = valuesFor(input, windowArg);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
    };
    const delta = (input, windowArg) => {
      const values = valuesFor(input, windowArg);
      return values.length >= 2 ? values[values.length - 1] - values[0] : Number.NaN;
    };
    const pend = (input, windowArg) => {
      const values = valuesFor(input, windowArg);
      if (values.length < 2) {
        return Number.NaN;
      }
      const parsedWindow = parseFunctionWindow(windowArg, definition);
      const span = parsedWindow.unit === "seconds" ? Math.max(Number.EPSILON, parsedWindow.value) : Math.max(1, values.length - 1);
      return (values[values.length - 1] - values[0]) / span;
    };
    const std = (input, windowArg) => {
      const values = valuesFor(input, windowArg);
      if (!values.length) {
        return Number.NaN;
      }
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      return Math.sqrt(variance);
    };
    const rms = (input, windowArg) => {
      const values = valuesFor(input, windowArg);
      return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length) : Number.NaN;
    };
    const gt = (left, right) => (Number(left) > Number(right) ? 1 : 0);
    const lt = (left, right) => (Number(left) < Number(right) ? 1 : 0);
    const gte = (left, right) => (Number(left) >= Number(right) ? 1 : 0);
    const lte = (left, right) => (Number(left) <= Number(right) ? 1 : 0);
    const result = evaluator(token, actual, inicial, min, max, prom, Math.abs, Math.sqrt, Math.round, delta, pend, std, rms, gt, lt, gte, lte);
    return Number.isFinite(Number(result)) ? Number(result) : undefined;
  };

  const recomputeVirtualFunctionHistory = (definitions = virtualFunctionsRef.current) => {
    const activeDefinitions = definitions.filter((definition) => definition.enabled !== false);
    if (!historyRef.current.length) {
      return {};
    }

    if (!activeDefinitions.length) {
      historyRef.current.replace(historyRef.current.map((sample) => ({ ...sample, virtualValues: undefined })));
      rebuildLodFromHistory();
      return {};
    }

    const sourceHistory = historyRef.current;
    const latestValues = {};
    const recomputedHistory = sourceHistory.map((sample, index) => {
      const samplesUntilNow = sourceHistory.slice(0, index + 1);
      const virtualValues = {};
      activeDefinitions.forEach((definition) => {
        const value = evaluateVirtualFunction(definition, samplesUntilNow);
        if (Number.isFinite(value)) {
          const rounded = Number(value.toFixed(6));
          virtualValues[definition.id] = rounded;
          if (index === sourceHistory.length - 1) {
            latestValues[definition.id] = rounded;
          }
        }
      });
      return { ...sample, virtualValues };
    });
    historyRef.current.replace(recomputedHistory);

    rebuildLodFromHistory();

    return latestValues;
  };

  useEffect(() => {
    if (!historyRef.current.length) {
      return;
    }

    const latestValues = recomputeVirtualFunctionHistory(virtualFunctionsRef.current);
    setVirtualFunctions((prev) => {
      if (!prev.length) {
        return prev;
      }
      return prev.map((definition) => ({
        ...definition,
        value: Number.isFinite(latestValues[definition.id])
          ? latestValues[definition.id]
          : definition.value || 0
      }));
    });
    setDataVersion((prev) => prev + 1);
  }, [virtualFunctionSnapshotKey]);

  const validateFunctionDraft = (draft = functionDraft) => {
    if (!draft) {
      return "No hay función para validar.";
    }
    if (!draft.name?.trim()) {
      return "Escribe un nombre para la función.";
    }
    const blockError = draft.block ? validateFunctionBlock(draft.block) : "";
    if (blockError) {
      return blockError;
    }
    if (!draftExpression(draft)) {
      return "Arma una función.";
    }
    try {
      expressionToJs(draft);
      evaluateVirtualFunction(draft, historyRef.current);
    } catch (error) {
      return String(error?.message || error || "Sintaxis inválida.");
    }
    return "";
  };

  const openFunctionBuilder = (definition = null) => {
    const firstSource = sourceChannels[0]?.id || "val0";
    const defaultBlock = createFunctionBlock("rangeAbs", firstSource);
    setFunctionDraft(definition ? {
      ...definition,
      block: definition.block || defaultBlock,
      expression: definition.block ? blockToExpression(definition.block) : draftExpression(definition)
    } : {
      id: `fn-${Date.now()}`,
      name: "Nueva función",
      sourceId: firstSource,
      operation: "rangeAbs",
      block: null,
      expression: "",
      windowUnit: "seconds",
      windowValue: 200,
      color: virtualPalette[virtualFunctions.length % virtualPalette.length],
      lineStyle: "solid",
      thickness: 2,
      enabled: true,
      value: 0
    });
    setFunctionMessage("");
    setModal("function");
  };

  const saveFunctionDraft = () => {
    const error = validateFunctionDraft();
    if (error) {
      setFunctionMessage(error);
      return;
    }
    const sanitized = {
      ...functionDraft,
      name: functionDraft.name.trim(),
      expression: draftExpression(functionDraft),
      windowValue: Math.max(1, Number(functionDraft.windowValue) || 1),
      enabled: true
    };
    const nextValue = evaluateVirtualFunction(sanitized);
    setVirtualFunctions((prev) => {
      const exists = prev.some((item) => item.id === sanitized.id);
      const next = { ...sanitized, value: Number.isFinite(nextValue) ? Number(nextValue.toFixed(6)) : sanitized.value || 0 };
      return exists ? prev.map((item) => (item.id === sanitized.id ? next : item)) : [...prev, next];
    });
    setFunctionMessage(`Función guardada: ${sanitized.name}`);
    setFunctionDraft(null);
    setModal(null);
  };

  const deleteFunction = (functionId) => {
    setVirtualFunctions((prev) => prev.filter((item) => item.id !== functionId));
    setPlots((prev) =>
      prev.map((plot) => ({
        ...plot,
        assignments: plot.assignments.filter((assignment) => assignment.channelId !== functionId),
        statAvgTargets: (plot.statAvgTargets || []).filter((key) => !key.startsWith(`${functionId}:`)),
        statMinTargets: (plot.statMinTargets || []).filter((key) => !key.startsWith(`${functionId}:`)),
        statMaxTargets: (plot.statMaxTargets || []).filter((key) => !key.startsWith(`${functionId}:`))
      }))
    );
    if (functionDraft?.id === functionId) {
      setFunctionDraft(null);
      setModal(null);
    }
  };

  const updatePlotSettings = (plotId, patch) => {
    setPlots((prev) =>
      prev.map((plot) => (plot.id === plotId ? { ...plot, ...patch } : plot))
    );
  };

  const updateCaptureConfig = (patch) => {
    setCaptureConfig((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem("jwSerialCaptureConfig", JSON.stringify(next));
      return next;
    });
  };

  const updateAppSettings = (patch) => {
    setAppSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(appSettingsStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const getCaptureIntervalMs = (config = captureConfig) =>
    Math.max(1, Number(config.intervalMinutes) || 10) * 60 * 1000;

  const resetCaptureTimer = (from = Date.now(), config = captureConfig) => {
    if (!config.enabled || !config.directory || connectionStatus !== "connected") {
      setNextCaptureAt(null);
      return;
    }
    setNextCaptureAt(from + getCaptureIntervalMs(config));
  };

  const formatRemainingTime = (ms) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const assignChannelToAxis = (plotId, channelId, axis) => {
    if (!plotId || !channelId || !axis) {
      return;
    }
    const key = `${channelId}:${axis}`;
    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) {
          return plot;
        }
        if (plot.assignments.some((item) => `${item.channelId}:${item.axis}` === key)) {
          return plot;
        }
        const withoutSameXAxis = axis === "x"
          ? plot.assignments.filter((item) => item.axis !== "x")
          : plot.assignments;
        return {
          ...plot,
          assignments: [...withoutSameXAxis, { channelId, axis }]
        };
      })
    );
    setAssignmentPrompt(null);
  };

  const getPlotElementRef = (plotId) => {
    if (plotRefCallbacks.current.has(plotId)) {
      return plotRefCallbacks.current.get(plotId);
    }

    const callback = (node) => {
      const previousObserver = plotResizeObservers.current.get(plotId);
      if (previousObserver) {
        previousObserver.disconnect();
        plotResizeObservers.current.delete(plotId);
      }

      if (!node) {
        plotElementRefs.current.delete(plotId);
        return;
      }

      plotElementRefs.current.set(plotId, node);
      const updateWidth = () => {
        const rect = (node.querySelector(".plot__canvas") || node).getBoundingClientRect();
        const width = Math.max(360, Math.round(rect.width));
        setPlotWidths((prev) => (prev[plotId] === width ? prev : { ...prev, [plotId]: width }));
      };
      const observer = new ResizeObserver(updateWidth);
      observer.observe(node);
      plotResizeObservers.current.set(plotId, observer);
      window.requestAnimationFrame(updateWidth);
    };

    plotRefCallbacks.current.set(plotId, callback);
    return callback;
  };


  const toggleStatTarget = (plotId, statKey, target) => {
    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) {
          return plot;
        }

        const current = Array.isArray(plot[statKey]) ? plot[statKey] : [];
        const exists = current.includes(target);
        return {
          ...plot,
          [statKey]: exists ? current.filter((item) => item !== target) : [...current, target]
        };
      })
    );
  };


  const getWheelUnits = (event) => {
    const base = event.shiftKey ? 10 : 1;
    const direction = event.deltaY < 0 ? 1 : -1;
    return direction * base;
  };

  const getPointerAxisZone = (event) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / Math.max(1, rect.width);
    const relativeY = (event.clientY - rect.top) / Math.max(1, rect.height);

    if (relativeX <= 0.08) {
      return "y1";
    }
    if (relativeX >= 0.92) {
      return "y2";
    }
    if (relativeY >= 0.84 && relativeX > 0.06 && relativeX < 0.94) {
      return "x";
    }
    return null;
  };

  const isAxisEditable = (plot, axis) => {
    if (axis === "x") {
      return true;
    }
    return plot[`${axis}Mode`] === "manual";
  };

  const toggleXAxisAuto = (plotId, enabled) => {
    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) {
          return plot;
        }

        if (enabled) {
          return { ...plot, xMode: "auto" };
        }

        const auto = computeAxisAutoRange(plot, "x");
        if (!auto) {
          return { ...plot, xMode: "manual" };
        }

        return {
          ...plot,
          xMode: "manual",
          xManualMin: Number(auto.min.toFixed(6)),
          xManualMax: Number(auto.max.toFixed(6))
        };
      })
    );
  };

  const getSamplesForPlot = (plot) => {
    const visibleBufferSamples = Math.max(
      1,
      Math.floor(basicConfig.bufferSeconds * basicConfig.samplesPerSecond)
    );
    const allSamples = historyRef.current.length > visibleBufferSamples
      ? historyRef.current.slice(-visibleBufferSamples)
      : historyRef.current;
    const sampleWindowSize = Math.max(2, Math.round((Number(plot.xWindowSize || 10) || 10) * basicConfig.samplesPerSecond));
    return plot.xMode === "window" ? allSamples.slice(-sampleWindowSize) : allSamples;
  };

  const appendSampleToLod = (sample, sequence) => {
    const lod = lodBlocksRef.current;
    let block = lod.current;
    if (!block) {
      block = { startSequence: sequence, endSequence: sequence, count: 0, extrema: {} };
      lod.current = block;
    }

    const updateExtrema = (channelId, value) => {
      if (!Number.isFinite(value)) {
        return;
      }
      const current = block.extrema[channelId];
      if (!current) {
        block.extrema[channelId] = { min: value, max: value, minSample: sample, maxSample: sample };
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

    sample.values?.forEach((value, index) => updateExtrema(`val${index}`, value));
    updateExtrema("sysSps", sample.sysSps ?? sample.systemValues?.sysSps);
    updateExtrema("sysFps", sample.sysFps ?? sample.systemValues?.sysFps);
    Object.entries(sample.virtualValues || {}).forEach(([channelId, value]) => updateExtrema(channelId, value));
    block.endSequence = sequence;
    block.count += 1;

    if (block.count >= 64) {
      appendCompletedLodBlock(lod, block);
      lod.current = null;
    }
  };

  const mergeLodBlocks = (left, right) => {
    const extrema = {};
    const channelIds = new Set([...Object.keys(left.extrema), ...Object.keys(right.extrema)]);
    channelIds.forEach((channelId) => {
      const leftExtrema = left.extrema[channelId];
      const rightExtrema = right.extrema[channelId];
      if (!leftExtrema) {
        extrema[channelId] = rightExtrema;
        return;
      }
      if (!rightExtrema) {
        extrema[channelId] = leftExtrema;
        return;
      }
      extrema[channelId] = {
        min: Math.min(leftExtrema.min, rightExtrema.min),
        max: Math.max(leftExtrema.max, rightExtrema.max),
        minSample: leftExtrema.min <= rightExtrema.min ? leftExtrema.minSample : rightExtrema.minSample,
        maxSample: leftExtrema.max >= rightExtrema.max ? leftExtrema.maxSample : rightExtrema.maxSample
      };
    });
    return {
      startSequence: left.startSequence,
      endSequence: right.endSequence,
      count: left.count + right.count,
      extrema
    };
  };

  const appendCompletedLodBlock = (lod, baseBlock) => {
    let block = baseBlock;
    let levelIndex = 0;
    while (block) {
      if (!lod.levels[levelIndex]) {
        lod.levels[levelIndex] = { blocks: [], head: 0, pending: null };
      }
      const level = lod.levels[levelIndex];
      level.blocks.push(block);
      if (!level.pending) {
        level.pending = block;
        break;
      }
      block = mergeLodBlocks(level.pending, block);
      level.pending = null;
      levelIndex += 1;
    }
  };

  const rebuildLodFromHistory = () => {
    lodBlocksRef.current = { levels: [], current: null };
    historyRef.current.forEach((sample, index) => {
      const sequence = Number.isFinite(sample.sequence) ? sample.sequence : index + 1;
      sample.sequence = sequence;
      appendSampleToLod(sample, sequence);
    });
  };

  const trimLodBefore = (oldestSequence) => {
    const lod = lodBlocksRef.current;
    lod.levels.forEach((level) => {
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
  };

  const getLodSamplesForPlot = (plot, rawSamples, width) => {
    const channelIds = [...new Set(plot.assignments.map((assignment) => assignment.channelId))];
    // Each LOD group emits Min + Max, so half a group per CSS pixel
    // already provides roughly one drawable point per pixel and channel.
    const targetGroups = Math.max(256, Math.ceil(width / 2));
    const targetSamples = Math.max(2048, targetGroups * Math.max(1, channelIds.length) * 2);
    if (rawSamples.length <= targetSamples) {
      return rawSamples;
    }

    const firstSequence = rawSamples[0]?.sequence;
    const lastSequence = rawSamples[rawSamples.length - 1]?.sequence;
    if (!Number.isFinite(firstSequence) || !Number.isFinite(lastSequence)) {
      return rawSamples;
    }

    const selected = new Map([
      [firstSequence, rawSamples[0]],
      [lastSequence, rawSamples[rawSamples.length - 1]]
    ]);
    const lod = lodBlocksRef.current;
    const findRange = (level) => {
      let low = level.head;
      let high = level.blocks.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (level.blocks[middle].endSequence < firstSequence) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }
      const start = low;
      high = level.blocks.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (level.blocks[middle].startSequence <= lastSequence) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }
      return { start, end: low, count: Math.max(0, low - start) };
    };

    let selectedLevel = lod.levels[0] || { blocks: [], head: 0 };
    let selectedRange = findRange(selectedLevel);
    for (let levelIndex = 1; levelIndex < lod.levels.length; levelIndex += 1) {
      if (selectedRange.count <= targetGroups) {
        break;
      }
      const candidateLevel = lod.levels[levelIndex];
      const candidateRange = findRange(candidateLevel);
      if (candidateRange.count > 0) {
        selectedLevel = candidateLevel;
        selectedRange = candidateRange;
      }
    }

    const visibleBlocks = selectedLevel.blocks.slice(selectedRange.start, selectedRange.end);
    const coveredEndSequence = visibleBlocks[visibleBlocks.length - 1]?.endSequence ?? firstSequence - 1;
    const baseLevel = lod.levels[0];
    if (baseLevel && selectedLevel !== baseLevel) {
      const tailRange = findRange(baseLevel);
      let low = tailRange.start;
      let high = tailRange.end;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
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
    if (lod.current?.endSequence >= firstSequence && lod.current.startSequence <= lastSequence) {
      visibleBlocks.push(lod.current);
    }

    const blocksPerGroup = Math.max(1, Math.ceil(visibleBlocks.length / targetGroups));
    for (let groupStart = 0; groupStart < visibleBlocks.length; groupStart += blocksPerGroup) {
      const groupEnd = Math.min(visibleBlocks.length, groupStart + blocksPerGroup);
      channelIds.forEach((channelId) => {
        let minValue = Number.POSITIVE_INFINITY;
        let maxValue = Number.NEGATIVE_INFINITY;
        let minSample = null;
        let maxSample = null;
        for (let index = groupStart; index < groupEnd; index += 1) {
          const extrema = visibleBlocks[index].extrema[channelId];
          if (extrema?.min < minValue) {
            minValue = extrema.min;
            minSample = extrema.minSample;
          }
          if (extrema?.max > maxValue) {
            maxValue = extrema.max;
            maxSample = extrema.maxSample;
          }
        }
        [minSample, maxSample].forEach((candidate) => {
          if (candidate?.sequence >= firstSequence && candidate.sequence <= lastSequence) {
            selected.set(candidate.sequence, candidate);
          }
        });
      });
    }
    return [...selected.values()].sort((left, right) => left.sequence - right.sequence);
  };

  const getPlotXValue = (plot, sample, index) => {
    const xAssignment = plot.assignments.find((item) => item.axis === "x");
    if (xAssignment) {
      const value = getSampleValue(sample, xAssignment.channelId);
      return Number.isFinite(value) ? value : index;
    }
    if (basicConfig.includeTimestamp && sample.xValue !== null && sample.xValue !== undefined) {
      return sample.xValue;
    }
    return index;
  };

  const getVisibleSamplesForPlot = (plot, samples = getSamplesForPlot(plot)) => {
    if (plot.xMode !== "manual") {
      return samples;
    }

    const xMin = Math.min(Number(plot.xManualMin), Number(plot.xManualMax));
    const xMax = Math.max(Number(plot.xManualMin), Number(plot.xManualMax));
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
      return samples;
    }

    const visibleSamples = samples.filter((sample, index) => {
      const xValue = getPlotXValue(plot, sample, index);
      return Number.isFinite(xValue) && xValue >= xMin && xValue <= xMax;
    });
    return visibleSamples.length ? visibleSamples : samples;
  };

  const computeAxisAutoRange = (plot, axis) => {
    const baseSamples = getSamplesForPlot(plot);
    const samples = axis === "x" ? baseSamples : getVisibleSamplesForPlot(plot, baseSamples);
    if (samples.length < 2) {
      return null;
    }

    if (axis === "x") {
      const xValues = samples.map((sample, index) => getPlotXValue(plot, sample, index));

      return findFiniteRange(xValues);
    }

    const axisAssignments = plot.assignments.filter((item) => item.axis === axis);
    if (!axisAssignments.length) {
      return null;
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    axisAssignments.forEach((assignment) => {
      samples.forEach((sample) => {
        const value = getSampleValue(sample, assignment.channelId);
        if (value === undefined) {
          return;
        }
        min = Math.min(min, value);
        max = Math.max(max, value);
      });
    });

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return null;
    }
    return normalizeYAxisRange(min, max);
  };

  const handleModeChange = (plotId, axis, mode) => {
    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) {
          return plot;
        }

        const key = `${axis}Mode`;
        const next = { ...plot, [key]: mode };
        if (mode !== "manual") {
          return next;
        }

        const auto = computeAxisAutoRange(plot, axis);
        if (!auto) {
          return next;
        }

        if (axis === "x") {
          return {
            ...next,
            xManualMin: Number(auto.min.toFixed(6)),
            xManualMax: Number(auto.max.toFixed(6))
          };
        }

        return {
          ...next,
          [`${axis}ManualMin`]: Number(auto.min.toFixed(6)),
          [`${axis}ManualMax`]: Number(auto.max.toFixed(6))
        };
      })
    );
  };

  const handlePlotCanvasPointerMove = (event, plotId) => {
    const axis = getPointerAxisZone(event);
    const plot = plots.find((item) => item.id === plotId);
    const activeAxis = plot && axis && isAxisEditable(plot, axis) ? axis : null;

    setHoverAxisByPlot((prev) => {
      if ((prev[plotId] || null) === activeAxis) {
        return prev;
      }
      return { ...prev, [plotId]: activeAxis };
    });

    if (!axisDrag || axisDrag.plotId !== plotId || !plot) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const pixelHeight = Math.max(1, rect.height * 0.76);
    const pixelWidth = Math.max(1, rect.width * 0.86);
    const deltaX = event.clientX - axisDrag.lastClientX;
    const deltaY = event.clientY - axisDrag.lastClientY;
    if (Math.abs(deltaY) < 0.5 && Math.abs(deltaX) < 0.5) {
      return;
    }

    setAxisDrag((prev) => (prev ? { ...prev, lastClientX: event.clientX, lastClientY: event.clientY } : prev));

    setPlots((prev) =>
      prev.map((candidate) => {
        if (candidate.id !== plotId) {
          return candidate;
        }

        if (axisDrag.axis === "x") {
          if (candidate.xMode !== "manual") {
            return candidate;
          }
          const span = Math.max(1e-6, Number(candidate.xManualMax) - Number(candidate.xManualMin));
          const valueShift = -(deltaX / pixelWidth) * span;
          return {
            ...candidate,
            xManualMin: Number((Number(candidate.xManualMin) + valueShift).toFixed(6)),
            xManualMax: Number((Number(candidate.xManualMax) + valueShift).toFixed(6))
          };
        }

        if (!["y1", "y2"].includes(axisDrag.axis) || candidate[`${axisDrag.axis}Mode`] !== "manual") {
          return candidate;
        }
        const minKey = `${axisDrag.axis}ManualMin`;
        const maxKey = `${axisDrag.axis}ManualMax`;
        const span = Math.max(1e-6, Number(candidate[maxKey]) - Number(candidate[minKey]));
        const valueShift = (deltaY / pixelHeight) * span;
        return {
          ...candidate,
          [minKey]: Number((Number(candidate[minKey]) + valueShift).toFixed(6)),
          [maxKey]: Number((Number(candidate[maxKey]) + valueShift).toFixed(6))
        };
      })
    );
  };

  const handlePlotCanvasPointerDown = (event, plotId) => {
    if (event.button !== 0) {
      return;
    }
    const axis = getPointerAxisZone(event);
    if (!axis) {
      return;
    }

    const plot = plots.find((item) => item.id === plotId);
    if (!plot || !isAxisEditable(plot, axis)) {
      return;
    }

    event.preventDefault();
    setAxisDrag({ plotId, axis, lastClientX: event.clientX, lastClientY: event.clientY });
  };

  const handlePlotCanvasPointerLeave = (plotId) => {
    setHoverAxisByPlot((prev) => {
      if (!prev[plotId]) {
        return prev;
      }
      return { ...prev, [plotId]: null };
    });
  };

  const handlePlotAxisWheel = (event, plotId) => {
    const axisZone = getPointerAxisZone(event);
    const plot = plots.find((item) => item.id === plotId);
    if (!plot || !axisZone || !isAxisEditable(plot, axisZone)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const units = getWheelUnits(event);

    setPlots((prev) =>
      prev.map((candidate) => {
        if (candidate.id !== plotId) {
          return candidate;
        }

        if (axisZone === "x") {
          const totalSeconds = Math.max(0.1, historyRef.current.length / Math.max(1, basicConfig.samplesPerSecond));
          const currentSeconds = Math.max(0.1, Number(candidate.xWindowSize) || Math.min(10, totalSeconds));
          const direction = units > 0 ? 1 : -1;

          if (candidate.xMode === "window") {
            const secondStep = event.shiftKey ? 10 : 1;
            const nextSeconds = currentSeconds + direction * secondStep;
            const clamped = clamp(nextSeconds, 0.1, totalSeconds);
            if (clamped >= totalSeconds - 1e-6) {
              return { ...candidate, xMode: "auto", xWindowSize: Number(totalSeconds.toFixed(3)) };
            }
            return {
              ...candidate,
              xWindowSize: Number(clamped.toFixed(3))
            };
          }
          if (candidate.xMode === "auto") {
            const secondStep = event.shiftKey ? 10 : 1;
            const nextSeconds = currentSeconds + direction * secondStep;
            const clamped = clamp(nextSeconds, 0.1, totalSeconds);
            if (clamped >= totalSeconds - 1e-6) {
              return { ...candidate, xMode: "auto", xWindowSize: Number(totalSeconds.toFixed(3)) };
            }
            return {
              ...candidate,
              xMode: "window",
              xWindowSize: Number(clamped.toFixed(3))
            };
          }
          if (candidate.xMode === "manual") {
            const min = Number(candidate.xManualMin);
            const max = Number(candidate.xManualMax);
            const center = (min + max) / 2;
            const span = Math.max(1e-6, max - min);
            const scale = event.shiftKey
              ? (direction > 0 ? 0.8 : 1.2)
              : (direction > 0 ? 0.95 : 1.05);
            const safeSpan = Math.max(1e-6, span * scale);
            return {
              ...candidate,
              xManualMin: Number((center - safeSpan / 2).toFixed(6)),
              xManualMax: Number((center + safeSpan / 2).toFixed(6))
            };
          }
          return candidate;
        }

        if (candidate[`${axisZone}Mode`] !== "manual") {
          return candidate;
        }

        const minKey = `${axisZone}ManualMin`;
        const maxKey = `${axisZone}ManualMax`;
        const min = Number(candidate[minKey]);
        const max = Number(candidate[maxKey]);
        const center = (min + max) / 2;
        const span = Math.max(1e-6, max - min);
        const nextSpan = Math.max(1e-6, span - units * Math.max(span * 0.08, 0.02));

        return {
          ...candidate,
          [minKey]: Number((center - nextSpan / 2).toFixed(6)),
          [maxKey]: Number((center + nextSpan / 2).toFixed(6))
        };
      })
    );
  };

  const handlePlotterWheelCapture = (event) => {
    if (event.cancelable) {
      event.preventDefault();
    }
  };

  const openVariableMenu = (event, channelId) => {
    event.preventDefault();
    const menuWidth = 250;
    const menuHeight = 236;
    const x = clamp(event.clientX, 8, window.innerWidth - menuWidth - 8);
    const y = clamp(event.clientY, 8, window.innerHeight - menuHeight - 8);
    setVariableMenu({ channelId, x, y });
    setContextMenu(null);
  };

  const handleChannelDragStart = (event, channelId) => {
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", channelId);
    event.dataTransfer.setData("application/x-jw-channel", channelId);
  };

  const handlePlotDragOver = (event) => {
    if (event.dataTransfer.types.includes("application/x-jw-channel") || event.dataTransfer.types.includes("text/plain")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const plotId = event.currentTarget.dataset.plotId;
      const axis = getPointerAxisZone(event);
      setHoverAxisByPlot((prev) => (prev[plotId] === axis ? prev : { ...prev, [plotId]: axis }));
    }
  };

  const handlePlotDragLeave = (event, plotId) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setHoverAxisByPlot((prev) => ({ ...prev, [plotId]: null }));
  };

  const handlePlotDrop = (event, plotId) => {
    const channelId = event.dataTransfer.getData("application/x-jw-channel") || event.dataTransfer.getData("text/plain");
    if (!channelId) {
      return;
    }

    event.preventDefault();
    setHoverAxisByPlot((prev) => ({ ...prev, [plotId]: null }));
    const axis = getPointerAxisZone(event);
    if (axis) {
      assignChannelToAxis(plotId, channelId, axis);
      return;
    }

    const channel = getChannelById(channelId);
    setAssignmentPrompt({
      plotId,
      channelId,
      channelName: channel?.name || channelId
    });
  };

  const handlePlotMenuAxisDrop = (event, plotId, axis) => {
    const channelId = event.dataTransfer.getData("application/x-jw-channel") || event.dataTransfer.getData("text/plain");
    if (!channelId) {
      return;
    }

    event.preventDefault();
    assignChannelToAxis(plotId, channelId, axis);
  };


  const openContextMenu = (event, plotId) => {
    event.preventDefault();
    const menuWidth = 340;
    const menuHeight = Math.min(520, Math.floor(window.innerHeight * 0.78));
    const x = clamp(event.clientX, 8, window.innerWidth - menuWidth - 8);
    const y = event.clientY + menuHeight > window.innerHeight - 8
      ? Math.max(8, event.clientY - menuHeight)
      : clamp(event.clientY, 8, window.innerHeight - menuHeight - 8);
    setContextMenu({
      plotId,
      x,
      y
    });
    setVariableMenu(null);
  };

  const addPlot = () => {
    setPlots((prev) => [...prev, createPlot(prev.length + 1)]);
  };

  const removePlot = () => {
    setPlots((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const updatePlotHeight = (plotId, nextHeight) => {
    const height = clamp(Number(nextHeight) || 320, 300, 720);
    setPlots((prev) =>
      prev.map((plot) => (plot.id === plotId ? { ...plot, height } : plot))
    );
  };

  const startResize = (event, plotId, currentHeight) => {
    event.preventDefault();
    event.stopPropagation();
    setPlotResize({
      plotId,
      startY: event.clientY,
      startHeight: currentHeight || 320
    });
  };

  const addAssignment = (plotId, channelId) => {
    const draft = getDraft(plotId);
    if (!channelId) {
      return;
    }
    assignChannelToAxis(plotId, channelId, draft.axis);
  };

  const removeAssignment = (plotId, assignmentKey = null) => {
    const draft = getDraft(plotId);
    const keyToRemove = assignmentKey || draft.removeKey;
    if (!keyToRemove) {
      return;
    }

    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) {
          return plot;
        }
        return {
          ...plot,
          assignments: plot.assignments.filter(
            (item) => `${item.channelId}:${item.axis}` !== keyToRemove
          )
        };
      })
    );
    if (!assignmentKey) {
      closeContextMenu();
    }
  };

  const clearAssignments = (plotId) => {
    setPlots((prev) =>
      prev.map((plot) => (plot.id === plotId ? { ...plot, assignments: [] } : plot))
    );
    closeContextMenu();
  };

  const closeModal = () => {
    setTemplateConfirm(null);
    setFunctionDraft(null);
    setFunctionMessage("");
    setModal(null);
  };

  const handleSend = async () => {
    if (!monitorMessage.trim()) {
      return;
    }

    const suffix =
      terminator === "nl"
        ? "\n"
        : terminator === "cr"
          ? "\r"
          : terminator === "nlcr"
            ? "\n\r"
            : "";

    const payload = `${monitorMessage}${suffix}`;
    const response = await window.jwSerial?.sendMessage?.(payload);
    if (response?.ok) {
      appendLog(`TX > ${monitorMessage}`);
      setMonitorMessage("");
    }
  };

  const updateBasicConfig = (key, value) => {
    setBasicConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateAdvancedConfig = (key, value) => {
    setAdvancedConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSamplesChange = (value) => {
    const samplesPerSecond = Number(value);
    if (!samplesPerSecond || samplesPerSecond <= 0) {
      return;
    }
    updateBasicConfig("samplesPerSecond", samplesPerSecond);
    updateBasicConfig("periodMs", Number((1000 / samplesPerSecond).toFixed(2)));
  };

  const handlePeriodChange = (value) => {
    const periodMs = Number(value);
    if (!periodMs || periodMs <= 0) {
      return;
    }
    updateBasicConfig("periodMs", periodMs);
    updateBasicConfig("samplesPerSecond", Number((1000 / periodMs).toFixed(2)));
  };

  const applyEsp32Ch340HighSpeedProfile = () => {
    setBaudRate(esp32Ch340HighSpeedProfile.baudRate);
    setBasicConfig((prev) => ({
      ...prev,
      channelCount: esp32Ch340HighSpeedProfile.channelCount,
      samplesPerSecond: esp32Ch340HighSpeedProfile.samplesPerSecond,
      periodMs: esp32Ch340HighSpeedProfile.periodMs,
      bufferSeconds: esp32Ch340HighSpeedProfile.bufferSeconds,
      refreshMs: esp32Ch340HighSpeedProfile.refreshMs,
      plotMode: esp32Ch340HighSpeedProfile.plotMode,
      includeTimestamp: false,
      minValidFrames: 1
    }));
    updateAppSettings({ serialTimeoutSeconds: esp32Ch340HighSpeedProfile.serialTimeoutSeconds });
    setPlots((prev) =>
      prev.map((plot) => ({
        ...plot,
        xMode: "window",
        xWindowSize: esp32Ch340HighSpeedProfile.xWindowSize
      }))
    );
    setConfigMessage("Perfil ESP32/CH340 aplicado: 921600 baud, 2 kSPS, buffer 60 s y ploteo Min/Max.");
  };

  const refreshPorts = async () => {
    try {
      const nextPorts = await window.jwSerial.listPorts();
      setPorts(nextPorts);
      if (!selectedPort && nextPorts.length > 0) {
        setSelectedPort(nextPorts[0].path);
      }
      if (nextPorts.length === 0) {
        appendLog("SYS > No se detectaron puertos. Puedes ingresar uno manualmente (ej: COM7).");
      } else {
        appendLog(`SYS > ${nextPorts.length} puerto(s) detectado(s).`);
      }
    } catch (_error) {
      setPorts([]);
      appendLog("SYS > Error al listar puertos seriales.");
    }
  };

  const openSerialConnection = async () => {
    const targetPort = selectedPort || manualPort.trim();
    if (!targetPort) {
      appendLog("SYS > Selecciona o ingresa un puerto antes de conectar.");
      return;
    }

    try {
      setConnectionStatus("connecting");
      await window.jwSerial.openPort({
        path: targetPort,
        baudRate,
        dataBits: advancedConfig.dataBits,
        parity: advancedConfig.parity,
        stopBits: advancedConfig.stopBits,
        expectedChannels: basicConfig.channelCount,
        minValidFrames: basicConfig.minValidFrames,
        includeTimestamp: basicConfig.includeTimestamp,
        serialFilterMode: appSettings.serialFilterMode,
        serialFilterPatterns: appSettings.serialFilterPatterns
      });
      lastValidFrameAtRef.current = Date.now();
      setConnectionStatus("connected");
      appendSessionEvent("connect", `Conectado a ${targetPort}`);
    } catch (_error) {
      setConnectionStatus("error");
    }
  };

  const handleConnect = async () => {
    if (captureConfig.usePrefix) {
      setConnectIdentifierPrompt(captureConfig.label || "");
      return;
    }
    openSerialConnection();
  };

  const confirmConnectIdentifier = () => {
    const label = connectIdentifierPrompt.trim();
    if (!label) {
      setCaptureMessage("Ingresa un identificador antes de conectar.");
      return;
    }
    updateCaptureConfig({ label });
    setConnectIdentifierPrompt(null);
    window.setTimeout(() => openSerialConnection(), 0);
  };

  const handleDisconnect = async () => {
    appendSessionEvent("disconnect", "Desconexión solicitada");
    await window.jwSerial.closePort();
    setConnectionStatus("disconnected");
    lastValidFrameAtRef.current = null;
  };

  const clearBuffer = () => {
    historyRef.current.clear();
    lodBlocksRef.current = { levels: [], current: null };
    rxStatsWindowRef.current = { times: [], head: 0, intervalSum: 0, intervalSquareSum: 0 };
    totalFramesRef.current = 0;
    latestRxStatsRef.current = { frames: 0, sps: 0, avgMs: 0, jitterMs: 0, lastFrameMs: null };
    latestVirtualValuesRef.current = {};
    rawLogQueueRef.current = [];
    pendingDataRefreshRef.current = false;
    pendingChannelRefreshRef.current = false;
    pendingVirtualRefreshRef.current = false;
    if (uiFlushTimerRef.current) {
      window.clearTimeout(uiFlushTimerRef.current);
      uiFlushTimerRef.current = null;
    }
    lastUiFlushAtRef.current = 0;
    setRxStats(latestRxStatsRef.current);
    setDataVersion((prev) => prev + 1);
    setMonitorLog([]);
    setChannels((prev) => prev.map((channel) => ({ ...channel, value: 0 })));
    setVirtualFunctions((prev) => prev.map((item) => ({ ...item, value: 0 })));
  };

  const exportCsv = () => {
    if (historyRef.current.length === 0) {
      return;
    }

    const header = ["timestamp", "xValue", ...sourceChannels.map((channel) => channel.name), ...virtualChannels.map((channel) => channel.name)];
    const rows = historyRef.current.map((item) => [
      item.timestamp,
      item.xValue,
      ...sourceChannels.map((channel) => getSampleValue(item, channel.id) ?? ""),
      ...virtualChannels.map((channel) => getSampleValue(item, channel.id) ?? "")
    ]);
    const csv = [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jw-serial-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const isMissingIpcHandlerError = (error) =>
    String(error?.message || error || "").includes("No handler registered");

  const getTemplateStore = () => readTemplateStore();

  const syncTemplateNames = (templates = getTemplateStore(), preferredName = selectedTemplateName) => {
    const names = getTemplateNames(templates);
    setTemplateNames(names);
    setSelectedTemplateName(names.includes(preferredName) ? preferredName : "");
    return names;
  };

  const saveTemplateNow = (name) => {
    const templates = getTemplateStore();
    templates[name] = buildConfigSnapshot();
    localStorage.setItem(templateStorageKey, JSON.stringify(templates));
    syncTemplateNames(templates, name);
    setTemplateName("");
    setTemplateMessage(`Plantilla guardada: ${name}`);
  };

  const requestSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) {
      setTemplateMessage("Escribe un nombre en Guardar como.");
      return;
    }
    const templates = getTemplateStore();
    setTemplateConfirm({
      type: "save",
      name,
      overwrites: Boolean(templates[name])
    });
  };

  const loadTemplate = () => {
    const name = selectedTemplateName.trim();
    if (!name) {
      setTemplateMessage("Selecciona una plantilla para cargar.");
      return;
    }
    const template = getTemplateStore()[name];
    if (!template) {
      syncTemplateNames();
      setTemplateMessage("No se encontró esa plantilla.");
      return;
    }
    applyConfigSnapshot(template);
    setTemplateMessage(`Plantilla cargada: ${name}`);
  };

  const deleteTemplateNow = (name) => {
    const templates = getTemplateStore();
    if (!templates[name]) {
      syncTemplateNames();
      setTemplateMessage("No se encontró esa plantilla.");
      return;
    }
    delete templates[name];
    localStorage.setItem(templateStorageKey, JSON.stringify(templates));
    syncTemplateNames(templates, "");
    setTemplateMessage(`Plantilla eliminada: ${name}`);
  };

  const requestDeleteTemplate = () => {
    const name = selectedTemplateName.trim();
    if (!name) {
      setTemplateMessage("Selecciona una plantilla para eliminar.");
      return;
    }
    const templates = getTemplateStore();
    if (!templates[name]) {
      syncTemplateNames();
      setTemplateMessage("No se encontró esa plantilla.");
      return;
    }
    setTemplateConfirm({ type: "delete", name });
  };

  const confirmTemplateAction = () => {
    if (!templateConfirm) {
      return;
    }
    if (templateConfirm.type === "save") {
      saveTemplateNow(templateConfirm.name);
    }
    if (templateConfirm.type === "delete") {
      deleteTemplateNow(templateConfirm.name);
    }
    setTemplateConfirm(null);
  };

  const handleSaveConfig = async () => {
    const payload = JSON.stringify(buildConfigSnapshot(), null, 2);
    setConfigText(payload);
    localStorage.setItem("jwSerialConfig", payload);
    try {
      const response = await window.jwSerial?.saveConfigFile?.(payload);
      if (response?.ok) {
        setConfigMessage(`Configuración guardada en ${response.filePath}`);
        return;
      }
      if (response?.canceled) {
        setConfigMessage("Guardado cancelado.");
        return;
      }
    } catch (error) {
      if (isMissingIpcHandlerError(error)) {
        setConfigMessage("Reinicia JW-Serial para activar el diálogo nativo de guardado.");
        return;
      }
      setConfigMessage("No se pudo abrir el diálogo de guardado.");
      return;
    }
    setConfigMessage("Configuración guardada localmente.");
  };

  const handleLoadConfig = async () => {
    try {
      const response = await window.jwSerial?.loadConfigFile?.();
      if (response?.ok) {
        localStorage.setItem("jwSerialConfig", response.content);
        setConfigText(response.content);
        setConfigMessage(`Configuración cargada desde ${response.filePath}`);
        return;
      }
      if (response?.canceled) {
        setConfigMessage("Carga cancelada.");
        return;
      }
    } catch (error) {
      if (isMissingIpcHandlerError(error)) {
        setConfigMessage("Reinicia JW-Serial para activar el diálogo nativo de carga.");
        return;
      }
      setConfigMessage("No se pudo abrir el diálogo de carga.");
      return;
    }
    const saved = localStorage.getItem("jwSerialConfig");
    if (!saved) {
      setConfigMessage("No hay configuración guardada.");
      return;
    }
    setConfigText(saved);
    setConfigMessage("Configuración cargada desde almacenamiento local.");
  };

  const applyConfigText = () => {
    try {
      const parsed = JSON.parse(configText);
      const nextBasicConfig = parsed.basicConfig ? { ...basicConfig, ...parsed.basicConfig } : basicConfig;

      if (parsed.basicConfig) {
        setBasicConfig(nextBasicConfig);
      }
      if (parsed.advancedConfig) {
        setAdvancedConfig(parsed.advancedConfig);
      }
      if (parsed.appSettings) {
        updateAppSettings(parsed.appSettings);
      }
      if (parsed.baudRate) {
        setBaudRate(parsed.baudRate);
      }
      if (parsed.selectedPort) {
        setSelectedPort(parsed.selectedPort);
      }
      if (parsed.manualPort) {
        setManualPort(parsed.manualPort);
      }
      if (parsed.terminator) {
        setTerminator(parsed.terminator);
      }
      if (parsed.activeTab) {
        setActiveTab(parsed.activeTab);
      }
      if (parsed.plots) {
        setPlots(parsed.plots);
      }
      if (parsed.captureConfig) {
        updateCaptureConfig(parsed.captureConfig);
      }
      if (Array.isArray(parsed.channels)) {
        const preferredCount = nextBasicConfig.channelCount > 0
          ? nextBasicConfig.channelCount
          : parsed.channels.length;
        setChannels(normalizeChannels(preferredCount, parsed.channels));
      }
      if (Array.isArray(parsed.virtualFunctions)) {
        setVirtualFunctions(parsed.virtualFunctions.map((item) => ({ ...item, expression: item.expression || buildFunctionFormula(item), value: item.value || 0 })));
      }
      setConfigMessage("Configuración aplicada.");
    } catch (_error) {
      setConfigMessage("JSON inválido. Revisa el formato.");
    }
  };

  const applyConfigSnapshot = (parsed) => {
    const nextBasicConfig = parsed.basicConfig ? { ...basicConfig, ...parsed.basicConfig } : basicConfig;
    if (parsed.basicConfig) {
      setBasicConfig(nextBasicConfig);
    }
    if (parsed.advancedConfig) {
      setAdvancedConfig(parsed.advancedConfig);
    }
    if (parsed.appSettings) {
      updateAppSettings(parsed.appSettings);
    }
    if (parsed.baudRate) {
      setBaudRate(parsed.baudRate);
    }
    if (parsed.selectedPort) {
      setSelectedPort(parsed.selectedPort);
    }
    if (parsed.manualPort) {
      setManualPort(parsed.manualPort);
    }
    if (parsed.terminator) {
      setTerminator(parsed.terminator);
    }
    if (parsed.activeTab) {
      setActiveTab(parsed.activeTab);
    }
    if (parsed.plots) {
      setPlots(parsed.plots);
    }
    if (parsed.captureConfig) {
      updateCaptureConfig(parsed.captureConfig);
    }
    if (Array.isArray(parsed.channels)) {
      const preferredCount = nextBasicConfig.channelCount > 0
        ? nextBasicConfig.channelCount
        : parsed.channels.length;
      setChannels(normalizeChannels(preferredCount, parsed.channels));
    }
    if (Array.isArray(parsed.virtualFunctions)) {
      setVirtualFunctions(parsed.virtualFunctions.map((item) => ({ ...item, expression: item.expression || buildFunctionFormula(item), value: item.value || 0 })));
    }
  };

  const readLastSessionSnapshot = () => {
    try {
      const saved = localStorage.getItem(lastSessionStorageKey);
      return saved ? JSON.parse(saved) : null;
    } catch (_error) {
      return null;
    }
  };

  const loadLastSession = (snapshot = readLastSessionSnapshot()) => {
    if (!snapshot) {
      restoreReadyRef.current = true;
      setStartupRestorePrompt(null);
      return;
    }
    applyConfigSnapshot(snapshot);
    restoreReadyRef.current = true;
    setStartupRestorePrompt(null);
    setConfigMessage("Última sesión cargada.");
  };

  const startEmptySession = () => {
    localStorage.removeItem(lastSessionStorageKey);
    restoreReadyRef.current = true;
    setStartupRestorePrompt(null);
    setConfigMessage("Sesión nueva iniciada.");
  };

  const chooseCaptureDirectory = async () => {
    try {
      const response = await window.jwSerial?.chooseCaptureDirectory?.();
      if (!response?.ok) {
        setCaptureMessage(response?.canceled ? "Selección cancelada." : "No se pudo elegir carpeta.");
        return;
      }
      updateCaptureConfig({ directory: response.directory });
      setCaptureMessage("Carpeta de capturas configurada.");
    } catch (error) {
      setCaptureMessage(
        isMissingIpcHandlerError(error)
          ? "Reinicia JW-Serial para activar el selector de carpeta."
          : "No se pudo abrir el selector de carpeta."
      );
    }
  };

  const openCaptureDirectory = async () => {
    if (!captureConfig.directory) {
      setCaptureMessage("Elige una carpeta antes de abrirla.");
      return;
    }

    try {
      const response = await window.jwSerial?.openCaptureDirectory?.(captureConfig.directory);
      if (!response?.ok) {
        setCaptureMessage(response?.error || "No se pudo abrir la carpeta.");
      }
    } catch (error) {
      setCaptureMessage(
        isMissingIpcHandlerError(error)
          ? "Reinicia JW-Serial para activar abrir carpeta."
          : "No se pudo abrir la carpeta."
      );
    }
  };

  const waitForPaint = () =>
    new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

  const inlineComputedStyles = (source, clone) => {
    if (!(source instanceof Element) || !(clone instanceof Element)) {
      return;
    }

    const computed = window.getComputedStyle(source);
    for (const property of computed) {
      clone.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
    }

    if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
      clone.value = source.value;
      if (source.checked) {
        clone.setAttribute("checked", "");
      } else {
        clone.removeAttribute("checked");
      }
    }

    Array.from(source.children).forEach((child, index) => {
      inlineComputedStyles(child, clone.children[index]);
    });
  };

  const renderElementToPng = async (element) => {
    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(rect.width || element.offsetWidth));
    const height = Math.max(1, Math.ceil(rect.height || element.offsetHeight));
    const clone = element.cloneNode(true);

    inlineComputedStyles(element, clone);
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.margin = "0";

    const serialized = new XMLSerializer().serializeToString(clone);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          ${serialized}
        </foreignObject>
      </svg>
    `;

    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const captureSinglePlot = async (plot, plotIndex) => {
    const element = plotElementRefs.current.get(plot.id);
    if (!element || !captureConfig.directory) {
      return null;
    }

    await waitForPaint();
    const saveVisibleWindowFallback = async () => {
      if (!window.jwSerial?.capturePlot) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return window.jwSerial.capturePlot({
        title: plot.title,
        plotNumber: plotIndex + 1,
        directory: captureConfig.directory,
        label: captureConfig.label,
        usePrefix: captureConfig.usePrefix,
        useSubfolder: captureConfig.useSubfolder,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      });
    };

    try {
      if (!window.jwSerial?.savePlotImage) {
        const fallback = await saveVisibleWindowFallback();
        if (fallback?.ok) {
          return fallback;
        }
        return {
          ok: false,
          error: "Reinicia JW-Serial para activar las capturas PNG en segundo plano."
        };
      }

      const dataUrl = await renderElementToPng(element);
      return await window.jwSerial?.savePlotImage?.({
        title: plot.title,
        plotNumber: plotIndex + 1,
        directory: captureConfig.directory,
        label: captureConfig.label,
        usePrefix: captureConfig.usePrefix,
        useSubfolder: captureConfig.useSubfolder,
        dataUrl
      });
    } catch (error) {
      try {
        const fallback = await saveVisibleWindowFallback();
        if (fallback?.ok) {
          return fallback;
        }
      } catch (_fallbackError) {
        // Keep the original error message below.
      }

      return {
        ok: false,
        error: isMissingIpcHandlerError(error)
          ? "Reinicia JW-Serial para activar las capturas PNG en segundo plano."
          : `No se pudo guardar la captura: ${String(error?.message || error)}`
      };
    }
  };

  const captureAllPlots = async ({ resetTimer = true, automatic = false } = {}) => {
    if (captureInProgressRef.current) {
      return;
    }
    if (!captureConfig.directory) {
      setCaptureMessage("Elige una carpeta antes de capturar.");
      return;
    }

    captureInProgressRef.current = true;
    const plotsElement = plotsRef.current;
    const previousPlotsScrollTop = plotsElement?.scrollTop ?? 0;
    const previousWindowScrollX = window.scrollX;
    const previousWindowScrollY = window.scrollY;
    const captureRoot = document.documentElement;

    const results = [];
    try {
      captureRoot.classList.add("capture-clean");
      await waitForPaint();
      for (const [plotIndex, plot] of plots.entries()) {
        results.push(await captureSinglePlot(plot, plotIndex));
      }
    } finally {
      captureRoot.classList.remove("capture-clean");
      captureInProgressRef.current = false;
      if (plotsElement) {
        plotsElement.scrollTop = previousPlotsScrollTop;
      }
      window.scrollTo(previousWindowScrollX, previousWindowScrollY);
      if (resetTimer) {
        resetCaptureTimer();
      }
    }
    const saved = results.filter((result) => result?.ok).length;
    const firstError = results.find((result) => result && !result.ok)?.error;
    setCaptureMessage(
      saved > 0
        ? `${automatic ? "Auto: " : ""}${saved} captura(s) guardada(s)`
        : firstError || "No se pudieron guardar capturas."
    );
    if (saved > 0) {
      appendSessionEvent(automatic ? "auto_capture" : "manual_capture", `${saved} captura(s) guardada(s)`, { captures: saved });
    }
  };

  useEffect(() => {
    refreshPorts();
  }, []);

  useEffect(() => {
    return () => {
      plotResizeObservers.current.forEach((observer) => observer.disconnect());
      plotResizeObservers.current.clear();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("jwSerialCaptureConfig", JSON.stringify(captureConfig));
  }, [captureConfig]);

  useEffect(() => {
    const snapshot = readLastSessionSnapshot();
    if (!snapshot) {
      restoreReadyRef.current = true;
      return;
    }

    if (appSettings.sessionRestoreMode === "auto") {
      loadLastSession(snapshot);
      return;
    }

    if (appSettings.sessionRestoreMode === "fresh") {
      restoreReadyRef.current = true;
      return;
    }

    setStartupRestorePrompt(snapshot);
  }, []);

  useEffect(() => {
    if (!restoreReadyRef.current) {
      return;
    }
    localStorage.setItem(lastSessionStorageKey, JSON.stringify(buildConfigSnapshot()));
  }, [basicConfig, advancedConfig, appSettings, baudRate, selectedPort, manualPort, terminator, activeTab, channels, virtualFunctionSnapshotKey, plots, captureConfig]);

  useEffect(() => {
    resetCaptureTimer();
  }, [captureConfig.enabled, captureConfig.directory, captureConfig.intervalMinutes, connectionStatus]);

  useEffect(() => {
    if (!nextCaptureAt) {
      return undefined;
    }

    const ticker = window.setInterval(() => setCaptureTimerNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, [nextCaptureAt]);

  useEffect(() => {
    if (!captureConfig.enabled || connectionStatus !== "connected" || !captureConfig.directory || !nextCaptureAt) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      captureAllPlots({ automatic: true });
    }, Math.max(0, nextCaptureAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [captureConfig.enabled, connectionStatus, captureConfig.directory, nextCaptureAt, plots]);

  useEffect(() => {
    if (
      !window.jwSerial?.onFrames ||
      !window.jwSerial?.onRawLines ||
      !window.jwSerial?.onStatus
    ) {
      appendLog("SYS > API serial no disponible en renderer (preload).");
      return undefined;
    }

    const processFrame = (frame) => {
      if (!shouldAcceptSerialLine(frame.raw, appSettings.serialFilterMode, appSettings.serialFilterPatterns)) {
        return;
      }

      lastValidFrameAtRef.current = Date.now();
      if (isPaused) {
        return;
      }

      const incomingValues = frame.values;
      const xValue = frame.includeTimestamp ? frame.values[0] : null;
      const channelCount =
        basicConfig.channelCount > 0 ? basicConfig.channelCount : incomingValues.length;

      const normalizedChannels = normalizeChannels(channelCount, latestChannelsRef.current);
      latestChannelsRef.current = normalizedChannels.map((channel, index) => ({
        ...channel,
        name: frame.names?.[index] || channel.name,
        value: Number((incomingValues[index] ?? channel.value ?? 0).toFixed(2))
      }));
      pendingChannelRefreshRef.current = true;

      const maxSamples = Math.max(
        1,
        Math.floor(basicConfig.bufferSeconds * basicConfig.samplesPerSecond)
      );
      totalFramesRef.current += 1;
      const nextStats = updateReceiveStats(frame.timestamp, totalFramesRef.current);
      const historyEntry = {
        sequence: totalFramesRef.current,
        timestamp: frame.timestamp,
        xValue,
        values: channelCount === incomingValues.length
          ? incomingValues
          : incomingValues.slice(0, channelCount),
        sysSps: Number(nextStats.sps || 0),
        sysFps: Number(latestPlotFpsRef.current || 0)
      };
      historyRef.current.push(historyEntry, maxSamples);
      const activeVirtualFunctions = virtualFunctionsRef.current;
      if (activeVirtualFunctions.length) {
        const nextVirtualValues = {};
        activeVirtualFunctions.forEach((definition) => {
          const value = evaluateVirtualFunction(definition, historyRef.current);
          if (Number.isFinite(value)) {
            nextVirtualValues[definition.id] = Number(value.toFixed(6));
          }
        });
        historyEntry.virtualValues = nextVirtualValues;
        latestVirtualValuesRef.current = nextVirtualValues;
        pendingVirtualRefreshRef.current = true;
      }
      appendSampleToLod(historyEntry, historyEntry.sequence);
      if (historyRef.current.length >= maxSamples && historyEntry.sequence % 64 === 0) {
        trimLodBefore(historyRef.current[0]?.sequence ?? 0);
      }
      pendingDataRefreshRef.current = true;
    };

    const unsubscribeFrames = window.jwSerial.onFrames((frames) => {
      frames.forEach(processFrame);
      scheduleUiFlush();
    });

    const unsubscribeRawLines = window.jwSerial.onRawLines((lines) => {
      lines.forEach((line) => {
        if (line?.trim()) {
          rawLogQueueRef.current.push(`RX > ${line}`);
        }
      });
      if (rawLogQueueRef.current.length > 500) {
        rawLogQueueRef.current = rawLogQueueRef.current.slice(-500);
      }
      scheduleUiFlush();
    });

    const unsubscribeStatus = window.jwSerial.onStatus((status) => {
      if (status.type === "error") {
        setConnectionStatus("error");
      }
      if (status.type === "closed") {
        setConnectionStatus("disconnected");
        lastValidFrameAtRef.current = null;
      }
      if (status.type === "open") {
        setConnectionStatus("connected");
        lastValidFrameAtRef.current = Date.now();
      }
      appendLog(`SYS > ${status.message}`);
    });

    return () => {
      unsubscribeFrames?.();
      unsubscribeRawLines?.();
      unsubscribeStatus?.();
    };
  }, [basicConfig, isPaused, appSettings.serialFilterMode, appSettings.serialFilterPatterns]);

  useEffect(() => {
    if (connectionStatus !== "connected") {
      return undefined;
    }

    const timeoutSeconds = Number(appSettings.serialTimeoutSeconds) || 0;
    if (timeoutSeconds <= 0) {
      return undefined;
    }

    const watchdog = window.setInterval(async () => {
      const lastValidFrameAt = lastValidFrameAtRef.current || 0;
      if (Date.now() - lastValidFrameAt < timeoutSeconds * 1000) {
        return;
      }

      appendLog(`SYS > Timeout serial: ${timeoutSeconds} s sin trama válida. Desconectando.`);
      appendSessionEvent("timeout_disconnect", `${timeoutSeconds} s sin trama válida`);
      lastValidFrameAtRef.current = null;
      try {
        await window.jwSerial?.closePort?.();
      } catch (_error) {
        // The status listener will handle normal close notifications.
      }
      setConnectionStatus("disconnected");
    }, 1000);

    return () => window.clearInterval(watchdog);
  }, [connectionStatus, appSettings.serialTimeoutSeconds]);

  useEffect(() => {
    if (basicConfig.channelCount > 0) {
      setChannels((prev) => normalizeChannels(basicConfig.channelCount, prev));
    }
  }, [basicConfig.channelCount]);

  useEffect(() => {
    if (modal === "save" || modal === "load") {
      setConfigText(JSON.stringify(buildConfigSnapshot(), null, 2));
      setConfigMessage("");
    }
  }, [modal]);

  useEffect(() => {
    if (activeTab !== "plotter" || !plotsRef.current) {
      return undefined;
    }

    const blockWheelScroll = (event) => {
      event.preventDefault();
    };

    const element = plotsRef.current;
    element.addEventListener("wheel", blockWheelScroll, { passive: false });
    return () => element.removeEventListener("wheel", blockWheelScroll);
  }, [activeTab]);

  useEffect(() => {
    if (!contextMenu && !variableMenu) {
      return undefined;
    }

    const close = (event) => {
      if (menuRef.current?.contains(event.target) || variableMenuRef.current?.contains(event.target)) {
        return;
      }
      setContextMenu(null);
      setVariableMenu(null);
    };

    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [contextMenu, variableMenu]);


  useEffect(() => {
    if (activeTab !== "plotter" || dataVersion === 0) {
      return undefined;
    }
    const paintFrame = window.requestAnimationFrame(() => {
      plotPaintCountRef.current += 1;
    });
    return () => window.cancelAnimationFrame(paintFrame);
  }, [activeTab, dataVersion]);

  useEffect(() => {
    let previousCount = plotPaintCountRef.current;
    let previousTime = performance.now();
    const ticker = window.setInterval(() => {
      const now = performance.now();
      const count = plotPaintCountRef.current;
      const elapsedSeconds = Math.max(0.001, (now - previousTime) / 1000);
      setPlotFps(activeTab === "plotter" ? (count - previousCount) / elapsedSeconds : 0);
      previousCount = count;
      previousTime = now;
    }, 1000);
    return () => window.clearInterval(ticker);
  }, [activeTab]);

  useEffect(() => {
    if (!axisDrag) {
      return undefined;
    }

    const stopDrag = () => setAxisDrag(null);
    window.addEventListener("pointerup", stopDrag);
    return () => window.removeEventListener("pointerup", stopDrag);
  }, [axisDrag]);

  useEffect(() => {
    if (!plotResize) {
      return undefined;
    }

    const onMove = (event) => {
      const delta = event.clientY - plotResize.startY;
      updatePlotHeight(plotResize.plotId, plotResize.startHeight + delta);
    };

    const onUp = () => setPlotResize(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [plotResize]);

  const renderPlot = (plot) => {
    const layoutHeight = clamp(plot.height || 320, 300, 720);
    const width = Math.max(520, plotWidths[plot.id] || 1200);
    const height = Math.max(180, layoutHeight - 88);
    const padding = { top: 20, right: 74, bottom: 40, left: 74 };
    const xTargetTicks = clamp(Math.floor((width - padding.left - padding.right) / 60), 6, 40);
    const rawSamples = getSamplesForPlot(plot);
    const samples = getLodSamplesForPlot(plot, rawSamples, width - padding.left - padding.right);
    const firstRawSequence = rawSamples[0]?.sequence ?? 0;

    const xAssignment = plot.assignments.find((item) => item.axis === "x");
    const xValues = samples.map((sample, index) => {
      if (xAssignment) {
        const value = getSampleValue(sample, xAssignment.channelId);
        return Number.isFinite(value) ? value : index;
      }
      if (basicConfig.includeTimestamp && sample.xValue !== null && sample.xValue !== undefined) {
        return sample.xValue;
      }
      return Number.isFinite(sample.sequence) ? sample.sequence - firstRawSequence : index;
    });
    const yScaleSamples = getVisibleSamplesForPlot(plot, samples);

    const yAssignments = plot.assignments.filter((item) => item.axis !== "x");
    const hasRenderableData = samples.length >= 2 && plot.assignments.length > 0 && yAssignments.length > 0;
    const hasY1Assignments = yAssignments.some((item) => item.axis === "y1");
    const hasY2Assignments = yAssignments.some((item) => item.axis === "y2");

    const axisStats = {
      y1: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
      y2: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
    };

    yAssignments.forEach((assignment) => {
      yScaleSamples.forEach((sample) => {
        const value = getSampleValue(sample, assignment.channelId);
        if (value === undefined) {
          return;
        }
        axisStats[assignment.axis].min = Math.min(axisStats[assignment.axis].min, value);
        axisStats[assignment.axis].max = Math.max(axisStats[assignment.axis].max, value);
      });
    });

    const y1AutoRange = Number.isFinite(axisStats.y1.min)
      ? normalizeYAxisRange(axisStats.y1.min, axisStats.y1.max)
      : Number.isFinite(axisStats.y2.min)
        ? normalizeYAxisRange(axisStats.y2.min, axisStats.y2.max)
        : { min: basePlotTicks.y1.min, max: basePlotTicks.y1.max };
    const y2AutoRange = Number.isFinite(axisStats.y2.min)
      ? normalizeYAxisRange(axisStats.y2.min, axisStats.y2.max)
      : Number.isFinite(axisStats.y1.min)
        ? normalizeYAxisRange(axisStats.y1.min, axisStats.y1.max)
        : { min: basePlotTicks.y2.min, max: basePlotTicks.y2.max };

    const y1Range = plot.y1Mode === "manual"
      ? {
          min: Number(plot.y1ManualMin ?? y1AutoRange.min),
          max: Number(plot.y1ManualMax ?? y1AutoRange.max)
        }
      : y1AutoRange;

    const y2Range = plot.y2Mode === "manual"
      ? {
          min: Number(plot.y2ManualMin ?? y2AutoRange.min),
          max: Number(plot.y2ManualMax ?? y2AutoRange.max)
        }
      : y2AutoRange;

    const y1TicksData = hasRenderableData
      ? makeYAxisTicks(y1Range.min, y1Range.max, height - padding.top - padding.bottom)
      : basePlotTicks.y1;
    const makeY2FollowTicks = () => {
      const ownTicks = makeYAxisTicks(y2Range.min, y2Range.max, height - padding.top - padding.bottom);
      if (!hasY1Assignments || plot.y1Mode !== "auto" || plot.y2Mode !== "auto") {
        y2FollowStateRef.current.delete(plot.id);
        return ownTicks;
      }

      const previous = y2FollowStateRef.current.get(plot.id);
      const referenceIntervals = Math.max(1, y1TicksData.ticks.length - 1);
      const followStep = pickStep(y2Range.max - y2Range.min, referenceIntervals);
      const followedTicks = makeYAxisTicksFollowingReference(y1TicksData, axisStats.y2, followStep || ownTicks.step || minStep, previous);
      y2FollowStateRef.current.set(plot.id, followedTicks.state);
      return {
        ticks: followedTicks.ticks,
        min: followedTicks.min,
        max: followedTicks.max,
        step: followedTicks.step
      };
    };
    const y2TicksData = hasRenderableData && hasY2Assignments
      ? makeY2FollowTicks()
      : hasRenderableData && hasY1Assignments
        ? y1TicksData
        : basePlotTicks.y2;

    const xRange = findFiniteRange(xValues);
    const xMin = xRange?.min ?? basePlotTicks.x.min;
    const xMax = xRange?.max ?? basePlotTicks.x.max;
    const xTicksData = hasRenderableData && plot.xMode === "manual"
      ? makeXTicks(Number(plot.xManualMin ?? xMin), Number(plot.xManualMax ?? xMax), xTargetTicks)
      : hasRenderableData
        ? makeXTicks(xMin, xMax, xTargetTicks)
        : basePlotTicks.x;

    const xMinorTicks = makeMinorTicks(xTicksData, getStepDivisionBase(xTicksData.step));
    const y1MinorTicks = makeMinorTicks(y1TicksData, getStepDivisionBase(y1TicksData.step));
    const y2MinorTicks = [];

    const yTickToPx = (value, ticksData) => {
      const ratio = (value - ticksData.min) / (ticksData.max - ticksData.min || 1);
      return (
        height -
        padding.bottom -
        ratio * (height - padding.top - padding.bottom)
      );
    };

    const xTickToPx = (value) => {
      const ratio = (value - xTicksData.min) / (xTicksData.max - xTicksData.min || 1);
      return padding.left + ratio * (width - padding.left - padding.right);
    };

    const y1VisibleTicks = y1TicksData.ticks
      .filter((tick, index, arr) => index === 0 || formatTick(tick, y1TicksData.step) !== formatTick(arr[index - 1], y1TicksData.step));
    const y2VisibleTicks = y2TicksData.ticks
      .filter((tick, index, arr) => index === 0 || formatTick(tick, y2TicksData.step) !== formatTick(arr[index - 1], y2TicksData.step));
    const xVisibleTicks = xTicksData.ticks
      .filter((tick, index, arr) => index === 0 || formatTick(tick, xTicksData.step) !== formatTick(arr[index - 1], xTicksData.step));

    const getStatWindow = () => {
      const rawValue = Math.max(2, Number(plot.statsWindowValue || 400));
      if (plot.statsWindowUnit === "seconds") {
        return Math.max(2, Math.round(rawValue * basicConfig.samplesPerSecond));
      }
      return rawValue;
    };

    const statWindowSamples = getStatWindow();
    const statTargetGroups = {
      avg: Array.isArray(plot.statAvgTargets) ? plot.statAvgTargets : [],
      min: Array.isArray(plot.statMinTargets) ? plot.statMinTargets : [],
      max: Array.isArray(plot.statMaxTargets) ? plot.statMaxTargets : []
    };

    const canvasSeries = hasRenderableData
      ? yAssignments.map((assignment) => {
        const stats = assignment.axis === "y2" ? y2TicksData : y1TicksData;
        if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max)) {
          return null;
        }

        const points = buildSeriesPoints(
          samples,
          xValues,
          assignment.channelId,
          getSampleValue,
          stats.min,
          stats.max,
          height,
          width,
          padding,
          xTicksData.min,
          xTicksData.max,
          basicConfig.plotMode
        );
        if (points.length < 2) {
          return null;
        }

        const channel = getChannelById(assignment.channelId);
        const style = channel?.lineStyle || "solid";
        const thickness = Number(channel?.thickness || 2);
        return {
          key: `${assignment.channelId}-${assignment.axis}`,
          points,
          color: channel?.color || "#2563eb",
          thickness: Math.max(1, thickness),
          style
        };
      }).filter(Boolean)
      : [];

    const computeRollingStatSeries = (values, mode) => {
      if (mode === "avg") {
        let sum = 0;
        let count = 0;
        return values.map((value, index) => {
          if (value !== undefined) {
            sum += value;
            count += 1;
          }
          const outIndex = index - statWindowSamples;
          if (outIndex >= 0) {
            const outValue = values[outIndex];
            if (outValue !== undefined) {
              sum -= outValue;
              count -= 1;
            }
          }
          return count > 0 ? sum / count : undefined;
        });
      }

      const deque = [];
      return values.map((value, index) => {
        if (value !== undefined) {
          while (deque.length) {
            const tailValue = values[deque[deque.length - 1]];
            if (tailValue === undefined) {
              deque.pop();
              continue;
            }
            if ((mode === "min" && tailValue >= value) || (mode === "max" && tailValue <= value)) {
              deque.pop();
            } else {
              break;
            }
          }
          deque.push(index);
        }

        const windowStart = index - statWindowSamples + 1;
        while (deque.length && deque[0] < windowStart) {
          deque.shift();
        }

        return deque.length ? values[deque[0]] : undefined;
      });
    };

    const statCurves = hasRenderableData
      ? yAssignments.map((assignment) => {
        const assignmentKey = `${assignment.channelId}:${assignment.axis}`;
        const channel = getChannelById(assignment.channelId);
        const stats = assignment.axis === "y2" ? y2TicksData : y1TicksData;
        const curves = [];

        const buildStatPath = (mode, opacity, dasharray = "") => {
          const targets = statTargetGroups[mode] || [];
          if (!targets.includes(assignmentKey)) {
            return;
          }

          const sourceValues = samples.map((sample) => getSampleValue(sample, assignment.channelId));
          const statValues = computeRollingStatSeries(sourceValues, mode);
          const points = downsamplePointsByPixel(statValues
            .map((value, sampleIndex) => {
              if (value === undefined) {
                return null;
              }
              const normalizedX = (xValues[sampleIndex] - xTicksData.min) / (xTicksData.max - xTicksData.min || 1);
              const normalizedY = (value - stats.min) / (stats.max - stats.min || 1);
              return {
                x: padding.left + normalizedX * (width - padding.left - padding.right),
                y: height - padding.bottom - normalizedY * (height - padding.top - padding.bottom)
              };
            })
            .filter(Boolean));

          if (points.length < 2) {
            return;
          }

          curves.push(
            <path
              key={`${assignment.channelId}-${assignment.axis}-${mode}`}
              d={buildPath(points)}
              fill="none"
              stroke={channel?.color || "#2563eb"}
              strokeWidth="0.5"
              strokeOpacity={opacity}
              strokeDasharray={dasharray}
            />
          );
        };

        buildStatPath("avg", 0.85);
        buildStatPath("min", 0.65);
        buildStatPath("max", 0.65);

        return curves;
      }).flat()
      : [];

    const isAxisActive = (axis) => hoverAxisByPlot[plot.id] === axis;
    const xAutoEnabled = plot.xMode !== "manual";
    const y1AutoEnabled = plot.y1Mode === "auto";
    const y2AutoEnabled = plot.y2Mode === "auto";
    const plotClipId = `plot-clip-${plot.id}`;
    const plotAreaWidth = width - padding.left - padding.right;
    const plotAreaHeight = height - padding.top - padding.bottom;
    const yDropWidth = 46;
    const plotTheme = theme === "dark"
      ? {
          background: "#0f172a",
          axis: "#64748b",
          gridMinor: "#1e293b",
          gridMinorY: "#182235",
          gridMajor: "#475569",
          gridYMajor: "#334155",
          tick: "#cbd5e1",
          placeholder: "#94a3b8",
          checkFill: "#111827",
          checkStroke: "#94a3b8",
          check: "#60a5fa"
        }
      : {
          background: "#ffffff",
          axis: "#94a3b8",
          gridMinor: "#e9eef8",
          gridMinorY: "#f3f6fd",
          gridMajor: "#b6c6db",
          gridYMajor: "#bfdbfe",
          tick: "#64748b",
          placeholder: "#94a3b8",
          checkFill: "#ffffff",
          checkStroke: "#64748b",
          check: "#2563eb"
        };

    return (
      <>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMin meet">
        <defs>
          <clipPath id={plotClipId}>
            <rect
              x={padding.left}
              y={padding.top}
              width={plotAreaWidth}
              height={plotAreaHeight}
            />
          </clipPath>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill={plotTheme.background} />
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke={plotTheme.axis}
          strokeWidth="1"
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke={plotTheme.axis}
          strokeWidth="1"
        />
        <line
          x1={width - padding.right}
          y1={padding.top}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke={plotTheme.axis}
          strokeWidth="1"
        />

        <rect
          x={padding.left - yDropWidth - 8}
          y={padding.top}
          width={yDropWidth}
          height={plotAreaHeight}
          className={`axis-control-box ${isAxisEditable(plot, "y1") ? "axis-control-box--editable" : ""} ${isAxisActive("y1") ? "axis-control-box--active" : ""}`}
          
        />
        <rect
          x={width - padding.right + 8}
          y={padding.top}
          width={yDropWidth}
          height={plotAreaHeight}
          className={`axis-control-box ${isAxisEditable(plot, "y2") ? "axis-control-box--editable" : ""} ${isAxisActive("y2") ? "axis-control-box--active" : ""}`}
          
        />
        <rect
          x={padding.left}
          y={height - padding.bottom + 10}
          width={plotAreaWidth}
          height={20}
          className={`axis-control-box ${isAxisEditable(plot, "x") ? "axis-control-box--editable" : ""} ${isAxisActive("x") ? "axis-control-box--active" : ""}`}
          
        />

        <g onClick={() => handleModeChange(plot.id, "y1", y1AutoEnabled ? "manual" : "auto")}>
          <rect x={padding.left - yDropWidth - 2} y={padding.top - 16} width={10} height={10} fill={plotTheme.checkFill} stroke={plotTheme.checkStroke} strokeWidth="1" />
          {y1AutoEnabled ? <path d={`M ${padding.left - yDropWidth} ${padding.top - 11} L ${padding.left - yDropWidth + 2} ${padding.top - 9} L ${padding.left - yDropWidth + 6} ${padding.top - 14}`} stroke={plotTheme.check} strokeWidth="1.5" fill="none" /> : null}
        </g>
        <g onClick={() => handleModeChange(plot.id, "y2", y2AutoEnabled ? "manual" : "auto")}>
          <rect x={width - padding.right + 14} y={padding.top - 16} width={10} height={10} fill={plotTheme.checkFill} stroke={plotTheme.checkStroke} strokeWidth="1" />
          {y2AutoEnabled ? <path d={`M ${width - padding.right + 16} ${padding.top - 11} L ${width - padding.right + 18} ${padding.top - 9} L ${width - padding.right + 22} ${padding.top - 14}`} stroke={plotTheme.check} strokeWidth="1.5" fill="none" /> : null}
        </g>
        <g onClick={() => toggleXAxisAuto(plot.id, !xAutoEnabled)}>
          <rect x={padding.left - 18} y={height - padding.bottom + 15} width={10} height={10} fill={plotTheme.checkFill} stroke={plotTheme.checkStroke} strokeWidth="1" />
          {xAutoEnabled ? <path d={`M ${padding.left - 16} ${height - padding.bottom + 20} L ${padding.left - 14} ${height - padding.bottom + 22} L ${padding.left - 10} ${height - padding.bottom + 17}`} stroke={plotTheme.check} strokeWidth="1.5" fill="none" /> : null}
        </g>

        {xMinorTicks.map((tick) => {
          const x = xTickToPx(tick);
          return (
            <line
              key={`x-minor-${tick}`}
              x1={x}
              y1={padding.top}
              x2={x}
              y2={height - padding.bottom}
              stroke={plotTheme.gridMinor}
              strokeWidth="1"
            />
          );
        })}

        {y1MinorTicks.map((tick) => {
          const y = yTickToPx(tick, y1TicksData);
          return (
            <line
              key={`y1-minor-${tick}`}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={plotTheme.gridMinorY}
              strokeWidth="1"
            />
          );
        })}

        {y2MinorTicks.map((tick) => {
          const y = yTickToPx(tick, y2TicksData);
          return (
            <line
              key={`y2-minor-${tick}`}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={plotTheme.gridMinorY}
              strokeWidth="1"
            />
          );
        })}

        {xVisibleTicks.map((tick) => {
          const x = xTickToPx(tick);
          return (
            <g key={`x-${tick}`}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={height - padding.bottom}
                stroke={plotTheme.gridMajor}
                strokeWidth="1.15"
              />
              <text
                x={x}
                y={height - padding.bottom + 24}
                textAnchor="middle"
                fontSize="12px"
                fill={plotTheme.tick}
              >
                {formatTick(tick, xTicksData.step)}
              </text>
            </g>
          );
        })}

        {y1VisibleTicks.map((tick) => {
          const y = yTickToPx(tick, y1TicksData);
          return (
            <g key={`y1-${tick}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke={plotTheme.gridYMajor}
                strokeWidth="1.15"
              />
              <text
                x={padding.left - 14}
                y={y + 3}
                textAnchor="end"
                fontSize="12px"
                fill={plotTheme.tick}
              >
                {formatTick(tick, y1TicksData.step)}
              </text>
            </g>
          );
        })}

        {y2VisibleTicks.map((tick) => {
          const y = yTickToPx(tick, y2TicksData);
          return (
            <text
              key={`y2-${tick}`}
              x={width - padding.right + 14}
              y={y + 3}
              textAnchor="start"
              fontSize="12px"
              fill={plotTheme.tick}
            >
              {formatTick(tick, y2TicksData.step)}
            </text>
          );
        })}
        <g clipPath={`url(#${plotClipId})`}>
          {statCurves}
        </g>
        {!hasRenderableData ? (
          <text
            x={padding.left + plotAreaWidth / 2}
            y={padding.top + plotAreaHeight / 2}
            textAnchor="middle"
            fontSize="12px"
            fill={plotTheme.placeholder}
          >
            Arrastra una variable hacia X, Y1 o Y2
          </text>
        ) : null}
      </svg>
      <PlotSeriesCanvas
        width={width}
        height={height}
        padding={padding}
        series={canvasSeries}
      />
      </>
    );
  };

  const functionDragMime = "application/x-jw-function-block";

  const functionPaletteGroups = [
    {
      title: "Operadores",
      items: [
        { type: "add", label: "+", tone: "operator" },
        { type: "subtract", label: "-", tone: "operator" },
        { type: "multiply", label: "*", tone: "operator" },
        { type: "divide", label: "/", tone: "operator" },
        { type: "power", label: "^", tone: "operator" },
        { type: "abs", label: "Abs", tone: "operator" },
        { type: "sqrt", label: "Sqrt", tone: "operator" },
        { type: "round", label: "Round", tone: "operator" },
        { type: "gt", label: ">", tone: "operator" },
        { type: "lt", label: "<", tone: "operator" },
        { type: "gte", label: ">=", tone: "operator" },
        { type: "lte", label: "<=", tone: "operator" }
      ]
    },
    {
      title: "Ventanas",
      items: [
        { type: "current", label: "Actual", tone: "window" },
        { type: "initial", label: "Inicial", tone: "window" },
        { type: "min", label: "Min", tone: "window" },
        { type: "max", label: "Max", tone: "window" },
        { type: "avg", label: "Prom", tone: "window" },
        { type: "rangeAbs", label: "|Max-Min|", tone: "window" },
        { type: "delta", label: "Delta", tone: "window" },
        { type: "slope", label: "Pend", tone: "window" },
        { type: "std", label: "Std", tone: "window" },
        { type: "rms", label: "RMS", tone: "window" }
      ]
    },
    {
      title: "Constantes",
      items: [{ type: "number", label: "Número", tone: "number" }]
    }
  ];

  const updateFunctionBlockAtPath = (path, updater) => {
    setFunctionDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const updateNode = (node, depth = 0) => {
        if (depth >= path.length) {
          return updater(node);
        }
        if (!node) {
          return node;
        }
        const key = path[depth];
        return { ...node, [key]: updateNode(node?.[key], depth + 1) };
      };
      const nextBlock = updateNode(prev.block);
      return { ...prev, block: nextBlock, expression: nextBlock ? blockToExpression(nextBlock) : "" };
    });
    setFunctionMessage("");
  };

  const clearFunctionBlock = () => {
    setFunctionDraft((prev) => (prev ? { ...prev, block: null, expression: "" } : prev));
    setFunctionMessage("");
  };

  const createFunctionBlockFromPayload = (payload) => {
    const fallbackSource = payload?.sourceId || null;
    if (payload?.kind === "variable") {
      return createFunctionBlock("variable", fallbackSource);
    }
    return createFunctionBlock(payload?.type || "current", null);
  };

  const handleFunctionDragStart = (event, payload) => {
    const encodedPayload = JSON.stringify(payload);
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData(functionDragMime, encodedPayload);
    event.dataTransfer.setData("text/plain", `jwserial-function:${encodedPayload}`);
  };

  const readFunctionDragPayload = (event) => {
    const raw =
      event.dataTransfer.getData(functionDragMime) ||
      event.dataTransfer.getData("text/plain").replace(/^jwserial-function:/, "");
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  };

  const allowFunctionDrop = (event) => {
    if (Array.from(event.dataTransfer.types).includes(functionDragMime)) {
      event.preventDefault();
      const payload = readFunctionDragPayload(event);
      event.dataTransfer.dropEffect = payload?.kind === "placed" ? "move" : "copy";
    }
  };

  const allowFunctionTrashDrop = (event) => {
    if (Array.from(event.dataTransfer.types).includes(functionDragMime)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
    }
  };

  const dropFunctionBlockAtPath = (event, path) => {
    const payload = readFunctionDragPayload(event);
    if (!payload) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (payload.kind === "placed") {
      if (!Array.isArray(payload.path) || JSON.stringify(payload.path) === JSON.stringify(path)) {
        return;
      }
      setFunctionDraft((prev) => {
        if (!prev) {
          return prev;
        }
        const readNode = (node, readPath, depth = 0) => {
          if (!node || depth >= readPath.length) {
            return node || null;
          }
          return readNode(node[readPath[depth]], readPath, depth + 1);
        };
        const writeNode = (node, writePath, value, depth = 0) => {
          if (depth >= writePath.length) {
            return value;
          }
          if (!node) {
            return node;
          }
          const key = writePath[depth];
          return { ...node, [key]: writeNode(node[key], writePath, value, depth + 1) };
        };
        const movedBlock = readNode(prev.block, payload.path);
        if (!movedBlock) {
          return prev;
        }
        const withoutSource = writeNode(prev.block, payload.path, null);
        const nextBlock = writeNode(withoutSource, path, movedBlock);
        return { ...prev, block: nextBlock, expression: nextBlock ? blockToExpression(nextBlock) : "" };
      });
      setFunctionMessage("");
      return;
    }
    updateFunctionBlockAtPath(path, () => createFunctionBlockFromPayload(payload));
  };

  const dropFunctionBlockToTrash = (event) => {
    const payload = readFunctionDragPayload(event);
    if (!payload || payload.kind !== "placed" || !Array.isArray(payload.path)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateFunctionBlockAtPath(payload.path, () => null);
  };

  const dropFunctionVariableAtPath = (event, path) => {
    const payload = readFunctionDragPayload(event);
    if (!payload || payload.kind !== "variable") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateFunctionBlockAtPath(path, (node) => ({ ...node, sourceId: payload.sourceId }));
  };

  const patchFunctionBlockAtPath = (path, patch) => {
    updateFunctionBlockAtPath(path, (node) => ({ ...node, ...patch }));
  };

  const renderPaletteBlock = (item) => (
    <button
      key={`${item.type || item.sourceId}-${item.label}`}
      type="button"
      className={`function-palette__block function-palette__block--${item.tone || "operator"}`}
      draggable
      onDragStart={(event) => handleFunctionDragStart(event, item.kind ? item : { kind: "block", type: item.type })}
      onDoubleClick={() => updateFunctionBlockAtPath([], () => createFunctionBlockFromPayload(item.kind ? item : { kind: "block", type: item.type }))}
      title="Arrastra este bloque a una ranura"
    >
      {item.color ? <span className="function-palette__dot" style={{ background: item.color }} /> : null}
      <span>{item.label}</span>
    </button>
  );

  const handlePlacedFunctionDragStart = (event, path) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(functionDragMime, JSON.stringify({ kind: "placed", path }));
  };

  const renderFunctionVariableSlot = (block, path) => {
    const channel = sourceChannels.find((item) => item.id === block.sourceId) || null;
    return (
      <span
        className={`function-slot ${channel ? "function-slot--variable" : "function-slot--empty"}`}
        onDragOver={allowFunctionDrop}
        onDrop={(event) => dropFunctionVariableAtPath(event, path)}
        title="Arrastra una variable aquí"
      >
        {channel ? <span className="function-palette__dot" style={{ background: channel.color }} /> : null}
        <span>{channel?.name || ""}</span>
      </span>
    );
  };

  const renderFunctionSlot = (block, path, label) => (
    <span
      className="function-slot-shell"
      onDragOver={allowFunctionDrop}
      onDrop={(event) => dropFunctionBlockAtPath(event, path)}
      title="Suelta un bloque aquí"
    >
      {block ? renderFunctionBlock(block, path) : <span className="function-slot function-slot--empty" aria-label={label} />}
    </span>
  );

  const renderFunctionBlock = (block, path = []) => {
    if (!block) {
      return null;
    }
    const operation = functionBlockOperations.find((item) => item.id === block.type);
    const setPatch = (patch) => patchFunctionBlockAtPath(path, patch);
    const dragProps = {
      draggable: true,
      onDragStart: (event) => handlePlacedFunctionDragStart(event, path),
      onDragOver: allowFunctionDrop,
      onDrop: (event) => dropFunctionBlockAtPath(event, path)
    };

    if (block.type === "number") {
      return (
        <span className="function-block function-block--number" {...dragProps}>
          <span>Número</span>
          <input
            type="number"
            value={block.value}
            onChange={(event) => setPatch({ value: event.target.value })}
          />
        </span>
      );
    }

    if (block.type === "variable") {
      const channel = sourceChannels.find((item) => item.id === block.sourceId) || sourceChannels[0];
      return (
        <span className="function-block function-block--variable" {...dragProps}>
          {channel ? <span className="function-palette__dot" style={{ background: channel.color }} /> : null}
          <span>{channel?.name || "Variable"}</span>
        </span>
      );
    }

    if (unaryExpressionFunctions[block.type]) {
      return (
        <span className="function-block function-block--operator" {...dragProps}>
          <span>{operation?.label || unaryExpressionFunctions[block.type]}</span>
          <span>(</span>
          {renderFunctionSlot(block.input, [...path, "input"], "valor")}
          <span>)</span>
        </span>
      );
    }

    if (binaryBlockSymbols[block.type]) {
      return (
        <span className="function-block function-block--operator" {...dragProps}>
          {renderFunctionSlot(block.left, [...path, "left"], "A")}
          <span className="function-block__symbol">{binaryBlockSymbols[block.type]}</span>
          {renderFunctionSlot(block.right, [...path, "right"], "B")}
        </span>
      );
    }

    return (
      <span className="function-block function-block--window" {...dragProps}>
        <span className="function-block__label">{operation?.label || "Actual"}</span>
        <span>de</span>
        {renderFunctionVariableSlot(block, path)}
        {operation?.needsWindow ? (
          <>
            <span>en</span>
            <input
              type="number"
              min="1"
              value={block.windowValue}
              onChange={(event) => setPatch({ windowValue: event.target.value })}
            />
            <select
              value={block.windowUnit || "seconds"}
              onChange={(event) => setPatch({ windowUnit: event.target.value })}
            >
              <option value="seconds">s</option>
              <option value="samples">m</option>
            </select>
          </>
        ) : null}
      </span>
    );
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar__header">
          <div className="sidebar__brand">
            <div>
              <h1>JW-Serial</h1>
          <div className="sidebar__status">
            <span className={`status-dot status-dot--${statusTone}`} />
            <span>
              {isPaused
                ? "Pausado"
                : connectionStatus === "connected"
                  ? "Capturando"
                  : connectionStatus === "error"
                    ? "Error"
                    : "Desconectado"}
            </span>
          </div>
          <p>MVP · Windows</p>
            </div>
            <button
              type="button"
              className={`theme-toggle theme-toggle--${theme}`}
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            >
              <span className="theme-toggle__scene" aria-hidden="true">
                <span className="theme-toggle__sun" />
                <span className="theme-toggle__moon" />
                <span className="theme-toggle__cloud theme-toggle__cloud--one" />
                <span className="theme-toggle__cloud theme-toggle__cloud--two" />
                <span className="theme-toggle__star theme-toggle__star--one" />
                <span className="theme-toggle__star theme-toggle__star--two" />
                <span className="theme-toggle__star theme-toggle__star--three" />
              </span>
            </button>
          </div>
        </header>

        <div className="sidebar__content">
          <section className="sidebar__section">
            <h2>Conexión</h2>
            <label className="field">
              Puerto
              <select
                value={selectedPort}
                onChange={(event) => setSelectedPort(event.target.value)}
              >
                {ports.length === 0 ? (
                  <option value="">Sin puertos</option>
                ) : (
                  ports.map((port) => (
                    <option key={port.path} value={port.path}>
                      {port.path}
                    </option>
                  ))
                )}
              </select>
            </label>
            {ports.length === 0 ? (
              <label className="field">
                Puerto manual
                <input
                  type="text"
                  value={manualPort}
                  onChange={(event) => setManualPort(event.target.value)}
                  placeholder="COM7"
                />
              </label>
            ) : null}
            <label className="field">
              Baudrate
              <select
                value={baudRate}
                onChange={(event) => setBaudRate(Number(event.target.value))}
              >
                {commonBaudRates.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}
                  </option>
                ))}
              </select>
            </label>
            <div className="connection-actions">
              <button type="button" onClick={refreshPorts}>
                Refrescar
              </button>
              {connectionStatus === "connected" ? (
                <button type="button" onClick={handleDisconnect}>
                  Desconectar
                </button>
              ) : (
                <button type="button" onClick={handleConnect}>
                  Conectar
                </button>
              )}
            </div>
            <div className="rx-stats">
              <span>{rxStats.sps.toFixed(1)} SPS</span>
              <span>{plotFps.toFixed(1)} FPS</span>
            </div>
          </section>

          <section className="sidebar__section">
            <h2>Variables</h2>
            <div className="channel-table">
              {visibleChannels.map((channel) => (
                <div
                  className="channel-row"
                  key={channel.id}
                  draggable
                  onDragStart={(event) => handleChannelDragStart(event, channel.id)}
                  onContextMenu={(event) => openVariableMenu(event, channel.id)}
                >
                  <span
                    className="channel-color"
                    style={{ backgroundColor: channel.color }}
                  />
                  <span className="channel-name">{channel.name}</span>
                  <span className="channel-value">{channel.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="sidebar__section">
            <h2>Métricas</h2>
            <div className="channel-table">
              {systemChannels.map((channel) => (
                <div
                  className="channel-row channel-row--system"
                  key={channel.id}
                  draggable
                  onDragStart={(event) => handleChannelDragStart(event, channel.id)}
                >
                  <span
                    className="channel-color"
                    style={{ backgroundColor: channel.color }}
                  />
                  <span className="channel-name">{channel.name}</span>
                  <span className="channel-value">{channel.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="sidebar__section">
            <div className="sidebar__section-title">
              <h2>Funciones</h2>
              <button type="button" onClick={() => openFunctionBuilder()}>
                Nueva
              </button>
            </div>
            <div className="channel-table">
              {virtualChannels.length === 0 ? (
                <p className="connection-status">Sin funciones virtuales.</p>
              ) : (
                virtualChannels.map((channel) => (
                  <div
                    className="channel-row channel-row--virtual"
                    key={channel.id}
                    draggable
                    onDragStart={(event) => handleChannelDragStart(event, channel.id)}
                    onClick={() => openFunctionBuilder(virtualFunctions.find((item) => item.id === channel.id))}
                    onContextMenu={(event) => openVariableMenu(event, channel.id)}
                  >
                    <span
                      className="channel-color"
                      style={{ backgroundColor: channel.color }}
                    />
                    <span className="channel-name">{channel.name}</span>
                    <span className="channel-value">{channel.value.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="sidebar__section">
            <h2>Acciones</h2>
            <div className="actions">
              <button type="button" onClick={() => setModal("config")}>
                Configuración
              </button>
              <div className="actions__row actions__row--triple">
                <button type="button" onClick={() => setIsPaused((prev) => !prev)}>
                  {isPaused ? "Reanudar" : "Pausar"}
                </button>
              <button type="button" onClick={clearBuffer}>
                Limpiar
              </button>
              <button type="button" onClick={exportCsv}>
                  CSV
                </button>
              </div>
              <button type="button" onClick={() => setModal("event")}>
                Evento
              </button>
              <div className="actions__row actions__row--capture">
              <button
                type="button"
                className="capture-status-button"
                style={{ "--capture-progress": `${captureCountdown.progress * 100}%` }}
                onClick={() => captureAllPlots()}
              >
                <span>{captureCountdown.label}</span>
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModal("captures")}
                aria-label="Configurar capturas"
                title="Configurar capturas"
              >
                ?
              </button>
              </div>
              <div className="actions__row actions__row--split">
                <button type="button" onClick={() => setModal("save")}>
                  Guardar conf.
                </button>
                <button type="button" onClick={() => setModal("load")}>
                  Cargar conf.
                </button>
              </div>
            </div>
            {captureMessage ? <p className="connection-status">{captureMessage}</p> : null}
          </section>
        </div>
      </aside>

      <main className="main">
        <div className="main__toolbar">
          <div className="tabs">
            <button
              type="button"
              className={`tab ${activeTab === "plotter" ? "tab--active" : ""}`}
              onClick={() => setActiveTab("plotter")}
            >
              Plotter
            </button>
            <button
              type="button"
              className={`tab ${activeTab === "monitor" ? "tab--active" : ""}`}
              onClick={() => setActiveTab("monitor")}
            >
              Monitor
            </button>
          </div>
          <div className="plot-actions">
            <button type="button" onClick={addPlot}>
              Add Plot
            </button>
            <button type="button" onClick={removePlot}>
              Remove Plot
            </button>
          </div>
        </div>

        {activeTab === "plotter" ? (
          <div ref={plotsRef} className="plots" data-version={dataVersion} onWheelCapture={handlePlotterWheelCapture}>
            {plots.map((plot) => {
              const draft = getDraft(plot.id);
              const yAssignments = plot.assignments.filter((item) => item.axis !== "x");
              const legendEntries = plot.assignments.map((assignment) => {
                const channel = getChannelById(assignment.channelId);
                return {
                  key: `${assignment.channelId}-${assignment.axis}`,
                  channelId: assignment.channelId,
                  axis: assignment.axis.toUpperCase(),
                  name: channel?.name || assignment.channelId,
                  color: channel?.color || "#64748b"
                };
              });

              return (
                <section
                  className="plot"
                  key={plot.id}
                  ref={getPlotElementRef(plot.id)}
                  style={{ height: `${plot.height || 320}px` }}
                >
                  <header className="plot__header">
                    <h3>{plot.title}</h3>
                  </header>

                  <div
                    className="plot__canvas"
                    onContextMenu={(event) => openContextMenu(event, plot.id)}
                    onWheel={(event) => handlePlotAxisWheel(event, plot.id)}
                    onPointerMove={(event) => handlePlotCanvasPointerMove(event, plot.id)}
                    onPointerDown={(event) => handlePlotCanvasPointerDown(event, plot.id)}
                    onPointerLeave={() => handlePlotCanvasPointerLeave(plot.id)}
                    onDragOver={handlePlotDragOver}
                    onDragLeave={(event) => handlePlotDragLeave(event, plot.id)}
                    onDrop={(event) => handlePlotDrop(event, plot.id)}
                    data-plot-id={plot.id}
                  >
                    {renderPlot(plot)}
                    <div className="plot__legend-box">
                      <strong>Señales</strong>
                      {legendEntries.length === 0 ? (
                        <span>Sin señales</span>
                      ) : (
                        legendEntries.map((entry) => (
                          <button
                            key={entry.key}
                            type="button"
                            className="plot__legend-row"
                            onContextMenu={(event) => openVariableMenu(event, entry.channelId)}
                          >
                            <span className="plot__legend-dot" style={{ backgroundColor: entry.color }} />
                            <span>{entry.name}</span>
                            <span className="plot__legend-axis">{entry.axis}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div
                    className="plot__resize-zone"
                    onPointerDown={(event) => startResize(event, plot.id, plot.height)}
                    role="separator"
                    aria-label="Resize plot vertically"
                    title="Arrastra desde el borde inferior"
                  />

                  {contextMenu?.plotId === plot.id ? (
                    <div
                      ref={menuRef}
                      className="plot-menu"
                      style={{ left: contextMenu.x, top: contextMenu.y }}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <header className="plot-menu__header">
                        <div>
                          <strong>{plot.title}</strong>
                          <span>Configurar gráfico</span>
                        </div>
                        <button type="button" className="plot-menu__close" onClick={closeContextMenu}>
                          Cerrar
                        </button>
                      </header>

                      <div className="plot-menu__section">
                        <div className="plot-menu__section-title">
                          <strong>Asignar señal</strong>
                          <span>Arrastra hacia un eje</span>
                        </div>
                        <div className="plot-menu__axis-targets" role="group" aria-label="Ejes destino">
                          {["x", "y1", "y2"].map((axis) => (
                            <div
                              key={axis}
                              className="plot-menu__axis-target"
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => handlePlotMenuAxisDrop(event, plot.id, axis)}
                            >
                              {axisLabels[axis]}
                            </div>
                          ))}
                        </div>
                        <div className="plot-menu__channels">
                          {allChannels.map((channel) => (
                            <button
                              key={channel.id}
                              type="button"
                              className="plot-menu__channel"
                              draggable
                              onDragStart={(event) => handleChannelDragStart(event, channel.id)}
                              title={`Arrastra ${channel.name} hacia X, Y1 o Y2`}
                            >
                              <span className="plot-menu__dot" style={{ backgroundColor: channel.color }} />
                              <span>{channel.name}</span>
                              <span>{Number(channel.value || 0).toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="plot-menu__section">
                        <div className="plot-menu__section-title">
                          <strong>Señales asignadas</strong>
                          <span>{plot.assignments.length} activa(s)</span>
                        </div>
                        <div className="plot-menu__assigned">
                          {plot.assignments.length === 0 ? (
                            <span className="plot-menu__muted">Aún no hay señales en este plot.</span>
                          ) : (
                            plot.assignments.map((assignment) => {
                              const channel = getChannelById(assignment.channelId);
                              const assignmentKey = `${assignment.channelId}:${assignment.axis}`;
                              return (
                                <div key={assignmentKey} className="plot-menu__assigned-row">
                                  <span className="plot-menu__dot" style={{ backgroundColor: channel?.color || "#64748b" }} />
                                  <span>{channel?.name || assignment.channelId}</span>
                                  <span className="plot-menu__axis-pill">{axisLabels[assignment.axis]}</span>
                                  <button type="button" onClick={() => removeAssignment(plot.id, assignmentKey)}>
                                    Quitar
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div className="plot-menu__actions">
                          <button type="button" onClick={() => clearAssignments(plot.id)} disabled={plot.assignments.length === 0}>
                            Limpiar plot
                          </button>
                          <button type="button" onClick={closeContextMenu}>Listo</button>
                        </div>
                      </div>

                      <div className="plot-menu__section plot-menu__section--fold">
                        <strong>Curvas de referencia</strong>
                        <div className="plot-menu__inline-fields">
                          <select
                            value={plot.statsWindowUnit}
                            onChange={(event) => updatePlotSettings(plot.id, { statsWindowUnit: event.target.value })}
                          >
                            <option value="samples">Muestras</option>
                            <option value="seconds">Segundos</option>
                          </select>
                          <input
                            type="number"
                            min="2"
                            value={plot.statsWindowValue}
                            onChange={(event) => updatePlotSettings(plot.id, { statsWindowValue: Math.max(2, Number(event.target.value) || 2) })}
                          />
                        </div>
                        {yAssignments.length === 0 ? (
                          <span className="plot-menu__muted">Asigna una señal en Y1 o Y2 para activar referencias.</span>
                        ) : (
                          <div className="plot-menu__stats-table">
                            <span>Señal</span>
                            <span>Prom</span>
                            <span>Min</span>
                            <span>Max</span>
                            {yAssignments.map((assignment) => {
                              const targetKey = `${assignment.channelId}:${assignment.axis}`;
                              const channel = getChannelById(assignment.channelId);
                              const stats = [
                                { field: "statAvgTargets", label: "Promedio" },
                                { field: "statMinTargets", label: "Mínimo" },
                                { field: "statMaxTargets", label: "Máximo" }
                              ];
                              return (
                                <React.Fragment key={targetKey}>
                                  <div className="plot-menu__stats-signal">
                                    <span className="plot-menu__dot" style={{ backgroundColor: channel?.color || "#64748b" }} />
                                    <span>{channel?.name || assignment.channelId}</span>
                                    <span>{axisLabels[assignment.axis]}</span>
                                  </div>
                                  {stats.map((stat) => {
                                    const selected = (Array.isArray(plot[stat.field]) ? plot[stat.field] : []).includes(targetKey);
                                    return (
                                      <label key={`${targetKey}-${stat.field}`} className="plot-menu__stat-check" title={`${stat.label} de ${channel?.name || assignment.channelId}`}>
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          onChange={() => toggleStatTarget(plot.id, stat.field, targetKey)}
                                        />
                                      </label>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        )}
                        {([
                          { key: "avg", label: "Promedio", field: "statAvgTargets" },
                          { key: "min", label: "Mínimo", field: "statMinTargets" },
                          { key: "max", label: "Máximo", field: "statMaxTargets" }
                        ]).map((stat) => (
                          <div key={stat.key} className="plot-menu__stat-group">
                            <strong>{stat.label}</strong>
                            {yAssignments.length === 0 ? (
                              <span className="plot-menu__muted">Sin señales Y</span>
                            ) : (
                              yAssignments.map((assignment) => {
                                const targetKey = `${assignment.channelId}:${assignment.axis}`;
                                const channel = getChannelById(assignment.channelId);
                                const selected = (Array.isArray(plot[stat.field]) ? plot[stat.field] : []).includes(targetKey);
                                return (
                                  <label key={`${stat.key}-${targetKey}`}>
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() => toggleStatTarget(plot.id, stat.field, targetKey)}
                                    />
                                    {channel?.name || assignment.channelId} ({assignment.axis.toUpperCase()})
                                  </label>
                                );
                              })
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="plot-menu__section plot-menu__section--fold plot-menu__modes">
                        <strong>Modos de ejes</strong>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={plot.xMode !== "manual"}
                            onChange={(event) => toggleXAxisAuto(plot.id, event.target.checked)}
                          />
                          X auto/ventana
                        </label>
                        {isAxisEditable(plot, "x") ? (
                          <p className="plot-menu__muted">
                            Pasa el mouse sobre zona X: rueda = ±1 s, Shift+rueda = ±10 s.
                          </p>
                        ) : null}
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={plot.y1Mode === "auto"}
                            onChange={(event) => handleModeChange(plot.id, "y1", event.target.checked ? "auto" : "manual")}
                          />
                          Y1 automático
                        </label>
                        {plot.y1Mode === "manual" ? (
                          <p className="plot-menu__muted">
                            Pasa el mouse sobre zona Y1 y usa rueda; arrastra con click izquierdo para deslizar.
                          </p>
                        ) : null}
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={plot.y2Mode === "auto"}
                            onChange={(event) => handleModeChange(plot.id, "y2", event.target.checked ? "auto" : "manual")}
                          />
                          Y2 automático
                        </label>
                        {plot.y2Mode === "manual" ? (
                          <p className="plot-menu__muted">
                            Pasa el mouse sobre zona Y2 y usa rueda; arrastra con click izquierdo para deslizar.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="monitor">
            <div className="monitor__log">
              {monitorLog.length === 0 ? (
                <p className="monitor__placeholder">Aquí se verá el monitor serial.</p>
              ) : (
                monitorLog.map((line, index) => (
                  <p key={`${line}-${index}`} className="monitor__line">
                    {line}
                  </p>
                ))
              )}
            </div>
            <div className="monitor__controls">
              <input
                type="text"
                placeholder="Escribe un mensaje..."
                value={monitorMessage}
                onChange={(event) => setMonitorMessage(event.target.value)}
              />
              <select
                value={terminator}
                onChange={(event) => setTerminator(event.target.value)}
              >
                <option value="none">Sin ajuste</option>
                <option value="nl">Nueva línea (NL)</option>
                <option value="cr">Retorno de carro (CR)</option>
                <option value="nlcr">NL &amp; CR</option>
              </select>
              <button type="button" onClick={handleSend}>
                Enviar
              </button>
            </div>
          </div>
        )}
      </main>

      {modal ? (
        <div className="modal-backdrop">
          <div
            ref={modal === "function" ? functionModalRef : null}
            className={`modal ${modal === "function" ? "modal--function" : ""}`}
            style={modal === "function" ? { width: `${functionModalWidth}px` } : undefined}
            onMouseUp={modal === "function" ? () => {
              if (functionModalRef.current) {
                persistFunctionModalWidth(functionModalRef.current.getBoundingClientRect().width);
              }
            } : undefined}
          >
            <header className="modal__header">
              <h3>
                {modal === "config" && "Configuración"}
                {modal === "captures" && "Capturas"}
                {modal === "event" && "Evento"}
                {modal === "function" && "Función"}
                {modal === "save" && "Guardar configuración"}
                {modal === "load" && "Cargar configuración"}
              </h3>
              <button type="button" onClick={closeModal}>
                Cerrar
              </button>
            </header>
            <div className="modal__body">
              {modal === "config" ? (
                <div className="modal__form modal__section">
                  <h4>Plantillas</h4>
                  <label>
                    Plantilla existente
                    <select
                      value={selectedTemplateName}
                      onChange={(event) => {
                        setSelectedTemplateName(event.target.value);
                        setTemplateMessage("");
                      }}
                    >
                      <option value="">Sin seleccionar</option>
                      {templateNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Guardar como
                    <input
                      type="text"
                      value={templateName}
                      placeholder="Galga 80 SPS"
                      onChange={(event) => setTemplateName(event.target.value)}
                    />
                  </label>
                  <div className="modal__actions">
                    <button type="button" onClick={requestSaveTemplate}>Guardar como</button>
                    <button type="button" onClick={loadTemplate} disabled={!selectedTemplateName}>Cargar</button>
                    <button type="button" onClick={requestDeleteTemplate} disabled={!selectedTemplateName}>Eliminar</button>
                  </div>
                  {templateMessage ? <p className="modal__hint">{templateMessage}</p> : null}
                </div>
              ) : null}

              {modal === "config" ? (
                <div className="modal__form modal__section">
                  <h4>Básica</h4>
                  <div className="performance-profile">
                    <div>
                      <strong>ESP32 + CH340 alto rendimiento</strong>
                      <span>
                        {serialThroughputEstimate.bytesPerSample.toFixed(1)} bytes/muestra disponibles a {baudRate} baud.
                      </span>
                      <span>
                        Buffer estimado: {serialThroughputEstimate.bufferSamples.toLocaleString()} muestras.
                      </span>
                    </div>
                    <button type="button" className="button-primary" onClick={applyEsp32Ch340HighSpeedProfile}>
                      Aplicar 2 kSPS
                    </button>
                  </div>
                  {configMessage ? <p className="modal__hint">{configMessage}</p> : null}
                  <label>
                    Canales por trama (0 = auto)
                    <input
                      type="number"
                      min="0"
                      value={basicConfig.channelCount}
                      onChange={(event) =>
                        updateBasicConfig("channelCount", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    SPS (muestras/seg)
                    <input
                      type="number"
                      min="1"
                      value={basicConfig.samplesPerSecond}
                      onChange={(event) => handleSamplesChange(event.target.value)}
                    />
                  </label>
                  <label>
                    Periodo (ms)
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={basicConfig.periodMs}
                      onChange={(event) => handlePeriodChange(event.target.value)}
                    />
                  </label>
                  <label>
                    Buffer (segundos)
                    <input
                      type="number"
                      min="1"
                      value={basicConfig.bufferSeconds}
                      onChange={(event) =>
                        updateBasicConfig("bufferSeconds", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Refresh UI (ms)
                    <input
                      type="number"
                      min="16"
                      value={basicConfig.refreshMs}
                      onChange={(event) =>
                        updateBasicConfig("refreshMs", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Min. tramas válidas para iniciar
                    <input
                      type="number"
                      min="1"
                      value={basicConfig.minValidFrames}
                      onChange={(event) =>
                        updateBasicConfig("minValidFrames", Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                  </label>
                  <label>
                    Modo de ploteo
                    <select
                      value={basicConfig.plotMode}
                      onChange={(event) => updateBasicConfig("plotMode", event.target.value)}
                    >
                      <option value="normal">Normal</option>
                      <option value="minmax">Min/Max agregado</option>
                    </select>
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={basicConfig.includeTimestamp}
                      onChange={(event) =>
                        updateBasicConfig("includeTimestamp", event.target.checked)
                      }
                    />
                    Incluye timestamp en X
                  </label>
                  <label>
                    Timeout sin trama válida (s)
                    <input
                      type="number"
                      min="0"
                      value={appSettings.serialTimeoutSeconds}
                      onChange={(event) =>
                        updateAppSettings({ serialTimeoutSeconds: Math.max(0, Number(event.target.value) || 0) })
                      }
                    />
                  </label>
                  <p className="modal__hint">
                    Usa 0 para desactivar la desconexión automática por falta de tramas válidas.
                  </p>
                </div>
              ) : null}

              {modal === "config" ? (
                <div className="modal__form modal__section">
                  <h4>Filtro de tramas</h4>
                  <p className="modal__hint">
                    Filtra las líneas antes de graficarlas. Escribe un prefijo o patrón por línea.
                  </p>
                  <label>
                    Modo de filtro
                    <select
                      value={appSettings.serialFilterMode || "none"}
                      onChange={(event) => updateAppSettings({ serialFilterMode: event.target.value })}
                    >
                      <option value="none">Sin filtro</option>
                      <option value="accept">Aceptar solo coincidencias</option>
                      <option value="reject">Rechazar coincidencias</option>
                    </select>
                  </label>
                  <label className="modal__field--textarea">
                    Prefijos/patrones
                    <textarea
                      rows={4}
                      value={appSettings.serialFilterPatterns || ""}
                      placeholder={"LORA_\n+EVT"}
                      onChange={(event) => updateAppSettings({ serialFilterPatterns: event.target.value })}
                    />
                  </label>
                  <p className="modal__hint">
                    Ejemplo: usa "Aceptar solo coincidencias" con LORA_ para graficar solo tramas como LORA_ADC:1409.96,RSSI:-29,SNR:12,FREQ:916.000.
                  </p>
                </div>
              ) : null}

              {modal === "config" ? (
                <div className="modal__form modal__section">
                  <h4>Inicio y sesión</h4>
                  <p className="modal__hint">Define cómo JW-Serial debe manejar la última configuración guardada al abrir.</p>
                  <label>
                    Al iniciar JW-Serial
                    <select
                      value={appSettings.sessionRestoreMode}
                      onChange={(event) => updateAppSettings({ sessionRestoreMode: event.target.value })}
                    >
                      <option value="ask">Preguntar si cargar la última sesión</option>
                      <option value="auto">Cargar la última sesión automáticamente</option>
                      <option value="fresh">Empezar de cero sin preguntar</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {modal === "config" ? (
                <div className="modal__form modal__section">
                  <h4>Avanzada</h4>
                  <p className="modal__hint">Parámetros del puerto serial para equipos que requieren formato específico.</p>
                  <label>
                    Data bits
                    <select
                      value={advancedConfig.dataBits}
                      onChange={(event) =>
                        updateAdvancedConfig("dataBits", Number(event.target.value))
                      }
                    >
                      <option value={7}>7</option>
                      <option value={8}>8</option>
                    </select>
                  </label>
                  <label>
                    Paridad
                    <select
                      value={advancedConfig.parity}
                      onChange={(event) =>
                        updateAdvancedConfig("parity", event.target.value)
                      }
                    >
                      <option value="none">Ninguna</option>
                      <option value="even">Par</option>
                      <option value="odd">Impar</option>
                    </select>
                  </label>
                  <label>
                    Stop bits
                    <select
                      value={advancedConfig.stopBits}
                      onChange={(event) =>
                        updateAdvancedConfig("stopBits", Number(event.target.value))
                      }
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {modal === "captures" ? (
                <div className="modal__form modal__form--compact">
                  <div className="modal__field">
                    <span>Capturas automáticas</span>
                    <button
                      type="button"
                      className={`state-toggle ${captureConfig.enabled ? "state-toggle--enabled" : "state-toggle--disabled"}`}
                      onClick={() => updateCaptureConfig({ enabled: !captureConfig.enabled })}
                    >
                      {captureConfig.enabled ? "Activado" : "Desactivado"}
                    </button>
                  </div>
                  <label>
                    Intervalo de capturas (min)
                    <input
                      type="number"
                      min="1"
                      value={captureConfig.intervalMinutes}
                      onChange={(event) =>
                        updateCaptureConfig({ intervalMinutes: Math.max(1, Number(event.target.value) || 10) })
                      }
                    />
                  </label>
                  <label>
                    Identificador de tarjeta/lote
                    <input
                      type="text"
                      value={captureConfig.label}
                      placeholder="PCB_10115"
                      onChange={(event) => updateCaptureConfig({ label: event.target.value })}
                    />
                  </label>
                  <div className="modal__field">
                    <span>Usar como prefijo</span>
                    <button
                      type="button"
                      className={`state-toggle ${captureConfig.usePrefix ? "state-toggle--enabled" : "state-toggle--disabled"}`}
                      onClick={() => updateCaptureConfig({ usePrefix: !captureConfig.usePrefix })}
                    >
                      {captureConfig.usePrefix ? "Activado" : "Desactivado"}
                    </button>
                  </div>
                  <div className="modal__field">
                    <span>Guardar en subcarpeta</span>
                    <button
                      type="button"
                      className={`state-toggle ${captureConfig.useSubfolder ? "state-toggle--enabled" : "state-toggle--disabled"}`}
                      onClick={() => updateCaptureConfig({ useSubfolder: !captureConfig.useSubfolder })}
                    >
                      {captureConfig.useSubfolder ? "Activado" : "Desactivado"}
                    </button>
                  </div>
                  <div className="modal__actions modal__actions--spaced">
                    <button type="button" onClick={chooseCaptureDirectory}>
                      Elegir carpeta
                    </button>
                    <button type="button" onClick={openCaptureDirectory}>
                      Abrir carpeta
                    </button>
                    <button type="button" onClick={() => captureAllPlots()}>
                      Capturar ahora
                    </button>
                  </div>
                  <p className="modal__hint">
                    {captureConfig.directory ? "Carpeta de capturas configurada." : "Sin carpeta de capturas seleccionada."}
                  </p>
                  {captureMessage ? <p className="modal__hint">{captureMessage}</p> : null}
                </div>
              ) : null}

              {modal === "event" ? (
                <div className="modal__form">
                  <label>
                    Descripción
                    <input
                      type="text"
                      value={eventText}
                      placeholder="Cambio de carga, ajuste, observación..."
                      onChange={(event) => setEventText(event.target.value)}
                    />
                  </label>
                  <div className="modal__actions">
                    <button
                      type="button"
                      onClick={() => {
                        const text = eventText.trim() || "Evento sin descripción";
                        appendSessionEvent("event", text);
                        appendLog(`EVT > ${text}`);
                        setEventText("");
                        closeModal();
                      }}
                    >
                      Guardar evento
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const text = eventText.trim() || "Evento con captura";
                        appendSessionEvent("event", text);
                        appendLog(`EVT > ${text}`);
                        captureAllPlots();
                        setEventText("");
                        closeModal();
                      }}
                    >
                      Guardar y capturar
                    </button>
                  </div>
                  <p className="modal__hint">
                    Los eventos se registran solo si hay identificador y subcarpeta activos.
                  </p>
                </div>
              ) : null}

              {modal === "function" && functionDraft ? (
                <div className="modal__form function-builder function-builder--blocks">
                  <div className="modal__field">
                    <span>Nombre</span>
                    <input
                      type="text"
                      value={functionDraft.name}
                      placeholder="Rango uV 200s"
                      onChange={(event) => setFunctionDraft((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </div>
                  <div className="modal__field">
                    <span>Color</span>
                    <input
                      type="color"
                      value={functionDraft.color}
                      onChange={(event) => setFunctionDraft((prev) => ({ ...prev, color: event.target.value }))}
                    />
                  </div>
                  <div className="function-workbench">
                    <div className="function-palette" aria-label="Paleta de bloques">
                      <div className="function-palette__intro">
                        <span className="function-builder__section-title">Bloques</span>
                        <p className="modal__hint">Arrastra piezas a la fórmula o a cualquier ranura.</p>
                      </div>
                      <div className="function-palette__rows">
                        {functionPaletteGroups.map((group) => (
                          <div key={group.title} className="function-palette__group">
                            <span>{group.title}</span>
                            <div className="function-palette__blocks">
                              {group.items.map(renderPaletteBlock)}
                            </div>
                          </div>
                        ))}
                        <div className="function-palette__group">
                          <span>Variables</span>
                          <div className="function-palette__blocks">
                            {sourceChannels.map((channel) => renderPaletteBlock({
                              kind: "variable",
                              sourceId: channel.id,
                              label: channel.name,
                              color: channel.color,
                              tone: "variable"
                            }))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="function-canvas">
                      <div className="function-canvas__header">
                        <span>Fórmula</span>
                        <span>{functionDraft.block ? "Resultado" : "Vacío"}</span>
                      </div>
                      <div className="function-canvas__result" onDragOver={allowFunctionDrop} onDrop={(event) => dropFunctionBlockAtPath(event, [])}>
                        {functionDraft.block ? renderFunctionSlot(functionDraft.block, [], "Suelta un bloque") : (
                          <div className="function-canvas__empty">
                            <strong>Suelta un bloque aquí</strong>
                            <span>Empieza desde un operador, ventana, número o variable.</span>
                          </div>
                        )}
                      </div>
                      <div className="function-canvas__tools">
                        <button type="button" onClick={clearFunctionBlock}>Limpiar fórmula</button>
                        <div
                          className="function-trash"
                          onDragEnter={allowFunctionTrashDrop}
                          onDragOver={allowFunctionTrashDrop}
                          onDrop={dropFunctionBlockToTrash}
                        >
                          <span>Papelera</span>
                          <small>Arrastra aquí para borrar</small>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="function-builder__preview">
                    <span>Fórmula generada</span>
                    <code>{draftExpression(functionDraft)}</code>
                  </div>
                  <p className={`modal__hint ${validateFunctionDraft(functionDraft) ? "function-builder__error" : "function-builder__ok"}`}>
                    {functionMessage || validateFunctionDraft(functionDraft) || "Bloques válidos. Se generará una variable virtual arrastrable."}
                  </p>
                  <div className="modal__actions modal__actions--spaced">
                    <button type="button" className="button-primary" onClick={saveFunctionDraft}>
                      Guardar función
                    </button>
                    {virtualFunctions.some((item) => item.id === functionDraft.id) ? (
                      <button type="button" className="button-danger" onClick={() => deleteFunction(functionDraft.id)}>
                        Eliminar
                      </button>
                    ) : null}
                    <button type="button" onClick={closeModal}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
              {modal === "save" || modal === "load" ? (
                <div className="modal__form">
                  <label>
                    Configuración (JSON)
                    <textarea
                      rows={8}
                      value={configText}
                      onChange={(event) => setConfigText(event.target.value)}
                    />
                  </label>
                  <div className="modal__actions">
                    {modal === "save" ? (
                      <button type="button" onClick={handleSaveConfig}>
                        Guardar archivo JSON
                      </button>
                    ) : (
                      <button type="button" onClick={handleLoadConfig}>
                        Cargar archivo JSON
                      </button>
                    )}
                    <button type="button" onClick={applyConfigText}>
                      Aplicar JSON
                    </button>
                  </div>
                  {configMessage ? <p className="modal__hint">{configMessage}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {startupRestorePrompt ? (
        <div className="modal-backdrop modal-backdrop--top">
          <div className="modal modal--compact">
            <header className="modal__header">
              <h3>Última sesión</h3>
              <button type="button" onClick={startEmptySession}>
                Cerrar
              </button>
            </header>
            <div className="modal__body">
              <div className="modal__form">
                <p className="modal__hint">
                  Se encontró una configuración de la sesión anterior. Puedes cargarla o empezar con una sesión limpia.
                </p>
                <div className="template-confirm__actions">
                  <button
                    type="button"
                    className="template-confirm__button template-confirm__button--secondary"
                    onClick={startEmptySession}
                  >
                    Empezar de cero
                  </button>
                  <button
                    type="button"
                    className="template-confirm__button template-confirm__button--primary"
                    onClick={() => loadLastSession(startupRestorePrompt)}
                  >
                    Cargar última sesión
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {connectIdentifierPrompt !== null ? (
        <div className="modal-backdrop modal-backdrop--top">
          <div className="modal modal--compact">
            <header className="modal__header">
              <h3>Identificador</h3>
              <button type="button" onClick={() => setConnectIdentifierPrompt(null)}>
                Cerrar
              </button>
            </header>
            <div className="modal__body">
              <div className="modal__form">
                <label>
                  Identificador de tarjeta/lote
                  <input
                    type="text"
                    value={connectIdentifierPrompt}
                    placeholder={captureConfig.label || "PCB_10115"}
                    autoFocus
                    onChange={(event) => setConnectIdentifierPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        confirmConnectIdentifier();
                      }
                    }}
                  />
                </label>
                <p className="modal__hint">
                  Se usará para nombrar capturas mientras esté activo "Usar como prefijo".
                </p>
                <div className="template-confirm__actions">
                  <button
                    type="button"
                    className="template-confirm__button template-confirm__button--secondary"
                    onClick={() => setConnectIdentifierPrompt(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="template-confirm__button template-confirm__button--primary"
                    onClick={confirmConnectIdentifier}
                  >
                    Conectar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {templateConfirm ? (
        <div className="modal-backdrop modal-backdrop--top">
          <div className="modal modal--compact">
            <header className="modal__header">
              <h3>
                {templateConfirm.type === "save" ? "Confirmar guardado" : "Confirmar eliminación"}
              </h3>
              <button type="button" onClick={() => setTemplateConfirm(null)}>
                Cerrar
              </button>
            </header>
            <div className="modal__body">
              <div className="modal__form">
                <p className="modal__hint">
                  {templateConfirm.type === "save"
                    ? templateConfirm.overwrites
                      ? `La plantilla "${templateConfirm.name}" ya existe. Si continúas, se reemplazará con la configuración actual.`
                      : `Se guardará una nueva plantilla llamada "${templateConfirm.name}".`
                    : `Se eliminará la plantilla "${templateConfirm.name}". Esta acción no se puede deshacer.`}
                </p>
                <div className="template-confirm__actions">
                  <button
                    type="button"
                    className="template-confirm__button template-confirm__button--secondary"
                    onClick={() => setTemplateConfirm(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={
                      templateConfirm.type === "delete"
                        ? "template-confirm__button template-confirm__button--danger"
                        : "template-confirm__button template-confirm__button--primary"
                    }
                    onClick={confirmTemplateAction}
                  >
                    {templateConfirm.type === "save"
                      ? templateConfirm.overwrites
                        ? "Confirmar reemplazo"
                        : "Confirmar guardado"
                      : "Confirmar eliminación"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {assignmentPrompt ? (
        <div className="modal-backdrop">
          <div className="modal modal--compact">
            <header className="modal__header">
              <h3>Asignar variable</h3>
              <button type="button" onClick={() => setAssignmentPrompt(null)}>
                Cerrar
              </button>
            </header>
            <div className="modal__body">
              <div className="modal__form">
                <p className="modal__hint">
                  {assignmentPrompt.channelName} se soltó dentro del plot. Elige el eje.
                </p>
                <div className="modal__actions">
                  {["x", "y1", "y2"].map((axis) => (
                    <button
                      key={axis}
                      type="button"
                      onClick={() => assignChannelToAxis(assignmentPrompt.plotId, assignmentPrompt.channelId, axis)}
                    >
                      {axis.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {variableMenu ? (
        <div
          ref={variableMenuRef}
          className="variable-menu"
          style={{ left: variableMenu.x, top: variableMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <strong>Variable</strong>
          {(() => {
            const channel = getChannelById(variableMenu.channelId);
            if (!channel) {
              return <span>No disponible</span>;
            }
            if (channel.system) {
              return (
                <>
                  <span>{channel.name}</span>
                  <span>{channel.value.toFixed(2)}</span>
                  <button type="button" onClick={closeVariableMenu}>Cerrar</button>
                </>
              );
            }
            const updateChannelStyle = channel.virtual ? updateVirtualFunction : updateChannel;

            return (
              <>
                <label>
                  Nombre
                  <input
                    type="text"
                    value={channel.name}
                    onChange={(event) => updateChannelStyle(channel.id, { name: event.target.value || channel.id })}
                  />
                </label>
                <label>
                  Color
                  <input
                    type="color"
                    value={channel.color}
                    onChange={(event) => updateChannelStyle(channel.id, { color: event.target.value })}
                  />
                </label>
                <label>
                  Estilo
                  <select
                    value={channel.lineStyle || "solid"}
                    onChange={(event) => updateChannelStyle(channel.id, { lineStyle: event.target.value })}
                  >
                    <option value="solid">Sólida</option>
                    <option value="dashed">Discontinua</option>
                    <option value="dotted">Punteada</option>
                  </select>
                </label>
                <label>
                  Grosor
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={channel.thickness || 2}
                    onChange={(event) => updateChannelStyle(channel.id, { thickness: clamp(Number(event.target.value) || 2, 1, 8) })}
                  />
                </label>
                {channel.virtual ? (
                  <div className="modal__actions">
                    <button
                      type="button"
                      onClick={() => {
                        closeVariableMenu();
                        openFunctionBuilder(virtualFunctions.find((item) => item.id === channel.id));
                      }}
                    >
                      Editar función
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => {
                        deleteFunction(channel.id);
                        closeVariableMenu();
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                ) : null}
                <button type="button" onClick={closeVariableMenu}>Cerrar</button>
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}








