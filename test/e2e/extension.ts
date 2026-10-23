/**
 * Playwright fixture for the built extension.
 *
 * A persistent context is mandatory for extensions; the extension id is read
 * from the background service-worker URL, which avoids hard-coding the id of
 * an unpacked build. Every test gets a fresh profile, so `chrome.storage.local`
 * starts empty and one test cannot unlock another test's vault.
 *
 * `helper` is an options-page tab opened before the side panel. It is a second
 * extension context that can write `chrome.storage.local` without bringing
 * itself to the foreground, which is how the external-write and external-delete
 * cases are driven without also triggering the visibility lock.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  chromium,
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '..', '..', '.output', 'chrome-mv3');

export const EXTENSION_ORIGIN = (extensionId: string): string =>
  `chrome-extension://${extensionId}`;

export function extensionPageUrl(extensionId: string, file: string): string {
  return `${EXTENSION_ORIGIN(extensionId)}/${file}`;
}

interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  helper: Page;
  sidePanel: Page;
}

export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
  context: async ({}, use) => {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'longstone-ext-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    try {
      await use(context);
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  },

  extensionId: async ({ context }, use) => {
    let worker: Worker | undefined = context.serviceWorkers()[0];
    if (worker === undefined) {
      worker = await context.waitForEvent('serviceworker', { timeout: 30_000 });
    }
    await use(new URL(worker.url()).host);
  },

  helper: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(extensionPageUrl(extensionId, 'options.html'));
    await use(page);
  },

  sidePanel: async ({ context, extensionId, helper }, use) => {
    // Opening the side panel second makes it the foreground tab; the helper
    // stays hidden, so writing from it is a pure storage event.
    void helper;
    const page = await context.newPage();
    await page.goto(extensionPageUrl(extensionId, 'sidepanel.html'));
    await use(page);
  },
});

export { expect };
