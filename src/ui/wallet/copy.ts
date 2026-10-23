/**
 * User-visible copy for wallet errors and account metadata.
 *
 * The vault only exposes typed codes (never exception text or secret material);
 * this table is the single place that turns them into English. The wording is
 * fixed by `ux-flows.md` §11 — unlock, export and change-password failures stay
 * indistinguishable on purpose.
 */
import type {
  AccountSource,
  PasswordValidation,
  WalletError,
} from '@limccn/longstone-wallet';

export const UNLOCK_FAILURE_COPY = 'Wrong password, or the vault data is damaged.';

export function walletErrorCopy(error: WalletError): string {
  switch (error.code) {
    case 'TOO_SHORT':
      return 'Password must be at least 8 characters.';
    case 'TOO_LONG':
      return 'Password must be at most 1024 characters.';
    case 'CONFIRM_MISMATCH':
      return 'The two passwords do not match.';
    case 'DECRYPT_FAILED':
      return UNLOCK_FAILURE_COPY;
    case 'MNEMONIC_WORD_COUNT':
      return `A recovery phrase must have 12, 15, 18, 21, or 24 words (found ${String(
        error.details.wordCount ?? 0,
      )}).`;
    case 'MNEMONIC_WORDLIST':
      return `Word #${String(error.details.wordIndex ?? 0)} is not in the BIP-39 English word list.`;
    case 'MNEMONIC_CHECKSUM':
      return 'That word sequence is not a valid recovery phrase (checksum failed).';
    case 'PRIVATE_KEY_FORMAT':
      return 'A private key must be 0x followed by 64 hex characters.';
    case 'PRIVATE_KEY_RANGE':
      return 'That private key is outside the valid range.';
    case 'ACCOUNT_EXISTS':
      return 'This address is already in this wallet.';
    case 'ACCOUNT_LIMIT':
      return 'This wallet already has the maximum of 50 accounts.';
    case 'ACCOUNT_NOT_FOUND':
      return 'That account is no longer in this wallet.';
    case 'LABEL_INVALID':
      return 'Enter a name of 1–64 characters.';
    case 'LOCKED':
      return 'Wallet is locked.';
    case 'STORAGE_FAILED':
      return "Could not save to this browser's storage. Nothing was changed.";
    case 'VAULT_CORRUPT':
      return 'The saved wallet cannot be read. It was not modified.';
    case 'KDF_UNAVAILABLE':
      return 'Encryption is unavailable in this browser.';
    case 'KDF_PARAMS_UNSUPPORTED':
      return 'This wallet was saved with unsupported settings.';
    case 'NO_VAULT':
      return 'There is no wallet in this browser.';
    case 'VAULT_EXISTS':
      return 'A wallet already exists in this browser.';
    case 'CONFLICT':
      return 'The wallet was changed in another window. Unlock again.';
  }
}

export function passwordValidationCopy(
  code: Extract<PasswordValidation, { ok: false }>['code'],
): string {
  if (code === 'TOO_SHORT') return 'Password must be at least 8 characters.';
  if (code === 'TOO_LONG') return 'Password must be at most 1024 characters.';
  return 'The two passwords do not match.';
}

export function sourceLabel(source: AccountSource): string {
  if (source === 'created') return 'Created';
  if (source === 'mnemonic') return 'Imported phrase';
  return 'Imported key';
}

export const PASSWORD_RULES_COPY =
  'At least 8 characters. Spaces count.';

export const NO_RECOVERY_COPY =
  'There is no password recovery. If you forget this password, the wallet on this browser cannot be opened. Export your recovery phrase if you want a backup.';

export const TESTNET_COPY =
  'This wallet is for the Base Sepolia testnet. A browser-held key is not the same trust model as a hardware wallet.';

export const DERIVATION_PATH_COPY = "m/44'/60'/0'/0/0";
