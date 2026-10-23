/**
 * Built-bundle audit — CI gate for design §5.2 / B1.
 *
 * A Chrome/Edge extension is reviewed on what ships, not on what the source
 * intended. This script inspects `.output/{chrome,edge}-mv3` and fails when a
 * built file contains:
 *
 *   1. a remote script:  <script src="http…  (MV3 forbids remote code)
 *   2. eval or `new Function` (both absent from the extension-page CSP, and a
 *      common remote-code vector when a dependency tries it)
 *   3. wallet signing entry points: `signTransaction`, `sendTransaction`,
 *      `window.ethereum` — the extension is read-only by contract
 *   4. key material:          `LONGSTONE_KEY`, `LONGSTONE_OWNER_KEY`
 *   5. any `0x` + 64-hex literal (a private-key-shaped value; the extension
 *      has no legitimate reason to carry one, and PS-1 forbids it in
 *      distributed artifacts)
 *
 * It also asserts the manifest permissions directly, so a WXT default or a
 * module cannot quietly widen them between the unit tests and the artifact.
 *
 * Usage: node scripts/audit-extension.mjs [--dir <output-dir>]
 * Exit code 1 on any finding. `.output/` missing is an error: the audit is
 * only meaningful after a build, and CI runs it there.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT = path.join(ROOT, '.output');

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const scanRoot = dirIndex >= 0 && args[dirIndex + 1] ? path.resolve(args[dirIndex + 1]) : OUTPUT;

/**
 * Text patterns. Each has a human explanation because the failure message is
 * the whole value of this gate: "which rule, which file".
 */
