/**
 * Self-write suppression for `chrome.storage.onChanged` (DR-01, host side).
 *
 * Chromium delivers a storage event to the writer too. The guard records what
 * this page just wrote (or removed) and the unlock listener ignores that
 * event; a value it did not write locks the vault. The deterministic
 * serializer itself lives in `@limccn/longstone-wallet` so record hashing and
 * this comparison cannot drift.
 */
import { describe, expect, it } from 'vitest';
import { createWalletChangeGuard } from '../../src/lib/wallet/changeGuard.js';

const KEYS = { record: 'test.wallet.v1', pending: 'test.wallet.v1.pending' } as const;

describe('self-write suppression', () => {
  it('classifies its own writes and removes as self, everything else as external', () => {
    const guard = createWalletChangeGuard(KEYS);
    const record = { format: 'longstone.wallet.v1', value: 1 };
    guard.noteWrite(KEYS.record, record);
    expect(guard.classify(KEYS.record, { value: 1, format: 'longstone.wallet.v1' })).toBe(
      'self',
    );
    expect(guard.classify(KEYS.record, { ...record, value: 2 })).toBe('external');
    expect(guard.classify(KEYS.record, undefined)).toBe('external');

    guard.noteRemove(KEYS.record);
    expect(guard.classify(KEYS.record, undefined)).toBe('self');
    expect(guard.classify(KEYS.record, record)).toBe('external');
    expect(guard.classify(KEYS.pending, undefined)).toBe('external');
  });
});
