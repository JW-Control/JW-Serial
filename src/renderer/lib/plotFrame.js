// Computes everything a plot needs to draw one frame, straight from the
// acquisition engine: visible samples (LOD-reduced), X values, auto ranges,
// ticks (with Y2 following Y1's grid) and projected series/reference curves.
// Runs inside the canvas animation loop, never during React renders.

import {
  basePlotTicks,
  clamp,
  findFiniteRange,
  makeXTicks,
  makeYAxisTicks,
  makeYAxisTicksFollowingReference,
  minStep,
  normalizeYAxisRange,
  pickYAxisStep
} from "./axisScale.js";
import { RollingStat } from "./rollingStats.js";
import { buildLinePoints } from "./seriesPoints.js";

export const PLOT_PADDING = { top: 20, right: 74, bottom: 40, left: 74 };

export const CURSOR_COLORS = { a: "#f59e0b", b: "#10b981" };

export const plotThemes = {
  dark: {
    background: "#0f172a",
    axis: "#64748b",
    gridMinor: "#1e293b",
    gridMinorY: "#182235",
    gridMajor: "#475569",
    gridYMajor: "#334155",
    tick: "#cbd5e1",
    placeholder: "#94a3b8",
    tooltipBg: "rgba(15, 23, 42, 0.94)",
    tooltipBorder: "#475569",
    tooltipText: "#e2e8f0",
    crosshair: "#94a3b8",
    checkFill: "#111827",
    checkStroke: "#94a3b8",
    check: "#60a5fa"
  },
  light: {
    background: "#ffffff",
    axis: "#94a3b8",
    gridMinor: "#e9eef8",
    gridMinorY: "#f3f6fd",
    gridMajor: "#b6c6db",
    gridYMajor: "#bfdbfe",
    tick: "#64748b",
    placeholder: "#94a3b8",
    tooltipBg: "rgba(255, 255, 255, 0.96)",
    tooltipBorder: "#cbd5e1",
    tooltipText: "#0f172a",
    crosshair: "#64748b",
    checkFill: "#ffffff",
    checkStroke: "#64748b",
    check: "#2563eb"
  }
};

const STAT_MODES = [
  { mode: "avg", field: "statAvgTargets", opacity: 0.85 },
  { mode: "min", field: "statMinTargets", opacity: 0.65 },
  { mode: "max", field: "statMaxTargets", opacity: 0.65 }
];

/** X is always navigable; Y axes only when in manual mode. */
export const isAxisEditable = (plot, axis) => (axis === "x" ? true : plot[`${axis}Mode`] === "manual");

/** Samples covered by a plot's X mode (time-based, using sample timestamps). */
export const getPlotView = (engine, plot) => {
  if (plot.xMode === "window") {
    return engine.getView(Math.max(0.001, Number(plot.xWindowSize) || 10), Number(plot.xWindowOffset) || 0);
  }
  return engine.getView();
};

const rangeOf = (stats) => (Number.isFinite(stats.min) ? normalizeYAxisRange(stats.min, stats.max) : null);

/**
 * @param options.engine         AcquisitionEngine
 * @param options.plot           plot configuration
 * @param options.width/height   canvas size in CSS pixels
 * @param options.styles         Map channelId -> { color, thickness, lineStyle }
 * @param options.includeTimestamp use the device timestamp as default X
 * @param options.plotMode       "normal" | "minmax"
 * @param options.theme          "light" | "dark"
 * @param options.memory         per-plot mutable object (Y2 follow state, stat caches)
 */
