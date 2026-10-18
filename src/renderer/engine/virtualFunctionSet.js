// Compiles the active virtual-function definitions and evaluates them sample
// by sample. Compilation errors are reported per definition and never throw
// into the acquisition path.

import { blockToAst, compileAst, parseFormula, WindowRegistry } from "../lib/virtual/compiler.js";
import { definitionExpression } from "../lib/virtual/definitions.js";

/**
 * Compiles one definition. `channels` is the list of physical channels
 * ({ id, name }) used to resolve names in text formulas.
 * Returns `{ evaluate }` or throws a FormulaError.
 */
export const compileDefinition = (definition, channels, registry) => {
  const nameToId = new Map(channels.map((channel) => [channel.name.trim(), channel.id]));
  const idToName = (id) => channels.find((channel) => channel.id === id)?.name || "variable";
  const ast = definition.block
    ? blockToAst(definition.block)
    : parseFormula(definitionExpression(definition, idToName), (name) => nameToId.get(name) || null);
  const fallbackWindow = {
    unit: definition.windowUnit === "seconds" ? "seconds" : "samples",
    value: Number(definition.windowValue) || 1
  };
  return { evaluate: compileAst(ast, registry, fallbackWindow) };
};

export class VirtualFunctionSet {
  constructor(definitions = [], channels = [], readValue) {
    this.readValue = readValue;
    this.registry = new WindowRegistry();
    this.compiled = [];
    this.errors = new Map();
    this.context = { sample: null, readValue };
    definitions
      .filter((definition) => definition.enabled !== false)
      .forEach((definition) => {
        try {
          const { evaluate } = compileDefinition(definition, channels, this.registry);
          this.compiled.push({ id: definition.id, evaluate });
        } catch (error) {
          this.errors.set(definition.id, String(error?.message || error));
        }
      });
  }

  get isEmpty() {
    return this.compiled.length === 0;
  }

  /** Feeds a sample to the windows and returns `{ [id]: value }`. */
  evaluate(sample) {
    this.registry.push(sample, this.readValue);
    this.context.sample = sample;
    const values = {};
    for (const { id, evaluate } of this.compiled) {
      const value = evaluate(this.context);
      if (Number.isFinite(value)) {
        values[id] = value;
      }
    }
    return values;
  }
}
