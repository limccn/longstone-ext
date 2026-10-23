/**
 * Scan orchestration: cache-aware, resumable read of the registry.
 *
 * The surface package's `scanRange` is the only place `eth_getLogs` is
 * chunked and retried; this module must not reimplement those rules. It only
 * decides the window, slices the work so progress is durable, merges with the
 * cache, and derives the index.
 *
 * Durability matters here more than in the web app: a side panel is closed
 * by clicking away, so a scan that only persisted at the end would restart
 * from zero on every reopen. Each slice is written to `chrome.storage.local`
 * before the next one starts.
 */
import type { PublicClient } from 'viem';
import {
  deriveIndex,
  scanRange,
  type ChainIndex,
  type MemoryEventRecord,
  type SignerRecord,
} from '@limccn/longstone-surface';
import type { CachedScan, CacheArea } from './indexCache.js';
import { cacheMatches, readCache, writeCache } from './indexCache.js';
import { resolveWindow } from './chain.js';

export interface ScanProgress {
  phase: 'scanning' | 'done';
  done: bigint;
  total: bigint;
}

export interface ScanArgs {
  client: PublicClient;
  area: CacheArea;
  chainId: number;
  rpcUrl: string;
  registryAddress: `0x${string}`;
  scanStartBlock: string;
  chunkSize: number;
  onProgress?: (progress: ScanProgress) => void;
  /**
   * Called after each persisted slice with the index built so far, so the
   * panel can render rows while the rest of the window is still scanning.
   */
  onPartial?: (index: ChainIndex) => void;
}

export interface ScanOutcome {
  index: ChainIndex;
  /** Window actually covered, for the honest empty state. */
  fromBlock: bigint;
  toBlock: bigint;
}

/**
 * Blocks per persisted slice. Twenty `eth_getLogs` windows at the default
 * chunk size of 200: large enough that persistence is not the bottleneck,
 * small enough that a panel closed mid-scan loses seconds of work.
 */
function sliceBlocks(chunkSize: number): bigint {
  return BigInt(Math.max(1, chunkSize)) * 20n;
}

/**
 * Scans from the cache's high-water mark to the tip, persisting each slice.
 *
 * When the cache does not match the current chain/registry/RPC, the window is
 * recomputed and the cache is replaced instead of merged.
 */
export async function scanIndex(args: ScanArgs): Promise<ScanOutcome> {
  const { client, area, chainId, rpcUrl, registryAddress, chunkSize } = args;

  const tip = await client.getBlockNumber();
  const cached = await readCache(area);
  // A cache is reusable only if it still covers the requested window. Lowering
  // `scanStartBlock` asks for older history; keeping a cache that begins later
  // would silently answer with a shorter window than the user configured.
  const configuredStart =
    args.scanStartBlock === '' ? null : BigInt(args.scanStartBlock);
  const coversRequestedWindow =
    cached === null ||
    configuredStart === null ||
    BigInt(cached.fromBlock) <= configuredStart;
  const reusable =
    cached !== null &&
    cacheMatches(cached, { registryAddress, rpcUrl, chainId }) &&
    coversRequestedWindow;

  let fromBlock: bigint;
  let records: MemoryEventRecord[];
  let signers: SignerRecord[];
  let scannedTo: bigint;

  if (reusable) {
    fromBlock = BigInt(cached.fromBlock);
    records = cached.records;
    signers = cached.signers;
    scannedTo = BigInt(cached.scannedTo);
  } else {
    const window = resolveWindow(tip, args.scanStartBlock);
    fromBlock = window.fromBlock;
    records = [];
    signers = [];
    scannedTo = fromBlock - 1n;
  }

  const total = tip >= fromBlock ? tip - fromBlock + 1n : 0n;

  const persist = async (): Promise<void> => {
    const next: CachedScan = {
      chainId,
      registryAddress,
      rpcUrl,
      fromBlock: fromBlock.toString(),
      scannedTo: scannedTo.toString(),
      records,
      signers,
      updatedAt: Date.now(),
    };
    await writeCache(area, next);
  };

  const slice = sliceBlocks(chunkSize);
  let cursor = scannedTo + 1n;

  if (cursor <= tip) {
    args.onProgress?.({ phase: 'scanning', done: 0n, total });
  }

  while (cursor <= tip) {
    const sliceEnd = cursor + slice - 1n > tip ? tip : cursor + slice - 1n;
    const base = cursor - fromBlock;

    const result = await scanRange({
      client,
      registryAddress,
      fromBlock: cursor,
      toBlock: sliceEnd,
      chunkSize,
      onProgress: (done) => args.onProgress?.({ phase: 'scanning', done: base + done, total }),
    });

    records = [...records, ...result.records];
    signers = [...signers, ...result.signers];
    scannedTo = result.scannedTo;
    // Durable before the next slice: a closed panel resumes here.
    await persist();
    args.onPartial?.(deriveIndex(records, scannedTo, signers));
    cursor = scannedTo + 1n;
  }

  args.onProgress?.({ phase: 'done', done: total, total });

  return {
    index: deriveIndex(records, scannedTo, signers),
    fromBlock,
    toBlock: tip,
  };
}
