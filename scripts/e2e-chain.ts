/**
 * E2E chain fixture: deploys MemoryRegistry to the local Hardhat node running
 * with `--chain-id 84532` (Base Sepolia's id) and seeds it via the node's
 * unlocked accounts. No private key is ever read, written, or passed around.
 *
 * Seeded state (all over the real contract, real hashing):
 *   active    — anchored and served with matching bytes        (verified)
 *   tampered  — anchored, but the spec's gateway serves other bytes
 *                                                              (content-mismatch)
 *   retracted — anchored, then `retract`ed on-chain            (retracted)
 *   error     — anchored; the spec forces getCommitment to fail (error)
 *   unknown   — never anchored                                  (not-anchored)
 *
 * Produces: test/e2e/.chain.json (consumed by the read/verify spec).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  getAddress,
  http,
  keccak256,
  stringToBytes,
  type Abi,
  type EIP1193Provider,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { cidDigest, cidV1Raw, tagToBytes32 } from '@limccn/menhir-core';

const RPC = process.env['E2E_RPC_URL'] ?? 'http://127.0.0.1:8545';
const ROOT = path.resolve(import.meta.dirname, '..');
const ARTIFACT = path.resolve(
  ROOT,
  '../menhir/contracts/artifacts/src/MemoryRegistry.sol/MemoryRegistry.json',
);
const OUT_FILE = path.join(ROOT, 'test', 'e2e', '.chain.json');
const ZERO32 = `0x${'00'.repeat(32)}` as const;

function rpcProvider(url: string): EIP1193Provider {
  let id = 0;
  return {
    request: async (args) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: (id += 1), ...args }),
      });
      const body = (await response.json()) as {
        result?: unknown;
        error?: { message: string };
      };
      if (body.error !== undefined) throw new Error(body.error.message);
      return body.result;
    },
  } as EIP1193Provider;
}

function contentOf(text: string) {
  const canonical = JSON.stringify({ format: 'text.v0', text });
  const bytes = stringToBytes(canonical);
  return {
    canonical,
    contentHash: keccak256(bytes),
    cidDigest: cidDigest(bytes),
    cid: cidV1Raw(bytes),
  };
}

async function main(): Promise<void> {
  const artifact = JSON.parse(await readFile(ARTIFACT, 'utf8')) as {
    abi: Abi;
    bytecode: `0x${string}`;
  };

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const chainId = await publicClient.getChainId();
  if (chainId !== baseSepolia.id) {
    throw new Error(`expected chainId ${baseSepolia.id}, node reports ${chainId}`);
  }

  const accounts = (await publicClient.request({
    method: 'eth_accounts',
  })) as unknown as `0x${string}`[];
  const owner = accounts[0];
  if (owner === undefined) throw new Error('need at least one unlocked account on the node');

  const wallet = createWalletClient({
    account: owner,
    chain: baseSepolia,
    transport: custom(rpcProvider(RPC)),
  });

  const deployHash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [],
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  if (deployReceipt.contractAddress === null) throw new Error('deploy produced no address');
  const registry = getAddress(deployReceipt.contractAddress);

  async function commit(
    content: ReturnType<typeof contentOf>,
    tags: string[],
  ): Promise<`0x${string}`> {
    const tx = await wallet.writeContract({
      address: registry,
      abi: artifact.abi,
      functionName: 'commit',
      args: [
        {
          owner,
          contentHash: content.contentHash,
          cidDigest: content.cidDigest,
          signer: owner,
          blockHeight: await publicClient.getBlockNumber(),
          op: 0,
          prev: ZERO32,
        },
        tags.map((tag) => tagToBytes32(tag)),
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    const log = receipt.logs[0];
    if (log === undefined) throw new Error('commit emitted no logs');
    return (
      decodeEventLog({ abi: artifact.abi, data: log.data, topics: log.topics }).args as {
        commitmentHash: `0x${string}`;
      }
    ).commitmentHash;
  }

  const active = contentOf('memory read by the extension e2e');
  const activeHash = await commit(active, ['layer:deep']);

  // The chain commits `canonical`; the spec's gateway serves `served` under the
  // same CID, so both digests mismatch.
  const tampered = contentOf('memory whose gateway copies were substituted');
  const tamperedHash = await commit(tampered, ['layer:working']);
  const tamperedServed = 'tampered bytes that do not match the chain';

  const retracted = contentOf('memory retracted after it was anchored');
  const retractedHash = await commit(retracted, ['layer:deep']);
  const retractTx = await wallet.writeContract({
    address: registry,
    abi: artifact.abi,
    functionName: 'retract',
    args: [retractedHash, ZERO32],
  });
  await publicClient.waitForTransactionReceipt({ hash: retractTx });

  const error = contentOf('memory whose commitment read fails in the fixture');
  const errorHash = await commit(error, []);

  const fixture = {
    registry,
    deployBlock: deployReceipt.blockNumber.toString(),
    rpcUrl: RPC,
    owner,
    active: { commitmentHash: activeHash, ...active },
    tampered: { commitmentHash: tamperedHash, ...tampered, served: tamperedServed },
    retracted: { commitmentHash: retractedHash, ...retracted },
    error: { commitmentHash: errorHash, ...error },
    unknownHash: keccak256(stringToBytes('nothing was anchored here')),
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`registry:  ${registry}`);
  console.log(`active:    ${activeHash}`);
  console.log(`tampered:  ${tamperedHash}`);
  console.log(`retracted: ${retractedHash}`);
  console.log(`error:     ${errorHash}`);
  console.log(`fixture:   ${OUT_FILE}`);
}

await main();
