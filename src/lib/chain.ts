/**
 * Chain reads for the side panel.
 *
 * The surface package owns scanning and verification; this module only
 * decides *which* blocks to ask for and supplies the client. A desktop panel
 * is opened for seconds, so it never scans the full history from the deploy
 * block on first use the way the web app does with IndexedDB caching.
 *
 * Instead it scans backwards from the tip in a bounded window. The window is
 * large enough for normal activity (Base Sepolia gets a handful of blocks per
 * second, 50k blocks is a few hours) and is a user-visible setting so a cold
 * registry is reachable by widening it, never by silently scanning 48M
 * blocks.
 */
import { getAddress } from 'viem';
import { baseSepolia } from 'viem/chains';
import type { PublicClient } from 'viem';
import {
  UiError,
  makePublicClient,
  type MemoryEventRecord,
  type SignerRecord,
} from '@limccn/longstone-surface';

export interface ScanWindow {
  fromBlock: bigint;
  toBlock: bigint;
}

/**
 * Default lookback when the user has not pinned a start block. 50,000 blocks
 * at Base's ~2s block time is roughly 28 hours.
 */
export const DEFAULT_LOOKBACK_BLOCKS = 50_000n;

export function createClient(rpcUrl: string): PublicClient {
  return makePublicClient(rpcUrl);
}

/**
 * Canonical (EIP-55) form of a validated address.
 *
 * Event decoding returns checksummed addresses, and `statesForOwner` is an
 * exact map lookup. Without canonicalization a lowercase pasted owner would
 * silently show an empty timeline. Lowercasing first makes the checksum
 * input-insensitive: the user's casing is a display detail, not a filter.
 */
export function canonicalAddress(address: string): `0x${string}` {
  return getAddress(address.toLowerCase() as `0x${string}`);
}

/**
 * Turns an opaque transport failure into an actionable one.
 *
 * A CORS-enabled endpoint works without host permission; one that is not
 * CORS-enabled needs the optional origin grant, and Chrome reports that as a
 * generic network timeout. There is no API that says "this origin was never
 * granted", so the message names both likely causes instead of guessing.
 */
export function explainScanError(error: unknown, rpcUrl: string): string {
  if (error instanceof UiError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (/timed? ?out|fetch failed|Failed to fetch|NetworkError/i.test(message)) {
    return `${message} Check that ${rpcUrl} is reachable from this machine; if it does not send CORS headers, open Settings and save so the extension can ask for access to that exact origin.`;
  }
  return message;
}

export async function latestBlock(client: PublicClient): Promise<bigint> {
  return client.getBlockNumber();
}

/**
 * Resolves the block window for a scan.
 *
 * - A numeric `scanStartBlock` in settings is authoritative (the user may be
 *   pointing at a quiet registry or a local chain).
 * - Otherwise the window is `[tip - lookback, tip]`.
 *
 * There is no genesis scan and no deploy-block binary search here; both are
 * web-app behaviours tuned for a cached index. The panel states its window in
 * the UI so "no memories found" is never mistaken for "no memories exist".
 */
export function resolveWindow(
  tip: bigint,
  scanStartBlock: string,
  lookback: bigint = DEFAULT_LOOKBACK_BLOCKS,
): ScanWindow {
  const configured = scanStartBlock === '' ? null : BigInt(scanStartBlock);
  if (configured !== null && configured <= tip) {
    return { fromBlock: configured, toBlock: tip };
  }
  const start = tip > lookback ? tip - lookback : 0n;
  return { fromBlock: start, toBlock: tip };
}

/** One decoded page of registry events. */
export interface ScanPage {
  records: MemoryEventRecord[];
  signers: SignerRecord[];
  fromBlock: bigint;
  toBlock: bigint;
}

/** The chain ID the manifest and defaults assume. */
export const CHAIN_ID = baseSepolia.id;
export const CHAIN_NAME = baseSepolia.name;
