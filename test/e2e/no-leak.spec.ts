/**
 * Design §8.2 anti-leak assertions.
 *
 * The canaries are generated at runtime: the recovery phrase comes from the
 * extension's CSPRNG and the private key is derived at the fixed path. Nothing
 * here is a fixture that could accidentally match a hard-coded exception.
 */
import { expect, test } from './extension.js';
import {
  createWallet,
  derivePrivateKeyAtPath,
  dumpStorage,
  openAccountDetails,
  phraseFragments,
  readWalletRecord,
  TEST_PASSWORD,
  type StorageDump,
} from './walletActions.js';

interface CollectedString {
  path: string;
  value: string;
}

function collectStrings(value: unknown, prefix = ''): CollectedString[] {
  if (typeof value === 'string') return [{ path: prefix, value }];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectStrings(entry, `${prefix}[${String(index)}]`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      collectStrings(entry, prefix === '' ? key : `${prefix}.${key}`),
    );
  }
  return [];
}

function assertNoPlaintext(
  text: string,
  phrase: string,
  fragments: readonly string[],
  privateKey: string,
  label: string,
): void {
  expect(text, `${label}: full phrase`).not.toContain(phrase);
  for (const fragment of fragments) {
    expect(text, `${label}: fragment "${fragment}"`).not.toContain(fragment);
  }
  expect(text.toLowerCase(), `${label}: private key`).not.toContain(
    privateKey.replace(/^0x/, '').toLowerCase(),
  );
}

test('storage and DOM never hold the phrase, a 4-word fragment, or the private key', async ({
  sidePanel,
}) => {
  // AC-18: nothing the wallet renders may also reach the console. Collect for
  // the whole flow and assert at the end, next to the DOM/storage dumps.
  const consoleText: string[] = [];
  sidePanel.on('console', (message) => {
    consoleText.push(message.text());
  });
  sidePanel.on('pageerror', (error) => {
    consoleText.push(error.message);
  });

  // Liveness: a page-level message must reach the collector, otherwise the
  // "no secret in the console" assertion at the end would be vacuous.
  await sidePanel.evaluate(() => {
    console.log('no-leak-canary: console listener attached');
  });
  await expect
    .poll(() => consoleText.some((line) => line.includes('no-leak-canary')))
    .toBe(true);

  const created = await createWallet(sidePanel);
  const privateKey = derivePrivateKeyAtPath(created.phrase);
  const fragments = phraseFragments(created.words);

  const before = await dumpStorage(sidePanel);
  for (const area of ['extension', 'localStorage', 'indexedDb'] as const satisfies ReadonlyArray<
    keyof StorageDump
  >) {
    assertNoPlaintext(before[area], created.phrase, fragments, privateKey, `${area} (fresh)`);
  }

  const record = await readWalletRecord(sidePanel);
  expect(record['format']).toBe('longstone.wallet.v1');
  expect(record['version']).toBe(1);
  const strings = collectStrings(record);
  const ciphertext = strings.find((entry) => entry.path === 'cipher.ciphertext');
  expect(ciphertext, 'cipher.ciphertext present').toBeDefined();
  expect(ciphertext?.value.length ?? 0).toBeGreaterThan(100);
  expect(ciphertext?.value ?? '').toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  for (const entry of strings) {
    if (entry.path === 'cipher.ciphertext') continue;
    // salt (24 chars), iv (16), alg names, format and domain are all short.
    expect(entry.value.length, `unexpected long string at ${entry.path}`).toBeLessThanOrEqual(80);
  }

  let html = await sidePanel.content();
  assertNoPlaintext(html, created.phrase, fragments, privateKey, 'DOM after creation');

  // The recovery phrase must be gone from the completion screen and details.
  await openAccountDetails(sidePanel, 0);
  html = await sidePanel.content();
  assertNoPlaintext(html, created.phrase, fragments, privateKey, 'DOM on account details');

  // Password check → risk admission → masked secret. The plaintext must not be
  // in the DOM until the explicit reveal button is pressed.
  await sidePanel.getByRole('button', { name: 'Export private key' }).click();
  await sidePanel.getByTestId('wallet-export-password').fill(TEST_PASSWORD);
  await sidePanel.getByTestId('wallet-export-verify').click();
  await expect(sidePanel.getByTestId('wallet-export-reveal-admit')).toBeVisible({
    timeout: 60_000,
  });
  await sidePanel.getByTestId('wallet-export-reveal-admit').click();
  await expect(sidePanel.getByTestId('wallet-export-secret')).toContainText('••••');
  html = await sidePanel.content();
  assertNoPlaintext(html, created.phrase, fragments, privateKey, 'DOM before reveal');

  await sidePanel.getByTestId('wallet-export-reveal').click();
  const shown =
    (await sidePanel.getByTestId('wallet-export-secret').locator('p.mono').textContent())?.trim() ??
    '';
  expect(shown).toBe(privateKey);
  expect(await sidePanel.content()).toContain(privateKey);

  await sidePanel.getByTestId('wallet-export-done').click();
  await expect(sidePanel.getByTestId('wallet-export-dialog')).toHaveCount(0);
  html = await sidePanel.content();
  assertNoPlaintext(html, created.phrase, fragments, privateKey, 'DOM after export closed');

  // Closing the dialog must also have dropped the plaintext from component
  // state; a second dump proves exports never persist anything.
  const after = await dumpStorage(sidePanel);
  for (const area of ['extension', 'localStorage', 'indexedDb'] as const satisfies ReadonlyArray<
    keyof StorageDump
  >) {
    assertNoPlaintext(after[area], created.phrase, fragments, privateKey, `${area} (after export)`);
  }

  // The console canary covers the same window as the DOM/storage checks.
  assertNoPlaintext(consoleText.join('\n'), created.phrase, fragments, privateKey, 'console');
});
