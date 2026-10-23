/**
 * PS-7 regression: host access is requested per configured origin.
 *
 * The runtime path must never ask for `<all_urls>` or a wildcard host, even
 * if a caller passes one; and the manifest's optional list must be something
 * a user grants one entry at a time.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  hasOrigin,
  originPatternFor,
  requestOrigin,
  requestOrigins,
  type PermissionsApi,
} from '../src/lib/permissions.js';

function fakeApi(contained: string[] = [], grant = true): PermissionsApi & {
  requests: string[][];
} {
  const requests: string[][] = [];
  return {
    requests,
    async contains(permissions) {
      return (permissions.origins ?? []).every((origin) => contained.includes(origin));
    },
    async request(permissions) {
      requests.push(permissions.origins ?? []);
      return grant;
    },
  };
}

describe('requestOrigin', () => {
  it('asks for exactly the one origin', async () => {
    const api = fakeApi();
    const result = await requestOrigin(api, 'https://rpc.example.org/*');
    expect(api.requests).toEqual([['https://rpc.example.org/*']]);
    expect(result).toEqual({
      origin: 'https://rpc.example.org/*',
      granted: true,
      alreadyGranted: false,
    });
  });

  it('does not prompt when the origin is already granted', async () => {
    const api = fakeApi(['https://rpc.example.org/*']);
    const result = await requestOrigin(api, 'https://rpc.example.org/*');
    expect(api.requests).toEqual([]);
    expect(result).toEqual({
      origin: 'https://rpc.example.org/*',
      granted: true,
      alreadyGranted: true,
    });
  });

  it('reports a denial without throwing', async () => {
    const api = fakeApi([], false);
    const result = await requestOrigin(api, 'https://rpc.example.org/*');
    expect(result.granted).toBe(false);
  });

  it.each(['<all_urls>', '*://*/*', 'https://*/*', 'http://*/*', 'https://*.example.org/*'])(
    'refuses the broad pattern %s',
    async (pattern) => {
      const api = fakeApi();
      await expect(requestOrigin(api, pattern)).rejects.toThrow(/broad|wildcard|single-origin/);
      expect(api.requests).toEqual([]);
    },
  );

  it('refuses a bare host or path without the wildcard tail', async () => {
    const api = fakeApi();
    await expect(requestOrigin(api, 'https://rpc.example.org')).rejects.toThrow();
  });
});

describe('requestOrigins', () => {
  it('asks for the configured set in one prompt', async () => {
    const api = fakeApi();
    const result = await requestOrigins(api, [
      'https://rpc.example.org/*',
      'https://gateway.example.org/*',
      'https://rpc.example.org/*',
    ]);
    expect(api.requests).toEqual([
      ['https://rpc.example.org/*', 'https://gateway.example.org/*'],
    ]);
    expect(result).toEqual({
      origins: ['https://rpc.example.org/*', 'https://gateway.example.org/*'],
      granted: true,
    });
  });

  it('does nothing when there are no configured origins', async () => {
    const api = fakeApi();
    const result = await requestOrigins(api, []);
    expect(api.requests).toEqual([]);
    expect(result).toEqual({ origins: [], granted: true });
  });

  it('rejects the whole request if any entry is broad', async () => {
    const api = fakeApi();
    await expect(
      requestOrigins(api, ['https://rpc.example.org/*', '<all_urls>']),
    ).rejects.toThrow(/broad/);
    expect(api.requests).toEqual([]);
  });
});

describe('originPatternFor', () => {
  it('reduces a configured URL to its host, without a port', () => {
    expect(originPatternFor('https://hisaishi.example.workers.dev/v1')).toBe(
      'https://hisaishi.example.workers.dev/*',
    );
    // Match patterns have no port field; the grant covers all ports.
    expect(originPatternFor('http://127.0.0.1:8787')).toBe('http://127.0.0.1/*');
  });

  it('returns null for blank, invalid, or non-http URLs', () => {
    expect(originPatternFor('')).toBeNull();
    expect(originPatternFor('not a url')).toBeNull();
    expect(originPatternFor('ftp://x.example')).toBeNull();
  });

  it('cannot express an IPv6 loopback as a match pattern', () => {
    expect(originPatternFor('http://[::1]:8545')).toBeNull();
  });
});

describe('hasOrigin', () => {
  it('checks without requesting', async () => {
    const api = fakeApi(['https://rpc.example.org/*']);
    expect(await hasOrigin(api, 'https://rpc.example.org/*')).toBe(true);
    expect(api.requests).toEqual([]);
  });

  it('validates the pattern like requestOrigin', async () => {
    const api = fakeApi();
    await expect(hasOrigin(api, '<all_urls>')).rejects.toThrow();
  });
});

describe('panel wiring never requests permissions itself', () => {
  it('the deep-link origin is opened as a tab, not requested as a permission', async () => {
    // Opening a new tab does not require host access. Only a settings save
    // calls permissions.request; no other module imports the API.
    const { webAppOrigin } = await import('../src/lib/deepLinks.js');
    expect(webAppOrigin()).toBe('https://longstone-ui.pages.dev');
  });
});
