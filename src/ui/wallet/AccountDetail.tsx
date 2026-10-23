/**
 * Account details: full address, provenance, derivation path and the two
 * independent export entries. The page only ever holds the current account's
 * public fields; secrets are derived inside the export dialog after a fresh
 * password check.
 */
import { useState } from 'react';
import { DERIVATION_PATH } from '../../lib/wallet/accounts.js';
import type { VaultAccount } from '../../lib/wallet/format.js';
import { sourceLabel } from './copy.js';
import { copyText } from './clipboard.js';
import { ExportDialog, type ExportKind } from './ExportDialog.js';
import type { VaultApi } from './useVault.js';

export function AccountDetail({
  wallet,
  account,
  onBack,
}: {
  wallet: VaultApi;
  account: VaultAccount;
  onBack: () => void;
}) {
  const [exportKind, setExportKind] = useState<ExportKind | null>(null);
  const hasPhrase = account.secret.kind === 'mnemonic';

  return (
    <section className="wallet-view">
      <div className="row-between">
        <h2>{account.label}</h2>
        <button type="button" className="link-button" onClick={onBack}>
          Back
        </button>
      </div>
      <p className="mono">{account.address}</p>
      <div className="row">
        <button
          type="button"
          onClick={() => {
            void copyText(account.address).then((ok) =>
              wallet.showNotice(ok ? 'Address copied.' : 'Could not copy the address.'),
            );
          }}
        >
          Copy address
        </button>
      </div>
      <dl className="facts">
        <dt>Source</dt>
        <dd>{sourceLabel(account.source)}</dd>
        <dt>Created</dt>
        <dd>{new Date(account.createdAt).toLocaleString()}</dd>
        {hasPhrase && (
          <>
            <dt>Derivation path</dt>
            <dd className="mono">{DERIVATION_PATH}</dd>
          </>
        )}
      </dl>
      <div className="wallet-actions">
        <button
          type="button"
          data-testid="wallet-export-start-key"
          aria-label="Export private key"
          onClick={() => setExportKind('privateKey')}
        >
          Export private key
        </button>
        <button
          type="button"
          data-testid="wallet-export-start-phrase"
          aria-label="Export recovery phrase"
          disabled={!hasPhrase}
          onClick={() => setExportKind('mnemonic')}
        >
          Export recovery phrase
        </button>
      </div>
      {!hasPhrase && (
        <p className="hint small">
          This account was imported as a private key, so there is no recovery phrase.
        </p>
      )}
      {exportKind !== null && (
        <ExportDialog
          wallet={wallet}
          account={account}
          kind={exportKind}
          onClose={() => setExportKind(null)}
        />
      )}
    </section>
  );
}
