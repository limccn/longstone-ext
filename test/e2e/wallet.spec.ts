import { expect, test } from './extension.js';
import {
  addPrivateKeyAccount,
  changePassword,
  createWallet,
  derivePrivateKeyAtPath,
  exportPrivateKey,
  exportRecoveryPhrase,
  firePageHide,
  lockWallet,
  openAccountDetails,
  removeWalletRecord,
  readWalletRecord,
  setVisibility,
  TEST_PASSWORD,
  NEW_PASSWORD,
  TEST_PRIVATE_KEY,
  TEST_PRIVATE_KEY_ADDRESS,
  unlockWallet,
  writeWalletRecord,
} from './walletActions.js';

test('boots on a fresh profile with the Wallet tab and no vault', async ({ sidePanel }) => {
  await expect(sidePanel.getByTestId('wallet-welcome')).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute('aria-label', 'No wallet');
  await expect(sidePanel.getByTestId('wallet-tab')).toHaveClass(/on/);
});

test('creates a wallet, locks, rejects a wrong password and unlocks', async ({ sidePanel }) => {
  const created = await createWallet(sidePanel);
  await expect(sidePanel.getByTestId('wallet-account-item')).toHaveCount(1);
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet unlocked',
  );

  await lockWallet(sidePanel);
  await expect(sidePanel.getByTestId('wallet-unlock-password')).toBeVisible();
  // The locked view must not leak the address, account count or label (A-1).
  await expect(sidePanel.getByText(created.address)).toHaveCount(0);
  await expect(sidePanel.getByTestId('wallet-account-item')).toHaveCount(0);
  await expect(sidePanel.getByText('Account 1')).toHaveCount(0);

  await sidePanel.getByTestId('wallet-unlock-password').fill('definitely-wrong-password');
  await sidePanel.getByTestId('wallet-unlock').click();
  await expect(sidePanel.getByTestId('wallet-unlock-error')).toHaveText(
    'Wrong password, or the vault data is damaged.',
    { timeout: 60_000 },
  );
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet locked',
  );

  await unlockWallet(sidePanel);
  await expect(sidePanel.getByTestId('wallet-account-item')).toHaveCount(1);

  // The header lock is the same lifecycle path as the in-view button.
  await sidePanel.getByTestId('wallet-lock-global').click();
  await expect(sidePanel.getByTestId('wallet-unlock-password')).toBeVisible();
});

test('adds an imported account and exports the same secrets', async ({ sidePanel }) => {
  const created = await createWallet(sidePanel);
  await addPrivateKeyAccount(sidePanel);
  await expect(sidePanel.getByTestId('wallet-account-item')).toHaveCount(2);
  await expect(sidePanel.getByText('Account added.')).toBeVisible();

  // Imported private key: its own key, no recovery phrase.
  await openAccountDetails(sidePanel, 1);
  await expect(sidePanel.getByText(TEST_PRIVATE_KEY_ADDRESS)).toBeVisible();
  await expect(sidePanel.getByRole('button', { name: 'Export recovery phrase' })).toBeDisabled();
  const exportedKey = await exportPrivateKey(sidePanel);
  expect(exportedKey.toLowerCase()).toBe(TEST_PRIVATE_KEY);

  await sidePanel.getByRole('button', { name: 'Back' }).click();
  await expect(sidePanel.getByTestId('wallet-account-list')).toBeVisible();

  // Created account: the recovery phrase round-trips, and the exported private
  // key is exactly the key at m/44'/60'/0'/0/0 (DR-09).
  await openAccountDetails(sidePanel, 0);
  const exportedPhrase = await exportRecoveryPhrase(sidePanel);
  expect(exportedPhrase).toBe(created.phrase);
  const derivedKey = await exportPrivateKey(sidePanel);
  expect(derivedKey).toBe(derivePrivateKeyAtPath(created.phrase));
});

test('changes the password and rejects the old one afterwards', async ({ sidePanel }) => {
  await createWallet(sidePanel);
  await changePassword(sidePanel, TEST_PASSWORD, NEW_PASSWORD);
  await expect(sidePanel.getByText('Password changed.')).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet unlocked',
  );

  await lockWallet(sidePanel);
  await sidePanel.getByTestId('wallet-unlock-password').fill(TEST_PASSWORD);
  await sidePanel.getByTestId('wallet-unlock').click();
  await expect(sidePanel.getByTestId('wallet-unlock-error')).toHaveText(
    'Wrong password, or the vault data is damaged.',
    { timeout: 60_000 },
  );
  await expect(sidePanel.getByTestId('wallet-account-list')).toHaveCount(0);

  await unlockWallet(sidePanel, NEW_PASSWORD);
});

