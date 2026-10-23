/**
 * The only module that touches `browser.*` directly.
 *
 * Everything else takes the seams defined here, which is what lets the tests
 * exercise validation, links and settings without a browser. Imports use
 * `wxt/browser` (a thin alias for the WebExtension API) so the same code would
 * run on any Chromium target WXT supports.
 */
import { browser } from 'wxt/browser';
import {
  SETTINGS_STORAGE_KEY,
  createSettingsStore,
  type KeyValueArea,
  type SettingsStore,
} from './settings.js';
import type { CacheArea } from './indexCache.js';
import type { PermissionsApi } from './permissions.js';
import {
  createWalletChangeGuard,
} from './wallet/changeGuard.js';
import type { StorageKeys, WalletStorage } from './wallet/vault.js';

export const storageArea: KeyValueArea = {
  async get(key) {
    return (await browser.storage.local.get(key)) as Record<string, unknown>;
  },
  async set(items) {
    await browser.storage.local.set(items);
  },
};

export const cacheArea: CacheArea = {
  get: storageArea.get,
  set: storageArea.set,
  async remove(key) {
    await browser.storage.local.remove(key);
  },
};

export const settingsStore: SettingsStore = createSettingsStore(storageArea);

/**
 * Wallet storage keys. These literals live here and nowhere else: the wallet
 * core takes keys by injection, which keeps it browser-free and lets a stray
 * key literal fail the purity gate.
 */
export const WALLET_STORAGE_KEYS: StorageKeys = {
  record: 'longstone-ext.wallet.v1',
  pending: 'longstone-ext.wallet.v1.pending',
};

/**
 * Chromium delivers `storage.onChanged` to the writer as well as to other
 * pages. The guard records each serialized value this instance is about to
 * write, so the listener can ignore its own events; otherwise every save would
 * lock the vault that just made it (DR-01).
 */
const walletChangeGuard = createWalletChangeGuard(WALLET_STORAGE_KEYS);

export const walletStorage: WalletStorage = {
  get: storageArea.get,
  async set(items) {
    for (const [key, value] of Object.entries(items)) {
      walletChangeGuard.noteWrite(key, value);
    }
    await browser.storage.local.set(items);
  },
  async remove(key) {
    walletChangeGuard.noteRemove(key);
    await browser.storage.local.remove(key);
  },
};

export interface WalletStorageChange {
  key: string;
  /** `undefined` means the key was removed. */
  newValue: unknown;
}

/**
 * Subscribes to wallet-record changes that did not originate in this page.
 * The side panel locks on any external write and re-reads the record; an
 * external delete simply becomes `NO_VAULT` after the reload.
 */
export function onWalletStorageChanged(
  callback: (change: WalletStorageChange) => void,
): () => void {
  const listened: readonly string[] = [WALLET_STORAGE_KEYS.record, WALLET_STORAGE_KEYS.pending];
  const listener = (changes: Record<string, unknown>, areaName: string): void => {
    if (areaName !== 'local') return;
    for (const key of listened) {
      if (!(key in changes)) continue;
      const raw = changes[key] as { newValue?: unknown } | undefined;
      const newValue = raw?.newValue;
      if (walletChangeGuard.classify(key, newValue) === 'self') continue;
      callback({ key, newValue });
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export const permissionsApi: PermissionsApi = {
  async contains(permissions) {
    return browser.permissions.contains(permissions);
  },
  async request(permissions) {
    return browser.permissions.request(permissions);
  },
};

/**
 * Sends the user to a validated URL in a new tab.
 *
 * The URL comes from `deepLinks.ts`, which validates before construction.
 * `window.open` is unavailable/undesirable in a side panel, and `tabs.create`
 * does not require the `tabs` permission (that permission only grants reading
 * tab metadata).
 */
export async function openExternal(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error(`refusing to open a non-https URL: ${url}`);
  }
  await browser.tabs.create({ url: parsed.toString() });
}

/** Opens the extension's options page. Needs no permission. */
export async function openOptionsPage(): Promise<void> {
  await browser.runtime.openOptionsPage();
}

/**
 * Subscribes to `chrome.storage.local` changes so a save in the options page
 * refreshes an already-open side panel.
 */
export function onLocalStorageChanged(callback: () => void): () => void {
  const listener = (changes: Record<string, unknown>, areaName: string): void => {
    // The scan cache also lives in storage and is written once per slice;
    // only a settings write should trigger a settings reload.
    if (areaName === 'local' && SETTINGS_STORAGE_KEY in changes) callback();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
