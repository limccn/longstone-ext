/**
 * Settings validation parity with `longstone-ui/src/settings/store.ts`
 * (implement.md Phase D, fallback option).
 *
 * Moving `validateUrl` / `validateAddress` into `@limccn/longstone-surface`
 * would edit a repository outside this task's scope, so this test mirrors the
 * UI's validator case table instead. The table is intentionally duplicated:
 * if either side changes a verdict, one of the suites fails and the divergence
 * is reviewed rather than silently accepted.
 *
 * Known intentional extensions on the extension side (not parity failures):
 *   - wildcard hosts are rejected because they are match patterns, not
 *     endpoints (PS-7); the UI does not request host permissions;
 *   - `ownerAddress` is an extension-only Settings field;
 *   - stored chunk sizes must already be integers.
 */
import { describe, expect, it } from 'vitest';
import { validateAddress, validateUrl } from '../src/lib/settings.js';

const URL_CASES: ReadonlyArray<{ input: string; ok: boolean; value?: string }> = [
  { input: 'https://sepolia.base.org', ok: true, value: 'https://sepolia.base.org' },
  { input: '  https://example.org  ', ok: true, value: 'https://example.org' },
  { input: 'http://localhost:8545', ok: true, value: 'http://localhost:8545' },
  { input: 'http://127.0.0.1:8545', ok: true, value: 'http://127.0.0.1:8545' },
  { input: 'http://[::1]:8545', ok: true, value: 'http://[::1]:8545' },
  { input: 'http://rpc.example.org', ok: false },
  { input: 'ftp://example.org', ok: false },
  { input: 'javascript:alert(1)', ok: false },
  { input: 'not a url', ok: false },
  { input: '', ok: false },
];

const ADDRESS_CASES: ReadonlyArray<{ input: string; ok: boolean }> = [
  { input: `0x${'a'.repeat(40)}`, ok: true },
  { input: `0x${'A'.repeat(40)}`, ok: true },
  { input: `0x${'aA'.repeat(20)}`, ok: true },
  { input: `0x${'a'.repeat(39)}`, ok: false },
  { input: `0x${'a'.repeat(41)}`, ok: false },
  { input: `${'a'.repeat(40)}`, ok: false },
  { input: `0x${'g'.repeat(40)}`, ok: false },
  { input: '', ok: false },
];

describe('settings validation parity (mirrored longstone-ui table)', () => {
  it('agrees with the UI on every URL verdict', () => {
    for (const item of URL_CASES) {
      const result = validateUrl(item.input);
      expect(result.ok, item.input).toBe(item.ok);
      if (result.ok && item.value !== undefined) expect(result.value).toBe(item.value);
    }
  });

  it('agrees with the UI on every address verdict', () => {
    for (const item of ADDRESS_CASES) {
      expect(validateAddress(item.input).ok, item.input).toBe(item.ok);
    }
  });

  it('accepts empty values only when the caller allows them, on both paths', () => {
    expect(validateUrl('', { allowEmpty: true })).toEqual({ ok: true, value: '' });
    expect(validateAddress('', { allowEmpty: true })).toEqual({ ok: true, value: '' });
    expect(validateUrl('').ok).toBe(false);
    expect(validateAddress('').ok).toBe(false);
  });

  it('stays stricter than the UI on wildcard hosts (documented divergence)', () => {
    expect(validateUrl('https://*.example.org').ok).toBe(false);
    expect(validateUrl('https://*').ok).toBe(false);
  });
});
