/**
 * F-2: generate → reveal (masked by default) → sequential 4-word check → password.
 * The mnemonic never touches storage until `createVault` writes the encrypted
 * record; before that, leaving the flow drops it with the component.
 */
import { useCallback, useMemo, useState } from 'react';
import { generateWalletMnemonic } from '@limccn/longstone-wallet';
import { walletErrorCopy, NO_RECOVERY_COPY, TESTNET_COPY } from './copy.js';
import { copyText } from './clipboard.js';
import { NewPasswordForm } from './fields.js';
import { useAutoHide } from './reveal.js';
import type { VaultApi } from './useVault.js';

type Step = 'phrase' | 'confirm' | 'password' | 'done';

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    const swap = (buffer[0] ?? 0) % (index + 1);
    const current = out[index] as T;
    out[index] = out[swap] as T;
    out[swap] = current;
  }
  return out;
}

/** Four distinct 1-based word positions, in the order the user must pick them. */
function pickPositions(): number[] {
  return shuffle(Array.from({ length: 12 }, (_, index) => index + 1)).slice(0, 4);
}

export function CreateFlow({
  wallet,
  onDone,
  onCancel,
}: {
  wallet: VaultApi;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [mnemonic, setMnemonic] = useState(() => generateWalletMnemonic());
  const [step, setStep] = useState<Step>('phrase');
  const [revealed, setRevealed] = useState(false);
  const [confirmRevealed, setConfirmRevealed] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAddress, setCreatedAddress] = useState('');
  const [cancelPrompt, setCancelPrompt] = useState(false);

  const words = useMemo(() => (mnemonic === '' ? [] : mnemonic.split(' ')), [mnemonic]);
  const bank = useMemo(() => shuffle(words), [words]);
  const positions = useMemo(() => pickPositions(), [mnemonic]);

  const hidePhrase = useCallback(() => setRevealed(false), []);
  const hideConfirmPhrase = useCallback(() => setConfirmRevealed(false), []);
  useAutoHide(revealed, hidePhrase);
  useAutoHide(confirmRevealed, hideConfirmPhrase);

  function restart(): void {
    setMnemonic(generateWalletMnemonic());
    setStep('phrase');
    setRevealed(false);
    setConfirmRevealed(false);
    setSelected([]);
    setConfirmError(null);
    setError(null);
    setCancelPrompt(false);
  }

  function chooseWord(word: string): void {
    const expected = positions[selected.length];
    if (expected === undefined) return;
    if (word !== words[expected - 1]) {
      setConfirmError(
        `That is not word #${String(expected)}. Your phrase is still here — reveal it again and check.`,
      );
      setSelected([]);
      setConfirmRevealed(false);
      return;
    }
    setConfirmError(null);
    setSelected((current) => [...current, expected]);
  }

  async function submitPassword(password: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      // Let React paint the "Encrypting…" state before Argon2id blocks the
      // main thread; hash-wasm cannot be interrupted, so this is the only
      // chance to show progress copy.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const result = await wallet.create(password, {
        source: 'created',
        secret: { kind: 'mnemonic', words: mnemonic },
      });
      if (!result.ok) {
        setError(walletErrorCopy(result.error));
        return;
      }
      setCreatedAddress(result.value.payload.accounts[0]?.address ?? '');
      // The completion screen does not need the phrase; dropping it now also
      // keeps a stale copy out of the mounted component.
      setMnemonic('');
      setRevealed(false);
      setConfirmRevealed(false);
      setStep('done');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <section className="wallet-view">
        <h2>Wallet created</h2>
        <p className="mono">{createdAddress}</p>
        <div className="row">
          <button
            type="button"
            onClick={() => {
              void copyText(createdAddress).then((ok) =>
                wallet.showNotice(ok ? 'Address copied.' : 'Could not copy the address.'),
              );
            }}
          >
            Copy address
          </button>
        </div>
        <p className="hint small">Account 1</p>
        <p>
          The wallet is locked when you close the side panel. You can export the recovery
          phrase from Account details.
        </p>
        <button type="button" data-testid="wallet-done" onClick={onDone}>
          Done
        </button>
      </section>
    );
  }

  return (
    <section className="wallet-view">
      {step === 'phrase' && (
        <>
          <h2>Your recovery phrase</h2>
          <div className="wallet-word-grid">
            {words.map((word, index) => (
              <div className="wallet-word-cell" key={`${String(index)}-${word}`}>
                <span className="hint small">{index + 1}.</span>
                <span className="mono">{revealed ? word : '••••'}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            data-testid="wallet-mnemonic-reveal"
            aria-pressed={revealed}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? 'Hide words' : 'Reveal words'}
          </button>
          <p className="hint warn small">
            Anyone with these 12 words can take this wallet. Write them down offline. Do not
            store them in a password manager, cloud note, or screenshot.
          </p>
          <p className="hint small">{TESTNET_COPY}</p>
          <div className="row">
            <button
              type="button"
              data-testid="wallet-mnemonic-continue"
              onClick={() => setStep('confirm')}
            >
              I have written it down
            </button>
            <button
              type="button"
              className="link-button"
              data-testid="wallet-mnemonic-restart"
              onClick={restart}
            >
              Start over
            </button>
          </div>
        </>
      )}

      {step === 'confirm' && (
        <>
          <h2>Confirm your recovery phrase</h2>
          <p>
            Select word {positions.map((position) => `#${String(position)}`).join(', then ')} —
            in that order.
          </p>
          <button
            type="button"
            className="link-button"
            aria-pressed={confirmRevealed}
            onClick={() => setConfirmRevealed((current) => !current)}
          >
            {confirmRevealed ? 'Hide words' : 'Reveal words'}
          </button>
          {confirmRevealed && (
            <p className="mono hint small">
              {words.map((word, index) => `${String(index + 1)}. ${word}`).join('  ')}
            </p>
          )}
          <div className="wallet-slots">
            {[0, 1, 2, 3].map((slot) => {
              const position = selected[slot];
              const word = position === undefined ? '—' : words[position - 1];
              return (
                <button
                  key={slot}
                  type="button"
                  className="wallet-slot"
                  data-testid={`wallet-confirm-slot-${String(slot)}`}
                  onClick={() => setSelected((current) => current.slice(0, -1))}
                  disabled={position === undefined}
                  aria-label={`Selected word ${String(slot + 1)}`}
                >
                  {word}
                </button>
              );
            })}
          </div>
          <div className="wallet-word-bank" data-testid="wallet-word-bank">
            {bank.map((word, index) => (
              <button
                key={`${String(index)}-${word}`}
                type="button"
                data-testid={`wallet-word-${word}`}
                onClick={() => chooseWord(word)}
                disabled={selected.length >= 4}
              >
                {word}
              </button>
            ))}
          </div>
          {confirmError !== null && (
            <p className="error" role="alert">
              {confirmError}
            </p>
          )}
          <div className="row">
            <button
              type="button"
              data-testid="wallet-confirm-continue"
              disabled={selected.length !== 4}
              onClick={() => setStep('password')}
            >
              Continue
            </button>
            <button type="button" className="link-button" onClick={() => setStep('phrase')}>
              Back
            </button>
          </div>
        </>
      )}

      {step === 'password' && (
        <>
          <h2>Set a wallet password</h2>
          <NewPasswordForm
            submitLabel="Create wallet"
            submitTestId="wallet-password-submit"
            errorTestId="wallet-password-error"
            onSubmit={submitPassword}
            busy={busy}
            error={error}
            warning={NO_RECOVERY_COPY}
            onCancel={() => setCancelPrompt(true)}
            cancelLabel="Cancel setup"
          />
        </>
      )}

      {cancelPrompt && (
        <div className="wallet-inline-confirm">
          <p>This wallet has not been saved yet. Leave and discard it?</p>
          <div className="row">
            <button type="button" className="warn" onClick={onCancel}>
              Leave and discard
            </button>
            <button type="button" className="link-button" onClick={() => setCancelPrompt(false)}>
              Keep editing
            </button>
          </div>
        </div>
      )}

      {step !== 'password' && !cancelPrompt && (
        <button
          type="button"
          className="link-button"
          onClick={() => setCancelPrompt(true)}
        >
          Cancel setup
        </button>
      )}
    </section>
  );
}
