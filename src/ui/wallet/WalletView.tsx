/**
 * Wallet tab router (ux-flows §1). Setup flows stay mounted after a successful
 * create/import so their completion screen can show the new address; any lock
 * drops them, because the key that produced them is gone.
 */
import { useEffect, useState } from 'react';
import { AccountsView } from './AccountsView.js';
import { CreateFlow } from './CreateFlow.js';
import { ImportFlow } from './ImportFlow.js';
import { UnlockView } from './UnlockView.js';
import { WelcomeView } from './WelcomeView.js';
import type { VaultApi } from './useVault.js';

type Setup = 'create' | 'import-create' | 'import-add' | null;

export function WalletView({
  wallet,
  onSkip,
}: {
  wallet: VaultApi;
  onSkip: () => void;
}) {
  const [setup, setSetup] = useState<Setup>(null);

  useEffect(() => {
    if (wallet.phase !== 'UNLOCKED' && wallet.phase !== 'NO_VAULT') setSetup(null);
  }, [wallet.phase]);

  if (wallet.phase === 'loading') {
    return <p className="loading">Checking wallet…</p>;
  }

  if (setup === 'create') {
    return (
      <CreateFlow
        wallet={wallet}
        onDone={() => setSetup(null)}
        onCancel={() => setSetup(null)}
      />
    );
  }
  if (setup === 'import-create') {
    return (
      <ImportFlow
        wallet={wallet}
        from="welcome"
        onDone={() => setSetup(null)}
        onCancel={() => setSetup(null)}
      />
    );
  }
  if (setup === 'import-add') {
    return (
      <ImportFlow
        wallet={wallet}
        from="accounts"
        onDone={() => setSetup(null)}
        onCancel={() => setSetup(null)}
      />
    );
  }

  if (wallet.phase === 'UNLOCKED') {
    return <AccountsView wallet={wallet} onAdd={() => setSetup('import-add')} />;
  }
  if (wallet.phase === 'NO_VAULT') {
    return (
      <WelcomeView
        onCreate={() => setSetup('create')}
        onImport={() => setSetup('import-create')}
        onSkip={onSkip}
      />
    );
  }
  return <UnlockView wallet={wallet} />;
}
