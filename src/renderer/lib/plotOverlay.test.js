import assert from "node:assert/strict";
import test from "node:test";

import { AcquisitionEngine } from "../engine/acquisitionEngine.js";
import { computePlotFrame } from "./plotFrame.js";
import { anchorFromPx, anchorToX, computeHover, computeMeasurement, formatReadout, xToPx } from "./plotOverlay.js";
import { createPlot } from "../constants.js";

const buildFrame = () => {
  const engine = new AcquisitionEngine();
  engine.configure({ bufferSeconds: 100, samplesPerSecond: 100 });
  engine.ingestFrames(Array.from({ length: 1000 }, (_, index) => ({ values: [index, index % 2], timestamp: 1000 + index * 10 })));
  clearTimeout(engine.flushTimer);
  const plot = { ...createPlot(1), assignments: [{ channelId: "val0", axis: "y1" }, { channelId: "val1", axis: "y2" }] };
  const styles = new Map([["val0", { name: "rampa", color: "#f00" }], ["val1", { name: "par", color: "#0f0" }]]);
  const frame = computePlotFrame({ engine, plot, width: 1000, height: 300, styles, includeTimestamp: false, plotMode: "normal", theme: "light", memory: {} });
  return { engine, frame };
};

test("cursor anchors follow samples, not pixels", () => {
  const { frame } = buildFrame();
  const anchor = anchorFromPx(frame, xToPx(frame, 250));
  assert.deepEqual(anchor, { kind: "index", sequence: 251 });
  assert.equal(anchorToX(frame, anchor), 250);
  // If the view scrolls by 10 samples the same anchor maps 10 units left.
  assert.equal(anchorToX({ ...frame, firstRawSequence: frame.firstRawSequence + 10 }, anchor), 240);
});

test("hover reads values under the cursor", () => {
  const { engine, frame } = buildFrame();
  const hover = computeHover(engine, frame, xToPx(frame, 500));
  assert.equal(hover.x, 500);
  assert.deepEqual(hover.rows.map((row) => row.value), [500, 0]);
});

test("measurement uses raw samples between cursors", () => {
  const { engine, frame } = buildFrame();
  const result = computeMeasurement(engine, frame, { kind: "index", sequence: 101 }, { kind: "index", sequence: 200 });
  assert.equal(result.count, 100);
  assert.equal(result.dx, 99);
  assert.ok(Math.abs(result.dt - 0.99) < 1e-9);
  const [ramp, parity] = result.rows;
  assert.equal(ramp.valueA, 100);
  assert.equal(ramp.valueB, 199);
  assert.equal(ramp.delta, 99);
  assert.equal(ramp.peakToPeak, 99);
  assert.ok(Math.abs(ramp.mean - 149.5) < 1e-9);
  assert.ok(Math.abs(parity.std - 0.5) < 1e-9);
  // Cursors in reverse order give the same statistics.
  const reversed = computeMeasurement(engine, frame, { kind: "index", sequence: 200 }, { kind: "index", sequence: 101 });
  assert.equal(reversed.rows[0].delta, -99);
  assert.equal(reversed.rows[0].mean, ramp.mean);
});

test("readout formatting", () => {
  assert.equal(formatReadout(1409.96321), "1409.96");
  assert.equal(formatReadout(0.000012345), "1.2345e-5");
  assert.equal(formatReadout(Number.NaN), "—");
});

test("window view never points before the oldest sample", async () => {
  const { getPlotView } = await import("./plotFrame.js");
  const engine = new AcquisitionEngine();
  engine.configure({ bufferSeconds: 100, samplesPerSecond: 100 });
  // 2 s of data, but the plot window is 1 s wide with a stale 30 s offset.
  engine.ingestFrames(Array.from({ length: 200 }, (_, index) => ({ values: [index], timestamp: 1000 + index * 10 })));
  clearTimeout(engine.flushTimer);
  const view = getPlotView(engine, { ...createPlot(1), xMode: "window", xWindowSize: 1, xWindowOffset: 30 });
  assert.ok(view.length >= 99, `got ${view.length} samples`);
  assert.equal(view.at(0).values[0], 0);
});
