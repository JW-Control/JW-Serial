import { clamp } from "./axisScale.js";

/**
 * Projects a series to canvas coordinates, reduced to what one pixel column
 * can show. Returns a flat Float32Array [x0, y0, x1, y1, ...].
 *
 * - "normal": consecutive points in the same pixel column collapse to their
 *   first/min/max/last points, keeping peaks and the drawing order.
 * - "minmax": one vertical min-max segment per pixel column.
 *
 * Points outside [xMin, xMax] are skipped; Y is clamped to the plot area.
 */
export const buildLinePoints = ({
  count,
  xAt,
  yAt,
  xMin,
  xMax,
  yMin,
  yMax,
  width,
  height,
  padding,
  mode = "normal"
}) => {
  if (count < 2) {
    return new Float32Array(0);
  }
  const spreadX = xMax - xMin || 1;
  const spreadY = yMax - yMin || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const bottom = height - padding.bottom;
  const toY = (value) => bottom - clamp((value - yMin) / spreadY, 0, 1) * plotHeight;

  if (mode === "minmax") {
    const bucketCount = Math.max(1, Math.ceil(plotWidth) + 1);
    const bucketMinY = new Float32Array(bucketCount).fill(Number.POSITIVE_INFINITY);
    const bucketMaxY = new Float32Array(bucketCount).fill(Number.NEGATIVE_INFINITY);
    for (let index = 0; index < count; index += 1) {
      const xValue = xAt(index);
      const value = yAt(index);
      if (!Number.isFinite(value) || !Number.isFinite(xValue) || xValue < xMin || xValue > xMax) {
        continue;
      }
      const key = clamp(Math.floor(((xValue - xMin) / spreadX) * plotWidth), 0, bucketCount - 1);
      const y = toY(value);
      if (y < bucketMinY[key]) {
        bucketMinY[key] = y;
      }
      if (y > bucketMaxY[key]) {
        bucketMaxY[key] = y;
      }
    }
    const coordinates = new Float32Array(bucketCount * 4);
    let cursor = 0;
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      if (!Number.isFinite(bucketMinY[bucket])) {
        continue;
      }
      const x = padding.left + bucket + 0.5;
      coordinates[cursor++] = x;
      coordinates[cursor++] = bucketMinY[bucket];
      coordinates[cursor++] = x;
      coordinates[cursor++] = bucketMaxY[bucket];
    }
    return cursor >= 4 ? coordinates.subarray(0, cursor) : new Float32Array(0);
  }

  // Up to four points per pixel column: first, min, max, last.
  const output = new Float32Array(count * 2 + 8);
  let cursor = 0;
  let column = Number.NaN;
  let firstX = 0;
  let firstY = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let lastX = 0;
  let lastY = 0;
  let minOrder = 0;
  let maxOrder = 0;
  let order = 0;
  let lastWrittenX = Number.NaN;
  let lastWrittenY = Number.NaN;

  const write = (x, y) => {
    if (x === lastWrittenX && y === lastWrittenY) {
      return;
    }
    output[cursor++] = x;
    output[cursor++] = y;
    lastWrittenX = x;
    lastWrittenY = y;
  };

  const flush = () => {
    if (Number.isNaN(column)) {
      return;
    }
    write(firstX, firstY);
    if (minOrder <= maxOrder) {
      write(minX, minY);
      write(maxX, maxY);
    } else {
      write(maxX, maxY);
      write(minX, minY);
    }
    write(lastX, lastY);
  };

  for (let index = 0; index < count; index += 1) {
    const xValue = xAt(index);
    const value = yAt(index);
    if (!Number.isFinite(value) || !Number.isFinite(xValue) || xValue < xMin || xValue > xMax) {
      continue;
    }
    const x = padding.left + ((xValue - xMin) / spreadX) * plotWidth;
    const y = toY(value);
    const pixelColumn = Math.floor(x);
    if (pixelColumn !== column) {
      flush();
      column = pixelColumn;
      firstX = minX = maxX = lastX = x;
      firstY = minY = maxY = lastY = y;
      order = minOrder = maxOrder = 0;
      continue;
    }
    order += 1;
    lastX = x;
    lastY = y;
    if (y < minY) {
      minX = x;
      minY = y;
      minOrder = order;
    }
    if (y > maxY) {
      maxX = x;
      maxY = y;
      maxOrder = order;
    }
  }
  flush();
  return cursor >= 4 ? output.subarray(0, cursor) : new Float32Array(0);
};
