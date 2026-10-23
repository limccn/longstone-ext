/**
 * Extension settings — the same vocabulary as `longstone-ui`'s settings store,
 * but persisted in `chrome.storage.local` and validated on every read.
 *
 * Validation is shared policy, not UI sugar (PS-7):
 *   - URLs: https everywhere; plain http only for loopback.
 *   - Addresses: `0x` + exactly 40 hex characters.
 * A stored value that fails validation is discarded and the default is used,
 * so editing storage by hand cannot make the extension talk to a plain-http
 * remote origin.
 */

export interface Settings {
  /** Base Sepolia JSON-RPC used for reads. */
  rpcUrl: string;
  /** MemoryRegistry contract; empty = not configured. */
  registryAddress: string;
  /** IPFS gateway base URL, used when no hisaishi URL is configured. */
  ipfsGateway: string;
  /** Optional hisaishi base URL for digest-route content fetching. */
  hisaishiUrl: string;
  /** Owner whose timeline is shown when no address is pasted. Empty = none. */
  ownerAddress: string;
  /** Blocks per `eth_getLogs` call; the scanner adapts down if rejected. */
  scanChunkSize: number;
  /** Empty = discover the registry's deploy block from chain. */
  scanStartBlock: string;
}

export const SETTINGS_STORAGE_KEY = 'longstone-ext.settings.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type Validation = { ok: true; value: string } | { ok: false; error: string };

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** https anywhere; plain http only for loopback. */
export function validateUrl(
  raw: string,
  options: { allowEmpty?: boolean } = {},
): Validation {
  const value = raw.trim();
  if (value === '') {
    return options.allowEmpty
      ? { ok: true, value: '' }
      : { ok: false, error: 'URL is required' };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: 'Not a valid URL' };
  }
  // A URL parser accepts `https://*.example.com`, but that is a match-pattern
  // wildcard, not a concrete endpoint. Reject it here so the options page
  // reports a field error instead of letting a broad pattern reach (and be
  // refused by) the host-permission request path.
  if (url.hostname.includes('*')) {
    return { ok: false, error: 'Wildcards are not allowed in endpoint URLs' };
  }
  if (url.protocol === 'https:') return { ok: true, value };
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) {
    return { ok: true, value };
  }
  return { ok: false, error: 'Only https:// (or http:// on loopback) is allowed' };
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function validateAddress(
  raw: string,
  options: { allowEmpty?: boolean } = {},
): Validation {
  const value = raw.trim();
  if (value === '') {
    return options.allowEmpty
      ? { ok: true, value: '' }
      : { ok: false, error: 'Address is required' };
  }
  if (!ADDRESS_RE.test(value)) {
    return { ok: false, error: 'Address must be 0x + 40 hex characters' };
  }
  return { ok: true, value };
}

