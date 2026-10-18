// Virtual function compiler and streaming evaluator.
//
// A definition (block tree, or formula text for older configs) is turned into
// an AST, then into closures. Window functions read shared SlidingWindow
// instances, so evaluating a function per sample is O(1) regardless of the
// window length. No `eval`/`new Function` is involved.

import { SlidingWindow } from "./slidingWindow.js";
import {
  binaryBlockSymbols,
  isWindowBlockType,
  normalizeWindowValue,
  unaryExpressionFunctions,
  windowExpressionFunctions
} from "./definitions.js";

const WINDOW_FUNCTIONS = new Set(["inicial", "min", "max", "prom", "delta", "pend", "std", "rms", "errorPercen", "errorRela"]);
const UNARY_FUNCTIONS = new Set(["abs", "sqrt", "round"]);
const COMPARISON_FUNCTIONS = new Set(["gt", "lt", "gte", "lte"]);
const SECONDS_UNITS = new Set(["s", "seg", "segundos"]);
const SAMPLE_UNITS = new Set(["m", "muestras", "n"]);
const blockOperatorSymbols = { add: "+", subtract: "-", multiply: "*", divide: "/", power: "^" };
const blockWindowFunctions = { ...windowExpressionFunctions };

export class FormulaError extends Error {}

// ---------------------------------------------------------------------------
// Parsing (formula text -> AST)
// ---------------------------------------------------------------------------

const tokenize = (text) => {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "[") {
      const end = text.indexOf("]", index + 1);
      if (end < 0) {
        throw new FormulaError("Falta cerrar un corchete ].");
      }
      tokens.push({ type: "channel", value: text.slice(index + 1, end).trim() });
      index = end + 1;
      continue;
    }
    const numberMatch = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(text.slice(index));
    if (numberMatch) {
      tokens.push({ type: "number", value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }
    const nameMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(index));
    if (nameMatch) {
      tokens.push({ type: "name", value: nameMatch[0] });
      index += nameMatch[0].length;
      continue;
    }
    if ("+-*/^(),".includes(char)) {
      tokens.push({ type: "op", value: char });
      index += 1;
      continue;
    }
    throw new FormulaError("La fórmula contiene caracteres no permitidos.");
  }
  return tokens;
};

/**
 * Parses formula text. `resolveChannel(name)` maps a `[name]` reference to a
 * channel id (or null). Grammar: + - * / ^, unary minus, parentheses,
 * numbers with optional window unit (200s, 50m) and function calls.
 */
