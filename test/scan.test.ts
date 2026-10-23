/**
 * Chain window and cache rules.
 *
 * `scanIndex` delegates chunking/retry to the surface package; what this repo
 * decides is the window and what invalidates a cached page. Both are easy to
 * get subtly wrong (a resumed scan that moves its lower bound silently loses
 * history), so they are tested without a chain.
 */
import { describe, expect, it } from 'vitest';
import type { PublicClient } from 'viem';
import { DEFAULT_LOOKBACK_BLOCKS, canonicalAddress, resolveWindow } from '../src/lib/chain.js';
import {
  CACHE_STORAGE_KEY,
  cacheMatches,
  clearCache,
  readCache,
  writeCache,
  type CacheArea,
  type CachedScan,
} from '../src/lib/indexCache.js';
import { scanIndex } from '../src/lib/scan.js';

describe('canonicalAddress', () => {
  it('produces the checksummed form decoded events use, regardless of input casing', () => {
    const lower = '0x330c67886612ba88b4895739f2e610f01f233d78';
    const checksummed = '0x330c67886612ba88b4895739f2E610f01F233d78';
    expect(canonicalAddress(lower)).toBe(checksummed);
    expect(canonicalAddress(checksummed)).toBe(checksummed);
  });
});

describe('resolveWindow', () => {
  it('uses the configured start block when present', () => {
    expect(resolveWindow(1000n, '200')).toEqual({ fromBlock: 200n, toBlock: 1000n });
  });

  it('falls back to the bounded lookback when blank', () => {
    expect(resolveWindow(1_000_000n, '')).toEqual({
      fromBlock: 1_000_000n - DEFAULT_LOOKBACK_BLOCKS,
      toBlock: 1_000_000n,
    });
  });

  it('clamps at zero for a young chain', () => {
    expect(resolveWindow(10n, '')).toEqual({ fromBlock: 0n, toBlock: 10n });
  });

  it('ignores a configured start beyond the tip instead of inverting the range', () => {
    expect(resolveWindow(100n, '999')).toEqual({
      fromBlock: 100n > DEFAULT_LOOKBACK_BLOCKS ? 100n - DEFAULT_LOOKBACK_BLOCKS : 0n,
      toBlock: 100n,
    });
  });
});

function memoryArea(): CacheArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

const KEY = {
  registryAddress: `0x${'aa'.repeat(20)}`,
  rpcUrl: 'https://sepolia.base.org',
  chainId: 84532,
};

describe('indexCache', () => {
  it('round-trips bigint fields', async () => {
    const area = memoryArea();
    const scan: CachedScan = {
      ...KEY,
      fromBlock: '100',
      scannedTo: '200',
      records: [
        {
          kind: 'committed',
          blockNumber: 150n,
          logIndex: 0,
          txHash: `0x${'bb'.repeat(32)}`,
          owner: KEY.registryAddress as `0x${string}`,
          commitmentHash: `0x${'cc'.repeat(32)}`,
          tags: ['note'],
        },
      ],
      signers: [],
      updatedAt: 1,
    };
    await writeCache(area, scan);
    const read = await readCache(area);
    expect(read?.records[0]?.blockNumber).toBe(150n);
    expect(read?.fromBlock).toBe('100');
  });

  it('invalidates on a different registry, RPC, or chain', () => {
    const cache: CachedScan = {
      ...KEY,
      fromBlock: '1',
      scannedTo: '2',
      records: [],
      signers: [],
      updatedAt: 1,
    };
    expect(cacheMatches(cache, KEY)).toBe(true);
    expect(cacheMatches(cache, { ...KEY, rpcUrl: 'https://other.example.org' })).toBe(false);
    expect(cacheMatches(cache, { ...KEY, chainId: 1 })).toBe(false);
    expect(
      cacheMatches(cache, { ...KEY, registryAddress: `0x${'dd'.repeat(20)}` }),
    ).toBe(false);
  });

  it('clears without throwing', async () => {
    const area = memoryArea();
    area.data[CACHE_STORAGE_KEY] = { anything: true };
    await clearCache(area);
    expect(area.data[CACHE_STORAGE_KEY]).toBeUndefined();
  });
});

/** Stub client: only the calls scanIndex makes before delegating to scanRange. */
function stubClient(tip: bigint, logs: unknown[] = []): PublicClient {
  return {
    async getBlockNumber() {
      return tip;
    },
    async getLogs() {
      return logs;
    },
  } as unknown as PublicClient;
}

