// localStorage helpers. Every access is guarded: storage can be unavailable
// or hold corrupted JSON, and that must never break the UI.

import { storageKeys } from "../constants.js";

export const readJson = (key, fallback = null) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (_error) {
    return fallback;
  }
};

/** Reads an object and merges it over `defaults`. */
export const readSettings = (key, defaults) => {
  const saved = readJson(key, null);
  return saved && typeof saved === "object" ? { ...defaults, ...saved } : defaults;
};

export const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Quota or privacy errors: persistence is best-effort.
  }
};

export const readString = (key, fallback = "") => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch (_error) {
    return fallback;
  }
};

export const writeString = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (_error) {
    // Best-effort.
  }
};

export const removeKey = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (_error) {
    // Best-effort.
  }
};

export const readTemplates = () => {
  const templates = readJson(storageKeys.templates, {});
  return templates && typeof templates === "object" ? templates : {};
};

export const writeTemplates = (templates) => writeJson(storageKeys.templates, templates);

export const getTemplateNames = (templates = readTemplates()) =>
  Object.keys(templates).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
