/** Presentation helpers shared by the panel and the options page. */

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function shortCid(cid: string): string {
  return cid.length > 28 ? `${cid.slice(0, 18)}…${cid.slice(-8)}` : cid;
}

export function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown error';
}