const BANNED = [
  {
    id: 'remote-script',
    pattern: /<script[^>]+src\s*=\s*["']https?:/gi,
    why: 'remote script tag (MV3 forbids remote code)',
  },
  {
    id: 'eval',
    // Word-boundary so identifiers like `retrieval(` or `medieval(` do not
    // trip it, while property access such as `window.eval(` is caught (the
    // preceding `.` is not an identifier character).
    pattern: /(?:^|[^\w$])eval\s*\(/g,
    why: 'eval() (no eval in the extension-page CSP)',
  },
  {
    id: 'function-constructor',
    // `Function('...')` is string-to-code exactly like `new Function('...')`;
    // catch both forms.
    pattern: /(?:^|[^\w$])(?:new\s+)?Function\s*\(/g,
    why: 'Function() constructor (string-to-code, same class as eval)',
  },
  {
    id: 'sign-transaction',
    pattern: /\bsignTransaction\b/g,
    why: 'wallet signing entry point (extension is read-only)',
  },
  {
    id: 'send-transaction',
    pattern: /\bsendTransaction\b/g,
    why: 'wallet signing entry point (extension is read-only)',
  },
  {
    id: 'window-ethereum',
    pattern: /window\s*\.\s*ethereum/g,
    why: 'injected wallet API (extension is read-only)',
  },
  {
    id: 'eth-send-transaction',
    pattern: /\beth_sendTransaction\b/g,
    why: 'transaction submission RPC method (v1 does not sign or send)',
  },
  {
    id: 'eth-sign-typed-data',
    pattern: /\beth_signTypedData\b/g,
    why: 'typed-data signing RPC method (v1 does not sign)',
  },
  {
    id: 'longstone-key',
    pattern: /LONGSTONE_(?:OWNER_)?KEY/gi,
    why: 'key-material name in a distributed artifact (PS-1)',
  },
];

/**
 * 32-byte hex literals that are public protocol data, not key material.
 *
 * `viem` (a required dependency — it is the chain client the surface package
 * is built on) bundles secp256k1 parameters, the ERC-6492 magic value, an
 * EIP-7702 sentinel, and some contract init-code strings. Those are fixed
 * public constants, verified below by provenance, not secrets.
 *
 * The list is exact-match on purpose: a new literal — including one from a
 * viem upgrade — fails the audit until someone reviews it and adds it here.
 * That keeps the rule strict instead of weakening it into a pattern.
 */
const PUBLIC_HEX_CONSTANTS = new Map([
  // secp256k1 field prime p (ox/core/internal/curves.ts, noble-curves).
  ['0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f', 'secp256k1 field prime'],
  // secp256k1 group order n (ox/core/internal/curves.ts).
  ['0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 'secp256k1 group order'],
  // secp256k1 endomorphism beta (noble-curves, lowS/endo).
  ['0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee', 'secp256k1 endomorphism beta'],
  // ERC-6492 magic suffix used to detect counterfactual signatures (viem).
  ['0x6492649264926492649264926492649264926492649264926492649264926492', 'ERC-6492 magic value'],
  // EIP-7702 delegated-account sentinel bytes (viem).
  ['0x8010801080108010801080108010801080108010801080108010801080108010', 'EIP-7702 sentinel'],
  // Solidity init code shipped by viem for its deployment helpers/tests.
  ['0x608060405234801561001057600080fd5b5060405161018e38038061018e8339', 'Solidity init code (viem fixture)'],
  ['0x608060405234801561001057600080fd5b506040516102c03803806102c08339', 'Solidity init code (viem fixture)'],
  ['0x608060405234801561001057600080fd5b506040516106943803806106948339', 'Solidity init code (viem fixture)'],
  ['0x608060405234801561001057600080fd5b506115b9806100206000396000f3fe', 'Solidity init code (viem fixture)'],
  ['0x6080604052348015600e575f80fd5b5061016d8061001c5f395ff3fe60806040', 'Solidity init code (viem fixture)'],
  ['0x608060405234801561000f575f5ffd5b5060043610610029575f3560e01c8063', 'Solidity init code (viem fixture)'],
]);

const HEX_32_BYTE_PATTERN = /0x[0-9a-fA-F]{64}/g;

const AUDITED_EXTENSIONS = /\.(js|mjs|cjs|html|json|css|txt)$/i;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Splits a CSP policy into directive name → source tokens. */
function parseCsp(policy) {
  const directives = new Map();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter((token) => token !== '');
    if (tokens.length === 0) continue;
    directives.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return directives;
}

/**
 * CSP tokens that execute code or inject markup. Compared as **whole tokens**:
 * `'wasm-unsafe-eval'` is a different token from `'unsafe-eval'`, and a
 * substring check would reject the wasm permission the vault needs (design
 * §7.2). No rule may be relaxed to make a build pass.
 */
const FORBIDDEN_CSP_TOKENS = new Set(["'unsafe-eval'", "'unsafe-inline'"]);

/** Remote/opaque sources a script or object directive must never carry. */
function isRemoteCspSource(token) {
  return /^(?:https?:|wss?:|data:|blob:|filesystem:|\*)/i.test(token);
}

/**
 * Audits the manifest CSP token by token.
 *
 * `extension_pages` must allow wasm (`'wasm-unsafe-eval'`) because Argon2id is
 * compiled from wasm, and must not allow `'unsafe-eval'`, `'unsafe-inline'`, or
 * any remote source. Every policy in the map is checked for the forbidden
 * tokens and remote sources.
 */
function auditCsp(csp, label, failures) {
  if (typeof csp !== 'object' || csp === null) {
    failures.push(`${label}: content_security_policy is missing`);
    return;
  }
  for (const [key, policy] of Object.entries(csp)) {
    if (typeof policy !== 'string') {
      failures.push(`${label}: content_security_policy.${key} is not a string`);
      continue;
    }
    const directives = parseCsp(policy);
    for (const [directive, sources] of directives) {
      for (const token of sources) {
        if (FORBIDDEN_CSP_TOKENS.has(token.toLowerCase())) {
          failures.push(`${label}: CSP ${key}/${directive} contains ${token}`);
        }
        if (isRemoteCspSource(token)) {
          failures.push(`${label}: CSP ${key}/${directive} allows remote source ${token}`);
        }
      }
    }
    if (key === 'extension_pages') {
      const script = directives.get('script-src') ?? [];
      const object = directives.get('object-src') ?? [];
      if (!script.includes("'self'")) {
        failures.push(`${label}: CSP script-src must include 'self'`);
      }
      if (!script.includes("'wasm-unsafe-eval'")) {
        failures.push(`${label}: CSP script-src must include 'wasm-unsafe-eval' (Argon2id wasm)`);
      }
      if (!object.includes("'self'") && !object.includes("'none'")) {
        failures.push(`${label}: CSP object-src must be 'self' or 'none'`);
      }
    }
  }
}

/** OWASP-style allowlist: required keys exactly, forbidden keys absent. */
function auditManifest(manifest, label, failures) {
  if (manifest.manifest_version !== 3) {
    failures.push(`${label}: manifest_version is ${manifest.manifest_version}, expected 3`);
  }
  if (manifest.side_panel === undefined) {
    failures.push(`${label}: side_panel is missing (the primary surface would not open)`);
  }
  if (manifest.options_ui === undefined && manifest.options_page === undefined) {
    failures.push(`${label}: no options page declared`);
  }

  const required = ['sidePanel', 'storage'];
  const permissions = manifest.permissions ?? [];
  for (const permission of required) {
    if (!permissions.includes(permission)) {
      failures.push(`${label}: required permission "${permission}" is missing`);
    }
  }
  const extra = permissions.filter((permission) => !required.includes(permission));
  if (extra.length > 0) {
    failures.push(`${label}: unexpected required permissions: ${extra.join(', ')}`);
  }

  if (manifest.host_permissions !== undefined) {
    failures.push(`${label}: host_permissions must be optional, not required`);
  }
  const forbidden = ['tabs', 'activeTab', 'scripting', 'debugger', 'webRequest', 'cookies'];
  for (const permission of forbidden) {
    if (permissions.includes(permission)) {
      failures.push(`${label}: forbidden permission "${permission}"`);
    }
  }
  if (manifest.content_scripts !== undefined) {
    failures.push(`${label}: content_scripts must not be declared`);
  }
  if (manifest.web_accessible_resources !== undefined) {
    failures.push(`${label}: web_accessible_resources must not be declared`);
  }

  const optional = manifest.optional_host_permissions ?? [];
  if (optional.includes('<all_urls>') || optional.includes('*://*/*')) {
    failures.push(`${label}: optional_host_permissions contains a broad pattern`);
  }

  auditCsp(manifest.content_security_policy, label, failures);
}

const failures = [];
const notes = [];
/** reason → occurrence count, reported so allowlisted literals stay visible. */
const allowlisted = new Map();

if (!(await exists(scanRoot))) {
  console.error(
    `audit: ${path.relative(ROOT, scanRoot)} does not exist — run "pnpm build" (chrome + edge) first.`,
  );
  process.exit(1);
}

const targets = (await readdir(scanRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.endsWith('-mv3'))
  .map((entry) => path.join(scanRoot, entry.name));

if (targets.length === 0) {
  console.error(`audit: no *-mv3 build directories under ${path.relative(ROOT, scanRoot)}.`);
  process.exit(1);
}

let scanned = 0;
for (const target of targets) {
  const label = path.relative(ROOT, target).replaceAll('\\', '/');
  const manifestPath = path.join(target, 'manifest.json');
  if (!(await exists(manifestPath))) {
    failures.push(`${label}: manifest.json missing`);
    continue;
  }
  auditManifest(JSON.parse(await readFile(manifestPath, 'utf8')), label, failures);

  const files = (await walk(target)).filter((file) => AUDITED_EXTENSIONS.test(file));
  for (const file of files) {
    const rel = path.relative(ROOT, file).replaceAll('\\', '/');
    const text = await readFile(file, 'utf8');
    scanned += 1;
    for (const rule of BANNED) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(text);
      if (match !== null) {
        const line = text.slice(0, match.index).split('\n').length;
        failures.push(`${rel}:${String(line)}: ${rule.why} — matched ${JSON.stringify(match[0].slice(0, 80))}`);
      }
    }
    // 32-byte hex literals: every occurrence must be a reviewed public
    // constant. Allowlisted hits are still counted so the audit output shows
    // what shipped and why it is acceptable.
    HEX_32_BYTE_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(HEX_32_BYTE_PATTERN)) {
      const literal = match[0];
      const reason = PUBLIC_HEX_CONSTANTS.get(literal);
      if (reason === undefined) {
        const line = text.slice(0, match.index).split('\n').length;
        failures.push(
          `${rel}:${String(line)}: 0x + 64-hex literal not on the public-constant allowlist (PS-1) — ${literal}`,
        );
        continue;
      }
      allowlisted.set(reason, (allowlisted.get(reason) ?? 0) + 1);
    }

    // A remote stylesheet or font is also remote code-adjacent content and is
    // blocked by the CSP; report it rather than shipping a page that silently
    // fails to style.
    const remoteCss = /<link[^>]+href\s*=\s*["']https?:/i.exec(text);
    if (remoteCss !== null) {
      failures.push(`${rel}: remote stylesheet link is not allowed`);
    }
  }
  notes.push(`${label}: ${String(files.length)} files`);
}

if (failures.length > 0) {
  console.error('audit: FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`audit: OK — scanned ${String(scanned)} files across ${String(targets.length)} build(s)`);
for (const note of notes) console.log(`  ${note}`);
for (const [reason, count] of allowlisted) {
  console.log(`  public 32-byte constant: ${reason} (${String(count)} occurrence(s))`);
}
