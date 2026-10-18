// Catalogue of virtual-function blocks and helpers to turn a block tree into
// its textual formula. The formula text is what users see and what config
// files store; evaluation compiles the block tree directly (see compiler.js).

export const WINDOW_BLOCK_TYPES = [
  "current", "initial", "min", "max", "avg", "rangeAbs", "delta", "slope", "std", "rms", "errorPercen", "errorRela"
];

export const functionBlockOperations = [
  { id: "current", label: "Actual", kind: "window", needsWindow: false },
  { id: "initial", label: "Inicial", kind: "window", needsWindow: true },
  { id: "min", label: "Min", kind: "window", needsWindow: true },
  { id: "max", label: "Max", kind: "window", needsWindow: true },
  { id: "avg", label: "Prom", kind: "window", needsWindow: true },
  { id: "rangeAbs", label: "|Max-Min|", kind: "window", needsWindow: true },
  { id: "delta", label: "Delta", kind: "window", needsWindow: true },
  { id: "slope", label: "Pend", kind: "window", needsWindow: true },
  { id: "std", label: "Std", kind: "window", needsWindow: true },
  { id: "rms", label: "RMS", kind: "window", needsWindow: true },
  { id: "abs", label: "Abs", kind: "unary" },
  { id: "sqrt", label: "Sqrt", kind: "unary" },
  { id: "round", label: "Round", kind: "unary" },
  { id: "add", label: "+", kind: "binary", symbol: "+" },
  { id: "subtract", label: "-", kind: "binary", symbol: "-" },
  { id: "multiply", label: "*", kind: "binary", symbol: "*" },
  { id: "divide", label: "/", kind: "binary", symbol: "/" },
  { id: "power", label: "^", kind: "binary", symbol: "^" },
  { id: "gt", label: ">", kind: "binary", symbol: ">" },
  { id: "lt", label: "<", kind: "binary", symbol: "<" },
  { id: "gte", label: ">=", kind: "binary", symbol: ">=" },
  { id: "lte", label: "<=", kind: "binary", symbol: "<=" },
  { id: "errorPercen", label: "Error%", kind: "window", needsWindow: true },
  { id: "errorRela", label: "Error_Rela", kind: "window", needsWindow: true }
];

export const binaryBlockSymbols = {
  add: "+",
  subtract: "-",
  multiply: "*",
  divide: "/",
  power: "^",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<="
};

// Comparison blocks are written as function calls in the formula text.
export const binaryExpressionFunctions = {
  gt: "gt",
  lt: "lt",
  gte: "gte",
  lte: "lte"
};

export const unaryExpressionFunctions = {
  abs: "abs",
  sqrt: "sqrt",
  round: "round"
};

export const windowExpressionFunctions = {
  current: "actual",
  initial: "inicial",
  min: "min",
  max: "max",
  avg: "prom",
  delta: "delta",
  slope: "pend",
  std: "std",
  rms: "rms",
  errorPercen: "errorPercen",
  errorRela: "errorRela"
};

// Pre-block definitions stored `sourceId` + `operation` instead of a block.
const legacyOperations = {
  current: (name) => `actual([${name}])`,
  initial: (name, windowText) => `inicial([${name}], ${windowText})`,
  min: (name, windowText) => `min([${name}], ${windowText})`,
  max: (name, windowText) => `max([${name}], ${windowText})`,
  avg: (name, windowText) => `prom([${name}], ${windowText})`,
  rangeAbs: (name, windowText) => `abs(max([${name}], ${windowText}) - min([${name}], ${windowText}))`,
  delta: (name, windowText) => `delta([${name}], ${windowText})`,
  slope: (name, windowText) => `pend([${name}], ${windowText})`,
  std: (name, windowText) => `std([${name}], ${windowText})`,
  rms: (name, windowText) => `rms([${name}], ${windowText})`,
  errorPercen: (name, windowText) => `errorPercen([${name}], ${windowText})`,
  errorRela: (name, windowText) => `errorRela([${name}], ${windowText})`
};

export const functionPaletteGroups = [
  {
    title: "Operadores",
    items: [
      { type: "add", label: "+", tone: "operator" },
      { type: "subtract", label: "-", tone: "operator" },
      { type: "multiply", label: "*", tone: "operator" },
      { type: "divide", label: "/", tone: "operator" },
      { type: "power", label: "^", tone: "operator" },
      { type: "abs", label: "Abs", tone: "operator" },
      { type: "sqrt", label: "Sqrt", tone: "operator" },
      { type: "round", label: "Round", tone: "operator" },
      { type: "gt", label: ">", tone: "operator" },
      { type: "lt", label: "<", tone: "operator" },
      { type: "gte", label: ">=", tone: "operator" },
      { type: "lte", label: "<=", tone: "operator" }
    ]
  },
  {
    title: "Ventanas",
    items: [
      { type: "current", label: "Actual", tone: "window" },
      { type: "initial", label: "Inicial", tone: "window" },
      { type: "min", label: "Min", tone: "window" },
      { type: "max", label: "Max", tone: "window" },
      { type: "avg", label: "Prom", tone: "window" },
      { type: "rangeAbs", label: "|Max-Min|", tone: "window" },
      { type: "delta", label: "Delta", tone: "window" },
      { type: "slope", label: "Pend", tone: "window" },
      { type: "std", label: "Std", tone: "window" },
      { type: "rms", label: "RMS", tone: "window" },
      { type: "errorPercen", label: "Error%", tone: "window" },
      { type: "errorRela", label: "Error_Rela", tone: "window" }
    ]
  },
  {
    title: "Constantes",
    items: [{ type: "number", label: "Número", tone: "number" }]
  }
];

