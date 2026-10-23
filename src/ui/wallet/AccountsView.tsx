/**
 * F-5: account list and per-account actions while unlocked.
 *
 * Every row shows only public metadata; deleting the last account deletes the
 * whole record (DR-06), which is why that path needs its own checkbox.
 */
import { useState } from 'react';
import { DEFAULT_IDLE_TIMEOUT_MS, type VaultAccount } from '@limccn/longstone-wallet';
import { shortAddress } from '../format.js';
import { AccountDetail } from './AccountDetail.js';
import { ChangePasswordView } from './ChangePasswordView.js';
import { walletErrorCopy, sourceLabel } from './copy.js';
import { copyText } from './clipboard.js';
import { Dialog } from './fields.js';
import type { VaultApi } from './useVault.js';

function DeleteDialog({
  wallet,
  account,
  isLast,
  onClose,
}: {
  wallet: VaultApi;
  account: VaultAccount;
  isLast: boolean;
  onClose: () => void;
}) {
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await wallet.deleteAccount(account.id);
      if (!result.ok) {
        setError(walletErrorCopy(result.error));
        return;
      }
      if (result.value.vault !== null) wallet.showNotice('Account deleted.');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Delete account" testId="wallet-delete-dialog" onClose={onClose}>
      <p>
        Delete &ldquo;{account.label}&rdquo; ({shortAddress(account.address)})? The encrypted key
        material for this account will be removed. Make sure you have exported it if you need
        it.
      </p>
      {isLast && (
        <p className="hint warn">
          This is your only account. Deleting it removes the entire wallet from this browser.
          This cannot be undone.
        </p>
      )}
      {isLast && (
        <label className="wallet-check">
          <input
            type="checkbox"
            data-testid="wallet-delete-last-confirm"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
            disabled={busy}
          />{' '}
          I understand this deletes the wallet
        </label>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="warn"
          data-testid="wallet-delete-confirm"
          onClick={() => void remove()}
          disabled={busy || (isLast && !understood)}
        >
          {isLast ? 'Delete wallet' : 'Delete account'}
        </button>
        <button type="button" className="link-button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}

export function AccountsView({
  wallet,
  onAdd,
}: {
  wallet: VaultApi;
  onAdd: () => void;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vault = wallet.vault;
  if (vault === null) return null;
  const accounts = vault.payload.accounts;
  const detail = accounts.find((account) => account.id === detailId) ?? null;
  const deleting = accounts.find((account) => account.id === deletingId) ?? null;

  if (changingPassword) {
    return <ChangePasswordView wallet={wallet} onDone={() => setChangingPassword(false)} />;
  }
  if (detail !== null) {
    return <AccountDetail wallet={wallet} account={detail} onBack={() => setDetailId(null)} />;
  }

  const idleEnabled = vault.payload.idleTimeoutMs !== null;

  async function activate(accountId: string): Promise<void> {
    const result = await wallet.setActiveAccount(accountId);
    if (!result.ok) setError(walletErrorCopy(result.error));
  }

  async function saveRename(accountId: string): Promise<void> {
    const result = await wallet.renameAccount(accountId, renameValue);
    if (!result.ok) {
      setError(walletErrorCopy(result.error));
      return;
    }
    setError(null);
    setRenamingId(null);
    wallet.showNotice('Account renamed.');
  }

  async function toggleIdle(enabled: boolean): Promise<void> {
    const result = await wallet.setIdleTimeout(enabled ? DEFAULT_IDLE_TIMEOUT_MS : null);
    if (!result.ok) setError(walletErrorCopy(result.error));
  }

  return (
    <section className="wallet-view">
      <div className="row-between">
        <h2>Wallet</h2>
        <button
          type="button"
          data-testid="wallet-lock"
          onClick={() => wallet.lock('explicit')}
        >
          Lock
        </button>
      </div>
      <p className="hint small">Wallet unlocked. Closing the side panel locks it.</p>

      <div className="wallet-actions">
        <button type="button" data-testid="wallet-account-add" onClick={onAdd}>
          Add account
        </button>
        <button
          type="button"
          data-testid="wallet-change-password-start"
          onClick={() => setChangingPassword(true)}
        >
          Change password
        </button>
      </div>

      <label className="wallet-check">
        <input
          type="checkbox"
          data-testid="wallet-idle-toggle"
          checked={idleEnabled}
          onChange={(event) => void toggleIdle(event.target.checked)}
        />{' '}
        Lock after 15 minutes of inactivity
      </label>
      <p className="hint small">
        Turning this off only affects the visible panel. Hiding or closing the panel always
        locks the wallet.
      </p>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ul className="wallet-account-list" data-testid="wallet-account-list">
        {accounts.map((account) => {
          const active = account.id === vault.payload.activeAccountId;
          return (
            <li
              key={account.id}
              className={active ? 'wallet-account active' : 'wallet-account'}
              data-testid="wallet-account-item"
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                if (!active) void activate(account.id);
              }}
            >
              <div className="wallet-account-head">
                <input
                  type="radio"
                  name="wallet-active-account"
                  checked={active}
                  onChange={() => void activate(account.id)}
                  aria-label={`Use ${account.label}`}
                />
                {renamingId === account.id ? (
                  <div className="row" onClick={(event) => event.stopPropagation()}>
                    <input
                      data-testid="wallet-rename-input"
                      value={renameValue}
                      maxLength={64}
                      onChange={(event) => setRenameValue(event.target.value)}
                      aria-label="Account name"
                    />
                    <button
                      type="button"
                      data-testid="wallet-rename-save"
                      disabled={renameValue.trim() === ''}
                      onClick={() => void saveRename(account.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className="wallet-account-title" data-testid="wallet-account-label">
                    {account.label}
                  </span>
                )}
                <span className="badge">{sourceLabel(account.source)}</span>
              </div>
              <div className="wallet-account-meta">
                <button
                  type="button"
                  className="link-button mono"
                  data-testid="wallet-account-address"
                  onClick={(event) => {
                    event.stopPropagation();
                    void copyText(account.address).then((ok) =>
                      wallet.showNotice(ok ? 'Address copied.' : 'Could not copy the address.'),
                    );
                  }}
                >
                  {shortAddress(account.address)}
                </button>
                <span className="hint small">
                  {new Date(account.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="memory-actions" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setRenamingId(account.id);
                    setRenameValue(account.label);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setDetailId(account.id)}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="link-button warn"
                  onClick={() => setDeletingId(account.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {deleting !== null && (
        <DeleteDialog
          wallet={wallet}
          account={deleting}
          isLast={accounts.length === 1}
          onClose={() => setDeletingId(null)}
        />
      )}
    </section>
  );
}