export const parseFormula = (text, resolveChannel) => {
  const tokens = tokenize(String(text || ""));
  let position = 0;
  const peek = () => tokens[position];
  const isOp = (value) => peek()?.type === "op" && peek().value === value;
  const expectOp = (value) => {
    if (!isOp(value)) {
      throw new FormulaError(`Se esperaba "${value}" en la fórmula.`);
    }
    position += 1;
  };

  const parsePrimary = () => {
    const token = peek();
    if (!token) {
      throw new FormulaError("La fórmula está incompleta.");
    }
    if (token.type === "number") {
      position += 1;
      const unitToken = peek();
      if (unitToken?.type === "name") {
        const unit = unitToken.value.toLowerCase();
        if (SECONDS_UNITS.has(unit) || SAMPLE_UNITS.has(unit)) {
          position += 1;
          return { type: "window", unit: SECONDS_UNITS.has(unit) ? "seconds" : "samples", value: token.value };
        }
      }
      return { type: "num", value: token.value };
    }
    if (token.type === "channel") {
      position += 1;
      const channelId = resolveChannel(token.value);
      if (!channelId) {
        throw new FormulaError(`Variable no encontrada: ${token.value}`);
      }
      return { type: "chan", channelId };
    }
    if (token.type === "name") {
      position += 1;
      const name = token.value;
      if (name !== "actual" && !WINDOW_FUNCTIONS.has(name) && !UNARY_FUNCTIONS.has(name) && !COMPARISON_FUNCTIONS.has(name)) {
        throw new FormulaError(`Función no permitida: ${name}`);
      }
      expectOp("(");
      const args = [];
      if (!isOp(")")) {
        args.push(parseExpression());
        while (isOp(",")) {
          position += 1;
          args.push(parseExpression());
        }
      }
      expectOp(")");
      return { type: "call", name, args };
    }
    if (isOp("(")) {
      position += 1;
      const inner = parseExpression();
      expectOp(")");
      return inner;
    }
    throw new FormulaError(`Símbolo inesperado: ${token.value}`);
  };

  const parseUnary = () => {
    if (isOp("-")) {
      position += 1;
      return { type: "neg", arg: parseUnary() };
    }
    if (isOp("+")) {
      position += 1;
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePower = () => {
    const base = parseUnary();
    if (isOp("^")) {
      position += 1;
      return { type: "binary", op: "^", left: base, right: parsePower() };
    }
    return base;
  };

  const parseTerm = () => {
    let node = parsePower();
    while (isOp("*") || isOp("/")) {
      const op = peek().value;
      position += 1;
      node = { type: "binary", op, left: node, right: parsePower() };
    }
    return node;
  };

  function parseExpression() {
    let node = parseTerm();
    while (isOp("+") || isOp("-")) {
      const op = peek().value;
      position += 1;
      node = { type: "binary", op, left: node, right: parseTerm() };
    }
    return node;
  }

  if (!tokens.length) {
    throw new FormulaError("Arma una función.");
  }
  const ast = parseExpression();
  if (position < tokens.length) {
    throw new FormulaError(`Símbolo inesperado: ${peek().value}`);
  }
  return ast;
};

// ---------------------------------------------------------------------------
// Blocks -> AST (by channel id, so renaming a variable never breaks a function)
// ---------------------------------------------------------------------------

const windowNode = (block) => ({
  type: "window",
  unit: block.windowUnit === "seconds" ? "seconds" : "samples",
  value: Number(block.windowValue)
});

export const blockToAst = (block) => {
  if (!block) {
    throw new FormulaError("Arma un bloque principal.");
  }
  if (block.type === "number") {
    return { type: "num", value: Number(block.value) || 0 };
  }
  if (block.type === "variable") {
    if (!block.sourceId) {
      throw new FormulaError("Selecciona una variable válida.");
    }
    return { type: "chan", channelId: block.sourceId };
  }
  if (unaryExpressionFunctions[block.type]) {
    return { type: "call", name: unaryExpressionFunctions[block.type], args: [blockToAst(block.input)] };
  }
  if (binaryBlockSymbols[block.type]) {
    const left = blockToAst(block.left);
    const right = blockToAst(block.right);
    return blockOperatorSymbols[block.type]
      ? { type: "binary", op: blockOperatorSymbols[block.type], left, right }
      : { type: "call", name: block.type, args: [left, right] };
  }
  if (isWindowBlockType(block.type)) {
    if (!block.sourceId) {
      throw new FormulaError("Selecciona una variable válida.");
    }
    const channel = { type: "chan", channelId: block.sourceId };
    if (block.type === "current") {
      return { type: "call", name: "actual", args: [channel] };
    }
    if (block.type === "rangeAbs") {
      return {
        type: "call",
        name: "abs",
        args: [{
          type: "binary",
          op: "-",
          left: { type: "call", name: "max", args: [channel, windowNode(block)] },
          right: { type: "call", name: "min", args: [channel, windowNode(block)] }
        }]
      };
    }
    return { type: "call", name: blockWindowFunctions[block.type], args: [channel, windowNode(block)] };
  }
  throw new FormulaError(`Bloque desconocido: ${block.type}`);
};

// ---------------------------------------------------------------------------
// Window registry and compilation (AST -> closures)
// ---------------------------------------------------------------------------

/**
 * Owns the sliding windows used by a set of compiled functions. Identical
 * windows (same channel, unit and length) are shared between functions.
 */
export class WindowRegistry {
  constructor() {
    this.windows = new Map();
    this.entries = [];
  }

  get(channelId, unit, value) {
    const normalizedValue = normalizeWindowValue(value, unit);
    const key = `${channelId}|${unit}|${normalizedValue}`;
    let window = this.windows.get(key);
    if (!window) {
      window = new SlidingWindow({ unit, value: normalizedValue });
      this.windows.set(key, window);
      this.entries.push({ channelId, window });
    }
    return window;
  }

  /** Feeds one sample to every window. `readValue(sample, channelId)`. */
  push(sample, readValue) {
    for (const entry of this.entries) {
      entry.window.push(sample.timestamp, readValue(sample, entry.channelId));
    }
  }

  reset() {
    this.entries.forEach((entry) => entry.window.reset());
  }
}

const toNumber = (value) => (typeof value === "number" ? value : Number(value));

const constantWindowStat = (name, value) => {
  // A window over a constant (non-channel) input behaves like a single sample.
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }
  switch (name) {
    case "delta":
    case "pend":
      return Number.NaN;
    case "std":
    case "errorPercen":
    case "errorRela":
      return 0;
    case "rms":
      return Math.abs(value);
    default:
      return value;
  }
};

const windowStat = (name, window) => {
  switch (name) {
    case "inicial":
      return window.first();
    case "min":
      return window.min();
    case "max":
      return window.max();
    case "prom":
      return window.mean();
    case "delta":
      return window.delta();
    case "pend":
      return window.slope();
    case "std":
      return window.std();
    case "rms":
      return window.rms();
    case "errorPercen":
    case "errorRela": {
      if (!window.count) {
        return Number.NaN;
      }
      const max = window.max();
      const ratio = Math.abs((max - window.min()) / (max || 1e-9));
      return name === "errorPercen" ? ratio * 100 : ratio;
    }
    default:
      return Number.NaN;
  }
};

/**
 * Compiles an AST to `evaluate(context)`, where `context.sample` is the newest
 * sample and `context.readValue(sample, channelId)` reads a channel value.
 * `fallbackWindow` is used for window functions written without a window.
 */
export const compileAst = (ast, registry, fallbackWindow = { unit: "samples", value: 1 }) => {
  const compile = (node) => {
    switch (node.type) {
      case "num": {
        const value = node.value;
        return () => value;
      }
      case "window":
        throw new FormulaError("Una ventana (ej. 200s) solo puede usarse como segundo argumento de una función.");
      case "chan": {
        const { channelId } = node;
        return (context) => {
          const value = context.readValue(context.sample, channelId);
          return Number.isFinite(value) ? value : Number.NaN;
        };
      }
      case "neg": {
        const arg = compile(node.arg);
        return (context) => -arg(context);
      }
      case "binary": {
        const left = compile(node.left);
        const right = compile(node.right);
        switch (node.op) {
          case "+":
            return (context) => left(context) + right(context);
          case "-":
            return (context) => left(context) - right(context);
          case "*":
            return (context) => left(context) * right(context);
          case "/":
            return (context) => left(context) / right(context);
          case "^":
            return (context) => left(context) ** right(context);
          default:
            throw new FormulaError(`Operador no permitido: ${node.op}`);
        }
      }
      case "call":
        return compileCall(node);
      default:
        throw new FormulaError("Fórmula inválida.");
    }
  };

  const compileCall = ({ name, args }) => {
    if (name === "actual") {
      if (args.length !== 1) {
        throw new FormulaError("actual() recibe una variable.");
      }
      return compile(args[0]);
    }
    if (UNARY_FUNCTIONS.has(name)) {
      if (args.length !== 1) {
        throw new FormulaError(`${name}() recibe un valor.`);
      }
      const arg = compile(args[0]);
      const fn = Math[name];
      return (context) => fn(toNumber(arg(context)));
    }
    if (COMPARISON_FUNCTIONS.has(name)) {
      if (args.length !== 2) {
        throw new FormulaError(`${name}() recibe dos valores.`);
      }
      const left = compile(args[0]);
      const right = compile(args[1]);
      switch (name) {
        case "gt":
          return (context) => (left(context) > right(context) ? 1 : 0);
        case "lt":
          return (context) => (left(context) < right(context) ? 1 : 0);
        case "gte":
          return (context) => (left(context) >= right(context) ? 1 : 0);
        default:
          return (context) => (left(context) <= right(context) ? 1 : 0);
      }
    }
    if (WINDOW_FUNCTIONS.has(name)) {
      if (args.length < 1 || args.length > 2) {
        throw new FormulaError(`${name}() recibe una variable y una ventana.`);
      }
      const [input, windowArg] = args;
      let spec = fallbackWindow;
      if (windowArg) {
        if (windowArg.type === "window") {
          spec = { unit: windowArg.unit, value: windowArg.value };
        } else if (windowArg.type === "num") {
          spec = { unit: "samples", value: windowArg.value };
        } else {
          throw new FormulaError(`La ventana de ${name}() debe ser un número, por ejemplo 200s o 50m.`);
        }
      }
      if (input.type === "chan") {
        const window = registry.get(input.channelId, spec.unit, spec.value);
        return () => windowStat(name, window);
      }
      const constant = compile(input);
      return (context) => constantWindowStat(name, toNumber(constant(context)));
    }
    throw new FormulaError(`Función no permitida: ${name}`);
  };

  return compile(ast);
};

/** Collects the channel ids referenced by an AST. */
export const collectChannelIds = (ast, result = new Set()) => {
  if (!ast || typeof ast !== "object") {
    return result;
  }
  if (ast.type === "chan") {
    result.add(ast.channelId);
  }
  [ast.arg, ast.left, ast.right, ...(ast.args || [])].forEach((child) => collectChannelIds(child, result));
  return result;
};
