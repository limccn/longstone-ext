/**
 * Purity gate for the wallet boundary (design §3.2, DR-03, DR-04,
 * SR-10/SR-12/SR-21).
 *
 * `@limccn/longstone-wallet` is the only implementation of the crypto, the
 * `wallet.v1` format, BIP-39/BIP-32 derivation and the vault lifecycle. This
 * extension keeps exactly one host-specific module here — the self-write
 * change guard — and the tests below fail if a second copy of the wallet core
 * grows back, or if the remaining module picks up a browser/network/logging
 * API. The UI rules stay: presentation code may not reach storage directly.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const WALLET_LIB = path.join(ROOT, 'src', 'lib', 'wallet');
const WALLET_UI = path.join(ROOT, 'src', 'ui', 'wallet');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const walletSources = walk(WALLET_LIB).filter((file) => /\.(ts|tsx)$/.test(file));
const uiSources = walk(WALLET_UI).filter((file) => /\.(ts|tsx)$/.test(file));
const allSources = [
  ...walk(path.join(ROOT, 'src')),
  ...walk(path.join(ROOT, 'entrypoints')),
].filter((file) => /\.(ts|tsx)$/.test(file));

const FORBIDDEN_IN_CORE: Array<{ id: string; pattern: RegExp }> = [
  { id: 'chrome-api', pattern: /(?:^|[^\w$])chrome\s*\./ },
  { id: 'browser-api', pattern: /(?:^|[^\w$])browser\s*\./ },
  { id: 'document', pattern: /\bdocument\s*\./ },
  { id: 'window', pattern: /\bwindow\s*\./ },
  { id: 'localStorage', pattern: /\blocalStorage\b/ },
  { id: 'sessionStorage', pattern: /\bsessionStorage\b/ },
  { id: 'fetch', pattern: /\bfetch\s*\(/ },
  { id: 'xhr', pattern: /\bXMLHttpRequest\b/ },
  { id: 'websocket', pattern: /\bWebSocket\b/ },
  { id: 'send-beacon', pattern: /\bsendBeacon\b/ },
  { id: 'event-source', pattern: /\bEventSource\b/ },
  { id: 'console', pattern: /\bconsole\s*\./ },
  { id: 'debugger', pattern: /\bdebugger\b/ },
  { id: 'viem', pattern: /from\s+['"]viem(?:\/[^'"]*)?['"]/ },
  { id: 'signing-account', pattern: /\b(?:privateKeyToAccount|mnemonicToAccount)\b/ },
  { id: 'sign-call', pattern: /\.sign\s*\(/ },
  { id: 'math-random', pattern: /\bMath\.random\s*\(/ },
  { id: 'storage-key-literal', pattern: /longstone-ext\.wallet/ },
  { id: 'inline-signing-rpc', pattern: /\b(?:eth_sendTransaction|eth_signTypedData)\b/ },
];

/**
 * A second wallet implementation: the KDF call, its domain tag, the record
 * parser or the derivation library. Only the shared package may contain these.
 */