/** A 32-byte commitment hash: `0x` + exactly 64 hex characters. */
export function isCommitmentHash(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Defaults mirror the deployed web app's build inputs: the same `VITE_*`
 * repository variables are read at build time, so a release can bake the
 * deployment it belongs to without a code change. Each baked value is run
 * through the same validators as a user edit; an invalid build variable
 * falls back instead of shipping a bad endpoint.
 *
 * The owner is deliberately blank — the extension never ships with a "your
 * address". A user override in storage always wins.
 */
function buildDefault(key: string, fallback: string): string {
  const env = import.meta.env as Record<string, unknown>;
  const value = env[key];
  return typeof value === 'string' ? value : fallback;
}

function bakedUrl(raw: string, fallback: string, allowEmpty = false): string {
  const check = validateUrl(raw, { allowEmpty });
  return check.ok ? check.value : fallback;
}

function bakedAddress(raw: string, fallback: string): string {
  const check = validateAddress(raw, { allowEmpty: true });
  return check.ok ? check.value : fallback;
}

export const DEFAULT_SETTINGS: Settings = {
  rpcUrl: bakedUrl(buildDefault('VITE_RPC_URL', ''), 'https://sepolia.base.org'),
  registryAddress: bakedAddress(
    buildDefault('VITE_REGISTRY_ADDRESS', '0xC85ed11d3065739F1829A114e420584bEC3FDFEF'),
    '',
  ),
  ipfsGateway: bakedUrl(
    buildDefault('VITE_IPFS_GATEWAY', 'https://gateway.pinata.cloud/ipfs'),
    'https://gateway.pinata.cloud/ipfs',
  ),
  hisaishiUrl: bakedUrl(
    buildDefault('VITE_HISAISHI_URL', 'https://hisaishi.limingcheng269.workers.dev'),
    '',
    true,
  ),
  ownerAddress: '',
  scanChunkSize: 200,
  scanStartBlock: '',
};

/**
 * The origin a permission request should cover for a configured URL.
 *
 * Returns null for an invalid/empty URL. The result is a match pattern
 * (`https://host/*`), never `<all_urls>`: the extension requests exactly the
 * endpoint the user just typed (PS-7).
 */
export function originPattern(rawUrl: string): string | null {
  const check = validateUrl(rawUrl, { allowEmpty: true });
  if (!check.ok) return null;
  if (check.value === '') return null;
  let url: URL;
  try {
    url = new URL(check.value);
  } catch {
    return null;
  }
  // Match patterns support neither ports nor IPv6 literals. A grant covers
  // every port on a host, but an IPv6 loopback cannot be expressed, so it has
  // no requestable pattern (reads may still work through CORS).
  if (url.hostname.startsWith('[')) return null;
  return `${url.protocol}//${url.hostname}/*`;
}

export interface SettingsValidation {
  values: Settings;
  /** Field name → message; empty when the draft is savable. */
  errors: Partial<Record<keyof Settings, string>>;
}

/** Validates a draft; returns field errors instead of throwing. */
export function validateDraft(draft: Settings): SettingsValidation {
  const errors: Partial<Record<keyof Settings, string>> = {};

  const rpc = validateUrl(draft.rpcUrl);
  if (!rpc.ok) errors.rpcUrl = rpc.error;

  const registry = validateAddress(draft.registryAddress, { allowEmpty: true });
  if (!registry.ok) errors.registryAddress = registry.error;

  const gateway = validateUrl(draft.ipfsGateway);
  if (!gateway.ok) errors.ipfsGateway = gateway.error;

  const hisaishi = validateUrl(draft.hisaishiUrl, { allowEmpty: true });
  if (!hisaishi.ok) errors.hisaishiUrl = hisaishi.error;

  const owner = validateAddress(draft.ownerAddress, { allowEmpty: true });
  if (!owner.ok) errors.ownerAddress = owner.error;

  if (
    !Number.isFinite(draft.scanChunkSize) ||
    !Number.isInteger(draft.scanChunkSize) ||
    draft.scanChunkSize < 1 ||
    draft.scanChunkSize > 50_000
  ) {
    errors.scanChunkSize = 'Chunk size must be a whole number between 1 and 50000';
  }

  if (!/^[0-9]*$/.test(draft.scanStartBlock)) {
    errors.scanStartBlock = 'Start block must be digits only, or blank';
  }

  return {
    values: {
      ...draft,
      rpcUrl: rpc.ok ? rpc.value : draft.rpcUrl,
      registryAddress: registry.ok ? registry.value : draft.registryAddress,
      ipfsGateway: gateway.ok ? gateway.value : draft.ipfsGateway,
      hisaishiUrl: hisaishi.ok ? hisaishi.value : draft.hisaishiUrl,
      ownerAddress: owner.ok ? owner.value : draft.ownerAddress,
      scanChunkSize: Number.isFinite(draft.scanChunkSize)
        ? Math.min(50_000, Math.max(1, Math.floor(draft.scanChunkSize)))
        : DEFAULT_SETTINGS.scanChunkSize,
      scanStartBlock: draft.scanStartBlock.replace(/[^0-9]/g, ''),
    },
    errors,
  };
}

/**
 * Coerces stored JSON into `Settings`, field by field.
 *
 * Every invalid field falls back to its default silently: storage is not a
 * trusted input channel (another extension cannot write ours, but a user with
 * devtools or a synced profile can).
 */
export function parseStoredSettings(raw: unknown): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  if (!isRecord(raw)) return settings;

  if (typeof raw['rpcUrl'] === 'string') {
    const check = validateUrl(raw['rpcUrl']);
    if (check.ok) settings.rpcUrl = check.value;
  }
  if (typeof raw['registryAddress'] === 'string') {
    const check = validateAddress(raw['registryAddress'], { allowEmpty: true });
    if (check.ok) settings.registryAddress = check.value;
  }
  if (typeof raw['ipfsGateway'] === 'string') {
    const check = validateUrl(raw['ipfsGateway']);
    if (check.ok) settings.ipfsGateway = check.value;
  }
  if (typeof raw['hisaishiUrl'] === 'string') {
    const check = validateUrl(raw['hisaishiUrl'], { allowEmpty: true });
    if (check.ok) settings.hisaishiUrl = check.value;
  }
  if (typeof raw['ownerAddress'] === 'string') {
    const check = validateAddress(raw['ownerAddress'], { allowEmpty: true });
    if (check.ok) settings.ownerAddress = check.value;
  }
  if (typeof raw['scanChunkSize'] === 'number' && Number.isInteger(raw['scanChunkSize'])) {
    settings.scanChunkSize = Math.min(50_000, Math.max(1, raw['scanChunkSize']));
  }
  if (typeof raw['scanStartBlock'] === 'string') {
    // Blank stays blank (= auto-detect); never coerced to '0'.
    settings.scanStartBlock = raw['scanStartBlock'].replace(/[^0-9]/g, '');
  }
  return settings;
}

/** The storage seam. Implemented by chrome.storage.local; faked in tests. */
export interface SettingsStore {
  get(): Promise<Settings>;
  set(settings: Settings): Promise<void>;
}

/** Key-value backend; the extension passes `chrome.storage.local`. */
export interface KeyValueArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export function createSettingsStore(area: KeyValueArea): SettingsStore {
  return {
    async get() {
      try {
        const stored = await area.get(SETTINGS_STORAGE_KEY);
        return parseStoredSettings(stored[SETTINGS_STORAGE_KEY]);
      } catch {
        // A broken storage area must not brick the panel.
        return { ...DEFAULT_SETTINGS };
      }
    },
    async set(settings) {
      await area.set({ [SETTINGS_STORAGE_KEY]: settings });
    },
  };
}
