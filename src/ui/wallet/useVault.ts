/**
 * Vault state for the side panel (design §7, DR-19).
 *
 * The decrypted payload and its non-extractable AES key live in this hook's
 * state, i.e. in page memory. Locking drops both synchronously before any
 * await, bumps an epoch so results of in-flight KDF work cannot repopulate the
 * UI, and reloads only the ciphertext metadata.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WALLET_STORAGE_KEYS,
  onWalletStorageChanged,
  walletStorage,
} from '../../lib/chromeApi.js';
import { createWriteGuard, type WriteGuard } from './writeGuard.js';
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  WalletError,
  addAccount as addAccountOp,
  changePassword as changePasswordOp,
  createEpochGate,
  createLockController,
  createVault,
  deleteAccount as deleteAccountOp,
  loadVault,
  renameAccount as renameAccountOp,
  resetVault,
  setActiveAccount as setActiveAccountOp,
  setIdleTimeout as setIdleTimeoutOp,
  unlockVault,
  type ChangePasswordInput,
  type ChangePasswordResult,
  type DeleteOutcome,
  type EpochGate,
  type LockController,
  type LockReason,
  type NewAccountInput,
  type UnlockedVault,
  type UnlockOutcome,
  type VaultAccount,
  type VaultDeps,
  type VaultLoad,
  type VaultPayload,
  type VaultResult,
} from '@limccn/longstone-wallet';

export type WalletPhase = 'loading' | 'NO_VAULT' | 'LOCKED' | 'CORRUPT' | 'UNLOCKED';

export interface VaultApi {
  phase: WalletPhase;
  load: VaultLoad | null;
  vault: UnlockedVault | null;
  activeAccount: VaultAccount | null;
  notice: string | null;
  showNotice: (message: string) => void;
  dismissNotice: () => void;
  create: (
    password: string,
    account: NewAccountInput,
  ) => Promise<VaultResult<UnlockedVault>>;
  unlock: (password: string) => Promise<VaultResult<UnlockOutcome>>;
  verifyPassword: (password: string) => Promise<VaultResult<UnlockOutcome>>;
  lock: (reason?: LockReason) => void;
  addAccount: (input: NewAccountInput) => Promise<VaultResult<UnlockedVault>>;
  renameAccount: (accountId: string, label: string) => Promise<VaultResult<UnlockedVault>>;
  setActiveAccount: (accountId: string) => Promise<VaultResult<UnlockedVault>>;
  deleteAccount: (accountId: string) => Promise<VaultResult<DeleteOutcome>>;
  setIdleTimeout: (idleTimeoutMs: number | null) => Promise<VaultResult<UnlockedVault>>;
  changePassword: (input: ChangePasswordInput) => Promise<ChangePasswordResult>;
  reset: () => Promise<VaultResult<null>>;
  reload: () => Promise<void>;
}

const VAULT_DEPS: VaultDeps = {
  storage: walletStorage,
  keys: WALLET_STORAGE_KEYS,
};

const LOCKED_DETAIL = {
  pendingOnly: false,
  primaryCorrupt: false,
} as const;

export function useVault(): VaultApi {
  const [load, setLoad] = useState<VaultLoad | null>(null);
  const [vault, setVaultState] = useState<UnlockedVault | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const vaultRef = useRef<UnlockedVault | null>(null);
  const controllerRef = useRef<LockController | null>(null);
  const epochRef = useRef<EpochGate | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createLockController({ now: () => Date.now() });
  }
  if (epochRef.current === null) epochRef.current = createEpochGate();

  const setVault = useCallback((next: UnlockedVault | null) => {
    vaultRef.current = next;
    setVaultState(next);
  }, []);

  const reload = useCallback(async () => {
    try {
      setLoad(await loadVault(VAULT_DEPS));
    } catch {
      setLoad({ kind: 'CORRUPT', pendingOnly: false });
    }
  }, []);

  const showNotice = useCallback((message: string) => setNotice(message), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  // A resolved storage write is not proof it landed (design §4.2 step 7.c).
  // Verification failures lock, reload, and surface a specific notice; every
  // write path below stops adopting the in-memory result when it returns false.
  const writeGuardRef = useRef<WriteGuard | null>(null);
  if (writeGuardRef.current === null) {
    writeGuardRef.current = createWriteGuard({
      deps: VAULT_DEPS,
      onUnverified: () => {
        controllerRef.current?.lock('explicit');
        void reload();
        setNotice('Could not verify the save. Unlock again to reload.');
      },
    });
  }
  const writeGuard = writeGuardRef.current;

  function applyIdleSetting(payload: VaultPayload): void {
    const controller = controllerRef.current;
    if (controller === null) return;
    const timeout =
      payload.idleTimeoutMs === undefined ? DEFAULT_IDLE_TIMEOUT_MS : payload.idleTimeoutMs;
    if (timeout === null) {
      controller.setEnabled(false);
    } else {
      controller.setTimeoutMs(timeout);
      controller.setEnabled(true);
    }
  }

  function activate(payload: VaultPayload): void {
    applyIdleSetting(payload);
    controllerRef.current?.unlock();
  }

  useEffect(() => {
    let cancelled = false;
    void loadVault(VAULT_DEPS)
      .then((loaded) => {
        if (!cancelled) setLoad(loaded);
      })
      .catch(() => {
        if (!cancelled) setLoad({ kind: 'CORRUPT', pendingOnly: false });
      });
    return () => {
      cancelled = true;
      // The page is going away or the panel remounted: drop the only reference
      // to the key. Any KDF that resolves later fails the epoch check.
      vaultRef.current = null;
      epochRef.current?.bump();
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (controller === null) return;
    return controller.onLock((reason) => {
      const hadVault = vaultRef.current !== null;
      setVault(null);
      epochRef.current?.bump();
      void reload();
      if (!hadVault) return;
      if (reason === 'idle') setNotice('Wallet locked after inactivity.');
      else if (reason === 'explicit') setNotice('Wallet locked.');
      else if (reason === 'external-change') {
        setNotice('The wallet was changed in another window. Unlock again.');
      }
    });
  }, [reload, setVault]);

  useEffect(
    () =>
      onWalletStorageChanged(() => {
        // Design §3.3: an external write bumps the epoch synchronously, even
        // when this panel was already locked. An unlock/create in flight while
        // locked must not adopt the record it read before the rival write.
        epochRef.current?.bump();
        if (vaultRef.current !== null) {
          controllerRef.current?.lock('external-change');
        } else {
          void reload();
        }
      }),
    [reload],
  );

  useEffect(() => {
    const controller = controllerRef.current;
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        // Design §3.3: bump on hidden itself, not only when the controller
        // transitions from unlocked. A create/unlock started while locked must
        // be discarded even if the panel becomes visible again before the KDF
        // resolves (the final visibility check alone cannot catch that).
        epochRef.current?.bump();
        controller?.handleVisibility('hidden');
      }
    };
    const onPageHide = (): void => {
      // Same rule: pagehide invalidates in-flight work regardless of the
      // controller state.
      epochRef.current?.bump();
      controller?.lock('pagehide');
    };
    const onActivity = (): void => {
      controller?.touch();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('pointerdown', onActivity, true);
    document.addEventListener('keydown', onActivity, true);
    document.addEventListener('focusin', onActivity, true);
    const timer = window.setInterval(() => {
      controller?.check();
    }, 15_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('pointerdown', onActivity, true);
      document.removeEventListener('keydown', onActivity, true);
      document.removeEventListener('focusin', onActivity, true);
      window.clearInterval(timer);
    };
  }, []);

  async function create(
    password: string,
    account: NewAccountInput,
  ): Promise<VaultResult<UnlockedVault>> {
    const epoch = epochRef.current?.current() ?? 0;
    const result = await createVault(VAULT_DEPS, { password, account });
    if (!result.ok) return result;
    if (!(await writeGuard.confirmRecordHash(result.value.recordHash))) {
      return { ok: false, error: new WalletError('STORAGE_FAILED') };
    }
    if (document.visibilityState === 'hidden') {
      // The record is written, but the panel is not visible: keep the key out
      // of memory and let the next open start from LOCKED.
      void reload();
      return result;
    }
    if (epochRef.current?.isCurrent(epoch) !== true) {
      void reload();
      return result;
    }
    activate(result.value.payload);
    epochRef.current?.bump();
    setVault(result.value);
    return result;
  }

  async function unlock(password: string): Promise<VaultResult<UnlockOutcome>> {
    const epoch = epochRef.current?.current() ?? 0;
    const result = await unlockVault(VAULT_DEPS, password);
    if (!result.ok) return result;
    if (document.visibilityState === 'hidden') {
      void reload();
      return result;
    }
    if (epochRef.current?.isCurrent(epoch) !== true) {
      void reload();
      return result;
    }
    activate(result.value.vault.payload);
    epochRef.current?.bump();
    setVault(result.value.vault);
    setLoad({
      kind: 'LOCKED',
      recordHash: result.value.vault.recordHash,
      kdf: result.value.vault.kdf,
      createdAt: result.value.vault.createdAt,
      updatedAt: result.value.vault.updatedAt,
      ...LOCKED_DETAIL,
    });
    return result;
  }

  async function verifyPassword(password: string): Promise<VaultResult<UnlockOutcome>> {
    return unlockVault(VAULT_DEPS, password);
  }

  function lock(reason: LockReason = 'explicit'): void {
    controllerRef.current?.lock(reason);
  }

  /**
   * Runs a vault mutation against the current key, then confirms its outcome
   * on disk before adopting it. A CONFLICT or vanished record means another
   * window won; an unconfirmed write locks instead of claiming success.
   */
  async function withVault<T>(
    operation: (current: UnlockedVault) => Promise<VaultResult<T>>,
    apply: (value: T) => void,
    confirm: (value: T) => Promise<boolean>,
  ): Promise<VaultResult<T>> {
    const current = vaultRef.current;
    if (current === null) return { ok: false, error: new WalletError('LOCKED') };
    const epoch = epochRef.current?.current() ?? 0;
    const result = await operation(current);
    if (!result.ok) {
      if (result.error.code === 'CONFLICT' || result.error.code === 'NO_VAULT') {
        controllerRef.current?.lock('external-change');
      }
      return result;
    }
    if (!(await confirm(result.value))) {
      return { ok: false, error: new WalletError('STORAGE_FAILED') };
    }
    if (epochRef.current?.isCurrent(epoch) !== true) {
      void reload();
      return result;
    }
    apply(result.value);
    return result;
  }

  function addAccount(input: NewAccountInput): Promise<VaultResult<UnlockedVault>> {
    return withVault(
      (current) => addAccountOp(VAULT_DEPS, current, input),
      (value) => setVault(value),
      (value) => writeGuard.confirmRecordHash(value.recordHash),
    );
  }

  function renameAccount(
    accountId: string,
    label: string,
  ): Promise<VaultResult<UnlockedVault>> {
    return withVault(
      (current) => renameAccountOp(VAULT_DEPS, current, accountId, label),
      (value) => setVault(value),
      (value) => writeGuard.confirmRecordHash(value.recordHash),
    );
  }

  function setActiveAccount(accountId: string): Promise<VaultResult<UnlockedVault>> {
    return withVault(
      (current) => setActiveAccountOp(VAULT_DEPS, current, accountId),
      (value) => setVault(value),
      (value) => writeGuard.confirmRecordHash(value.recordHash),
    );
  }

  function deleteAccount(accountId: string): Promise<VaultResult<DeleteOutcome>> {
    return withVault(
      (current) => deleteAccountOp(VAULT_DEPS, current, accountId),
      (outcome) => {
        if (outcome.vault !== null) {
          setVault(outcome.vault);
          return;
        }
        setVault(null);
        setLoad({ kind: 'NO_VAULT' });
        controllerRef.current?.lock('explicit');
        setNotice('Wallet removed from this browser.');
      },
      (outcome) =>
        outcome.vault === null
          ? writeGuard.confirmAbsent()
          : writeGuard.confirmRecordHash(outcome.vault.recordHash),
    );
  }

  function setIdleTimeout(idleTimeoutMs: number | null): Promise<VaultResult<UnlockedVault>> {
    return withVault(
      (current) => setIdleTimeoutOp(VAULT_DEPS, current, idleTimeoutMs),
      (value) => {
        setVault(value);
        applyIdleSetting(value.payload);
        if (value.payload.idleTimeoutMs !== null) controllerRef.current?.touch();
      },
      (value) => writeGuard.confirmRecordHash(value.recordHash),
    );
  }

  async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
    const current = vaultRef.current;
    if (current === null) {
      return {
        ok: false,
        error: new WalletError('LOCKED'),
        resolution: 'old-password-still-valid',
      };
    }
    const epoch = epochRef.current?.current() ?? 0;
    const result = await changePasswordOp(VAULT_DEPS, {
      ...input,
      expectedRecordHash: current.recordHash,
    });
    if (result.ok) {
      if (!(await writeGuard.confirmRecordHash(result.value.recordHash))) {
        // The write may or may not have landed; never claim success. The new
        // password is the one to try first after unlocking again.
        return {
          ok: false,
          error: new WalletError('STORAGE_FAILED'),
          resolution: 'try-new-password',
        };
      }
      if (epochRef.current?.isCurrent(epoch) === true) {
        setVault(result.value);
        epochRef.current?.bump();
        setNotice(
          result.pendingCleanupFailed
            ? 'Password changed. The old pending record could not be removed; it will be cleaned up on the next unlock.'
            : 'Password changed.',
        );
      } else {
        void reload();
      }
      return result;
    }
    if (result.resolution === 'wallet-changed') {
      controllerRef.current?.lock('external-change');
      setNotice('The wallet was changed in another window. Unlock again.');
    } else if (result.resolution === 'try-new-password') {
      controllerRef.current?.lock('explicit');
      setNotice(
        'Try your new password first. If it fails, try the old one; if both fail, reset the wallet.',
      );
    }
    return result;
  }

  async function reset(): Promise<VaultResult<null>> {
    // Design §3.3: a reset invalidates anything already in flight, before the
    // first await.
    epochRef.current?.bump();
    const result = await resetVault(VAULT_DEPS);
    if (!result.ok) {
      void reload();
      return result;
    }
    if (!(await writeGuard.confirmAbsent())) {
      return { ok: false, error: new WalletError('STORAGE_FAILED') };
    }
    setVault(null);
    setLoad({ kind: 'NO_VAULT' });
    controllerRef.current?.lock('explicit');
    setNotice('Wallet reset.');
    return result;
  }

  const activeAccount = useMemo(() => {
    if (vault === null) return null;
    return (
      vault.payload.accounts.find(
        (account) => account.id === vault.payload.activeAccountId,
      ) ?? null
    );
  }, [vault]);

  const phase: WalletPhase =
    vault !== null ? 'UNLOCKED' : load === null ? 'loading' : load.kind;

  return {
    phase,
    load,
    vault,
    activeAccount,
    notice,
    showNotice,
    dismissNotice,
    create,
    unlock,
    verifyPassword,
    lock,
    addAccount,
    renameAccount,
    setActiveAccount,
    deleteAccount,
    setIdleTimeout,
    changePassword,
    reset,
    reload,
  };
}
