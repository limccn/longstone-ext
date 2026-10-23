/**
 * Loader for the chain state seeded by `scripts/e2e-chain.ts`.
 *
 * `pnpm e2e` boots a local Hardhat node (chain-id 84532, Base Sepolia's id),
 * deploys MemoryRegistry from the menhir artifact and writes this file. The
 * specs never hard-code a registry address, so CI can deploy at any block.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface ContentFixture {
  commitmentHash: `0x${string}`;
  cid: string;
  contentHash: `0x${string}`;
  cidDigest: `0x${string}`;
  canonical: string;
}

export interface ChainFixture {
  registry: `0x${string}`;
  deployBlock: string;
  rpcUrl: string;
  owner: `0x${string}`;
  /** Anchored, active, served with matching bytes → verified. */
  active: ContentFixture;
  /** Anchored over `canonical`, but the gateway serves `served` → content-mismatch. */
  tampered: ContentFixture & { served: string };
  /** Anchored, then retracted on-chain; bytes still match → retracted. */
  retracted: ContentFixture;
  /** Anchored (isDeep true), but the spec forces getCommitment to fail → error. */
  error: ContentFixture;
  /** Never anchored → not-anchored. */
  unknownHash: `0x${string}`;
}

export function loadChainFixture(): ChainFixture {
  const file = process.env['E2E_CHAIN_FILE'] ?? path.resolve('test/e2e/.chain.json');
  return JSON.parse(readFileSync(file, 'utf8')) as ChainFixture;
}

export const SETTINGS_STORAGE_KEY = 'longstone-ext.settings.v1';

/** Settings the extension boots from for the read/verify suite. */
export function readVerifySettings(fixture: ChainFixture): Record<string, unknown> {
  return {
    rpcUrl: fixture.rpcUrl,
    registryAddress: fixture.registry,
    ipfsGateway: `${fixture.rpcUrl}/ipfs`,
    hisaishiUrl: '',
    ownerAddress: fixture.owner,
    scanChunkSize: 10,
    scanStartBlock: fixture.deployBlock,
  };
}
