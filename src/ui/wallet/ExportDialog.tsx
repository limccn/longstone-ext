/**
 * F-6: export one account's recovery phrase or private key.
 *
 * Password re-verification is mandatory even while the vault is unlocked.
 * Plaintext only enters the DOM after an explicit reveal, is hidden again
 * after 60 seconds or a hidden panel, and is dropped when the dialog unmounts.
 */
import { useCallback, useState } from 'react';
import {
  deriveAccountFromMnemonic,
  DERIVATION_PATH,
  type VaultAccount,
} from '@limccn/longstone-wallet';
import { UNLOCK_FAILURE_COPY, walletErrorCopy } from './copy.js';
import { copyText } from './clipboard.js';
import { Dialog, PasswordInput } from './fields.js';
import { useFailureBackoff } from './rateLimit.js';
import { useAutoHide } from './reveal.js';
import type { VaultApi } from './useVault.js';

type Step = 'password' | 'risk' | 'secret';
export type ExportKind = 'privateKey' | 'mnemonic';

export function ExportDialog({
  wallet,
  account,
  kind,
  onClose,
}: {
  wallet: VaultApi;
  account: VaultAccount;
  kind: ExportKind;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretText, setSecretText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const backoff = useFailureBackoff();

  const hide = useCallback(() => setRevealed(false), []);
  useAutoHide(revealed, hide);

  const title =
    step === 'password'
      ? 'Confirm your password'
      : step === 'risk'
        ? 'Before you reveal it'
        : kind === 'privateKey'
          ? 'Private key'
          : 'Recovery phrase';

  async function verify(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await wallet.verifyPassword(password);
      if (!result.ok) {
        backoff.fail();
        setError(
          result.error.code === 'DECRYPT_FAILED'
            ? UNLOCK_FAILURE_COPY
            : walletErrorCopy(result.error),
        );
        return;
      }
      // The key in `result` is only used for this check; drop the reference.
      backoff.reset();
      setPassword('');
      setStep('risk');
    } finally {
      setBusy(false);
    }
  }

  function enterSecret(): void {
    let text = '';
    if (kind === 'mnemonic') {
      text = account.secret.kind === 'mnemonic' ? account.secret.words : '';
    } else if (account.secret.kind === 'privateKey') {
      text = account.secret.hex;
    } else {
      text = deriveAccountFromMnemonic(account.secret.words).privateKey;
    }
    setSecretText(text);
    setRevealed(false);
    setManualCopy(false);
    setStep('secret');
  }

  function close(): void {
    setSecretText('');
    setRevealed(false);
    setPassword('');
    onClose();
  }

  return (
    <Dialog title={title} testId="wallet-export-dialog" onClose={close}>
      {step === 'password' && (
        <>
          <p className="hint small">
            Exporting is a separate check, even while the wallet is unlocked.
          </p>
          <PasswordInput
            id="wallet-export-password"
            label="Password"
            testId="wallet-export-password"
            value={password}
            onChange={setPassword}
            disabled={busy || backoff.blocked}
            autoFocus
          />
          {error !== null && (
            <p className="error" role="alert" data-testid="wallet-export-error">
              {error}
            </p>
          )}
          <div className="row">
            <button
              type="button"
              data-testid="wallet-export-verify"
              onClick={() => void verify()}
              disabled={busy || backoff.blocked || password === ''}
            >
              Continue
            </button>
            <button type="button" className="link-button" onClick={close}>
              Cancel
            </button>
          </div>
          {backoff.blocked && (
            <p className="hint small" role="status">
              Try again in {String(backoff.remainingSeconds)}s…
            </p>
          )}
          {busy && (
            <p className="loading" role="status">
              Checking…
            </p>
          )}
        </>
      )}

      {step === 'risk' && (
        <>
          <p>
            Anyone with this can take this account. Make sure nobody can see your screen.
            Your clipboard may keep a copy after you leave.
          </p>
          {kind === 'privateKey' && account.source !== 'private-key' && (
            <p className="hint small">
              This key controls the account derived at {DERIVATION_PATH}.
            </p>
          )}
          <div className="row">
            <button
              type="button"
              data-testid="wallet-export-reveal-admit"
              onClick={enterSecret}
            >
              {kind === 'privateKey' ? 'Show private key' : 'Show recovery phrase'}
            </button>
            <button type="button" className="link-button" onClick={close}>
              Cancel
            </button>
          </div>
        </>
      )}

      {step === 'secret' && (
        <>
          <div data-testid="wallet-export-secret" className="wallet-secret">
            {revealed ? (
              kind === 'mnemonic' ? (
                <ol className="wallet-secret-words">
                  {secretText.split(' ').map((word, index) => (
                    <li key={`${String(index)}-${word}`} className="mono">
                      {word}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mono">{secretText}</p>
              )
            ) : (
              <p className="mono" aria-live="polite">
                ••••
              </p>
            )}
          </div>
          <div className="row">
            <button
              type="button"
              className="link-button"
              data-testid="wallet-export-reveal"
              aria-pressed={revealed}
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? 'Hide' : 'Reveal'}
            </button>
            <button
              type="button"
              data-testid="wallet-export-copy"
              disabled={!revealed}
              onClick={() => {
                void copyText(secretText).then((ok) => {
                  if (ok) wallet.showNotice('Copied. Your clipboard may keep a copy.');
                  else setManualCopy(true);
                });
              }}
            >
              Copy
            </button>
          </div>
          {manualCopy && revealed && (
            <>
              <textarea
                className="mono"
                readOnly
                rows={3}
                data-testid="wallet-export-manual-copy"
                value={secretText}
                onFocus={(event) => event.currentTarget.select()}
              />
              <p className="hint small">Press Ctrl+C / ⌘C to copy.</p>
            </>
          )}
          <p className="hint small">
            This stays visible for 60 seconds, until you hide it, or until the panel is
            hidden.
          </p>
          <button type="button" data-testid="wallet-export-done" onClick={close}>
            Done
          </button>
        </>
      )}
    </Dialog>
  );
}
