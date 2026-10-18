// Shared between the Electron main process and the renderer: line parsing,
// frame filtering and field-name heuristics. Keep this module dependency-free.

const KEY_VALUE_PATTERN = /^([^:=,\t]+)\s*[:=]\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i;

const SEQUENCE_FIELD_NAMES = new Set(["seq", "sequence", "sample", "sampleid", "frame", "frameid", "counter", "count", "n"]);
const TIMESTAMP_FIELD_NAMES = new Set(["t", "ts", "time", "timestamp", "millis", "ms"]);

export const normalizeFieldName = (name) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

export const isSequenceFieldName = (name) => SEQUENCE_FIELD_NAMES.has(normalizeFieldName(name));

export const isTimestampFieldName = (name) => TIMESTAMP_FIELD_NAMES.has(normalizeFieldName(name));

const parseNumericChunks = (chunks) => {
  const values = new Array(chunks.length);
  for (let index = 0; index < chunks.length; index += 1) {
    const value = Number(chunks[index]);
    if (Number.isNaN(value)) {
      return null;
    }
    values[index] = value;
  }
  return values;
};

/**
 * Parses one serial line. Supports CSV/TSV numeric frames and `key:value`
 * (or `key=value`) frames separated by comma, tab or semicolon.
 * Returns `{ values, names? }` or `null` when the line is not a data frame.
 */
export const parseLine = (line) => {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes(":") || trimmed.includes("=")) {
    const chunks = trimmed
      .split(/[,\t;]/)
      .map((part) => part.trim())
      .filter(Boolean);
    const names = [];
    const values = [];
    for (const chunk of chunks) {
      const match = chunk.match(KEY_VALUE_PATTERN);
      if (!match) {
        return null;
      }
      names.push(match[1].trim());
      values.push(Number(match[2]));
    }
    return values.length ? { names, values } : null;
  }

  const delimiter = trimmed.includes("\t") ? "\t" : ",";
  const chunks = trimmed
    .split(delimiter)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (!chunks.length) {
    return null;
  }
  const values = parseNumericChunks(chunks);
  return values ? { values } : null;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const splitFilterPatterns = (patterns) =>
  String(patterns || "")
    .split(/\r?\n/)
    .map((pattern) => pattern.trim())
    .filter(Boolean);

const compilePattern = (pattern) => {
  if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
    try {
      const expression = new RegExp(pattern.slice(1, -1));
      return (line) => expression.test(line);
    } catch (_error) {
      return () => false;
    }
  }
  if (pattern.includes("*")) {
    const expression = new RegExp(pattern.split("*").map(escapeRegExp).join(".*"));
    return (line) => expression.test(line);
  }
  return (line) => line.startsWith(pattern);
};

/**
 * Builds a line predicate once so filtering costs one call per line instead
 * of re-splitting and re-compiling the pattern list for every frame.
 * Patterns: plain prefix, `*` wildcard, or `/regex/`.
 */
export const createLineFilter = (mode, patternsText) => {
  const patterns = splitFilterPatterns(patternsText);
  if (!mode || mode === "none" || !patterns.length) {
    return () => true;
  }
  const matchers = patterns.map(compilePattern);
  const matches = (line) => {
    const normalized = String(line || "").trim();
    return matchers.some((matcher) => matcher(normalized));
  };
  return mode === "accept" ? matches : (line) => !matches(line);
};

/**
 * Number of data values in a frame once sequence/timestamp metadata is
 * removed. Used to validate the expected channel count.
 */
export const countDataValues = (parsed, { includeTimestamp = false, includeSequenceCounter = false } = {}) => {
  if (!Array.isArray(parsed?.values)) {
    return 0;
  }
  if (Array.isArray(parsed.names) && parsed.names.length === parsed.values.length) {
    return parsed.names.filter((name) =>
      !isSequenceFieldName(name) && !(includeTimestamp && isTimestampFieldName(name))
    ).length;
  }
  const metadataCount = Number(Boolean(includeSequenceCounter)) + Number(Boolean(includeTimestamp));
  return Math.max(0, parsed.values.length - metadataCount);
};

/**
 * Splits a parsed frame into data values, optional names, the external
 * sequence counter and the device timestamp (used for X and for jitter).
 */
export const extractFramePayload = (frame, { includeTimestamp = false, includeSequenceCounter = false } = {}) => {
  const frameValues = Array.isArray(frame?.values) ? frame.values : [];
  const frameNames = Array.isArray(frame?.names) ? frame.names : [];
  const hasNamedValues = frameNames.length > 0 && frameNames.length === frameValues.length;
  let sequenceIndex = hasNamedValues ? frameNames.findIndex(isSequenceFieldName) : -1;
  if (sequenceIndex < 0 && includeSequenceCounter) {
    sequenceIndex = 0;
  }

  let timestampIndex = -1;
  if (includeTimestamp) {
    timestampIndex = hasNamedValues
      ? frameNames.findIndex((name, index) => index !== sequenceIndex && isTimestampFieldName(name))
      : -1;
    if (timestampIndex < 0) {
      timestampIndex = sequenceIndex === 0 ? 1 : 0;
    }
  }

  const values = [];
  const names = hasNamedValues ? [] : undefined;
  for (let index = 0; index < frameValues.length; index += 1) {
    if (index === sequenceIndex || index === timestampIndex) {
      continue;
    }
    values.push(frameValues[index]);
    names?.push(frameNames[index]);
  }

  const rawSequence = sequenceIndex >= 0 ? Number(frameValues[sequenceIndex]) : Number.NaN;
  const rawTimestamp = timestampIndex >= 0 ? Number(frameValues[timestampIndex]) : Number.NaN;
  return {
    values,
    names: names?.length ? names : undefined,
    xValue: Number.isFinite(rawTimestamp) ? rawTimestamp : null,
    externalSequence: Number.isFinite(rawSequence) ? Math.trunc(rawSequence) : null
  };
};
