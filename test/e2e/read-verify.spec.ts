/**
 * Phase E read/verify coverage against a local Hardhat chain.
 *
 * `pnpm e2e` boots `hardhat node --chain-id 84532` from ../menhir/contracts and
 * seeds MemoryRegistry (scripts/e2e-chain.ts); this spec boots the extension
 * from the resulting `.chain.json`. The production path is unchanged: viem's
 * HTTP transport reaches the node, the surface reads commitments with the real
 * MemoryRegistry ABI, and verify hashes the bytes the gateway returns.
 *
 * The gateway and the one failing `getCommitment` call are served by Playwright
 * routes, the same pattern `longstone-ui` uses. AC-13 explicitly allows an
 * intercepted transport for the error verdict; no verdict is injected.
 */
import { memoryRegistryAbi } from '@limccn/menhir-core';
import { decodeFunctionData, type Hex } from 'viem';
import { expect, test } from './extension.js';
import { extensionPageUrl } from './extension.js';
import {
  loadChainFixture,
  readVerifySettings,
  SETTINGS_STORAGE_KEY,
} from './chainFixture.js';
import { writeExtensionStorage } from './walletActions.js';

const CORS_HEADERS = { 'access-control-allow-origin': '*' } as const;

interface RpcCall {
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function isGetCommitmentFor(call: RpcCall, hash: string): boolean {
  if (call.method !== 'eth_call') return false;
  const request = (call.params as [{ data?: Hex }] | undefined)?.[0];
  if (request?.data === undefined) return false;
  try {
    const decoded = decodeFunctionData({ abi: memoryRegistryAbi, data: request.data });
    return (
      decoded.functionName === 'getCommitment' &&
      String(decoded.args?.[0] ?? '').toLowerCase() === hash
    );
  } catch {
    return false;
  }
}

test('scans a timeline, opens the detail and covers the five verdicts', async ({
  context,
  extensionId,
  helper,
}) => {
  const fixture = loadChainFixture();
  await writeExtensionStorage(helper, SETTINGS_STORAGE_KEY, readVerifySettings(fixture));

  const page = await context.newPage();

  // Gateway: the fixture CIDs, with tampered bytes deliberately served under
  // the hash the chain committed to.
  const bodies = new Map<string, string>([
    [fixture.active.cid, fixture.active.canonical],
    [fixture.tampered.cid, fixture.tampered.served],
    [fixture.retracted.cid, fixture.retracted.canonical],
    [fixture.error.cid, fixture.error.canonical],
  ]);
  await page.route('**/ipfs/**', async (route) => {
    const cid = route.request().url().split('/').pop() ?? '';
    const body = bodies.get(cid);
    if (body === undefined) {
      await route.fulfill({
        status: 404,
        headers: CORS_HEADERS,
        contentType: 'text/plain',
        body: 'not found',
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      contentType: 'application/octet-stream',
      body,
    });
  });

  // Error verdict: only this hash's getCommitment fails; isDeep, isActive,
  // logs and every other eth_call still reach the real node. The predicate is
  // path-exact so it cannot swallow the gateway requests sharing this origin.
  const errorHash = fixture.error.commitmentHash.toLowerCase();
  const rpcUrl = new URL(fixture.rpcUrl);
  await page.route(
    (url) => url.origin === rpcUrl.origin && url.pathname === rpcUrl.pathname,
    async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }
      const payload = request.postDataJSON() as RpcCall | RpcCall[] | null;
      if (payload === null || Array.isArray(payload) || !isGetCommitmentFor(payload, errorHash)) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: payload.id ?? null,
          error: { code: -32_000, message: 'execution reverted: e2e getCommitment failure' },
        }),
      });
    },
  );

  await page.goto(extensionPageUrl(extensionId, 'sidepanel.html'));

  // A fresh profile defaults to the Wallet tab; the scan already started
  // because Settings names an owner.
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByTestId('timeline-list')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('timeline-empty')).toHaveCount(0);

  const row = page.locator(
    `button.memory-main[title="${fixture.active.commitmentHash}"]`,
  );
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.getByTestId('detail')).toBeVisible();
  await expect(page.getByTestId('detail')).toContainText(fixture.active.commitmentHash);
  await expect(page.getByTestId('detail')).toContainText(fixture.active.contentHash);
  await expect(page.getByTestId('detail')).toContainText(fixture.active.cidDigest);

  await page.getByRole('button', { name: 'Verify content' }).click();
  await expect(page.getByTestId('verify-input')).toHaveValue(fixture.active.commitmentHash);
  await page.getByTestId('verify-run').click();
  const result = page.getByTestId('verify-result');
  await expect(result).toHaveClass(/verified/, { timeout: 30_000 });
  await expect(page.getByTestId('keccak-match')).toHaveText('true');
  await expect(page.getByTestId('sha256-match')).toHaveText('true');
  await expect(result).toContainText('true');

  // An unknown hash is honestly not-anchored; nothing is fetched.
  await page.getByTestId('verify-input').fill(fixture.unknownHash);
  await page.getByTestId('verify-run').click();
  await expect(result).toHaveClass(/not-anchored/, { timeout: 30_000 });
  await expect(result).toContainText('No commitment with this hash exists on this registry.');

  // Chain says one set of digests, the gateway serves different bytes: both
  // comparisons must fail.
  await page.getByTestId('verify-input').fill(fixture.tampered.commitmentHash);
  await page.getByTestId('verify-run').click();
  await expect(result).toHaveClass(/content-mismatch/, { timeout: 30_000 });
  await expect(page.getByTestId('keccak-match')).toHaveText('false');
  await expect(page.getByTestId('sha256-match')).toHaveText('false');

  // Bytes still match, but the commitment was retracted on-chain.
  await page.getByTestId('verify-input').fill(fixture.retracted.commitmentHash);
  await page.getByTestId('verify-run').click();
  await expect(result).toHaveClass(/retracted/, { timeout: 30_000 });
  await expect(result).toContainText(
    'Content matches, but this memory was retracted on-chain.',
  );

  // The node is deep but the commitment read fails: the surface must report
  // an error rather than a pass.
  await page.getByTestId('verify-input').fill(fixture.error.commitmentHash);
  await page.getByTestId('verify-run').click();
  await expect(result).toHaveClass(/error/, { timeout: 30_000 });
  await expect(page.getByTestId('keccak-match')).toHaveText('—');
});
