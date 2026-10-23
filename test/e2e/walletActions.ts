/**
 * Shared Playwright actions for the wallet E2E suite.
 *
 * Every helper drives the real UI (no direct vault calls): the suite exists to
 * prove that the rendered flow, the storage adapter and the Argon2id path work
 * together in a loaded extension. Secret material is only read after an
 * explicit reveal, exactly as a user would.
 */
import { expect, type Page } from '@playwright/test';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { bytesToHex } from '@noble/hashes/utils';

export const TEST_PASSWORD = 'correct horse battery staple 2026';
export const NEW_PASSWORD = 'a different correct horse 2026';
export const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
export const TEST_PRIVATE_KEY_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const KDF_TIMEOUT = 60_000;

export interface CreatedWallet {
  phrase: string;
  words: string[];
  address: string;
}

/** Runs F-2 start to the completion screen and returns the generated phrase. */
export async function createWallet(
  page: Page,
  password: string = TEST_PASSWORD,
): Promise<CreatedWallet> {
  await page.getByTestId('wallet-create-start').click();
  await page.getByTestId('wallet-mnemonic-reveal').click();

  const grid = page.locator('.wallet-word-grid');
  await expect(grid).not.toContainText('••••');
  const words = (await grid.locator('.mono').allTextContents()).map((word) => word.trim());
  expect(words).toHaveLength(12);

  await page.getByTestId('wallet-mnemonic-continue').click();
  const prompt =
    (await page
      .locator('p')
      .filter({ hasText: 'Select word' })
      .first()
      .textContent()) ?? '';
  const positions = [...prompt.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
  expect(positions).toHaveLength(4);

  for (const position of positions) {
    const word = words[position - 1];
    expect(word, `word #${String(position)}`).toBeDefined();
    await page.getByTestId(`wallet-word-${String(word)}`).first().click();
  }
  await page.getByTestId('wallet-confirm-continue').click();

  await page.getByTestId('wallet-password-new').fill(password);
  await page.getByTestId('wallet-password-confirm').fill(password);
  await page.getByTestId('wallet-password-submit').click();

  await expect(page.getByTestId('wallet-done')).toBeVisible({ timeout: KDF_TIMEOUT });
  const address =
    (await page.locator('.wallet-view p.mono').first().textContent())?.trim() ?? '';
  expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  await page.getByTestId('wallet-done').click();
  await expect(page.getByTestId('wallet-account-list')).toBeVisible();

  return { phrase: words.join(' '), words, address };
}

export async function lockWallet(page: Page): Promise<void> {
  await page.getByTestId('wallet-lock').click();
  await expect(page.getByTestId('wallet-unlock-password')).toBeVisible();
  await expect(page.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet locked',
  );
}

export async function unlockWallet(
  page: Page,
  password: string = TEST_PASSWORD,
): Promise<void> {
  await page.getByTestId('wallet-unlock-password').fill(password);
  await page.getByTestId('wallet-unlock').click();
  await expect(page.getByTestId('wallet-account-list')).toBeVisible({
    timeout: KDF_TIMEOUT,
  });
  await expect(page.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet unlocked',
  );
}

/** Imports the well-known Hardhat test key through the add-account flow. */
export async function addPrivateKeyAccount(
  page: Page,
  privateKey: string = TEST_PRIVATE_KEY,
): Promise<void> {
  await page.getByTestId('wallet-account-add').click();
  await page.getByTestId('wallet-import-tab-privatekey').click();
  await page.getByTestId('wallet-import-privatekey').fill(privateKey);
  await page.getByTestId('wallet-import-submit').click();
  await expect(page.getByTestId('wallet-address-confirm')).toBeVisible();
  await page.getByTestId('wallet-address-confirm').check();
  await page.getByTestId('wallet-import-submit').click();
  await expect(page.getByTestId('wallet-account-item')).toHaveCount(2, {
    timeout: 30_000,
  });
}

export async function openAccountDetails(page: Page, index: number): Promise<void> {
  const row = page.getByTestId('wallet-account-item').nth(index);
  await row.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByRole('button', { name: 'Export private key' })).toBeVisible();
}

/** Verifies the password, admits the risk, and reveals the private key. */
export async function exportPrivateKey(
  page: Page,
  password: string = TEST_PASSWORD,
): Promise<string> {
  await page.getByRole('button', { name: 'Export private key' }).click();
  await page.getByTestId('wallet-export-password').fill(password);
  await page.getByTestId('wallet-export-verify').click();
  await expect(page.getByTestId('wallet-export-reveal-admit')).toBeVisible({
    timeout: KDF_TIMEOUT,
  });
  await page.getByTestId('wallet-export-reveal-admit').click();
  await expect(page.getByTestId('wallet-export-secret')).toContainText('••••');
  await page.getByTestId('wallet-export-reveal').click();
  const secret =
    (await page.getByTestId('wallet-export-secret').locator('p.mono').textContent())?.trim() ??
    '';
  expect(secret).toMatch(/^0x[0-9a-fA-F]{64}$/);
  await page.getByTestId('wallet-export-done').click();
  await expect(page.getByTestId('wallet-export-dialog')).toHaveCount(0);
  return secret;
}

