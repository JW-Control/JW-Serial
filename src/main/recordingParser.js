// Streaming parser for recordings (and CSV exports): keeps time, sequence,
// X and channel columns, skips function columns ("fn:") and decimates files
// larger than maxRows.

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

export const MAX_REPLAY_ROWS = 1_000_000;

/** Growable Float64Array column for streaming parses. */
export const createColumn = (capacity) => ({ data: new Float64Array(Math.max(16, capacity)), length: 0 });
const pushColumn = (column, value) => {
  if (column.length === column.data.length) {
    const grown = new Float64Array(column.data.length * 2);
    grown.set(column.data);
    column.data = grown;
  }
  column.data[column.length] = value;
  column.length += 1;
};
const finishColumn = (column) => column.data.slice(0, column.length);
const parseCell = (text) => (text === undefined || text.trim() === "" ? Number.NaN : Number(text));


export const parseRecordingFile = async (filePath, maxRows = MAX_REPLAY_ROWS) => {
  const { size } = await fs.stat(filePath);
  const lines = readline.createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });

  let header = null;
  let layout = null;
  let rowIndex = 0;
  let bytesSeen = 0;
  let stride = 1;
  let columns = null;
  for await (const line of lines) {
    if (!header) {
      header = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
      const find = (...names) => header.findIndex((name) => names.includes(name.toLowerCase()));
      const reserved = new Set(["time_iso", "timestamp_ms", "timestamp", "seq", "x", "xvalue"]);
      layout = {
        timestamp: find("timestamp_ms", "timestamp"),
        sequence: find("seq"),
        x: find("x", "xvalue"),
        channels: header
          .map((name, index) => ({ name, index }))
          .filter(({ name }) => !reserved.has(name.toLowerCase()) && !name.startsWith("fn:"))
      };
      continue;
    }
    if (!line.trim()) {
      continue;
    }
    bytesSeen += line.length + 1;
    if (rowIndex === 2000) {
      // Estimate the row count from the average line length and decimate
      // so the review stays within maxRows.
      const estimatedRows = Math.ceil(size / (bytesSeen / rowIndex));
      stride = Math.max(1, Math.ceil(estimatedRows / maxRows));
    }
    if (!columns) {
      const capacity = Math.min(maxRows, Math.ceil(size / Math.max(8, line.length)));
      columns = {
        timestamps: createColumn(capacity),
        sequences: createColumn(capacity),
        xValues: createColumn(capacity),
        channels: layout.channels.map(() => createColumn(capacity))
      };
    }
    if (rowIndex % stride === 0 && columns.timestamps.length < maxRows) {
      const cells = line.split(",");
      const timestamp = layout.timestamp >= 0 ? parseCell(cells[layout.timestamp]) : rowIndex * 10;
      pushColumn(columns.timestamps, Number.isFinite(timestamp) ? timestamp : rowIndex * 10);
      pushColumn(columns.sequences, layout.sequence >= 0 ? parseCell(cells[layout.sequence]) : Number.NaN);
      pushColumn(columns.xValues, layout.x >= 0 ? parseCell(cells[layout.x]) : Number.NaN);
      layout.channels.forEach(({ index }, channel) => pushColumn(columns.channels[channel], parseCell(cells[index])));
    }
    rowIndex += 1;
  }

  if (!columns || !layout.channels.length) {
    return { ok: false, error: "El archivo no tiene datos o columnas reconocibles." };
  }
  return {
    ok: true,
    filePath,
    fileName: path.basename(filePath),
    names: layout.channels.map(({ name }) => name),
    timestamps: finishColumn(columns.timestamps),
    sequences: layout.sequence >= 0 ? finishColumn(columns.sequences) : null,
    xValues: layout.x >= 0 ? finishColumn(columns.xValues) : null,
    columns: columns.channels.map(finishColumn),
    decimation: stride,
    totalRows: rowIndex
  };
};