describe('scanIndex', () => {
  it('scans a fresh bounded window and records it in the cache', async () => {
    const area = memoryArea();
    const outcome = await scanIndex({
      client: stubClient(1000n),
      area,
      chainId: KEY.chainId,
      rpcUrl: KEY.rpcUrl,
      registryAddress: KEY.registryAddress as `0x${string}`,
      scanStartBlock: '900',
      chunkSize: 200,
    });
    expect(outcome.fromBlock).toBe(900n);
    expect(outcome.toBlock).toBe(1000n);
    expect(outcome.index.byHash.size).toBe(0);

    const cached = await readCache(area);
    expect(cached?.fromBlock).toBe('900');
    expect(cached?.scannedTo).toBe('1000');
  });

  it('resumes from the cache high-water mark without moving the lower bound', async () => {
    const area = memoryArea();
    await writeCache(area, {
      ...KEY,
      fromBlock: '900',
      scannedTo: '1500',
      records: [],
      signers: [],
      updatedAt: 1,
    });

    const outcome = await scanIndex({
      client: stubClient(1600n),
      area,
      chainId: KEY.chainId,
      rpcUrl: KEY.rpcUrl,
      registryAddress: KEY.registryAddress as `0x${string}`,
      scanStartBlock: '',
      chunkSize: 200,
    });

    expect(outcome.fromBlock).toBe(900n);
    expect(outcome.toBlock).toBe(1600n);
    const cached = await readCache(area);
    expect(cached?.scannedTo).toBe('1600');
    expect(cached?.fromBlock).toBe('900');
  });

  it('replaces the cache when the RPC endpoint changed', async () => {
    const area = memoryArea();
    await writeCache(area, {
      ...KEY,
      fromBlock: '1',
      scannedTo: '1500',
      records: [],
      signers: [],
      updatedAt: 1,
    });

    const outcome = await scanIndex({
      client: stubClient(2000n),
      area,
      chainId: KEY.chainId,
      rpcUrl: 'https://different.example.org',
      registryAddress: KEY.registryAddress as `0x${string}`,
      scanStartBlock: '1900',
      chunkSize: 200,
    });

    expect(outcome.fromBlock).toBe(1900n);
    const cached = await readCache(area);
    expect(cached?.rpcUrl).toBe('https://different.example.org');
  });

  it('does not re-scan when the tip has not moved', async () => {
    const area = memoryArea();
    let calls = 0;
    const client = {
      async getBlockNumber() {
        return 1000n;
      },
      async getLogs() {
        calls += 1;
        return [];
      },
    } as unknown as PublicClient;

    const args = {
      client,
      area,
      chainId: KEY.chainId,
      rpcUrl: KEY.rpcUrl,
      registryAddress: KEY.registryAddress as `0x${string}`,
      scanStartBlock: '900',
      chunkSize: 200,
    };

    await scanIndex(args);
    expect(calls).toBe(1);
    await scanIndex(args);
    expect(calls).toBe(1);
  });

  it('persists after every slice so a closed panel resumes its progress', async () => {
    const area = memoryArea();
    const client = stubClient(5000n);
    const partial: bigint[] = [];

    await scanIndex({
      client,
      area,
      chainId: KEY.chainId,
      rpcUrl: KEY.rpcUrl,
      registryAddress: KEY.registryAddress as `0x${string}`,
      scanStartBlock: '4000',
      chunkSize: 10, // slice = 200 blocks -> 6 slices over 1001 blocks
      onPartial: (index) => partial.push(index.latestBlock),
    });

    const cached = await readCache(area);
    expect(cached?.scannedTo).toBe('5000');
    expect(partial.length).toBeGreaterThan(1);
    // Each partial index saw a progressively further high-water mark.
    expect(partial).toEqual([...partial].sort((a, b) => (a < b ? -1 : 1)));
  });

  it('resumes from the last persisted slice, not the window start', async () => {
    const area = memoryArea();
    // Simulate a panel closed after the third of six slices.
    await writeCache(area, {
      ...KEY,
      fromBlock: '4000',
      scannedTo: '4600',
      records: [],
      signers: [],
      updatedAt: 1,
    });

    let firstRequestedFrom: bigint | null = null;
    const client = {
      async getBlockNumber() {
        return 5000n;
      },
      async getLogs(args: { fromBlock: bigint }) {
        firstRequestedFrom ??= args.fromBlock;
        return [];
      },
    } as unknown as PublicClient;

    const outcome = await scanIndex({
      client,
      area,
      chainId: KEY.chainId,
      rpcUrl: KEY.rpcUrl,
      registryAddress: KEY.registryAddress as `0x${string}`,
      scanStartBlock: '4000',
      chunkSize: 10,
    });

    expect(firstRequestedFrom).toBe(4601n);
    expect(outcome.fromBlock).toBe(4000n);
  });

  it('replaces the cache when the requested start block moved earlier', async () => {
    const area = memoryArea();
    await writeCache(area, {
      ...KEY,
      fromBlock: '4900',
      scannedTo: '5000',
      records: [],
      signers: [],
      updatedAt: 1,
    });

    const outcome = await scanIndex({
      client: stubClient(5000n),
      area,
      chainId: KEY.chainId,
      rpcUrl: KEY.rpcUrl,
      registryAddress: KEY.registryAddress as `0x${string}`,
      // Earlier than the cached window: the old cache cannot answer for it.
      scanStartBlock: '4000',
      chunkSize: 200,
    });

    expect(outcome.fromBlock).toBe(4000n);
    expect((await readCache(area))?.fromBlock).toBe('4000');
  });

  it('records an empty window so reopening does not rescan it', async () => {
    const area = memoryArea();
    await scanIndex({
      client: stubClient(1000n),
      area,
      chainId: KEY.chainId,
      rpcUrl: KEY.rpcUrl,
      registryAddress: KEY.registryAddress as `0x${string}`,
      scanStartBlock: '900',
      chunkSize: 200,
    });
    expect((await readCache(area))?.scannedTo).toBe('1000');
  });
});