export async function exportRecoveryPhrase(
  page: Page,
  password: string = TEST_PASSWORD,
): Promise<string> {
  await page.getByRole('button', { name: 'Export recovery phrase' }).click();
  await page.getByTestId('wallet-export-password').fill(password);
  await page.getByTestId('wallet-export-verify').click();
  await expect(page.getByTestId('wallet-export-reveal-admit')).toBeVisible({
    timeout: KDF_TIMEOUT,
  });
  await page.getByTestId('wallet-export-reveal-admit').click();
  await expect(page.getByTestId('wallet-export-secret')).toContainText('••••');
  await page.getByTestId('wallet-export-reveal').click();
  const words = await page
    .getByTestId('wallet-export-secret')
    .locator('ol.wallet-secret-words li')
    .allTextContents();
  expect(words).toHaveLength(12);
  await page.getByTestId('wallet-export-done').click();
  await expect(page.getByTestId('wallet-export-dialog')).toHaveCount(0);
  return words.map((word) => word.trim()).join(' ');
}

export async function changePassword(
  page: Page,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  await page.getByTestId('wallet-change-password-start').click();
  await page.getByTestId('wallet-change-old').fill(currentPassword);
  await page.getByTestId('wallet-change-new').fill(nextPassword);
  await page.getByTestId('wallet-change-confirm').fill(nextPassword);
  await page.getByTestId('wallet-change-submit').click();
  await expect(page.getByTestId('wallet-account-list')).toBeVisible({
    timeout: KDF_TIMEOUT,
  });
}

/** The derived key at the fixed path; test-only, mirrors DR-09. */
export function derivePrivateKeyAtPath(phrase: string): string {
  const seed = mnemonicToSeedSync(phrase);
  const child = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (child.privateKey === null) throw new Error('derivation produced no private key');
  return `0x${bytesToHex(child.privateKey)}`;
}

export interface StorageDump {
  extension: string;
  localStorage: string;
  indexedDb: string;
}

interface ChromeStorageShim {
  storage: {
    local: {
      get(keys: null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    };
  };
}

/** Serializes every persistent store available to the extension page. */
export async function dumpStorage(page: Page): Promise<StorageDump> {
  return page.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ChromeStorageShim }).chrome;
    const serialize = (value: unknown): string =>
      JSON.stringify(value, (_key, entry: unknown) =>
        typeof entry === 'bigint' ? entry.toString() : entry,
      ) ?? 'undefined';

    const extension = serialize(await api.storage.local.get(null));

    const local: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key !== null) local[key] = localStorage.getItem(key) ?? '';
    }

    const indexedDb: Record<string, unknown> = {};
    if (typeof indexedDB.databases === 'function') {
      const databases = await indexedDB.databases();
      for (const info of databases) {
        if (info.name === undefined) continue;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(info.name as string);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const stores: Record<string, unknown[]> = {};
        for (const storeName of [...db.objectStoreNames]) {
          stores[storeName] = await new Promise<unknown[]>((resolve, reject) => {
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result as unknown[]);
            request.onerror = () => reject(request.error);
          });
        }
        indexedDb[db.name] = stores;
        db.close();
      }
    }

    return {
      extension,
      localStorage: serialize(local),
      indexedDb: serialize(indexedDb),
    };
  });
}

/** Four-word sliding windows used as the storage/DOM canary. */
export function phraseFragments(words: readonly string[]): string[] {
  const fragments: string[] = [];
  for (let index = 0; index + 4 <= words.length; index += 1) {
    fragments.push(words.slice(index, index + 4).join(' '));
  }
  return fragments;
}

export async function writeWalletRecord(
  helper: Page,
  value: unknown,
  key = 'longstone-ext.wallet.v1',
): Promise<void> {
  await writeExtensionStorage(helper, key, value);
}

export async function writeExtensionStorage(
  helper: Page,
  key: string,
  value: unknown,
): Promise<void> {
  await helper.evaluate(
    async ({ storageKey, stored }) => {
      const api = (globalThis as unknown as { chrome: ChromeStorageShim }).chrome;
      await api.storage.local.set({ [storageKey]: stored });
    },
    { storageKey: key, stored: value },
  );
}

export async function removeWalletRecord(
  helper: Page,
  key = 'longstone-ext.wallet.v1',
): Promise<void> {
  await helper.evaluate(
    async (storageKey) => {
      const api = (globalThis as unknown as { chrome: ChromeStorageShim }).chrome;
      await api.storage.local.remove(storageKey);
    },
    key,
  );
}

export async function readWalletRecord(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ChromeStorageShim }).chrome;
    const all = await api.storage.local.get(null);
    const record = all['longstone-ext.wallet.v1'];
    if (typeof record !== 'object' || record === null) {
      throw new Error('wallet record missing');
    }
    return record as Record<string, unknown>;
  });
}

/** Overrides the read-only visibility state and fires the real event. */
export async function setVisibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => next,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

export async function firePageHide(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
  });
}
