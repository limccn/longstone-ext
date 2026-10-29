/**
 * Deep links to the web app (design §5.2, PS-8).
 *
 * The extension never signs. Destructive actions (retract, ACL changes)
 * happen in `longstone-ui`, where the user's wallet signs. This module builds
 * those links under three invariants:
 *
 *   1. The base URL is a compile-time constant. No caller can redirect it.
 *   2. The only dynamic path segment is a commitment hash, validated as
 *      `0x` + 64 hex *before* construction.
 *   3. Anything that does reach a URL is passed through
 *      `encodeURIComponent`, so even a future route parameter cannot alter
 *      the path or inject a query.
 *
 * A rejected input returns `null`; callers must not render a link.
 */

/** Fixed base — the deployed web app. Not configurable on purpose. */
export const WEB_APP_BASE = 'https://longstone.app' as const;

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isCommitmentHash(value: string): boolean {
  return HASH_RE.test(value);
}

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value);
}

function build(pathname: string, hash?: string): string {
  const url = new URL(pathname, WEB_APP_BASE);
  if (hash !== undefined) url.hash = hash;
  return url.toString();
}

/** Commitment detail in the web app; the hash is validated and encoded. */
export function commitmentUrl(commitmentHash: string): string | null {
  if (!HASH_RE.test(commitmentHash)) return null;
  return `${WEB_APP_BASE}/commitment/${encodeURIComponent(commitmentHash)}`;
}

/**
 * Workspaces (the timeline view) in the web app. No dynamic input, so nothing
 * to validate.
 */
export function timelineUrl(): string {
  return build('/workspaces');
}

/**
 * Retract page, optionally pre-selecting the commitment.
 *
 * `longstone-ui`'s retract view does not read a hash parameter today, so the
 * hash is passed as a fragment (never a query the server sees) and the page
 * still opens on the right screen. The value is validated and encoded even
 * though it is currently only an anchor.
 */
export function retractUrl(commitmentHash?: string): string | null {
  if (commitmentHash === undefined) return build('/retract');
  if (!HASH_RE.test(commitmentHash)) return null;
  return `${WEB_APP_BASE}/retract#${encodeURIComponent(commitmentHash)}`;
}

/** Access-control page in the web app. */
export function aclUrl(): string {
  return build('/acl');
}

/** Verify page in the web app, optionally carrying a commitment hash. */
export function verifyUrl(commitmentHash?: string): string | null {
  if (commitmentHash === undefined) return build('/verify');
  if (!HASH_RE.test(commitmentHash)) return null;
  return `${WEB_APP_BASE}/verify#${encodeURIComponent(commitmentHash)}`;
}

/**
 * The fixed origin the deep links target. Exposed so the policy test can
 * assert it is exactly the web app and not a caller-supplied base.
 *
 * Opening a tab does not require a host permission, so this origin is never
 * passed to `permissions.request`; only configured RPC/IPFS endpoints are.
 */
export function webAppOrigin(): string {
  return new URL(WEB_APP_BASE).origin;
}
