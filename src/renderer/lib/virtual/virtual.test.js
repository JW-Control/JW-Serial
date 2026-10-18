import assert from "node:assert/strict";
import test from "node:test";

import { SlidingWindow } from "./slidingWindow.js";
import { blockToAst, compileAst, FormulaError, parseFormula, WindowRegistry } from "./compiler.js";
import { blockToExpression, createFunctionBlock, definitionExpression, validateFunctionBlock } from "./definitions.js";
import { VirtualFunctionSet } from "../../engine/virtualFunctionSet.js";
import { readSampleValue } from "../../engine/acquisitionEngine.js";

const close = (actual, expected, tolerance = 1e-9) => {
  if (Number.isNaN(expected)) {
    assert.ok(Number.isNaN(actual), `expected NaN, got ${actual}`);
    return;
  }
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance * scale, `expected ${expected}, got ${actual}`);
};

// Reference implementation equivalent to the original per-sample evaluator:
// collect the finite values of the last N samples and compute directly.
const reference = (values) => {
  const finite = values.filter(Number.isFinite);
  const n = finite.length;
  const mean = n ? finite.reduce((sum, value) => sum + value, 0) / n : Number.NaN;
  return {
    first: n ? finite[0] : Number.NaN,
    min: n ? Math.min(...finite) : Number.NaN,
    max: n ? Math.max(...finite) : Number.NaN,
    mean,
    delta: n >= 2 ? finite[n - 1] - finite[0] : Number.NaN,
    std: n ? Math.sqrt(finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n) : Number.NaN,
    rms: n ? Math.sqrt(finite.reduce((sum, value) => sum + value ** 2, 0) / n) : Number.NaN
  };
};

const seededRandom = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

test("sample window matches brute force, including NaN gaps", () => {
  const random = seededRandom(7);
  for (const size of [1, 2, 5, 37, 400]) {
    const window = new SlidingWindow({ unit: "samples", value: size });
    const all = [];
    for (let index = 0; index < 3000; index += 1) {
      const value = random() < 0.05 ? Number.NaN : 1409.96 + (random() - 0.5) * 0.02;
      all.push(value);
      window.push(index, value);
      const expected = reference(all.slice(-size));
      close(window.first(), expected.first);
      close(window.min(), expected.min);
      close(window.max(), expected.max);
      close(window.mean(), expected.mean);
      close(window.delta(), expected.delta);
      close(window.std(), expected.std, 1e-6);
      close(window.rms(), expected.rms);
    }
  }
});

test("std keeps precision for tiny variations on a large offset", () => {
  const window = new SlidingWindow({ unit: "samples", value: 1000 });
  const all = [];
  for (let index = 0; index < 200000; index += 1) {
    const value = 2.5 + Math.sin(index / 10) * 1e-7;
    all.push(value);
    window.push(index, value);
  }
  close(window.std(), reference(all.slice(-1000)).std, 1e-6);
});

test("time window uses timestamps, not the configured rate", () => {
  const window = new SlidingWindow({ unit: "seconds", value: 1 });
  // 10 ms period, then a pause: only samples newer than 1 s stay.
  for (let index = 0; index < 300; index += 1) {
    window.push(index * 10, index);
  }
  assert.equal(window.count, 100);
  assert.equal(window.first(), 200);
  window.push(5000, 999);
  assert.equal(window.count, 1);
  assert.equal(window.min(), 999);
  // Slope is per real second.
  const ramp = new SlidingWindow({ unit: "seconds", value: 10 });
  for (let index = 0; index <= 100; index += 1) {
    ramp.push(index * 50, index * 0.5);
  }
  close(ramp.slope(), 10);
});

test("large windows do not overflow the stack", () => {
  const window = new SlidingWindow({ unit: "samples", value: 400000 });
  for (let index = 0; index < 450000; index += 1) {
    window.push(index, index % 1000);
  }
  assert.equal(window.min(), 0);
  assert.equal(window.max(), 999);
});

const channels = [
  { id: "val0", name: "uV" },
  { id: "val1", name: "RSSI" }
];
const resolve = (name) => channels.find((channel) => channel.name === name)?.id || null;

const evaluateFormula = (text, samples) => {
  const registry = new WindowRegistry();
  const evaluate = compileAst(parseFormula(text, resolve), registry);
  const context = { sample: null, readValue: readSampleValue };
  return samples.map((sample) => {
    registry.push(sample, readSampleValue);
    context.sample = sample;
    return evaluate(context);
  });
};

const makeSamples = (count) => {
  const random = seededRandom(3);
  return Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    timestamp: index * 10,
    values: [Math.sin(index / 7) * 100 + random(), -30 + random() * 5]
  }));
};

