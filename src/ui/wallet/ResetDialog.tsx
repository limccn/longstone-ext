/**
 * Destructive reset (A-3). This only deletes the encrypted local record; it is
 * not a recovery channel. Typing RESET is required because there is no undo.
 */
import { useState } from 'react';
import { walletErrorCopy } from './copy.js';
import { Dialog } from './fields.js';
import type { VaultApi } from './useVault.js';

export function ResetDialog({
  wallet,
  onClose,
}: {
  wallet: VaultApi;
  onClose: () => void;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await wallet.reset();
      if (!result.ok) {
        setError(walletErrorCopy(result.error));
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Reset wallet" testId="wallet-reset-dialog" onClose={onClose} dismissible={false}>
      <p>
        This deletes the encrypted wallet from this browser. It cannot be undone.
      </p>
      <p className="hint small">
        If you saved the recovery phrase or private key, you can import it again after
        resetting.
      </p>
      <div className="wallet-field">
        <label htmlFor="wallet-reset-confirmation">Type RESET to confirm</label>
        <input
          id="wallet-reset-confirmation"
          data-testid="wallet-reset-input"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="warn"
          data-testid="wallet-reset-confirm"
          onClick={() => void reset()}
          disabled={confirmation !== 'RESET' || busy}
        >
          Reset wallet
        </button>
        <button type="button" className="link-button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
