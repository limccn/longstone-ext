/**
 * Owner-source resolution for the Timeline (design §5.5, R8).
 *
 * Pure so the priority rule is testable without React:
 *   - a manually entered address always wins;
 *   - otherwise the active wallet address applies while unlocked;
 *   - while locked / without a vault, the Settings default is the fallback;
 *   - the wallet address is never persisted to Settings (SR-06).
 */
export type OwnerMode = 'wallet' | 'entered';

export function resolveOwner(
  mode: OwnerMode,
  enteredOwner: string | null,
  walletAddress: string | null,
  settingsOwner: string | null,
): string | null {
  if (mode === 'entered') return enteredOwner;
  return walletAddress ?? settingsOwner;
}

export type OwnerSource = 'local wallet' | 'entered address' | null;

export function ownerSource(
  mode: OwnerMode,
  enteredOwner: string | null,
  walletAddress: string | null,
): OwnerSource {
  if (mode === 'entered') return enteredOwner === null ? null : 'entered address';
  return walletAddress === null ? null : 'local wallet';
}
