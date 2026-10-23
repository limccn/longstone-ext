/**
 * F-7: rotate the password for every account. The vault performs a two-phase
 * write and reports which password is active if a failure leaves the outcome
 * ambiguous; this view never promises the old password works unless it does.
 */
import { useState } from 'react';
import { UNLOCK_FAILURE_COPY, walletErrorCopy } from './copy.js';
import { NewPasswordForm, PasswordInput } from './fields.js';
import type { VaultApi } from './useVault.js';

export function ChangePasswordView({
  wallet,
  onDone,
}: {
  wallet: VaultApi;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(nextPassword: string): Promise<void> {
    if (current === '') {
      setError('Enter your current password.');
      return;
    }
    const recordHash = wallet.vault?.recordHash;
    if (recordHash === undefined) {
      setError('Wallet is locked.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const result = await wallet.changePassword({
        currentPassword: current,
        newPassword: nextPassword,
        expectedRecordHash: recordHash,
      });
      if (result.ok) {
        onDone();
        return;
      }
      if (result.resolution !== 'old-password-still-valid') {
        // The hook has locked and shown the resolution notice; this view is
        // about to unmount.
        return;
      }
      if (result.error.code === 'DECRYPT_FAILED') {
        setError(UNLOCK_FAILURE_COPY);
      } else {
        setError(`${walletErrorCopy(result.error)} Your old password still works. Nothing was changed.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wallet-view">
      <h2>Change wallet password</h2>
      <PasswordInput
        id="wallet-change-old"
        label="Current password"
        testId="wallet-change-old"
        value={current}
        onChange={setCurrent}
        disabled={busy}
        autoFocus
      />
      <NewPasswordForm
        submitLabel="Change password"
        submitTestId="wallet-change-submit"
        errorTestId="wallet-change-error"
        newTestId="wallet-change-new"
        confirmTestId="wallet-change-confirm"
        idPrefix="wallet-change"
        warning="This changes the password for every account in this wallet. There is still no recovery if you forget it."
        onSubmit={submit}
        busy={busy}
        error={error}
        onCancel={onDone}
        cancelLabel="Back"
      />
    </section>
  );
}
