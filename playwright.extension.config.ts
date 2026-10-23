import path from 'node:path';
import { defineConfig } from '@playwright/test';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '.output/chrome-mv3');

/**
 * Extension E2E (implement.md Phase E).
 *
 * `channel: 'chromium'` is required: the branded Chrome channel no longer
 * accepts `--load-extension` during automated runs. The persistent-context
 * launch itself lives in `test/e2e/extension.ts`; the config pins the runner
 * options shared by every spec.
 */
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    },
  },
});
