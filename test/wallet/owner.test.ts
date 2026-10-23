/**
 * Owner priority (design §5.5). The UI must show the wallet's active address by
 * default, let a manually entered address win, and fall back to the Settings
 * default while locked — without ever writing the wallet address to Settings.
 */
import { describe, expect, it } from 'vitest';
import { ownerSource, resolveOwner } from '../../src/ui/wallet/owner.js';

const WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ENTERED = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SETTINGS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('timeline owner resolution', () => {
  it('uses the active wallet address while unlocked when nothing was entered', () => {
    expect(resolveOwner('wallet', null, WALLET, null)).toBe(WALLET);
    expect(resolveOwner('wallet', null, WALLET, SETTINGS)).toBe(WALLET);
    expect(ownerSource('wallet', null, WALLET)).toBe('local wallet');
  });

  it('lets an entered address win over the wallet', () => {
    expect(resolveOwner('entered', ENTERED, WALLET, SETTINGS)).toBe(ENTERED);
    expect(ownerSource('entered', ENTERED, WALLET)).toBe('entered address');
  });

  it('falls back to the Settings default while locked or without a vault', () => {
    expect(resolveOwner('wallet', null, null, SETTINGS)).toBe(SETTINGS);
    expect(resolveOwner('wallet', null, null, null)).toBeNull();
    expect(ownerSource('wallet', null, null)).toBeNull();
  });

  it('keeps an explicitly cleared owner empty instead of falling back', () => {
    expect(resolveOwner('entered', null, WALLET, SETTINGS)).toBeNull();
    expect(ownerSource('entered', null, WALLET)).toBeNull();
  });

  it('follows an active-account switch only in wallet mode', () => {
    expect(resolveOwner('wallet', null, ENTERED, null)).toBe(ENTERED);
    expect(resolveOwner('entered', ENTERED, SETTINGS, null)).toBe(ENTERED);
  });
});