test('locks immediately when hidden and on pagehide, regardless of the idle switch', async ({
  sidePanel,
}) => {
  await createWallet(sidePanel);

  // Turning the idle timer off is a self-write; it must not lock on its own.
  // The controlled checkbox only flips after the asynchronous vault save, so
  // click and poll rather than using Playwright's synchronous `uncheck`.
  const idle = sidePanel.getByTestId('wallet-idle-toggle');
  await expect(idle).toBeChecked();
  await idle.click();
  await expect(idle).not.toBeChecked({ timeout: 10_000 });
  await sidePanel.waitForTimeout(500);
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet unlocked',
  );

  await setVisibility(sidePanel, 'hidden');
  await expect(sidePanel.getByTestId('wallet-unlock-password')).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet locked',
  );

  await setVisibility(sidePanel, 'visible');
  await unlockWallet(sidePanel);

  await firePageHide(sidePanel);
  await expect(sidePanel.getByTestId('wallet-unlock-password')).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet locked',
  );
});

test('does not restore an unlock whose KDF resolved after the panel was hidden (DR-19)', async ({
  sidePanel,
}) => {
  await createWallet(sidePanel);
  await lockWallet(sidePanel);

  // Schedule the visibility event before the click; Argon2id blocks the main
  // thread, so this is the only way to hide the panel while the KDF is in
  // flight. Whether the timer lands during or just after the KDF, the result
  // must not survive as an unlocked panel.
  await sidePanel.evaluate(() => {
    window.setTimeout(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, 0);
  });
  await sidePanel.getByTestId('wallet-unlock-password').fill(TEST_PASSWORD);
  await sidePanel.getByTestId('wallet-unlock').click();

  await sidePanel.waitForTimeout(4_000);
  await expect(sidePanel.getByTestId('wallet-unlock-password')).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-account-list')).toHaveCount(0);
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet locked',
  );
});

test('does not restore an unlock that spans a hide-and-show during the KDF (DR-19 epoch)', async ({
  sidePanel,
}) => {
  await createWallet(sidePanel);
  await lockWallet(sidePanel);

  // Wrap the next storage read so the hidden→visible pair fires inside the
  // unlock attempt: after the epoch is captured, before its result is checked.
  // The panel is visible again when the KDF resolves, so the final visibility
  // check alone cannot reject the result — only the synchronous hidden-epoch
  // bump can.
  await sidePanel.evaluate(() => {
    const api = (globalThis as unknown as {
      chrome: { storage: { local: { get(keys: string[]): Promise<Record<string, unknown>> } } };
    }).chrome;
    const original = api.storage.local.get.bind(api.storage.local);
    const show = (state: 'hidden' | 'visible'): void => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    let fired = false;
    Object.defineProperty(api.storage.local, 'get', {
      configurable: true,
      value: async (keys: string[]) => {
        const result = await original(keys);
        if (!fired) {
          fired = true;
          show('hidden');
          show('visible');
        }
        return result;
      },
    });
  });

  await sidePanel.getByTestId('wallet-unlock-password').fill(TEST_PASSWORD);
  await sidePanel.getByTestId('wallet-unlock').click();

  await sidePanel.waitForTimeout(4_000);
  await expect(sidePanel.getByTestId('wallet-unlock-password')).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-account-list')).toHaveCount(0);
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet locked',
  );
});

test('does not adopt an unlock that was in flight when another instance wrote the record (DR-19 epoch)', async ({
  sidePanel,
}) => {
  await createWallet(sidePanel);
  await lockWallet(sidePanel);
  const record = await readWalletRecord(sidePanel);
  const external = { ...record, updatedAt: Number(record['updatedAt'] ?? 0) + 1 };
  await sidePanel.evaluate((value) => {
    const api = (globalThis as unknown as {
      chrome: { storage: { local: { set(items: Record<string, unknown>): Promise<void> } } };
    }).chrome;
    document.querySelector('[data-testid="wallet-unlock"]')?.addEventListener(
      'click',
      () => {
        // Bypasses the vault adapter on purpose: the change guard must treat
        // this exactly like another extension context's write.
        void api.storage.local.set({ 'longstone-ext.wallet.v1': value });
      },
      { once: true, capture: true },
    );
  }, external);
  await sidePanel.getByTestId('wallet-unlock-password').fill(TEST_PASSWORD);
  await sidePanel.getByTestId('wallet-unlock').click();

  await sidePanel.waitForTimeout(4_000);
  await expect(sidePanel.getByTestId('wallet-unlock-password')).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-account-list')).toHaveCount(0);
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet locked',
  );

  // The ciphertext was untouched, so the new record is still unlockable.
  await unlockWallet(sidePanel);
});

