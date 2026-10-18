// Axis scaling: canonical tick steps, tick generation, range padding and
// tick label formatting.

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const minStep = 0.05;
export const minYAxisStep = 0.00001;

export const pickStep = (range, targetTicks = 6, minimumStep = minStep, multipliers = [5, 10]) => {
  if (range <= 0 || Number.isNaN(range)) {
    return minimumStep;
  }

  const target = Math.max(minimumStep, range / targetTicks);
  const exponent = Math.floor(Math.log10(target));
  const base = 10 ** exponent;
  const candidates = multipliers.map((multiplier) => multiplier * base)
    .filter((step) => step >= minimumStep);

  for (const candidate of candidates) {
    if (candidate >= target) {
      return candidate;
    }
  }

  return Math.max(minimumStep, multipliers[0] * 10 ** (exponent + 1));
};

export const pickYAxisStep = (range, targetTicks = 6) =>
  pickStep(range, targetTicks, minYAxisStep, [1, 2, 2.5, 5, 10]);

export const getStepDivisionBase = (step) => {
  if (!Number.isFinite(step) || step <= 0) {
    return 10;
  }

  const exponent = Math.floor(Math.log10(step));
  const normalized = step / 10 ** exponent;
  return Math.abs(normalized - 5) < 1e-9 ? 5 : 10;
};

export const makeTicks = (minValue, maxValue, targetTicks = 6, stepPicker = pickStep) => {
  const min = Number.isFinite(minValue) ? minValue : 0;
  const max = Number.isFinite(maxValue) ? maxValue : min + 1;
  const safeMax = max === min ? min + 1 : max;
  const step = stepPicker(safeMax - min, targetTicks);
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

export const makeMinorTicks = (ticksData, divisions = 10) => {
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

export const makeXTicks = (minValue, maxValue, targetTicks = 8) => {
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

export const makeYAxisTicks = (minValue, maxValue, pixelHeight) => {
  const span = Math.max(1, maxValue - minValue);
  const targetTicks = clamp(Math.floor(pixelHeight / 28), 5, 16);

  if (targetTicks <= 2) {
    const step = pickYAxisStep(span, 2);
    const centered = Number((Math.round(((minValue + maxValue) * 0.5) / step) * step).toFixed(6));
    return { ticks: [centered], min: minValue, max: maxValue, step };
  }

  return makeTicks(minValue, maxValue, targetTicks, pickYAxisStep);
};

export const makeYAxisTicksFollowingReference = (referenceTicksData, targetStats, targetStep, previousState) => {
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

export const findFiniteRange = (values) => {
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

export const normalizeYAxisRange = (minValue, maxValue) => {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 1 };
  }

  if (minValue === maxValue) {
    const pad = Math.max(Math.abs(minValue) * 0.05, minYAxisStep * 2);
    return { min: minValue - pad, max: maxValue + pad };
  }

  const span = maxValue - minValue;
  const pad = Math.max(span * 0.06, minYAxisStep * 2);
  return { min: minValue - pad, max: maxValue + pad };
};

export const formatTick = (value, step) => {
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
  if (step >= 0.001) {
    return rounded.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  return rounded.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
};

export const basePlotTicks = {
  x: { ticks: [0, 1, 2, 3, 4, 5], min: 0, max: 5, step: 1 },
  y1: { ticks: [0, 0.25, 0.5, 0.75, 1], min: 0, max: 1, step: 0.25 },
  y2: { ticks: [-1, -0.5, 0, 0.5, 1], min: -1, max: 1, step: 0.5 }
};
