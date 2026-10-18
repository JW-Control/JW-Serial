import assert from "node:assert/strict";
import test from "node:test";

import { AcquisitionEngine } from "./acquisitionEngine.js";
import { ReceiveStats } from "./receiveStats.js";
import { SampleHistory } from "../lib/history.js";
import { LodCache } from "../lib/lod.js";
import { RollingStat } from "../lib/rollingStats.js";
import { buildLinePoints } from "../lib/seriesPoints.js";

const frames = (count, { start = 0, periodMs = 10, channels = 2, sequenceOffset = null } = {}) =>
  Array.from({ length: count }, (_, index) => {
    const values = Array.from({ length: channels }, (_unused, channel) => Math.sin((start + index) / 5) * (channel + 1));
    return {
      values: sequenceOffset === null ? values : [sequenceOffset + index, ...values],
      timestamp: 1_000_000 + (start + index) * periodMs
    };
  });

const withEngine = (callback) => {
  const engine = new AcquisitionEngine();
  try {
    callback(engine);
  } finally {
    clearTimeout(engine.flushTimer);
    engine.stopFpsTimer();
  }
};

test("history ring buffer keeps the newest samples and searches by time", () => {
  const history = new SampleHistory(5);
  for (let index = 0; index < 8; index += 1) {
    history.push({ sequence: index, timestamp: index * 10 });
  }
  assert.equal(history.length, 5);
  assert.equal(history.first().sequence, 3);
  assert.equal(history.last().sequence, 7);
  assert.equal(history.lowerBoundByTime(55), 3);
  history.setCapacity(3);
  assert.deepEqual([history.at(0).sequence, history.at(2).sequence], [5, 7]);
});

test("LOD selection keeps every extreme of the visible range", () => {
  const history = new SampleHistory(100000);
  const lod = new LodCache();
  for (let index = 0; index < 100000; index += 1) {
    const sample = { sequence: index + 1, timestamp: index, values: [index === 54321 ? 1000 : index === 777 ? -1000 : Math.sin(index)] };
    history.push(sample);
    lod.append(sample);
  }
  const view = { length: history.length, at: (index) => history.at(index), toArray: () => [] };
  const selected = lod.select(view, ["val0"], 800);
  assert.ok(selected.length < 5000, `selected ${selected.length}`);
  const values = selected.map((sample) => sample.values[0]);
  assert.ok(values.includes(1000));
  assert.ok(values.includes(-1000));
  assert.equal(selected[0].sequence, 1);
  assert.equal(selected.at(-1).sequence, 100000);
});

test("LOD selection returns raw samples when blocks would span several pixels", () => {
  // 30 s at 240 SPS on an 800 px plot: block min/max alone would alias a 5 Hz sine.
  const lod = new LodCache();
  const samples = Array.from({ length: 7200 }, (_, index) => ({ sequence: index + 1, timestamp: index, values: [Math.sin(index)] }));
  samples.forEach((sample) => lod.append(sample));
  const view = { length: samples.length, at: (index) => samples[index], toArray: () => samples };
  assert.equal(lod.select(view, ["val0"], 800), samples);
});

test("receive stats: SPS from timestamps, device jitter and sequence anomalies", () => {
  const stats = new ReceiveStats();
  const messages = [];
  for (let index = 0; index < 500; index += 1) {
    const deviceTime = index * 10 + (index % 2 ? 0.5 : -0.5);
    const sequence = index < 300 ? index : index + 5; // 5 samples lost at index 300
    const message = stats.record(1000 + index * 10, deviceTime, sequence);
    if (message) {
      messages.push(message);
    }
  }
  const snapshot = stats.snapshot(1000 + 499 * 10);
  assert.ok(Math.abs(snapshot.sps - 100) < 0.01);
  assert.ok(Math.abs(snapshot.devicePeriodMs - 10) < 0.01);
  assert.ok(Math.abs(snapshot.jitterMs - 1) < 0.01);
  assert.equal(snapshot.seqLost, 5);
  assert.equal(snapshot.seqGaps, 1);
  assert.equal(messages.length, 1);
  // A uint16 counter rolling over is not a reset.
  stats.recordSequence(65535);
  assert.equal(stats.recordSequence(0), null);
  assert.equal(stats.snapshot(0).seqResets, 0);
  assert.match(stats.recordSequence(0), /reiniciada/);
  // Data stopped for more than the window: SPS decays to 0.
  assert.equal(stats.snapshot(1000 + 499 * 10 + 6000).sps, 0);
});

test("engine ingests frames, detects names and keeps metrics while paused", () => {
  withEngine((engine) => {
    const structures = [];
    engine.onChannelStructure((structure) => structures.push(structure));
    engine.configure({ includeSequenceCounter: true, bufferSeconds: 10, samplesPerSecond: 100 });
    engine.ingestFrames(frames(100, { sequenceOffset: 0 }));
    assert.equal(engine.history.length, 100);
    assert.equal(structures.at(-1).count, 2);

    engine.ingestFrames([{ names: ["SEQ", "uV", "mA"], values: [100, 1, 2], timestamp: 1_000_000 + 100 * 10 }]);
    assert.deepEqual(structures.at(-1).names, ["uV", "mA"]);

    engine.setPaused(true);
    engine.ingestFrames(frames(50, { start: 101, sequenceOffset: 101 }));
    assert.equal(engine.history.length, 101, "paused frames are not stored");
    engine.setPaused(false);
    engine.ingestFrames(frames(1, { start: 151, sequenceOffset: 151 }));
    assert.equal(engine.stats.snapshot(engine.lastFrameAt).seqLost, 0, "pausing must not count as lost samples");
  });
});

