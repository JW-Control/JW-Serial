import assert from "node:assert/strict";
import test from "node:test";

import { countDataValues, createLineFilter, extractFramePayload, parseLine } from "./serialProtocol.js";

test("parses CSV, TSV and key:value frames", () => {
  assert.deepEqual(parseLine("12.3,45.6,-7e-3\r"), { values: [12.3, 45.6, -0.007] });
  assert.deepEqual(parseLine("1\t2\t3"), { values: [1, 2, 3] });
  assert.deepEqual(parseLine("LORA_ADC:1409.96,RSSI:-29,SNR:12,FREQ:916.000"), {
    names: ["LORA_ADC", "RSSI", "SNR", "FREQ"],
    values: [1409.96, -29, 12, 916]
  });
  assert.deepEqual(parseLine("a=1; b=2"), { names: ["a", "b"], values: [1, 2] });
  assert.equal(parseLine(""), null);
  assert.equal(parseLine("hola mundo"), null);
  assert.equal(parseLine("+EVT:RXP2P:-30:5:AABB"), null);
  assert.equal(parseLine("1,abc,3"), null);
});

test("line filter supports prefix, wildcard and regex patterns", () => {
  const accept = createLineFilter("accept", "LORA_\n*TEMP*\n/^X\\d+/");
  assert.equal(accept("LORA_ADC:1"), true);
  assert.equal(accept("  LORA_ADC:1"), true);
  assert.equal(accept("abcTEMPdef"), true);
  assert.equal(accept("X12,3"), true);
  assert.equal(accept("+EVT:RX"), false);
  const reject = createLineFilter("reject", "+EVT");
  assert.equal(reject("+EVT:RX"), false);
  assert.equal(reject("1,2,3"), true);
  assert.equal(createLineFilter("none", "LORA_")("anything"), true);
  assert.equal(createLineFilter("accept", "/[invalid/")("x"), false);
});

test("data value count ignores metadata fields", () => {
  assert.equal(countDataValues({ values: [1, 2, 3] }, { includeSequenceCounter: true }), 2);
  assert.equal(countDataValues({ values: [1, 2, 3], names: ["SEQ", "a", "t"] }, { includeTimestamp: true }), 1);
});

test("payload extraction separates sequence and timestamp", () => {
  assert.deepEqual(
    extractFramePayload({ values: [41, 1250, 3.3, 7.5] }, { includeSequenceCounter: true, includeTimestamp: true }),
    { values: [3.3, 7.5], names: undefined, xValue: 1250, externalSequence: 41 }
  );
  assert.deepEqual(
    extractFramePayload({ names: ["seq", "uV", "ms"], values: [7, 1.5, 300] }, { includeTimestamp: true }),
    { values: [1.5], names: ["uV"], xValue: 300, externalSequence: 7 }
  );
  assert.deepEqual(extractFramePayload({ values: [1, 2] }), { values: [1, 2], names: undefined, xValue: null, externalSequence: null });
});
