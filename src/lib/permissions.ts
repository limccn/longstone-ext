/**
 * Optional host permission handling (PS-7).
 *
 * The extension must be able to read the RPC, IPFS gateway and hisaishi
 * endpoints the user configures, and nothing else. Rather than declaring
 * `host_permissions`, the manifest declares `optional_host_permissions` and
 * the options page asks for the **specific configured origins** (never a
 * wildcard), at the moment the user saves, from a user gesture.
 *
 * The Chrome API is injected so unit tests can assert the exact request
 * without a browser.
 */

import { originPattern } from './settings.js';

export interface PermissionsApi {
  contains(permissions: { origins?: string[] }): Promise<boolean>;
  request(permissions: { origins?: string[] }): Promise<boolean>;
}

export interface PermissionRequestResult {
  origin: string;
  granted: boolean;
  /** True when the origin was already granted and no prompt was shown. */
  alreadyGranted: boolean;
}

/**
 * Requests one origin. `origin` must already be a match pattern such as
 * `https://rpc.example.org/*`; wildcards over all sites are rejected here as a
 * second line of defence behind the manifest policy.
 */
export async function requestOrigin(
  api: PermissionsApi,
  origin: string,
): Promise<PermissionRequestResult> {
  assertSpecificOrigin(origin);
  const already = await api.contains({ origins: [origin] });
  if (already) return { origin, granted: true, alreadyGranted: true };
  const granted = await api.request({ origins: [origin] });
  return { origin, granted, alreadyGranted: false };
}

export async function hasOrigin(api: PermissionsApi, origin: string): Promise<boolean> {
  assertSpecificOrigin(origin);
  return api.contains({ origins: [origin] });
}

export interface BatchPermissionResult {
  origins: string[];
  granted: boolean;
  error?: string;
}

/**
 * Requests a set of exact origins in one prompt.
 *
 * Chrome requires `permissions.request` to run during a user gesture, and the
 * activation does not survive a chain of dialogs: three sequential calls grant
 * at most the first origin. One call for the configured set is both reliable
 * and still specific — every entry comes from a setting the user just saved,
 * never a wildcard.
 */
export async function requestOrigins(
  api: PermissionsApi,
  origins: string[],
): Promise<BatchPermissionResult> {
  const unique = [...new Set(origins)];
  if (unique.length === 0) return { origins: [], granted: true };
  for (const origin of unique) assertSpecificOrigin(origin);
  try {
    const granted = await api.request({ origins: unique });
    return { origins: unique, granted };
  } catch (error) {
    return {
      origins: unique,
      granted: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const BROAD = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

function assertSpecificOrigin(origin: string): void {
  if (BROAD.has(origin)) {
    throw new Error(`refusing to request a broad origin: ${origin}`);
  }
  if (!/^https?:\/\/[^/*]+\/\*$/.test(origin)) {
    throw new Error(`not a single-origin match pattern: ${origin}`);
  }
  const host = origin.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
  if (host.includes('*')) {
    throw new Error(`refusing to request a wildcard host: ${origin}`);
  }
}

/**
 * Maps a configured endpoint URL to the match pattern to request, or null for
 * blank/invalid values. Delegates to the settings policy so the URL that is
 * saved and the origin that is requested can never diverge.
 */
export function originPatternFor(url: string): string | null {
  return originPattern(url);
}
