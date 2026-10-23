import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  originPattern,
  validateAddress,
  validateDraft,
  type Settings,
  type SettingsStore,
} from '../lib/settings.js';
import { hasOrigin, requestOrigins, type PermissionsApi } from '../lib/permissions.js';
import { blockscoutAddressUrl } from '@limccn/longstone-surface';
import { stringifyError } from './format.js';

/**
 * Options page: configuration only, no reads.
 *
 * The save button is the user gesture that backs every host-permission
 * prompt. The configured origins are requested in a single prompt covering
 * exactly the endpoints the draft names (PS-7), and each result is reported
 * so the user can tell a denied origin from a saved-but-unreachable one.
 */

export interface SettingsPageProps {
  store: SettingsStore;
  permissions: PermissionsApi;
}

interface PermissionNote {
  origin: string;
  granted: boolean;
  alreadyGranted: boolean;
  error?: string;
}

export function SettingsPage({ store, permissions }: SettingsPageProps) {
  const [draft, setDraft] = useState<Settings>(DEFAULT_SETTINGS);
  const [errors, setErrors] = useState<Partial<Record<keyof Settings, string>>>({});
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notes, setNotes] = useState<PermissionNote[]>([]);
  const [status, setStatus] = useState<Record<string, 'granted' | 'missing'>>({});

  useEffect(() => {
    void store.get().then((settings) => {
      setDraft(settings);
      setLoaded(true);
    });
  }, [store]);

  const checkOrigins = useCallback(async (settings: Settings) => {
    const origins = [
      originPattern(settings.rpcUrl),
      originPattern(settings.ipfsGateway),
      originPattern(settings.hisaishiUrl),
    ].filter((origin): origin is string => origin !== null);

    const entries = await Promise.all(
      origins.map(async (origin): Promise<[string, 'granted' | 'missing']> => {
        try {
          return [origin, (await hasOrigin(permissions, origin)) ? 'granted' : 'missing'];
        } catch {
          return [origin, 'missing'];
        }
      }),
    );
    setStatus(Object.fromEntries(entries));
  }, [permissions]);

  useEffect(() => {
    if (loaded) void checkOrigins(draft);
  }, [loaded, draft, checkOrigins]);

  function set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save(): Promise<void> {
    const check = validateDraft(draft);
    setErrors(check.errors);
    setNotes([]);
    if (Object.keys(check.errors).length > 0) return;

    const values = check.values;

    // Request permissions from this click (a user gesture) BEFORE persisting,
    // so a denial is visible in the same interaction. One prompt covers the
    // configured origins: sequential prompts would lose the user activation
    // after the first, and Chrome grants only during an activation.
    const origins = [
      originPattern(values.rpcUrl),
      originPattern(values.ipfsGateway),
      originPattern(values.hisaishiUrl),
    ].filter((origin): origin is string => origin !== null);

    const result = await requestOrigins(permissions, origins);
    setNotes(
      result.origins.map((origin) => ({
        origin,
        granted: result.granted,
        alreadyGranted: false,
        ...(result.error === undefined ? {} : { error: result.error }),
      })),
    );

    // Settings save regardless of the permission answer: the user may grant
    // the origin later from the browser's extension page, and refusing to save
    // would lose their input. The panel surfaces the unreachable endpoint.
    try {
      await store.set(values);
      setSaved(true);
      await checkOrigins(values);
    } catch (error) {
      setErrors({ rpcUrl: `Could not save settings: ${stringifyError(error)}` });
    }
  }

  if (!loaded) return <p className="loading">Loading settings…</p>;

  return (
    <main className="app options">
      <header className="app-header">
        <span className="brand">longstone</span>
        <span className="hint">Settings</span>
      </header>

      <div className="panel-body">
        <p className="hint">
          Everything here lives in this browser (<code>chrome.storage.local</code>).
          No account, no server, no telemetry. The local wallet is encrypted with a
          password you choose and never leaves this browser; v0.2 does not sign, so
          writes still open in the web app.
        </p>

        <div className="form">
          <Field label="RPC endpoint (reads)" error={errors.rpcUrl}>
            <input
              className="mono"
              data-testid="settings-rpc"
              value={draft.rpcUrl}
              onChange={(event) => set('rpcUrl', event.target.value)}
              spellCheck={false}
            />
            <OriginStatus pattern={originPattern(draft.rpcUrl)} status={status} />
          </Field>

          <Field label="Registry contract (Base Sepolia)" error={errors.registryAddress}>
            <input
              className="mono"
              data-testid="settings-registry"
              placeholder="0x…"
              value={draft.registryAddress}
              onChange={(event) => set('registryAddress', event.target.value)}
              spellCheck={false}
            />
            {validateAddress(draft.registryAddress, { allowEmpty: true }).ok &&
              draft.registryAddress !== '' && (
                <a
                  href={blockscoutAddressUrl(draft.registryAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="hint"
                >
                  View contract on Blockscout
                </a>
              )}
          </Field>

          <Field label="IPFS gateway (content bytes)" error={errors.ipfsGateway}>
            <input
              className="mono"
              data-testid="settings-gateway"
              value={draft.ipfsGateway}
              onChange={(event) => set('ipfsGateway', event.target.value)}
              spellCheck={false}
            />
            <OriginStatus pattern={originPattern(draft.ipfsGateway)} status={status} />
          </Field>

          <Field label="Memory gateway (hisaishi, optional)" error={errors.hisaishiUrl}>
            <input
              className="mono"
              data-testid="settings-hisaishi"
              placeholder="https://… (blank = direct IPFS only)"
              value={draft.hisaishiUrl}
              onChange={(event) => set('hisaishiUrl', event.target.value)}
              spellCheck={false}
            />
            <OriginStatus pattern={originPattern(draft.hisaishiUrl)} status={status} />
            <p className="hint small">
              The gateway is a transport for bytes, never the authority for
              digests: verification always reads the expected digests from chain.
              Delete it only if you prefer direct IPFS retrieval.
            </p>
          </Field>

          <Field label="Default owner (optional)" error={errors.ownerAddress}>
            <input
              className="mono"
              data-testid="settings-owner"
              placeholder="0x… (blank = paste an address in the panel)"
              value={draft.ownerAddress}
              onChange={(event) => set('ownerAddress', event.target.value)}
              spellCheck={false}
            />
          </Field>

          <Field label="Scan chunk size (blocks per getLogs call)" error={errors.scanChunkSize}>
            <input
              type="number"
              data-testid="settings-chunk"
              min={1}
              max={50000}
              value={draft.scanChunkSize}
              onChange={(event) => set('scanChunkSize', Number(event.target.value))}
            />
            <p className="hint small">
              Base Sepolia&apos;s public RPC caps a log query at 200 blocks. The
              scanner also adapts down automatically when a provider states a
              smaller limit.
            </p>
          </Field>

          <Field label="Scan start block (blank = recent window)" error={errors.scanStartBlock}>
            <input
              className="mono"
              data-testid="settings-start"
              placeholder="auto (last 50,000 blocks)"
              value={draft.scanStartBlock}
              onChange={(event) =>
                set('scanStartBlock', event.target.value.replace(/[^0-9]/g, ''))
              }
            />
            <p className="hint small">
              The panel scans backwards from the chain tip in a bounded window so
              it opens quickly. Set an explicit start block when the owner&apos;s
              memories are older; the full history is always available in the web app.
            </p>
          </Field>

          <div className="row">
            <button type="button" data-testid="settings-save" onClick={() => void save()}>
              Save
            </button>
            <button type="button" onClick={() => setDraft({ ...DEFAULT_SETTINGS })}>
              Defaults
            </button>
            <button type="button" onClick={() => void store.get().then(setDraft)}>
              Reset
            </button>
          </div>
          {saved && (
            <p className="notice" role="status" data-testid="settings-saved">
              Saved.
            </p>
          )}

          {notes.length > 0 && (
            <div className="notice-box" data-testid="permission-notes">
              <strong>Host access</strong>
              <ul>
                {notes.map((note) => (
                  <li key={note.origin}>
                    <span className="mono">{note.origin}</span> —{' '}
                    {note.granted
                      ? note.alreadyGranted
                        ? 'already allowed'
                        : 'allowed'
                      : note.error !== undefined
                        ? `not requested: ${note.error}`
                        : 'not granted'}
                  </li>
                ))}
              </ul>
              <p className="hint small">
                The extension asks only for the origins you configured. Denying an
                origin leaves the setting saved but the endpoint unreadable; allow
                it later from the extension&apos;s details page.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error !== undefined && <span className="error">{error}</span>}
    </label>
  );
}

function OriginStatus({
  pattern,
  status,
}: {
  pattern: string | null;
  status: Record<string, 'granted' | 'missing'>;
}) {
  if (pattern === null) return null;
  const state = status[pattern];
  if (state === undefined) return null;
  return (
    <span className={state === 'granted' ? 'hint small ok' : 'hint small warn'}>
      host access: {state === 'granted' ? 'granted' : 'not granted (asked on Save)'}
    </span>
  );
}
