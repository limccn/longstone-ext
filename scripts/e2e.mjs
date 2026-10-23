/**
 * E2E orchestration.
 *
 *   1. start a local Hardhat node on chain-id 84532 (Base Sepolia's id);
 *      reuse one that is already running
 *   2. deploy + seed MemoryRegistry via the node's unlocked accounts
 *      (scripts/e2e-chain.ts; no private key is ever passed around)
 *   3. build the chrome extension
 *   4. run Playwright with the extension loaded
 *
 * Usage: node scripts/e2e.mjs [--skip-build]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTRACTS = path.resolve(ROOT, '../menhir/contracts');
const ARTIFACT = path.join(
  CONTRACTS,
  'artifacts',
  'src',
  'MemoryRegistry.sol',
  'MemoryRegistry.json',
);
const EXTENSION = path.join(ROOT, '.output', 'chrome-mv3');
const CHAIN_FILE = path.join(ROOT, 'test', 'e2e', '.chain.json');
const RPC = process.env['E2E_RPC_URL'] ?? 'http://127.0.0.1:8545';
const IS_WIN = process.platform === 'win32';
const PNPM = IS_WIN ? 'corepack.cmd' : 'corepack';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: IS_WIN,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

async function chainId() {
  try {
    const response = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    });
    const body = await response.json();
    return body.result ?? null;
  } catch {
    return null;
  }
}

async function waitForNode(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await chainId()) === '0x14a34') return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('hardhat node did not become ready');
}

const nodeProcesses = [];

function killTree(child) {
  if (child.killed || child.exitCode !== null) return;
  if (IS_WIN) {
    // The shell wrapper owns the actual node; /T kills the whole tree.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

function cleanup() {
  for (const child of nodeProcesses) killTree(child);
}

async function ensureNode() {
  if ((await chainId()) === '0x14a34') {
    console.log('e2e: reusing running chain node');
    return;
  }
  console.log('e2e: starting hardhat node (chain-id 84532)');
  const child = spawn(
    PNPM,
    ['pnpm', 'exec', 'hardhat', 'node', '--chain-id', '84532', '--port', '8545'],
    {
      cwd: CONTRACTS,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: IS_WIN,
      // New process group on POSIX so cleanup can kill pnpm and the node.
      detached: !IS_WIN,
    },
  );
  nodeProcesses.push(child);
  child.stdout.on('data', (chunk) => {
    if (process.env['E2E_VERBOSE'] === '1') process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    if (process.env['E2E_VERBOSE'] === '1') process.stderr.write(chunk);
  });
  await waitForNode();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}

async function main() {
  if (!existsSync(ARTIFACT)) {
    throw new Error(
      `MemoryRegistry artifact missing: ${ARTIFACT}. ` +
        'Run `pnpm --dir ../menhir/contracts build` first.',
    );
  }
  await ensureNode();
  console.log('e2e: deploying + seeding registry');
  await run(process.execPath, ['scripts/e2e-chain.ts'], {
    cwd: ROOT,
    // Windows shells would split the node path at its spaces.
    shell: false,
    env: { ...process.env, E2E_RPC_URL: RPC },
  });

  if (!process.argv.includes('--skip-build')) {
    console.log('e2e: building chrome extension');
    await run(PNPM, ['pnpm', 'run', 'build:chrome'], { cwd: ROOT });
  }
  if (!existsSync(path.join(EXTENSION, 'manifest.json'))) {
    throw new Error(`extension build missing: ${EXTENSION}`);
  }

  console.log('e2e: running playwright');
  await run(
    PNPM,
    ['pnpm', 'exec', 'playwright', 'test', '-c', 'playwright.extension.config.ts'],
    { cwd: ROOT, env: { ...process.env, E2E_CHAIN_FILE: CHAIN_FILE } },
  );
}

main()
  .then(() => cleanup())
  .catch((error) => {
    console.error(error);
    cleanup();
    process.exit(1);
  });
