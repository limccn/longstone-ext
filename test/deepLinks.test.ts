/**
 * PS-8 regression: deep-link construction from chain data.
 *
 * The only dynamic value that may reach a URL is a commitment hash, and it
 * must be validated as `0x` + 64 hex *before* construction and encoded after.
 * A rejected input must produce no URL at all — never a partially built one.
 */
import { describe, expect, it } from 'vitest';
import {
  WEB_APP_BASE,
  aclUrl,
  commitmentUrl,
  retractUrl,
  timelineUrl,
  verifyUrl,
  webAppOrigin,
} from '../src/lib/deepLinks.js';

const HASH = `0x${'ab'.repeat(32)}`;

describe('commitmentUrl', () => {
  it('builds the detail route under the fixed base', () => {
    expect(commitmentUrl(HASH)).toBe(`${WEB_APP_BASE}/commitment/${HASH}`);
  });

  it('rejects a short hash', () => {
    expect(commitmentUrl('0x1234')).toBeNull();
    expect(commitmentUrl(`0x${'ab'.repeat(31)}`)).toBeNull();
  });

  it('rejects a 64-hex value without 0x', () => {
    expect(commitmentUrl('ab'.repeat(32))).toBeNull();
  });

  it('rejects path traversal and query injection attempts', () => {
    expect(commitmentUrl('../settings')).toBeNull();
    expect(commitmentUrl(`${HASH}?x=1`)).toBeNull();
    expect(commitmentUrl(`${HASH}/../acl`)).toBeNull();
    expect(commitmentUrl(`javascript:alert(1)`)).toBeNull();
    // A newline or space cannot hide an over-long string from the regex.
    expect(commitmentUrl(` ${HASH}`)).toBeNull();
    expect(commitmentUrl(`${HASH}\n`)).toBeNull();
  });

  it('keeps the path inside the fixed host for every accepted value', () => {
    const upper = `0x${'AB'.repeat(32)}`;
    const url = commitmentUrl(upper);
    expect(url).toBe(`${WEB_APP_BASE}/commitment/${upper}`);
    expect(new URL(url as string).origin).toBe(webAppOrigin());
  });
});

describe('retractUrl', () => {
  it('opens the retract page with no hash', () => {
    expect(retractUrl()).toBe(`${WEB_APP_BASE}/retract`);
  });

  it('carries a validated hash in the fragment, not the query', () => {
    const url = retractUrl(HASH) as string;
    expect(url).toBe(`${WEB_APP_BASE}/retract#${HASH}`);
    expect(new URL(url).search).toBe('');
    expect(new URL(url).hash).toBe(`#${HASH}`);
  });

  it('returns null for an invalid hash instead of a bare page', () => {
    expect(retractUrl('not-a-hash')).toBeNull();
    expect(retractUrl(`${HASH}?next=/evil`)).toBeNull();
  });
});

describe('verifyUrl', () => {
  it('builds the verify route with and without a hash', () => {
    expect(verifyUrl()).toBe(`${WEB_APP_BASE}/verify`);
    expect(verifyUrl(HASH)).toBe(`${WEB_APP_BASE}/verify#${HASH}`);
  });

  it('rejects invalid hashes', () => {
    expect(verifyUrl('0xzz')).toBeNull();
  });
});

describe('fixed routes', () => {
  it('never interpolates user input', () => {
    expect(timelineUrl()).toBe(`${WEB_APP_BASE}/workspaces`);
    expect(aclUrl()).toBe(`${WEB_APP_BASE}/acl`);
  });

  it('points the timeline at the workspaces route, not the landing page', () => {
    const url = new URL(timelineUrl());
    expect(url.pathname).toBe('/workspaces');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    expect(url.origin).toBe(webAppOrigin());
  });
});

describe('base is not caller-controlled', () => {
  it('exports a constant https base and origin', () => {
    expect(WEB_APP_BASE.startsWith('https://')).toBe(true);
    expect(webAppOrigin()).toBe(new URL(WEB_APP_BASE).origin);
  });
});
