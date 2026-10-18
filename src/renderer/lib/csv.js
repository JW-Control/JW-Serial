export const csvCell = (value) => {
  if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) {
    return "";
  }
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Builds a CSV of the sample history. `columns` is a list of
 * `{ header, read(sample) }`.
 */
export const buildHistoryCsv = (history, columns) => {
  const lines = new Array(history.length + 1);
  lines[0] = columns.map((column) => csvCell(column.header)).join(",");
  history.forEach((sample, index) => {
    lines[index + 1] = columns.map((column) => csvCell(column.read(sample))).join(",");
  });
  return lines.join("\n");
};
