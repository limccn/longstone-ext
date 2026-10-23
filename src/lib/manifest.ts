import type { UserManifest } from 'wxt';

/**
 * The single source of truth for the extension's declared capabilities.
 *
 * Kept in a plain module (no `wxt` import) so tests can assert the policy
 * without building the extension: a release that widened permissions would
 * fail `test/manifest.test.ts` before it ever reached a store review (PS-7).
 *
 * Design §5.2: `sidePanel` + `storage` only. Host access is **optional** and
 * requested for exactly the origins the user configures, in one prompt when
 * settings are saved. No `tabs`, no `activeTab`, no content scripts, no
 * `<all_urls>`.
 */
export const REQUIRED_PERMISSIONS = ['sidePanel', 'storage'] as const;

/**
 * Every manifest key that would grant broad or script-injecting access. The
 * extension must declare none of them, in any form (required or optional).
 */
export const FORBIDDEN_MANIFEST_KEYS = [
  'content_scripts',
  'host_permissions',
  'tabs',
  'activeTab',
  'debugger',
  'scripting',
] as const;

/**
 * The manifest version is set by WXT (`manifestVersion: 3` in the config and
 * the `-mv3` output directory); declaring it here is ignored with a warning.
 */

/** Permissions that must never appear in `permissions` or `optional_permissions`. */
export const FORBIDDEN_PERMISSIONS = [
  'tabs',
  'activeTab',
  'scripting',
  'debugger',
  'webRequest',
  'cookies',
  'history',
  'management',
  '<all_urls>',
] as const;

export const manifest: UserManifest = {
  // ASCII only: the store listing carries the typography; the manifest name
  // is a technical identifier that must survive every toolchain unchanged.
  name: 'longstone memory viewer',
  short_name: 'longstone',
  description:
    'Read-only viewer for MemoryOverEth: browse and verify on-chain agent memory. Writes open in the web app, where your wallet signs.',
  version: '0.1.0',
  // Minimum Chrome/Edge version that supports chrome.sidePanel (Chrome 114,
  // Edge 114). Declared so an old browser refuses the install instead of
  // showing a broken button.
  minimum_chrome_version: '114',
  permissions: [...REQUIRED_PERMISSIONS],
  // Optional, per-origin, requested from a user gesture when a setting is
  // saved (PS-7). Deliberately NOT `host_permissions`.
  optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  // Extension pages run under the MV3 extension-page CSP. Declaring it
  // explicitly documents the absence of `unsafe-eval` and remote scripts.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
  action: {
    default_title: 'longstone memory viewer',
  },
};