const SECOND_IMPLEMENTATION: Array<{ id: string; pattern: RegExp }> = [
  { id: 'argon2id-call', pattern: /\bargon2id\s*\(/ },
  { id: 'kdf-domain', pattern: /longstone\/wallet\.v1\/(?:kdf|enc)/ },
  { id: 'record-format', pattern: /longstone\.wallet\.v1/ },
  { id: 'format-constant', pattern: /\bWALLET_FORMAT(?:_DOMAIN)?\b/ },
  { id: 'kdf-domain-constant', pattern: /\bWALLET_KDF_DOMAIN\b|\bWALLET_HKDF_INFO\b/ },
  { id: 'vault-key-derivation', pattern: /\b(?:deriveVaultKey|deriveKdfOutput|hkdfSha256)\b/ },
  { id: 'record-parser', pattern: /\b(?:parseWalletRecord|validateVaultPayload)\b/ },
  { id: 'noble-curves-import', pattern: /from\s+['"]@noble\/curves/ },
  { id: 'noble-hashes-import', pattern: /from\s+['"]@noble\/hashes/ },
  { id: 'scure-bip32-import', pattern: /from\s+['"]@scure\/bip32/ },
  { id: 'scure-bip39-import', pattern: /from\s+['"]@scure\/bip39/ },
  { id: 'hash-wasm-import', pattern: /from\s+['"]hash-wasm['"]/ },
  { id: 'viem-accounts', pattern: /from\s+['"]viem\/accounts['"]/ },
  { id: 'relative-core-import', pattern: /lib\/wallet\/(?:errors|crypto|format|accounts|password|vault|lock)\.js/ },
];

describe('wallet core stays pure', () => {
  it('keeps only the host-specific change guard in the app', () => {
    // A missing directory would make every rule vacuous. The seven shared
    // modules must live in @limccn/longstone-wallet, never here.
    const names = walletSources.map((file) => path.basename(file));
    expect(names).toEqual(['changeGuard.ts']);
  });

  it('touches no browser, network, logging, or signing API', () => {
    expect(walletSources.length).toBeGreaterThan(0);
    for (const file of walletSources) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const rule of FORBIDDEN_IN_CORE) {
        expect(rule.pattern.test(text), `${path.relative(ROOT, file)}: ${rule.id}`).toBe(false);
      }
    }
  });

  it('imports only relative modules and the shared wallet package', () => {
    const allowed = [/^\./, /^@limccn\/longstone-wallet$/];
    for (const file of walletSources) {
      const text = stripComments(readFileSync(file, 'utf8'));
      const specifiers = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(
          allowed.some((pattern) => pattern.test(specifier ?? '')),
          `${path.relative(ROOT, file)} imports ${String(specifier)}`,
        ).toBe(true);
      }
      expect(text).not.toMatch(/\bimport\s*\(/);
    }
  });
});

describe('no second wallet implementation', () => {
  it('has no Argon2id, HKDF, AES envelope, record parser or derivation copy', () => {
    expect(allSources.length).toBeGreaterThan(0);
    for (const file of allSources) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const rule of SECOND_IMPLEMENTATION) {
        expect(
          rule.pattern.test(text),
          `${path.relative(ROOT, file)}: ${rule.id}`,
        ).toBe(false);
      }
    }
  });

  it('depends on the shared package by workspace link', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['@limccn/longstone-wallet']).toBe('workspace:*');
  });
});

describe('wallet UI stays presentation-only', () => {
  it('has no network, logging, html injection, or browser API access', () => {
    for (const file of uiSources) {
      const text = stripComments(readFileSync(file, 'utf8'));
      expect(text, path.relative(ROOT, file)).not.toMatch(
        /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bEventSource\b/,
      );
      expect(text, path.relative(ROOT, file)).not.toMatch(/\bconsole\s*\./);
      expect(text, path.relative(ROOT, file)).not.toMatch(/\bdebugger\b/);
      expect(text, path.relative(ROOT, file)).not.toMatch(/dangerouslySetInnerHTML/);
      expect(text, path.relative(ROOT, file)).not.toMatch(/math\.random/i);
      // Storage access is owned by src/lib/chromeApi.ts; UI talks to hooks.
      expect(text, path.relative(ROOT, file)).not.toMatch(/\b(?:chrome|browser)\.storage\b/);
    }
  });
});

const PUBLIC_HEX_ALLOWLIST = new Set([
  // secp256k1 group order: public protocol data used for scalar-range checks.
  '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
]);

describe('source tree secret hygiene', () => {
  it('contains no 0x + 64-hex literal (sample keys are test-only)', () => {
    expect(allSources.length).toBeGreaterThan(0);
    for (const file of allSources) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const match of text.matchAll(/0x[0-9a-fA-F]{64}/g)) {
        expect(
          PUBLIC_HEX_ALLOWLIST.has(match[0]),
          `${path.relative(ROOT, file)} carries an unreviewed 64-hex literal`,
        ).toBe(true);
      }
    }
  });

  it('uses CSPRNG, never Math.random', () => {
    for (const file of allSources) {
      const text = stripComments(readFileSync(file, 'utf8'));
      expect(text, path.relative(ROOT, file)).not.toMatch(/\bMath\.random\s*\(/);
    }
  });

  it('keeps the service worker free of wallet logic', () => {
    const background = readFileSync(path.join(ROOT, 'entrypoints', 'background.ts'), 'utf8');
    expect(background).not.toMatch(/wallet|mnemonic|privateKey|argon2|deriveVaultKey/i);
  });
});