test("engine views are time based and virtual functions survive renames", () => {
  withEngine((engine) => {
    engine.configure({ bufferSeconds: 5, samplesPerSecond: 10 }); // nominal 10 SPS, real 100 SPS
    engine.ingestFrames(frames(1000, { periodMs: 10 }));
    // The buffer grows to the measured rate once the UI flushes.
    engine.flush();
    engine.ingestFrames(frames(1000, { start: 1000, periodMs: 10 }));
    const view = engine.getView(2);
    assert.ok(Math.abs(view.length - 200) <= 1, `2 s at 100 SPS, got ${view.length}`);
    const windowed = engine.getView(1, 1);
    assert.ok(Math.abs(windowed.length - 100) <= 1);
    assert.equal(windowed.at(-1).timestamp, engine.history.last().timestamp - 1000);

    const errors = engine.setVirtualFunctions(
      [{ id: "fn", block: { type: "max", sourceId: "val0", windowUnit: "samples", windowValue: 10 } }],
      [{ id: "val0", name: "renamed" }, { id: "val1", name: "b" }]
    );
    assert.deepEqual(errors, {});
    const last = engine.history.last();
    const expected = Math.max(...Array.from({ length: 10 }, (_, index) => engine.history.at(engine.history.length - 10 + index).values[0]));
    assert.equal(last.virtualValues.fn, expected);
    assert.equal(engine.readValue(last, "fn"), expected);
  });
});

test("rolling reference curves only process new samples", () => {
  withEngine((engine) => {
    engine.configure({ bufferSeconds: 100, samplesPerSecond: 100 });
    engine.ingestFrames(frames(300));
    const stat = new RollingStat({ channelId: "val0", mode: "avg", unit: "samples", value: 50 });
    stat.sync(engine);
    const at = (sequence) => engine.history.at(sequence - 1).values[0];
    const mean = (end) => Array.from({ length: 50 }, (_, index) => at(end - index)).reduce((sum, value) => sum + value, 0) / 50;
    assert.ok(Math.abs(stat.valueAt(300) - mean(300)) < 1e-9);
    engine.ingestFrames(frames(10, { start: 300 }));
    stat.sync(engine);
    assert.ok(Math.abs(stat.valueAt(310) - mean(310)) < 1e-9);
    assert.ok(Number.isNaN(stat.valueAt(311)));
  });
});

test("line projection keeps per-pixel extremes", () => {
  const xs = Array.from({ length: 10000 }, (_, index) => index);
  const ys = xs.map((x) => (x === 5000 ? 100 : x === 7000 ? -100 : 0));
  const points = buildLinePoints({
    count: xs.length,
    xAt: (index) => xs[index],
    yAt: (index) => ys[index],
    xMin: 0,
    xMax: 9999,
    yMin: -100,
    yMax: 100,
    width: 600,
    height: 300,
    padding: { left: 50, right: 50, top: 20, bottom: 40 }
  });
  const yValues = [];
  for (let index = 1; index < points.length; index += 2) {
    yValues.push(points[index]);
  }
  assert.ok(points.length / 2 < 2100, "reduced to a few points per pixel");
  assert.ok(yValues.some((y) => Math.abs(y - 20) < 1e-6), "keeps the maximum (top of plot)");
  assert.ok(yValues.some((y) => Math.abs(y - 260) < 1e-6), "keeps the minimum (bottom of plot)");
});

test("calibration applies scale, offset and filters, and recomputes history", async () => {
  const { createCalibrationTransform } = await import("./calibration.js");
  const transform = createCalibrationTransform([{ scale: 2, offset: 1 }, { filter: "average", filterValue: 2 }]);
  assert.deepEqual(transform([1, 10], 0), [3, 10]);
  assert.deepEqual(transform([2, 20], 10), [5, 15]);
  assert.equal(createCalibrationTransform([{ scale: 1, offset: 0, filter: "none" }]), null);

  withEngine((engine) => {
    engine.configure({ bufferSeconds: 100, samplesPerSecond: 100 });
    engine.ingestFrames(frames(10));
    const rawFirst = engine.history.first().values[0];
    engine.setCalibrations([{ scale: 1000, offset: 0 }]);
    assert.ok(Math.abs(engine.history.first().values[0] - rawFirst * 1000) < 1e-9, "history recalibrated");
    engine.ingestFrames(frames(1, { start: 10 }));
    assert.ok(Math.abs(engine.history.last().values[0] - engine.history.last().rawValues[0] * 1000) < 1e-9);
    engine.setCalibrations([]);
    assert.equal(engine.history.first().values[0], rawFirst, "back to raw values");
  });
});

test("alarms trigger after the minimum duration and clear", async () => {
  const { AlarmMonitor } = await import("./alarms.js");
  const monitor = new AlarmMonitor((sample, id) => sample.values[Number(id.slice(3))]);
  monitor.setRules([{ id: "a", channelId: "val0", condition: "above", value: 5, minDurationSeconds: 0.05, enabled: true }]);
  [1, 6, 7, 8, 9, 2].forEach((value, index) => monitor.check({ timestamp: index * 20, values: [value] }));
  const events = monitor.drain();
  assert.deepEqual(events.map((event) => [event.type, event.time]), [["trigger", 80], ["clear", 100]]);
});
