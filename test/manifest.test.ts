/**
 * Release policy as a test (design §5.2, PS-7).
 *
 * The manifest is the store-review surface: a broad host permission or a
 * content script is the difference between "read-only viewer" and "extension
 * that can read every site". Asserting the policy in unit tests means a
 * permission can only widen with a visible, deliberate test edit.
 *
 * The built manifest is asserted too when `.output/` exists (after a build);
 * the source manifest alone cannot catch a WXT default or module adding a key.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_MANIFEST_KEYS,
  FORBIDDEN_PERMISSIONS,
  REQUIRED_PERMISSIONS,
  manifest,
} from '../src/lib/manifest.js';

const ROOT = path.resolve(__dirname, '..');

describe('declared manifest (source of truth)', () => {
  it('requires exactly sidePanel and storage, nothing else', () => {
    // MV3 is set by WXT (`manifestVersion: 3` in wxt.config.ts); declaring it
    // in the manifest object is ignored, so it is asserted on the built
    // manifest below instead.
    expect([...(manifest.permissions ?? [])].sort()).toEqual([...REQUIRED_PERMISSIONS].sort());
  });

  it('declares no broad host permissions and no content scripts', () => {
    for (const key of FORBIDDEN_MANIFEST_KEYS) {
      expect(key in manifest, `${key} must not be declared`).toBe(false);
    }
    for (const permission of FORBIDDEN_PERMISSIONS) {
      expect(manifest.permissions ?? [], `${permission} must not be required`).not.toContain(
        permission,
      );
    }
  });

  it('keeps optional host permissions to https plus loopback http', () => {
    const optional = manifest.optional_host_permissions ?? [];
    expect(optional.length).toBeGreaterThan(0);
    for (const pattern of optional) {
      expect(pattern).not.toBe('<all_urls>');
      expect(pattern).not.toBe('*://*/*');
      // https wildcard over hosts is the one broad-ish entry; the user still
      // grants one exact origin at a time at runtime (see permissions.test).
      expect(pattern === 'https://*/*' || /^http:\/\/(localhost|127\.0\.0\.1)\/\*$/.test(pattern)).toBe(
        true,
      );
    }
  });

  it('pins an extension-page CSP without unsafe-eval or remote scripts', () => {
    const csp = manifest.content_security_policy?.extension_pages ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('http');
  });

  it('ships the sidepanel entrypoint that produces side_panel', () => {
    // WXT derives `side_panel.default_path` from this file. Asserting the
    // entrypoint makes the "manifest includes side_panel" guarantee meaningful
    // even before a build exists; the built manifest is checked below.
    expect(existsSync(path.join(ROOT, 'entrypoints', 'sidepanel', 'index.html'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'entrypoints', 'options', 'index.html'))).toBe(true);
  });
});

/**
 * Built manifests, when present. `pnpm build` produces `.output/chrome-mv3`
 * and `.output/edge-mv3`; CI runs the build before the tests so this branch
 * always executes there.
 */
const outputDir = path.join(ROOT, '.output');
const builtManifests = existsSync(outputDir)
  ? readdirSync(outputDir)
      .filter((name) => name.endsWith('-mv3'))
      .map((name) => ({ name, file: path.join(outputDir, name, 'manifest.json') }))
      .filter(({ file }) => existsSync(file))
  : [];

describe.skipIf(builtManifests.length === 0)('built manifest', () => {
  for (const { name, file } of builtManifests) {
    it(`${name}: includes side_panel and the minimal permission set`, () => {
      const built = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      expect(built['manifest_version']).toBe(3);
      const sidePanel = built['side_panel'] as { default_path?: string } | undefined;
      expect(sidePanel?.default_path).toContain('sidepanel');
      // The declared path must point at a file that actually shipped.
      expect(existsSync(path.join(path.dirname(file), sidePanel?.default_path ?? ''))).toBe(true);
      expect(built['permissions']).toEqual(expect.arrayContaining(['sidePanel', 'storage']));
      expect(built['permissions']).not.toContain('tabs');
      expect(built['permissions']).not.toContain('activeTab');
      expect(built['permissions']).not.toContain('scripting');
      expect(built).not.toHaveProperty('content_scripts');
      expect(built).not.toHaveProperty('host_permissions');
      expect(built).not.toHaveProperty('web_accessible_resources');
      // The optional ceiling must survive the build too: without it a runtime
      // request for a configured origin is refused by the browser.
      expect(built['optional_host_permissions']).toEqual(
        expect.arrayContaining([...(manifest.optional_host_permissions ?? [])]),
      );
      expect(built['optional_host_permissions']).not.toContain('<all_urls>');
    });

    it(`${name}: options page is registered and no remote script can load`, () => {
      const built = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      const options = built['options_ui'] as { page?: string } | undefined;
      expect(options?.page).toEqual(expect.stringContaining('options'));
      // The declared page must point at a file that actually shipped.
      expect(existsSync(path.join(path.dirname(file), options?.page ?? ''))).toBe(true);
      const serialized = JSON.stringify(built);
      expect(serialized).not.toContain('<all_urls>');
      expect(serialized).not.toContain('unsafe-eval');
    });
  }
});

describe('source tree policy', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  }

  const sources = [
    ...walk(path.join(ROOT, 'src')),
    ...walk(path.join(ROOT, 'entrypoints')),
  ].filter((file) => /\.(ts|tsx)$/.test(file));

  it('imports no signing library and no wallet API', () => {
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} must not sign`).not.toMatch(/signTransaction/);
      expect(text, `${file} must not sign`).not.toMatch(/sendTransaction/);
      expect(text, `${file} must not touch window\.ethereum`).not.toMatch(/window\.ethereum/);
      expect(text, `${file} must not import wagmi`).not.toMatch(/from ['"]wagmi['"]/);
      expect(text, `${file} must not import viem accounts`).not.toMatch(
        /from ['"]viem\/accounts['"]/,
      );
    }
  });

  /** Drops comments so a doc comment naming an API is not a false positive. */
  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  it('touches the browser API only through the adapter modules', () => {
    const touching = sources.filter((file) => {
      const text = stripComments(readFileSync(file, 'utf8'));
      // An import of the extension API, or a real call on it. A documentation
      // string naming `chrome.storage.local` is not access, so calls require
      // the opening parenthesis.
      return (
        /from ['"]wxt\/browser['"]/.test(text) ||
        /\b(?:chrome|browser)\.(?:runtime|storage|permissions|tabs|sidePanel)\.[A-Za-z]+\s*\(/.test(text)
      );
    });
    const allowed = new Set([
      path.join(ROOT, 'src', 'lib', 'chromeApi.ts'),
      path.join(ROOT, 'entrypoints', 'background.ts'),
      path.join(ROOT, 'entrypoints', 'options', 'main.tsx'),
    ]);
    const unexpected = touching.filter((file) => !allowed.has(file));
    expect(unexpected).toEqual([]);
  });

  it('uses no eval-like constructs', () => {
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file}`).not.toMatch(/\beval\s*\(/);
      expect(text, `${file}`).not.toMatch(/new Function\s*\(/);
    }
  });
});