export const isWindowBlockType = (type) => WINDOW_BLOCK_TYPES.includes(type);

export const createFunctionBlock = (type = "rangeAbs", sourceId = null) => {
  if (isWindowBlockType(type)) {
    return { type, sourceId, windowUnit: "seconds", windowValue: 200 };
  }
  if (unaryExpressionFunctions[type]) {
    return { type, input: null };
  }
  if (binaryBlockSymbols[type]) {
    return { type, left: null, right: null };
  }
  if (type === "number") {
    return { type: "number", value: 0 };
  }
  if (type === "variable") {
    return { type: "variable", sourceId };
  }
  return { type: "current", sourceId };
};

/** Replaces `oldNode` with a new block, keeping the old node as its input. */
export const wrapFunctionBlock = (newBlock, oldNode) => {
  if (!oldNode || !newBlock) {
    return newBlock;
  }
  if (binaryBlockSymbols[newBlock.type]) {
    newBlock.left = oldNode;
  } else if (unaryExpressionFunctions[newBlock.type]) {
    newBlock.input = oldNode;
  } else if (isWindowBlockType(newBlock.type) && (oldNode.type === "variable" || oldNode.sourceId)) {
    newBlock.sourceId = oldNode.sourceId;
  }
  return newBlock;
};

export const normalizeWindowValue = (value, unit) => {
  const numeric = Number(value);
  if (unit === "seconds") {
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  }
  return Math.max(1, Math.round(Number.isFinite(numeric) ? numeric : 1));
};

export const formatWindowLabel = (value, unit) => {
  const resolvedUnit = unit === "seconds" ? "seconds" : "samples";
  return `${normalizeWindowValue(value, resolvedUnit)}${resolvedUnit === "seconds" ? "s" : "m"}`;
};

/** Formula text for a block tree; `channelName(id)` resolves variable names. */
export const blockToExpression = (block, channelName) => {
  if (!block) {
    return "";
  }
  if (block.type === "number") {
    return String(Number(block.value) || 0);
  }
  if (block.type === "variable") {
    return block.sourceId ? `actual([${channelName(block.sourceId)}])` : "";
  }
  if (unaryExpressionFunctions[block.type]) {
    return `${unaryExpressionFunctions[block.type]}(${blockToExpression(block.input, channelName)})`;
  }
  if (binaryExpressionFunctions[block.type]) {
    return `${binaryExpressionFunctions[block.type]}(${blockToExpression(block.left, channelName)}, ${blockToExpression(block.right, channelName)})`;
  }
  if (binaryBlockSymbols[block.type]) {
    return `(${blockToExpression(block.left, channelName)} ${binaryBlockSymbols[block.type]} ${blockToExpression(block.right, channelName)})`;
  }

  const variableText = block.sourceId ? `[${channelName(block.sourceId)}]` : "";
  const windowText = formatWindowLabel(block.windowValue, block.windowUnit);
  if (block.type === "rangeAbs") {
    return `abs(max(${variableText}, ${windowText}) - min(${variableText}, ${windowText}))`;
  }
  if (windowExpressionFunctions[block.type]) {
    const fnName = windowExpressionFunctions[block.type];
    return block.type === "current" ? `${fnName}(${variableText})` : `${fnName}(${variableText}, ${windowText})`;
  }
  return `actual(${variableText})`;
};

/** Returns an error message, or "" when the block tree is complete. */
export const validateFunctionBlock = (block, isKnownChannel) => {
  if (!block) {
    return "Arma un bloque principal.";
  }
  if (block.type === "number") {
    return Number.isFinite(Number(block.value)) ? "" : "Un bloque numérico tiene un valor inválido.";
  }
  if (block.type === "variable") {
    return isKnownChannel(block.sourceId) ? "" : "Selecciona una variable válida.";
  }
  if (unaryExpressionFunctions[block.type]) {
    return validateFunctionBlock(block.input, isKnownChannel);
  }
  if (binaryBlockSymbols[block.type]) {
    return validateFunctionBlock(block.left, isKnownChannel) || validateFunctionBlock(block.right, isKnownChannel);
  }
  if (!isKnownChannel(block.sourceId)) {
    return "Selecciona una variable válida.";
  }
  const operation = functionBlockOperations.find((item) => item.id === block.type);
  if (operation?.needsWindow && (!Number.isFinite(Number(block.windowValue)) || Number(block.windowValue) <= 0)) {
    return "La ventana debe ser mayor a 0.";
  }
  return "";
};

/** Formula text for any definition (block, stored expression or legacy). */
export const definitionExpression = (definition, channelName) => {
  if (!definition) {
    return "";
  }
  if (definition.block) {
    return blockToExpression(definition.block, channelName);
  }
  if (definition.expression?.trim()) {
    return definition.expression.trim();
  }
  const formula = legacyOperations[definition.operation] || legacyOperations.current;
  return formula(channelName(definition.sourceId) || "variable", formatWindowLabel(definition.windowValue, definition.windowUnit));
};
