import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  createSettingsStore,
  originPattern,
  parseStoredSettings,
  validateAddress,
  validateDraft,
  validateUrl,
  type KeyValueArea,
  type Settings,
} from '../src/lib/settings.js';

describe('validateUrl', () => {
  it('accepts https anywhere', () => {
    expect(validateUrl('https://sepolia.base.org')).toEqual({
      ok: true,
      value: 'https://sepolia.base.org',
    });
  });

  it('accepts plain http only on loopback', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(validateUrl(`http://${host}:8545`).ok).toBe(true);
    }
  });

  it('rejects plain http on a remote host', () => {
    const result = validateUrl('http://rpc.example.org');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/https/i);
  });

  it('rejects non-http schemes', () => {
    expect(validateUrl('ftp://example.org').ok).toBe(false);
    expect(validateUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateUrl('file:///etc/passwd').ok).toBe(false);
  });

  it('rejects wildcard hosts, which are match patterns rather than endpoints', () => {
    // The URL parser accepts these; the settings policy must not, or the
    // permission request would be refused after the user clicked Save.
    expect(validateUrl('https://*.example.org').ok).toBe(false);
    expect(validateUrl('https://*').ok).toBe(false);
  });

  it('rejects garbage and empty values unless empty is allowed', () => {
    expect(validateUrl('not a url').ok).toBe(false);
    expect(validateUrl('').ok).toBe(false);
    expect(validateUrl('', { allowEmpty: true })).toEqual({ ok: true, value: '' });
  });

  it('trims surrounding whitespace', () => {
    expect(validateUrl('  https://example.org  ')).toEqual({
      ok: true,
      value: 'https://example.org',
    });
  });
});

describe('validateAddress', () => {
  it('accepts 0x + 40 hex in either case', () => {
    expect(validateAddress(`0x${'a'.repeat(40)}`).ok).toBe(true);
    expect(validateAddress(`0x${'A'.repeat(40)}`).ok).toBe(true);
  });

  it('rejects wrong lengths, a missing 0x, and non-hex', () => {
    expect(validateAddress(`0x${'a'.repeat(39)}`).ok).toBe(false);
    expect(validateAddress(`0x${'a'.repeat(41)}`).ok).toBe(false);
    expect(validateAddress('a'.repeat(40)).ok).toBe(false);
    expect(validateAddress(`0x${'g'.repeat(40)}`).ok).toBe(false);
  });

  it('allows an empty value only when asked', () => {
    expect(validateAddress('').ok).toBe(false);
    expect(validateAddress('', { allowEmpty: true })).toEqual({ ok: true, value: '' });
  });
});

describe('originPattern', () => {
  it('returns the exact host, without a port (match patterns have none)', () => {
    expect(originPattern('https://rpc.example.org/v1/key')).toBe('https://rpc.example.org/*');
    expect(originPattern('http://localhost:8545')).toBe('http://localhost/*');
    expect(originPattern('https://rpc.example.org:8443')).toBe('https://rpc.example.org/*');
  });

  it('returns null for blank or invalid URLs', () => {
    expect(originPattern('')).toBeNull();
    expect(originPattern('nonsense')).toBeNull();
    expect(originPattern('http://remote.example.org')).toBeNull();
    expect(originPattern('https://*.example.org')).toBeNull();
  });
});

describe('parseStoredSettings', () => {
  it('returns defaults for non-objects', () => {
    expect(parseStoredSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and falls back per-field on invalid ones', () => {
    const parsed = parseStoredSettings({
      rpcUrl: 'https://own-rpc.example.org',
      registryAddress: 'nope',
      ipfsGateway: 'http://evil.example.org',
      hisaishiUrl: '',
      ownerAddress: `0x${'1'.repeat(40)}`,
      scanChunkSize: 999999,
      scanStartBlock: '12a3',
    });

    expect(parsed.rpcUrl).toBe('https://own-rpc.example.org');
    expect(parsed.registryAddress).toBe(DEFAULT_SETTINGS.registryAddress);
    expect(parsed.ipfsGateway).toBe(DEFAULT_SETTINGS.ipfsGateway);
    expect(parsed.hisaishiUrl).toBe('');
    expect(parsed.ownerAddress).toBe(`0x${'1'.repeat(40)}`);
    expect(parsed.scanChunkSize).toBe(50_000);
    expect(parsed.scanStartBlock).toBe('123');
  });

  it('rejects a plain-http remote RPC even if someone edited storage', () => {
    const parsed = parseStoredSettings({ rpcUrl: 'http://rpc.example.org' });
    expect(parsed.rpcUrl).toBe(DEFAULT_SETTINGS.rpcUrl);
  });

  it('never coerces a blank start block to zero', () => {
    expect(parseStoredSettings({ scanStartBlock: '' }).scanStartBlock).toBe('');
  });
});

describe('validateDraft', () => {
  it('accepts the default draft unchanged', () => {
    const result = validateDraft({ ...DEFAULT_SETTINGS });
    expect(result.errors).toEqual({});
    expect(result.values).toEqual(DEFAULT_SETTINGS);
  });

  it('reports one error per invalid field and does not throw', () => {
    const draft: Settings = {
      ...DEFAULT_SETTINGS,
      rpcUrl: 'http://remote.example.org',
      registryAddress: '0x123',
      ipfsGateway: '',
      hisaishiUrl: 'ftp://x',
      ownerAddress: 'bob',
      scanChunkSize: 0,
      scanStartBlock: 'x',
    };
    const result = validateDraft(draft);
    expect(Object.keys(result.errors).sort()).toEqual([
      'hisaishiUrl',
      'ipfsGateway',
      'ownerAddress',
      'registryAddress',
      'rpcUrl',
      'scanChunkSize',
      'scanStartBlock',
    ]);
  });

  it('floors a fractional chunk size into the valid range', () => {
    const result = validateDraft({ ...DEFAULT_SETTINGS, scanChunkSize: 12.9 });
    expect(result.values.scanChunkSize).toBe(12);
  });
});

describe('createSettingsStore', () => {
  function area(initial: Record<string, unknown> = {}): KeyValueArea & {
    writes: Record<string, unknown>[];
  } {
    const data = { ...initial };
    const writes: Record<string, unknown>[] = [];
    return {
      writes,
      async get(key) {
        return key in data ? { [key]: data[key] } : {};
      },
      async set(items) {
        writes.push(items);
        Object.assign(data, items);
      },
    };
  }

  it('round-trips settings through the storage area', async () => {
    const backend = area();
    const store = createSettingsStore(backend);
    const custom: Settings = { ...DEFAULT_SETTINGS, registryAddress: `0x${'2'.repeat(40)}` };

    await store.set(custom);
    expect(backend.writes[0]).toEqual({ [SETTINGS_STORAGE_KEY]: custom });
    expect(await store.get()).toEqual(custom);
  });

  it('falls back to defaults when the area throws', async () => {
    const store = createSettingsStore({
      async get() {
        throw new Error('storage unavailable');
      },
      async set() {
        throw new Error('storage unavailable');
      },
    });
    expect(await store.get()).toEqual(DEFAULT_SETTINGS);
  });
});
