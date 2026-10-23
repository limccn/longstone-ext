/**
 * Self-write suppression for `chrome.storage.onChanged` (DR-01).
 *
 * Chromium notifies the writer too, so a vault that saved one second ago would
 * otherwise classify its own write as "another window" and lock. This module
 * is deliberately separate from the vault and imports nothing, so the storage
 * adapter can use it without pulling Argon2id or the account code into pages
 * that never touch a wallet (the options page).
 */
export interface WalletChangeGuard {
  noteWrite(key: string, value: unknown): void;
  noteRemove(key: string): void;
  classify(key: string, newValue: unknown): 'self' | 'external';
}

const REMOVED = Symbol('removed');

/** Deterministic JSON: object keys sorted, so a reordered write hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

export function createWalletChangeGuard(_keys: unknown): WalletChangeGuard {
  const recorded = new Map<string, string | typeof REMOVED>();
  return {
    noteWrite(key, value) {
      recorded.set(key, stableStringify(value));
    },
    noteRemove(key) {
      recorded.set(key, REMOVED);
    },
    classify(key, newValue) {
      const current = newValue === undefined ? REMOVED : stableStringify(newValue);
      return recorded.get(key) === current ? 'self' : 'external';
    },
  };
}
