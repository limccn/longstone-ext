/**
 * F-3: import a BIP-39 phrase (12/15/18/21/24 words) or a private key.
 *
 * Format errors are field-level and distinguishable. The address confirmation
 * is mandatory, and a duplicate address never reaches the password step. When
 * opened from an unlocked vault, adding an account reuses the in-memory key and
 * never asks for the password again.
 */
import { useMemo, useState } from 'react';
import {
  deriveAccountFromMnemonic,
  parseMnemonicInput,
  parsePrivateKeyInput,
} from '../../lib/wallet/accounts.js';
import type { AccountSource, VaultSecret } from '../../lib/wallet/format.js';
import { walletErrorCopy } from './copy.js';
import { copyText } from './clipboard.js';
import { NewPasswordForm, PasswordInput } from './fields.js';
import type { VaultApi } from './useVault.js';

type ImportType = 'mnemonic' | 'private-key';
type Step = 'type' | 'address' | 'password' | 'done';

interface ParsedImport {
  source: AccountSource;
  secret: VaultSecret;
  address: string;
}

export function ImportFlow({
  wallet,
  from,
  onDone,
  onCancel,
}: {
  wallet: VaultApi;
  from: 'welcome' | 'accounts';
  onDone: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ImportType>('mnemonic');
  const [raw, setRaw] = useState('');
  const [step, setStep] = useState<Step>('type');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneAddress, setDoneAddress] = useState('');

  const duplicate = useMemo(() => {
    if (parsed === null || wallet.vault === null) return false;
    const address = parsed.address.toLowerCase();
    return wallet.vault.payload.accounts.some(
      (account) => account.address.toLowerCase() === address,
    );
  }, [parsed, wallet.vault]);

  function switchType(next: ImportType): void {
    setType(next);
    setRaw('');
    setError(null);
    setParsed(null);
    setConfirmed(false);
  }

  function parse(): ParsedImport | null {
    if (type === 'mnemonic') {
      const words = parseMnemonicInput(raw);
      if (!words.ok) {
        setError(walletErrorCopy(words.error));
        return null;
      }
      // Derivation uses the same audited path as the vault; the address shown
      // here is the one `create`/`addAccount` will store.
      return {
        source: 'mnemonic',
        secret: { kind: 'mnemonic', words: words.words },
        address: deriveAccountFromMnemonic(words.words).address,
      };
    }
    const key = parsePrivateKeyInput(raw);
    if (!key.ok) {
      setError(walletErrorCopy(key.error));
      return null;
    }
    return {
      source: 'private-key',
      secret: { kind: 'privateKey', hex: key.hex },
      address: key.address,
    };
  }

  function submitType(): void {
    const next = parse();
    if (next === null) return;
    setError(null);
    setParsed(next);
    setConfirmed(false);
    setStep('address');
  }

  async function addExisting(): Promise<void> {
    if (parsed === null || duplicate) return;
    setError(null);
    setBusy(true);
    try {
      const result = await wallet.addAccount({
        source: parsed.source,
        secret: parsed.secret,
      });
      if (!result.ok) {
        setError(walletErrorCopy(result.error));
        return;
      }
      wallet.showNotice('Account added.');
      setRaw('');
      setParsed(null);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function createNew(password: string): Promise<void> {
    if (parsed === null) return;
    setError(null);
    setBusy(true);
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const result = await wallet.create(password, {
        source: parsed.source,
        secret: parsed.secret,
      });
      if (!result.ok) {
        setError(walletErrorCopy(result.error));
        return;
      }
      setDoneAddress(result.value.payload.accounts[0]?.address ?? '');
      setRaw('');
      setParsed(null);
      setStep('done');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <section className="wallet-view">
        <h2>Wallet imported</h2>
        <p className="mono">{doneAddress}</p>
        <div className="row">
          <button
            type="button"
            onClick={() => {
              void copyText(doneAddress).then((ok) =>
                wallet.showNotice(ok ? 'Address copied.' : 'Could not copy the address.'),
              );
            }}
          >
            Copy address
          </button>
        </div>
        <p>
          The wallet is locked when you close the side panel. Keep your recovery material
          somewhere offline.
        </p>
        <button type="button" data-testid="wallet-done" onClick={onDone}>
          Done
        </button>
      </section>
    );
  }

  return (
    <section className="wallet-view">
      <h2>{from === 'accounts' ? 'Add an account' : 'Import a wallet'}</h2>

      {step === 'type' && (
        <>
          <div className="row" role="tablist" aria-label="Import type">
            <button
              type="button"
              role="tab"
              aria-selected={type === 'mnemonic'}
              className={type === 'mnemonic' ? 'nav-link on' : 'nav-link'}
              data-testid="wallet-import-tab-mnemonic"
              onClick={() => switchType('mnemonic')}
            >
              Recovery phrase
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={type === 'private-key'}
              className={type === 'private-key' ? 'nav-link on' : 'nav-link'}
              data-testid="wallet-import-tab-privatekey"
              onClick={() => switchType('private-key')}
            >
              Private key
            </button>
          </div>

          {type === 'mnemonic' ? (
            <div className="wallet-field">
              <label htmlFor="wallet-import-mnemonic">Recovery phrase</label>
              <textarea
                id="wallet-import-mnemonic"
                data-testid="wallet-import-mnemonic"
                rows={3}
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                placeholder="Enter 12, 15, 18, 21, or 24 words, separated by spaces."
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
              />
            </div>
          ) : (
            <PasswordInput
              id="wallet-import-privatekey"
              label="Private key"
              testId="wallet-import-privatekey"
              value={raw}
              onChange={setRaw}
              disabled={busy}
              autoFocus
            />
          )}

          {error !== null && (
            <p className="error" role="alert" data-testid="wallet-import-error">
              {error}
            </p>
          )}
          <div className="row">
            <button type="button" data-testid="wallet-import-submit" onClick={submitType} disabled={busy}>
              Continue
            </button>
            <button type="button" className="link-button" onClick={onCancel}>
              Cancel
            </button>
          </div>
          {type === 'mnemonic' && (
            <p className="hint small">
              If your wallet uses a BIP-39 passphrase (a 25th word) or a custom derivation
              path, this extension cannot import it.
            </p>
          )}
        </>
      )}

      {step === 'address' && parsed !== null && (
        <>
          <h3>Check the derived address</h3>
          <p className="mono">{parsed.address}</p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                void copyText(parsed.address).then((ok) =>
                  wallet.showNotice(ok ? 'Address copied.' : 'Could not copy the address.'),
                );
              }}
            >
              Copy address
            </button>
          </div>
          <p className="hint small">
            Check this address against your other wallet before continuing. Different wallets
            can use different derivation paths and show a different address for the same
            phrase.
          </p>
          <p className="hint small">
            If your wallet uses a BIP-39 passphrase (a 25th word) or a custom derivation path,
            this address will not match, and this extension cannot import it.
          </p>
          <label className="wallet-check">
            <input
              type="checkbox"
              data-testid="wallet-address-confirm"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{' '}
            I checked that this is the address I expect.
          </label>
          {duplicate && (
            <p className="error" role="alert" data-testid="wallet-import-error">
              This address is already in this wallet.
            </p>
          )}
          {error !== null && (
            <p className="error" role="alert" data-testid="wallet-import-error">
              {error}
            </p>
          )}
          <div className="row">
            {from === 'accounts' ? (
              <button
                type="button"
                data-testid="wallet-import-submit"
                onClick={() => void addExisting()}
                disabled={!confirmed || duplicate || busy}
              >
                Add account
              </button>
            ) : (
              <button
                type="button"
                data-testid="wallet-import-submit"
                onClick={() => setStep('password')}
                disabled={!confirmed || duplicate}
              >
                Continue
              </button>
            )}
            <button type="button" className="link-button" onClick={() => setStep('type')}>
              Back
            </button>
          </div>
          {busy && (
            <p className="loading" role="status">
              Adding account…
            </p>
          )}
        </>
      )}

      {step === 'password' && (
        <>
          <h3>Set a wallet password</h3>
          <NewPasswordForm
            submitLabel="Create wallet"
            submitTestId="wallet-password-submit"
            errorTestId="wallet-password-error"
            onSubmit={createNew}
            busy={busy}
            error={error}
            onCancel={() => setStep('address')}
            cancelLabel="Back"
          />
        </>
      )}
    </section>
  );
}
