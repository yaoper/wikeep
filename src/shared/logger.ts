/// <reference types="vite/client" />

// Vite statically replaces import.meta.env.DEV; logs are tree-shaken in prod.
const DEV = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (DEV) console.log("[wikeep]", ...args);
  },
  warn: (...args: unknown[]) => {
    if (DEV) console.warn("[wikeep]", ...args);
  },
  error: (...args: unknown[]) => {
    // Errors are always surfaced.
    console.error("[wikeep]", ...args);
  },
};