test('ignores its own write, locks on an external write, and shows NO_VAULT after external delete', async ({
  sidePanel,
  helper,
}) => {
  await createWallet(sidePanel);

  // DR-01: a save from this panel (rename) must not be mistaken for another
  // window and must leave the vault unlocked.
  const row = sidePanel.getByTestId('wallet-account-item').first();
  await row.getByRole('button', { name: 'Rename' }).click();
  await sidePanel.getByTestId('wallet-rename-input').fill('Primary account');
  await sidePanel.getByTestId('wallet-rename-save').click();
  await expect(sidePanel.getByText('Account renamed.')).toBeVisible();
  await sidePanel.waitForTimeout(1_000);
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet unlocked',
  );
  await expect(sidePanel.getByTestId('wallet-account-list')).toBeVisible();

  // Another extension context writes the same key with a changed value.
  const record = await readWalletRecord(sidePanel);
  const external = { ...record, updatedAt: Number(record['updatedAt'] ?? 0) + 1 };
  await writeWalletRecord(helper, external);
  await expect(sidePanel.getByTestId('wallet-unlock-password')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    sidePanel.getByText('The wallet was changed in another window. Unlock again.'),
  ).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute(
    'aria-label',
    'Wallet locked',
  );

  // The ciphertext is untouched, so the same password still unlocks.
  await unlockWallet(sidePanel);

  // External delete: lock callback reloads and lands on NO_VAULT, not a
  // corrupt or stale LOCKED screen.
  await removeWalletRecord(helper);
  await expect(sidePanel.getByTestId('wallet-welcome')).toBeVisible({
    timeout: 30_000,
  });
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute('aria-label', 'No wallet');
});

test('deletes the last account only after confirmation and returns to NO_VAULT', async ({
  sidePanel,
}) => {
  await createWallet(sidePanel);

  await sidePanel
    .getByTestId('wallet-account-item')
    .first()
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(sidePanel.getByTestId('wallet-delete-dialog')).toBeVisible();
  const confirm = sidePanel.getByTestId('wallet-delete-confirm');
  await expect(confirm).toBeDisabled();
  await sidePanel.getByTestId('wallet-delete-last-confirm').check();
  await confirm.click();

  await expect(sidePanel.getByTestId('wallet-welcome')).toBeVisible();
  await expect(sidePanel.getByText('Wallet removed from this browser.')).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute('aria-label', 'No wallet');

  const record = await sidePanel.evaluate(async () => {
    const api = (globalThis as unknown as {
      chrome: { storage: { local: { get(keys: string[]): Promise<Record<string, unknown>> } } };
    }).chrome;
    return api.storage.local.get([
      'longstone-ext.wallet.v1',
      'longstone-ext.wallet.v1.pending',
    ]);
  });
  expect(record).toEqual({});
});

test('resets a locked wallet after typing RESET', async ({ sidePanel }) => {
  await createWallet(sidePanel);
  await lockWallet(sidePanel);

  await sidePanel.getByTestId('wallet-forgot').click();
  await expect(sidePanel.getByText('No password recovery')).toBeVisible();
  await sidePanel.getByTestId('wallet-reset').click();
  await expect(sidePanel.getByTestId('wallet-reset-dialog')).toBeVisible();
  const reset = sidePanel.getByTestId('wallet-reset-confirm');
  await expect(reset).toBeDisabled();
  await sidePanel.getByTestId('wallet-reset-input').fill('RESET');
  await reset.click();

  await expect(sidePanel.getByTestId('wallet-welcome')).toBeVisible();
  await expect(sidePanel.getByText('Wallet reset.')).toBeVisible();
  await expect(sidePanel.getByTestId('wallet-status')).toHaveAttribute('aria-label', 'No wallet');
});
