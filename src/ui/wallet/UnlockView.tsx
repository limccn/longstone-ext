/**
 * F-4: the locked view. It deliberately shows no address, account count, or
 * label — all three live inside the ciphertext (A-1). Failures are throttled in
 * memory and the copy never distinguishes a bad password from a damaged vault.
 */
import { useEffect, useState } from 'react';
import { UNLOCK_FAILURE_COPY, walletErrorCopy } from './copy.js';
import { PasswordInput } from './fields.js';
import { useFailureBackoff } from './rateLimit.js';
import { ResetDialog } from './ResetDialog.js';
import type { VaultApi } from './useVault.js';

export function UnlockView({ wallet }: { wallet: VaultApi }) {
  const corrupt = wallet.phase === 'CORRUPT';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    corrupt ? 'The saved wallet cannot be read. It was not modified.' : null,
  );
  const [forgot, setForgot] = useState(corrupt);
  const [resetOpen, setResetOpen] = useState(false);
  const backoff = useFailureBackoff();

  useEffect(() => {
    if (!corrupt) return;
    setForgot(true);
    setError('The saved wallet cannot be read. It was not modified.');
  }, [corrupt]);

  async function unlock(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await wallet.unlock(password);
      if (result.ok) {
        backoff.reset();
        setPassword('');
        return;
      }
      backoff.fail();
      setError(
        result.error.code === 'DECRYPT_FAILED'
          ? UNLOCK_FAILURE_COPY
          : walletErrorCopy(result.error),
      );
    } finally {
      setBusy(false);
    }
  }

  if (forgot) {
    return (
      <section className="wallet-view">
        <h2>No password recovery</h2>
        <p>
          There is no recovery. Without the password, this browser&apos;s wallet cannot be
          opened. If you saved the recovery phrase or private key, you can reset this wallet
          and import it again.
        </p>
        {corrupt && (
          <p className="error" role="alert">
            The saved wallet cannot be read. It was not modified.
          </p>
        )}
        <div className="row">
          <button
            type="button"
            className="warn"
            data-testid="wallet-reset"
            onClick={() => setResetOpen(true)}
          >
            Reset wallet
          </button>
          {!corrupt && (
            <button type="button" className="link-button" onClick={() => setForgot(false)}>
              Back
            </button>
          )}
        </div>
        {resetOpen && (
          <ResetDialog wallet={wallet} onClose={() => setResetOpen(false)} />
        )}
      </section>
    );
  }

  return (
    <section className="wallet-view">
      <h2>Wallet locked</h2>
      <p>Enter your password to unlock. Closing the panel locks the wallet.</p>
      <PasswordInput
        id="wallet-unlock-password"
        label="Password"
        testId="wallet-unlock-password"
        value={password}
        onChange={setPassword}
        disabled={busy || backoff.blocked}
        autoFocus
      />
      {error !== null && (
        <p className="error" role="alert" data-testid="wallet-unlock-error">
          {error}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          data-testid="wallet-unlock"
          onClick={() => void unlock()}
          disabled={busy || backoff.blocked || password === ''}
        >
          Unlock
        </button>
        <button
          type="button"
          className="link-button"
          data-testid="wallet-forgot"
          onClick={() => setForgot(true)}
        >
          Forgot password?
        </button>
      </div>
      {backoff.blocked && (
        <p className="hint small" role="status">
          Try again in {String(backoff.remainingSeconds)}s…
        </p>
      )}
      {busy && (
        <p className="loading" role="status">
          Unlocking…
        </p>
      )}
    </section>
  );
}
