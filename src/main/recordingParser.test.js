import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseRecordingFile } from "./recordingParser.js";

const writeTemp = async (name, text) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "jw-serial-test-"));
  const filePath = path.join(directory, name);
  await fs.writeFile(filePath, text, "utf8");
  return filePath;
};

test("parses a recording, skipping function columns", async () => {
  const lines = ["time_iso,timestamp_ms,seq,x,uV,mA,fn:Rango"];
  for (let index = 0; index < 50; index += 1) {
    lines.push(`2026-01-01T00:00:00.000Z,${1000 + index * 10},${index},,${index * 0.5},${index % 3 === 0 ? "" : 2},9`);
  }
  const result = await parseRecordingFile(await writeTemp("Datos.csv", `${lines.join("\n")}\n`));
  assert.equal(result.ok, true);
  assert.deepEqual(result.names, ["uV", "mA"]);
  assert.equal(result.timestamps.length, 50);
  assert.equal(result.timestamps[1], 1010);
  assert.equal(result.sequences[49], 49);
  assert.equal(result.columns[0][4], 2);
  assert.ok(Number.isNaN(result.columns[1][0]), "empty cells become NaN");
  assert.equal(result.decimation, 1);
});

test("parses a legacy export without seq/x and decimates big files", async () => {
  const lines = ["timestamp,xValue,a"];
  for (let index = 0; index < 5000; index += 1) {
    lines.push(`${index},${index},${Math.sin(index)}`);
  }
  const result = await parseRecordingFile(await writeTemp("old.csv", lines.join("\n")), 1000);
  assert.deepEqual(result.names, ["a"]);
  assert.equal(result.sequences, null);
  assert.equal(result.totalRows, 5000);
  assert.ok(result.decimation >= 5, `stride ${result.decimation}`);
  assert.ok(result.timestamps.length <= 1000);
});

test("rejects files without data columns", async () => {
  const result = await parseRecordingFile(await writeTemp("empty.csv", "time_iso,timestamp_ms\n"));
  assert.equal(result.ok, false);
});
