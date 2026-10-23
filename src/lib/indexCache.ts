/**
 * Incremental scan cache for the side panel.
 *
 * `chrome.storage.local` is the only persistence available without adding a
 * permission, so the cache is JSON with bigint-safe encoding (the same
 * technique `longstone-ui` uses for IndexedDB). Exactly one registry window is
 * kept: the panel is not an archive, and a smaller working set means a corrupt
 * or stale entry can be discarded rather than merged.
 *
 * Correctness rule: an entry is usable only when chain id, registry, and RPC
 * endpoint all match. The window start (`fromBlock`) is recorded rather than
 * recomputed: extending a scan to a new tip must not move the lower bound, or
 * the index would silently lose the beginning of its history.
 */
import type { MemoryEventRecord, SignerRecord } from '@limccn/longstone-surface';

export interface CachedScan {
  chainId: number;
  registryAddress: string;
  rpcUrl: string;
  fromBlock: string;
  scannedTo: string;
  records: MemoryEventRecord[];
  signers: SignerRecord[];
  updatedAt: number;
}

export const CACHE_STORAGE_KEY = 'longstone-ext.scanCache.v1';

function encode(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) =>
      typeof v === 'bigint' ? { __bigint: v.toString() } : v,
    ),
  );
}

function decode<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), (_key, v: unknown) => {
    if (
      typeof v === 'object' &&
      v !== null &&
      '__bigint' in v &&
      typeof (v as { __bigint: unknown }).__bigint === 'string'
    ) {
      return BigInt((v as { __bigint: string }).__bigint);
    }
    return v;
  }) as T;
}

export interface CacheKey {
  registryAddress: string;
  rpcUrl: string;
  chainId: number;
}

export interface CacheArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export function cacheMatches(cache: CachedScan, key: CacheKey): boolean {
  return (
    cache.chainId === key.chainId &&
    cache.registryAddress.toLowerCase() === key.registryAddress.toLowerCase() &&
    cache.rpcUrl === key.rpcUrl
  );
}

export async function readCache(area: CacheArea): Promise<CachedScan | null> {
  try {
    const stored = await area.get(CACHE_STORAGE_KEY);
    const raw = stored[CACHE_STORAGE_KEY];
    if (raw === undefined || raw === null) return null;
    return decode<CachedScan>(raw);
  } catch {
    return null;
  }
}

export async function writeCache(area: CacheArea, scan: CachedScan): Promise<void> {
  try {
    await area.set({ [CACHE_STORAGE_KEY]: encode(scan) });
  } catch {
    // Quota or serialization failure: the panel still works from memory.
  }
}

export async function clearCache(area: CacheArea): Promise<void> {
  try {
    await area.remove(CACHE_STORAGE_KEY);
  } catch {
    // ignore
  }
}
