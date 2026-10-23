/**
 * Write-confirmation policy for the side panel (design §4.2 step 7.c).
 *
 * The shared core owns the retry/semantics; this module owns when a host
 * notifies and how many times. A failed confirmation must always reach the
 * hook so it can lock and reload instead of adopting the in-memory result.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { hashRecord, type VaultDeps, type WalletStorage } from '@limccn/longstone-wallet';

import { createWriteGuard } from '../../src/ui/wallet/writeGuard.js';

const KEYS = { record: 'test.wallet.v1', pending: 'test.wallet.v1.pending' } as const;

class FakeStorage implements WalletStorage {
  data = new Map<string, unknown>();
  writes: string[] = [];
  reads = 0;
  failGets = 0;

  async get(key: string): Promise<Record<string, unknown>> {
    this.reads += 1;
    if (this.failGets > 0) {
      this.failGets -= 1;
      throw new Error('simulated read failure');
    }
    return this.data.has(key) ? { [key]: this.data.get(key) } : {};
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      this.writes.push(key);
      this.data.set(key, value);
    }
  }

  async remove(key: string): Promise<void> {
    this.writes.push(key);
    this.data.delete(key);
  }
}

function setup(): {
  storage: FakeStorage;
  deps: VaultDeps;
  failures: () => number;
  guard: ReturnType<typeof createWriteGuard>;
} {
  const storage = new FakeStorage();
  let failures = 0;
  const guard = createWriteGuard({
    deps: { storage, keys: KEYS },
    onUnverified: () => {
      failures += 1;
    },
  });
  return { storage, deps: { storage, keys: KEYS }, failures: () => failures, guard };
}

describe('write guard', () => {
  const record = { format: 'longstone.wallet.v1', marker: 'record' };
  const other = { format: 'longstone.wallet.v1', marker: 'other' };

  it('confirms a matching record and stays silent', async () => {
    const { storage, guard, failures } = setup();
    storage.data.set(KEYS.record, record);

    await expect(guard.confirmRecordHash(hashRecord(record))).resolves.toBe(true);
    expect(failures()).toBe(0);
  });

  it('notifies once when both reads disagree', async () => {
    const { storage, guard, failures } = setup();
    storage.data.set(KEYS.record, other);

    await expect(guard.confirmRecordHash(hashRecord(record))).resolves.toBe(false);
    expect(failures()).toBe(1);
    expect(storage.reads).toBe(2);
  });

  it('notifies once when both reads throw', async () => {
    const { storage, guard, failures } = setup();
    storage.data.set(KEYS.record, record);
    storage.failGets = 2;

    await expect(guard.confirmRecordHash(hashRecord(record))).resolves.toBe(false);
    expect(failures()).toBe(1);
    expect(storage.reads).toBe(2);
  });

  it('confirms absence only when both keys are gone', async () => {
    const { storage, guard, failures } = setup();
    await expect(guard.confirmAbsent()).resolves.toBe(true);
    expect(failures()).toBe(0);

    storage.data.set(KEYS.pending, record);
    await expect(guard.confirmAbsent()).resolves.toBe(false);
    expect(failures()).toBe(1);
  });

  it('never writes while checking', async () => {
    const { storage, guard } = setup();
    storage.data.set(KEYS.record, record);

    await guard.confirmRecordHash(hashRecord(record));
    await guard.confirmAbsent();
    expect(storage.writes).toEqual([]);
  });

  it('imports only the shared core (no browser or React)', () => {
    const source = readFileSync(
      new URL('../../src/ui/wallet/writeGuard.ts', import.meta.url),
      'utf8',
    );
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );
    expect(specifiers).toEqual(['@limccn/longstone-wallet']);
  });
});
