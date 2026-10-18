// Quick commands sent to the device: text or hex bytes, one command per
// line, optionally with a delay between lines.

export const terminatorSuffix = {
  none: "",
  nl: "\n",
  cr: "\r",
  nlcr: "\n\r",
  crlf: "\r\n"
};

export const createCommand = () => ({
  id: `cmd-${Date.now()}`,
  label: "Nuevo comando",
  payload: "",
  format: "text",
  terminator: "inherit",
  delayMs: 100
});

/** Parses "AA 55 0x01,2f" into bytes; throws on invalid tokens. */
export const parseHexBytes = (text) => {
  const tokens = String(text).split(/[\s,;]+/).map((token) => token.trim()).filter(Boolean);
  return tokens.map((token) => {
    const clean = token.replace(/^0x/i, "");
    if (!/^[0-9a-f]{1,2}$/i.test(clean)) {
      throw new Error(`Byte hex inválido: ${token}`);
    }
    return parseInt(clean, 16);
  });
};

/** Messages to send for a command (one per non-empty payload line). */
export const buildCommandMessages = (command, defaultTerminator = "none") => {
  const lines = String(command.payload || "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (command.format === "hex") {
    return lines.map((line) => ({ bytes: parseHexBytes(line), label: line.trim() }));
  }
  const terminator = command.terminator === "inherit" || !command.terminator ? defaultTerminator : command.terminator;
  return lines.map((line) => ({ text: `${line}${terminatorSuffix[terminator] ?? ""}`, label: line }));
};
