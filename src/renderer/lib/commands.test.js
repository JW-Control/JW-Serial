import assert from "node:assert/strict";
import test from "node:test";

import { buildCommandMessages, parseHexBytes } from "./commands.js";

test("hex parsing accepts spaces, commas and 0x prefixes", () => {
  assert.deepEqual(parseHexBytes("AA 55,0x01 2f"), [0xaa, 0x55, 0x01, 0x2f]);
  assert.throws(() => parseHexBytes("AA GG"), /GG/);
});

test("multi-line commands with terminators", () => {
  const messages = buildCommandMessages({ payload: "GAIN 64\n\nRATE 2000", format: "text", terminator: "inherit" }, "nl");
  assert.deepEqual(messages.map((message) => message.text), ["GAIN 64\n", "RATE 2000\n"]);
  const raw = buildCommandMessages({ payload: "X", format: "text", terminator: "crlf" }, "nl");
  assert.equal(raw[0].text, "X\r\n");
  assert.deepEqual(buildCommandMessages({ payload: "01 02", format: "hex" })[0].bytes, [1, 2]);
});
