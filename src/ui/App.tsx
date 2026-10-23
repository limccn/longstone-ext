import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UiError, verifyCommitment, type ChainIndex } from '@limccn/longstone-surface';
import { canonicalAddress, createClient, explainScanError } from '../lib/chain.js';
import { scanIndex, type ScanProgress } from '../lib/scan.js';
import { validateAddress, type Settings, type SettingsStore } from '../lib/settings.js';
import {
  cacheArea,
  onLocalStorageChanged,
  openExternal,
  openOptionsPage,
  settingsStore,
} from '../lib/chromeApi.js';
import { aclUrl, retractUrl, timelineUrl } from '../lib/deepLinks.js';
import { CHAIN_ID } from '../lib/chain.js';
import { useSettings } from './useSettings.js';
import { TimelineView } from './TimelineView.js';
import { DetailView } from './DetailView.js';
import { VerifyView, type VerifyRunner } from './VerifyView.js';
import { shortAddress, stringifyError } from './format.js';
import { useVault } from './wallet/useVault.js';
import { WalletView } from './wallet/WalletView.js';
import { ownerSource, resolveOwner, type OwnerMode } from './wallet/owner.js';

type Tab = 'timeline' | 'verify' | 'wallet';

export interface AppDeps {
  store: SettingsStore;
  scan: typeof scanIndex;
  verify: VerifyRunner;
  openLink: (url: string) => void;
  openOptions: () => void;
  onSettingsChanged: (callback: () => void) => () => void;
}

/**
 * Builds the real dependency set for the panel. Separated from the component
 * so the component itself is testable with fakes (and so nothing in this file
 * runs until the panel is rendered).
 */
export function createDeps(): AppDeps {
  return {
    store: settingsStore,
    scan: scanIndex,
    verify: async (commitmentHash: string) => {
      const settings = await settingsStore.get();
      if (settings.registryAddress === '') {
        throw new UiError('REGISTRY_NOT_CONFIGURED', 'no registry address configured');
      }
      const client = createClient(settings.rpcUrl);
      return verifyCommitment({
        hash: commitmentHash as `0x${string}`,
        client,
        registryAddress: settings.registryAddress as `0x${string}`,
        gateway: settings.ipfsGateway,
        ...(settings.hisaishiUrl === '' ? {} : { hisaishiUrl: settings.hisaishiUrl }),
      });
    },
    openLink: (url) => {
      void openExternal(url);
    },
    openOptions: () => {
      void openOptionsPage();
    },
    onSettingsChanged: onLocalStorageChanged,
  };
}

export function App({ deps }: { deps: AppDeps }) {
  const { settings } = useSettings(
    useCallback(() => deps.store.get(), [deps.store]),
    deps.onSettingsChanged,
  );

  if (settings === null) {
    return (
      <main className="app">
        <p className="loading">Loading settings…</p>
      </main>
    );
  }
  // Key on the fields that change what a scan means, not the whole settings
  // object: re-reading storage (or any unrelated local write) must not remount
  // the panel and drop the commitment the user is looking at, while an RPC or
  // registry edit must drop state derived from the old endpoint.
  const scanIdentity = `${settings.rpcUrl}|${settings.registryAddress}|${settings.scanStartBlock}|${settings.scanChunkSize}`;
  return <Panel key={scanIdentity} settings={settings} deps={deps} />;
}