export const computePlotFrame = ({ engine, plot, width, height, styles, includeTimestamp, plotMode, theme, memory }) => {
  const padding = PLOT_PADDING;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xTargetTicks = clamp(Math.floor(plotWidth / 60), 6, 40);
  const colors = plotThemes[theme] || plotThemes.light;

  const view = getPlotView(engine, plot);
  const channelIds = [...new Set(plot.assignments.map((assignment) => assignment.channelId))];
  const samples = engine.lod.select(view, channelIds, plotWidth);
  const firstRawSequence = view.at(0)?.sequence ?? 0;

  const xAssignment = plot.assignments.find((item) => item.axis === "x");
  const xOf = xAssignment
    ? (sample) => engine.readValue(sample, xAssignment.channelId)
    : includeTimestamp
      ? (sample, index) => (sample.xValue ?? index)
      : (sample) => sample.sequence - firstRawSequence;
  const xValues = new Float64Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const value = xOf(samples[index], index);
    xValues[index] = Number.isFinite(value) ? value : Number.NaN;
  }

  const hidden = new Set(plot.hiddenChannels || []);
  const yAssignments = plot.assignments.filter((item) => item.axis !== "x" && !hidden.has(item.channelId));
  const hasAssignments = plot.assignments.some((item) => item.axis !== "x");
  const hasData = samples.length >= 2 && yAssignments.length > 0;
  const hasY1 = yAssignments.some((item) => item.axis === "y1");
  const hasY2 = yAssignments.some((item) => item.axis === "y2");

  // With a manual X range, autoscale Y on the visible part only.
  let manualXMin = Number.NaN;
  let manualXMax = Number.NaN;
  if (plot.xMode === "manual") {
    manualXMin = Math.min(Number(plot.xManualMin), Number(plot.xManualMax));
    manualXMax = Math.max(Number(plot.xManualMin), Number(plot.xManualMax));
  }
  const filterByX = Number.isFinite(manualXMin) && Number.isFinite(manualXMax);
  const axisStats = {
    y1: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
    y2: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
  };
  const accumulate = (useFilter) => {
    let found = false;
    for (const assignment of yAssignments) {
      const stats = axisStats[assignment.axis];
      for (let index = 0; index < samples.length; index += 1) {
        if (useFilter && !(xValues[index] >= manualXMin && xValues[index] <= manualXMax)) {
          continue;
        }
        const value = engine.readValue(samples[index], assignment.channelId);
        if (!Number.isFinite(value)) {
          continue;
        }
        found = true;
        if (value < stats.min) {
          stats.min = value;
        }
        if (value > stats.max) {
          stats.max = value;
        }
      }
    }
    return found;
  };
  if (!accumulate(filterByX) && filterByX) {
    accumulate(false);
  }

  const y1Own = rangeOf(axisStats.y1);
  const y2Own = rangeOf(axisStats.y2);
  const y1AutoRange = y1Own || y2Own || { min: basePlotTicks.y1.min, max: basePlotTicks.y1.max };
  const y2AutoRange = y2Own || y1Own || { min: basePlotTicks.y2.min, max: basePlotTicks.y2.max };
  const y1Range = plot.y1Mode === "manual"
    ? { min: Number(plot.y1ManualMin ?? y1AutoRange.min), max: Number(plot.y1ManualMax ?? y1AutoRange.max) }
    : y1AutoRange;
  const y2Range = plot.y2Mode === "manual"
    ? { min: Number(plot.y2ManualMin ?? y2AutoRange.min), max: Number(plot.y2ManualMax ?? y2AutoRange.max) }
    : y2AutoRange;

  const y1Ticks = hasData ? makeYAxisTicks(y1Range.min, y1Range.max, plotHeight) : basePlotTicks.y1;
  let y2Ticks = basePlotTicks.y2;
  if (hasData && hasY2) {
    const ownTicks = makeYAxisTicks(y2Range.min, y2Range.max, plotHeight);
    if (!hasY1 || plot.y1Mode !== "auto" || plot.y2Mode !== "auto") {
      memory.y2Follow = null;
      y2Ticks = ownTicks;
    } else {
      // Y2 reuses Y1's grid lines with its own canonical step.
      const referenceIntervals = Math.max(1, y1Ticks.ticks.length - 1);
      const followStep = pickYAxisStep(y2Range.max - y2Range.min, referenceIntervals);
      const followed = makeYAxisTicksFollowingReference(y1Ticks, axisStats.y2, followStep || ownTicks.step || minStep, memory.y2Follow);
      memory.y2Follow = followed.state;
      y2Ticks = { ticks: followed.ticks, min: followed.min, max: followed.max, step: followed.step };
    }
  } else if (hasData && hasY1) {
    y2Ticks = y1Ticks;
  }

  const xAutoRange = findFiniteRange(xValues);
  let xTicks = basePlotTicks.x;
  if (hasData && plot.xMode === "manual") {
    xTicks = makeXTicks(Number(plot.xManualMin ?? xAutoRange?.min), Number(plot.xManualMax ?? xAutoRange?.max), xTargetTicks);
  } else if (hasData && xAutoRange) {
    xTicks = makeXTicks(xAutoRange.min, xAutoRange.max, xTargetTicks);
  }

  const series = [];
  const statSeries = [];
  if (hasData) {
    const xAt = (index) => xValues[index];
    for (const assignment of yAssignments) {
      const ticks = assignment.axis === "y2" ? y2Ticks : y1Ticks;
      if (!Number.isFinite(ticks.min) || !Number.isFinite(ticks.max)) {
        continue;
      }
      const style = styles.get(assignment.channelId) || {};
      const common = {
        count: samples.length,
        xAt,
        xMin: xTicks.min,
        xMax: xTicks.max,
        yMin: ticks.min,
        yMax: ticks.max,
        width,
        height,
        padding
      };
      const points = buildLinePoints({
        ...common,
        yAt: (index) => engine.readValue(samples[index], assignment.channelId),
        mode: plotMode
      });
      if (points.length >= 4) {
        series.push({
          channelId: assignment.channelId,
          points,
          color: style.color || "#2563eb",
          thickness: Math.max(1, Number(style.thickness) || 2),
          style: style.lineStyle || "solid"
        });
      }

      const assignmentKey = `${assignment.channelId}:${assignment.axis}`;
      for (const { mode, field, opacity } of STAT_MODES) {
        if (!(Array.isArray(plot[field]) && plot[field].includes(assignmentKey))) {
          continue;
        }
        const stat = getRollingStat(memory, assignment.channelId, mode, plot);
        stat.sync(engine);
        const statPoints = buildLinePoints({
          ...common,
          yAt: (index) => stat.valueAt(samples[index].sequence)
        });
        if (statPoints.length >= 4) {
          statSeries.push({ points: statPoints, color: style.color || "#2563eb", opacity });
        }
      }
    }
  }
  pruneRollingStats(memory);

  return {
    series,
    statSeries,
    xTicks,
    y1Ticks,
    y2Ticks,
    theme: colors,
    hasData,
    hasAssignments,
    autoRanges: { x: xAutoRange, y1: y1Own, y2: y2Own },
    // Data needed by cursors, tooltips and measurements (see plotOverlay.js).
    view,
    samples,
    xValues,
    xOf,
    xKind: xAssignment || includeTimestamp ? "value" : "index",
    firstRawSequence,
    yAssignments: yAssignments.map((assignment) => ({
      ...assignment,
      name: styles.get(assignment.channelId)?.name || assignment.channelId,
      color: styles.get(assignment.channelId)?.color || "#2563eb"
    })),
    plotArea: { left: padding.left, top: padding.top, width: plotWidth, height: plotHeight }
  };
};

const getRollingStat = (memory, channelId, mode, plot) => {
  memory.stats ??= new Map();
  const key = `${channelId}|${mode}|${plot.statsWindowUnit}|${plot.statsWindowValue}`;
  let stat = memory.stats.get(key);
  if (!stat) {
    stat = new RollingStat({ channelId, mode, unit: plot.statsWindowUnit, value: plot.statsWindowValue });
    memory.stats.set(key, stat);
  }
  stat.usedInFrame = true;
  return stat;
};

const pruneRollingStats = (memory) => {
  memory.stats?.forEach((stat, key) => {
    if (!stat.usedInFrame) {
      memory.stats.delete(key);
    }
    stat.usedInFrame = false;
  });
};
