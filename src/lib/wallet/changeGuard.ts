/**
 * Self-write suppression for `chrome.storage.onChanged` (DR-01).
 *
 * Chromium notifies the writer too, so a vault that saved one second ago would
 * otherwise classify its own write as "another window" and lock. This module
 * is host-specific and imports only the shared core's deterministic
 * serializer; the package is side-effect free, so the options page (which
 * never touches a wallet) tree-shakes the KDF and account code away.
 */
import { stableStringify } from '@limccn/longstone-wallet';

export interface WalletChangeGuard {
  noteWrite(key: string, value: unknown): void;
  noteRemove(key: string): void;
  classify(key: string, newValue: unknown): 'self' | 'external';
}

const REMOVED = Symbol('removed');

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