function Panel({ settings, deps }: { settings: Settings; deps: AppDeps }) {
  const wallet = useVault();
  const [tab, setTab] = useState<Tab>('timeline');

  const settingsOwnerCheck = validateAddress(settings.ownerAddress, { allowEmpty: true });
  const settingsOwner =
    settingsOwnerCheck.ok && settingsOwnerCheck.value !== ''
      ? canonicalAddress(settingsOwnerCheck.value)
      : null;
  const walletAddress = wallet.activeAccount?.address ?? null;
  const [ownerMode, setOwnerMode] = useState<OwnerMode>(
    settingsOwner === null ? 'wallet' : 'entered',
  );
  const [enteredOwner, setEnteredOwner] = useState<string | null>(settingsOwner);
  const [ownerInput, setOwnerInput] = useState(settings.ownerAddress);
  const owner = resolveOwner(ownerMode, enteredOwner, walletAddress, settingsOwner);
  const source = ownerSource(ownerMode, enteredOwner, walletAddress);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [index, setIndex] = useState<ChainIndex | null>(null);
  const [scanWindow, setScanWindow] = useState<{ from: bigint; to: bigint } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [verifySeed, setVerifySeed] = useState<string | undefined>(undefined);
  const defaultTabApplied = useRef(false);

  // First run opens on Wallet; an existing (even locked) record keeps the old
  // Timeline default. Only the first settled load decides.
  useEffect(() => {
    if (defaultTabApplied.current || wallet.phase === 'loading') return;
    defaultTabApplied.current = true;
    if (wallet.phase === 'NO_VAULT') setTab('wallet');
  }, [wallet.phase]);

  // In "wallet" mode the input mirrors the active address while unlocked and
  // falls back to the Settings default (or empty) while locked. The address is
  // never written back to Settings (SR-06).
  useEffect(() => {
    if (ownerMode !== 'wallet') return;
    setOwnerInput(walletAddress ?? settings.ownerAddress);
  }, [ownerMode, walletAddress, settings.ownerAddress]);

  const walletStatusLabel =
    wallet.phase === 'UNLOCKED'
      ? 'Wallet unlocked'
      : wallet.phase === 'NO_VAULT'
        ? 'No wallet'
        : wallet.phase === 'loading'
          ? 'Checking wallet'
          : 'Wallet locked';
  const walletStatusState =
    wallet.phase === 'UNLOCKED'
      ? 'unlocked'
      : wallet.phase === 'NO_VAULT'
        ? 'none'
        : 'locked';

  const configuredRegistry = settings.registryAddress;

  const runScan = useCallback(
    async (targetOwner: string) => {
      if (configuredRegistry === '') {
        setScanError(new UiError('REGISTRY_NOT_CONFIGURED', '').message);
        return;
      }
      setScanning(true);
      setScanError(null);
      setProgress(null);
      try {
        const outcome = await deps.scan({
          client: createClient(settings.rpcUrl),
          area: cacheArea,
          chainId: CHAIN_ID,
          rpcUrl: settings.rpcUrl,
          registryAddress: configuredRegistry as `0x${string}`,
          scanStartBlock: settings.scanStartBlock,
          chunkSize: settings.scanChunkSize,
          onProgress: setProgress,
          // Render rows per persisted slice instead of freezing on a spinner
          // for the whole window; the final result replaces this index.
          onPartial: setIndex,
        });
        setIndex(outcome.index);
        setScanWindow({ from: outcome.fromBlock, to: outcome.toBlock });
      } catch (error) {
        setScanError(explainScanError(error, settings.rpcUrl));
      } finally {
        setScanning(false);
      }
    },
    [configuredRegistry, deps.scan, settings.rpcUrl, settings.scanStartBlock, settings.scanChunkSize],
  );

  // Scan when the owner changes. `runScan` is a dependency because the
  // settings it closes over (RPC, registry, window) must take effect; the
  // panel remounts on those changes (see `scanIdentity`), so the initial run
  // is the owner's first and only automatic scan here. Refresh is explicit.
  useEffect(() => {
    if (owner === null) return;
    void runScan(owner);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial scan only; Refresh is the re-run path
  }, [owner]);

  function applyOwner(): void {
    const check = validateAddress(ownerInput, { allowEmpty: true });
    if (!check.ok) {
      setOwnerError(check.error);
      return;
    }
    setOwnerError(null);
    setOwnerMode('entered');
    if (check.value === '') {
      setEnteredOwner(null);
      setIndex(null);
      setScanWindow(null);
      setScanError(null);
      return;
    }
    setEnteredOwner(canonicalAddress(check.value));
  }

  function useWalletAddress(): void {
    if (walletAddress === null) return;
    setOwnerError(null);
    setOwnerMode('wallet');
    setOwnerInput(walletAddress);
  }

  const verifyRunner = useMemo<VerifyRunner>(
    () => (hash) => deps.verify(hash),
    [deps],
  );

  // Verify is only meaningful once a registry exists.
  const canVerify = configuredRegistry !== '';

  return (
    <main className="app">
      <header className="app-header">
        <span className="brand">longstone</span>
        <nav className="app-nav">
          <button
            type="button"
            className={tab === 'timeline' ? 'nav-link on' : 'nav-link'}
            onClick={() => {
              setTab('timeline');
              setSelected(null);
            }}
          >
            Timeline
          </button>
          <button
            type="button"
            className={tab === 'verify' ? 'nav-link on' : 'nav-link'}
            onClick={() => setTab('verify')}
          >
            Verify
          </button>
          <button
            type="button"
            className={tab === 'wallet' ? 'nav-link on' : 'nav-link'}
            data-testid="wallet-tab"
            onClick={() => setTab('wallet')}
          >
            Wallet{' '}
            <span
              className={`wallet-dot ${walletStatusState}`}
              data-testid="wallet-status"
              role="img"
              aria-label={walletStatusLabel}
            />
          </button>
        </nav>
        {wallet.phase === 'UNLOCKED' && (
          <button
            type="button"
            className="link-button"
            data-testid="wallet-lock-global"
            onClick={() => wallet.lock('explicit')}
          >
            Lock
          </button>
        )}
        <button type="button" className="link-button" onClick={deps.openOptions}>
          Settings
        </button>
      </header>

      {wallet.notice !== null && (
        <div className="wallet-notice" role="status">
          <span>{wallet.notice}</span>
          <button
            type="button"
            className="link-button"
            onClick={wallet.dismissNotice}
            aria-label="Dismiss notification"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="panel-body">
        {configuredRegistry === '' && (
          <p className="error" role="alert">
            No registry configured. Open Settings and set the MemoryRegistry contract.
          </p>
        )}

        {tab === 'timeline' && selected !== null && index !== null && (
          <DetailView
            index={index}
            commitmentHash={selected}
            onBack={() => setSelected(null)}
            onSelect={setSelected}
            onOpenLink={deps.openLink}
            onVerify={(hash) => {
              setSelected(null);
              setTab('verify');
              setVerifySeed(hash);
            }}
          />
        )}

        {tab === 'timeline' && selected === null && (
          <>
            <section className="owner-box">
              <label className="owner-label" htmlFor="owner-input">
                Owner address
              </label>
              <div className="row">
                <input
                  id="owner-input"
                  className="mono wide"
                  data-testid="owner-input"
                  placeholder="0x… (or set a default in Settings)"
                  value={ownerInput}
                  onChange={(event) => setOwnerInput(event.target.value)}
                  spellCheck={false}
                />
                <button type="button" data-testid="owner-apply" onClick={applyOwner}>
                  Show
                </button>
              </div>
              {ownerError !== null && <p className="error">{ownerError}</p>}
              {source !== null && (
                <p className="hint small" data-testid="owner-source">
                  Owner source: {source}
                </p>
              )}
              {ownerMode === 'entered' && walletAddress !== null && (
                <button
                  type="button"
                  className="link-button"
                  data-testid="owner-use-wallet"
                  onClick={useWalletAddress}
                >
                  Use wallet address
                </button>
              )}
              {owner !== null && (
                <p className="hint">
                  Showing {shortAddress(owner)}{' '}
                  <button type="button" className="link-button" onClick={() => void runScan(owner)} disabled={scanning}>
                    {scanning ? 'Scanning…' : 'Refresh'}
                  </button>
                </p>
              )}
            </section>

            {owner === null && (
              <p className="empty" data-testid="no-owner">
                Paste an owner address to see that owner&apos;s memories, or save a default
                owner in Settings. You can also create or import a local wallet to use its
                active address.
              </p>
            )}

            {scanning && (
              <p className="loading">
                Scanning chain…
                {progress !== null && progress.total > 0n
                  ? ` ${progress.done.toString()}/${progress.total.toString()} blocks`
                  : ''}
              </p>
            )}
            {scanError !== null && (
              <p className="error" role="alert">
                Scan failed: {scanError}
              </p>
            )}
            {owner !== null && index !== null && scanWindow !== null && (
              <TimelineView
                index={index}
                owner={owner}
                fromBlock={scanWindow.from}
                toBlock={scanWindow.to}
                onSelect={setSelected}
                onOpenLink={deps.openLink}
              />
            )}

            <div className="quick-links">
              <button
                type="button"
                className="link-button"
                onClick={() => deps.openLink(timelineUrl())}
              >
                Full timeline in web app ↗
              </button>
              <button
                type="button"
                className="link-button warn"
                onClick={() => {
                  const url = retractUrl();
                  if (url !== null) deps.openLink(url);
                }}
              >
                Retract in web app ↗
              </button>
              <button type="button" className="link-button" onClick={() => deps.openLink(aclUrl())}>
                Signers in web app ↗
              </button>
            </div>
          </>
        )}

        {tab === 'verify' && (
          <VerifyView
            key={verifySeed ?? 'empty'}
            initialHash={verifySeed}
            run={canVerify ? verifyRunner : null}
            runUnavailableReason={
              canVerify ? undefined : 'Set a registry contract in Settings to verify.'
            }
          />
        )}

        {tab === 'wallet' && (
          <WalletView wallet={wallet} onSkip={() => setTab('timeline')} />
        )}
      </div>

      <footer className="app-footer">
        Base Sepolia (84532) · local encrypted wallet (v1 does not sign) · closing the panel
        locks it
      </footer>
    </main>
  );
}