test("formula functions match the original semantics", () => {
  const samples = makeSamples(500);
  const windowOf = (index, size) => samples.slice(Math.max(0, index + 1 - size), index + 1).map((sample) => sample.values[0]);
  const cases = [
    ["actual([uV])", (index) => samples[index].values[0]],
    ["inicial([uV], 20m)", (index) => reference(windowOf(index, 20)).first],
    ["abs(max([uV], 20m) - min([uV], 20m))", (index) => {
      const stats = reference(windowOf(index, 20));
      return Math.abs(stats.max - stats.min);
    }],
    ["prom([uV], 50)", (index) => reference(windowOf(index, 50)).mean],
    ["delta([uV], 20m)", (index) => reference(windowOf(index, 20)).delta],
    ["pend([uV], 20m)", (index) => {
      const values = windowOf(index, 20);
      return values.length >= 2 ? (values[values.length - 1] - values[0]) / (values.length - 1) : Number.NaN;
    }],
    ["std([uV], 20m)", (index) => reference(windowOf(index, 20)).std],
    ["rms([uV], 20m)", (index) => reference(windowOf(index, 20)).rms],
    ["errorPercen([uV], 20m)", (index) => {
      const stats = reference(windowOf(index, 20));
      return Math.abs((stats.max - stats.min) / (stats.max || 1e-9)) * 100;
    }],
    ["errorRela([uV], 20m)", (index) => {
      const stats = reference(windowOf(index, 20));
      return Math.abs((stats.max - stats.min) / (stats.max || 1e-9));
    }],
    ["([uV] + 2) * [RSSI] / 4 - 2 ^ 3", (index) => ((samples[index].values[0] + 2) * samples[index].values[1]) / 4 - 8],
    ["gt([uV], 0) + lte([RSSI], -28)", (index) => (samples[index].values[0] > 0 ? 1 : 0) + (samples[index].values[1] <= -28 ? 1 : 0)],
    ["sqrt(abs(round([uV])))", (index) => Math.sqrt(Math.abs(Math.round(samples[index].values[0])))],
    ["-[uV] + -(2)", (index) => -samples[index].values[0] - 2]
  ];
  for (const [formula, expected] of cases) {
    const results = evaluateFormula(formula, samples);
    results.forEach((value, index) => close(value, expected(index), 1e-7));
  }
});

test("seconds windows in formulas follow timestamps", () => {
  const samples = makeSamples(300);
  const results = evaluateFormula("min([RSSI], 1s)", samples);
  // timestamps are 10 ms apart: a 1 s window holds the last 100 samples.
  const index = 250;
  const expected = Math.min(...samples.slice(index - 99, index + 1).map((sample) => sample.values[1]));
  close(results[index], expected);
});

test("formula errors are reported, not thrown at evaluation", () => {
  assert.throws(() => parseFormula("max([nope], 10s)", resolve), /Variable no encontrada: nope/);
  assert.throws(() => parseFormula("alert(1)", resolve), /Función no permitida: alert/);
  assert.throws(() => parseFormula("[uV]; 1", resolve), FormulaError);
  assert.throws(() => parseFormula("min([uV], 10s", resolve), FormulaError);

  const set = new VirtualFunctionSet(
    [
      { id: "ok", expression: "max([uV], 5m)" },
      { id: "bad", expression: "max([missing], 5m)" }
    ],
    channels,
    readSampleValue
  );
  assert.deepEqual([...set.errors.keys()], ["bad"]);
  const values = set.evaluate({ timestamp: 0, values: [3, 1] });
  assert.equal(values.ok, 3);
});

test("blocks compile by channel id, so renaming a channel keeps working", () => {
  const block = createFunctionBlock("rangeAbs", "val0");
  block.windowUnit = "samples";
  block.windowValue = 3;
  const definition = { id: "fn", block };
  const renamed = [{ id: "val0", name: "Renombrado" }, channels[1]];
  const set = new VirtualFunctionSet([definition], renamed, readSampleValue);
  assert.equal(set.errors.size, 0);
  let values;
  [5, 1, 9, 4].forEach((value, index) => {
    values = set.evaluate({ timestamp: index, values: [value, 0] });
  });
  assert.equal(values.fn, 8); // window [1, 9, 4]
  assert.equal(
    blockToExpression(block, (id) => renamed.find((channel) => channel.id === id).name),
    "abs(max([Renombrado], 3m) - min([Renombrado], 3m))"
  );
  assert.ok(blockToAst(block));
});

test("block validation and legacy definitions", () => {
  const isKnown = (id) => channels.some((channel) => channel.id === id);
  assert.equal(validateFunctionBlock(null, isKnown), "Arma un bloque principal.");
  assert.equal(validateFunctionBlock({ type: "add", left: { type: "number", value: 1 }, right: null }, isKnown), "Arma un bloque principal.");
  assert.equal(validateFunctionBlock(createFunctionBlock("max", "val0"), isKnown), "");
  const legacy = { sourceId: "val0", operation: "avg", windowUnit: "seconds", windowValue: 200 };
  assert.equal(definitionExpression(legacy, (id) => channels.find((channel) => channel.id === id).name), "prom([uV], 200s)");
});
