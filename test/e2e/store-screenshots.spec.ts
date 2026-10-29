/**
 * Store screenshot capture (manual, not part of the regular E2E gate).
 *
 * Generates the Chrome Web Store / Edge Add-ons screenshots from the real
 * 0.2.0 build loaded by the extension fixture. The panel is captured at its
 * natural side-panel width; the remaining 1280x800 canvas is a decorative
 * backdrop, not simulated UI. Run with:
 *
 *   STORE_SCREENSHOTS=1 pnpm exec playwright test \
 *     -c playwright.extension.config.ts test/e2e/store-screenshots.spec.ts
 *
 * The chain fixture (`test/e2e/.chain.json`) must be current; `pnpm e2e`
 * creates it. No assertion in the existing suites is changed by this file.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from './extension.js';
import { extensionPageUrl } from './extension.js';
import {
  loadChainFixture,
  readVerifySettings,
  SETTINGS_STORAGE_KEY,
} from './chainFixture.js';
import { createWallet, lockWallet, writeExtensionStorage } from './walletActions.js';

const ENABLED = process.env['STORE_SCREENSHOTS'] === '1';
const FRAME = process.env['STORE_FRAME'] !== '0';
const ASSETS = path.resolve(import.meta.dirname, '..', '..', 'store', 'assets');

const CORS_HEADERS = { 'access-control-allow-origin': '*' } as const;

test.skip(!ENABLED, 'set STORE_SCREENSHOTS=1 to regenerate store screenshots');

test('captures the 0.2.0 store screenshots', async ({
  context,
  extensionId,
  helper,
}) => {
  const fixture = loadChainFixture();
  await writeExtensionStorage(helper, SETTINGS_STORAGE_KEY, readVerifySettings(fixture));

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  // Capture the product's dark presentation; the panel also supports light.
  await page.emulateMedia({ colorScheme: 'dark' });

  // Serve the fixture bytes for every CID the read/verify journey touches.
  const bodies = new Map<string, string>([
    [fixture.active.cid, fixture.active.canonical],
    [fixture.tampered.cid, fixture.tampered.served],
    [fixture.retracted.cid, fixture.retracted.canonical],
    [fixture.error.cid, fixture.error.canonical],
  ]);
  await page.route('**/ipfs/**', async (route) => {
    const cid = route.request().url().split('/').pop() ?? '';
    const body = bodies.get(cid);
    await route.fulfill(
      body === undefined
        ? { status: 404, headers: CORS_HEADERS, contentType: 'text/plain', body: 'not found' }
        : {
            status: 200,
            headers: CORS_HEADERS,
            contentType: 'application/octet-stream',
            body,
          },
    );
  });

  await page.goto(extensionPageUrl(extensionId, 'sidepanel.html'));

  if (FRAME) {
    const logoSvg = await readFile(path.join(ASSETS, 'icon-source.svg'), 'utf8');
    await page.addStyleTag({
      content: `
        html { background: radial-gradient(900px 700px at 30% 40%, #16243a 0%, #0b0e13 62%); }
        body { background: var(--bg); }
        #root {
          width: 420px;
          margin-left: auto;
          height: 100vh;
          border-left: 1px solid #273043;
          box-shadow: -24px 0 60px rgba(0, 0, 0, 0.55);
          position: relative;
          z-index: 1;
        }
        #store-hero {
          position: fixed;
          inset: 0 calc(100% - 420px) 0 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 48px;
          pointer-events: none;
        }
        #store-hero svg { width: 220px; height: 220px; filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.45)); }
        #store-hero .hero-word {
          font-size: 34px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #e8edf6;
        }
        #store-hero .hero-line {
          font-size: 13px;
          color: #8b97ab;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
      `,
    });
    await page.evaluate(({ svg }) => {
      const hero = document.createElement('div');
      hero.id = 'store-hero';
      hero.innerHTML =
        svg +
        '<div class="hero-word">longstone</div>' +
        '<div class="hero-line">MemoryOverEth side panel</div>';
      document.body.prepend(hero);
    }, { svg: logoSvg });
  }

  // Timeline: the scan starts automatically from the settings owner.
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByTestId('timeline-list')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('timeline-empty')).toHaveCount(0);
  await page.screenshot({ path: path.join(ASSETS, 'screenshot-01-timeline.png') });

  // Detail: the active, verified memory. The detail view is not a store asset
  // because the 0.2.0 Tx link overflows a 420 px side panel; the row click is
  // still the real navigation path into Verify.
  const row = page.locator(
    `button.memory-main[title="${fixture.active.commitmentHash}"]`,
  );
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('detail')).toBeVisible();

  // Verify: the real chain + real hashes produce a verified verdict.
  await page.getByRole('button', { name: 'Verify content' }).click();
  await expect(page.getByTestId('verify-input')).toHaveValue(fixture.active.commitmentHash);
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-result')).toHaveClass(/verified/, {
    timeout: 30_000,
  });
  await page.screenshot({ path: path.join(ASSETS, 'screenshot-02-verify.png') });

  // Wallet: the fresh profile's welcome screen.
  await page.getByTestId('wallet-tab').click();
  await expect(page.getByTestId('wallet-welcome')).toBeVisible();
  await page.screenshot({ path: path.join(ASSETS, 'screenshot-03-wallet-welcome.png') });

  // Wallet: a real generated account, then the locked unlock prompt.
  await createWallet(page);
  await expect(page.getByTestId('wallet-account-list')).toBeVisible();
  await page.screenshot({ path: path.join(ASSETS, 'screenshot-04-wallet-accounts.png') });
  await lockWallet(page);
  await page.screenshot({ path: path.join(ASSETS, 'screenshot-05-wallet-locked.png') });
});
