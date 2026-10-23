import { useState } from 'react';
import type { VerifyResult } from '@limccn/longstone-surface';
import { isCommitmentHash } from '../lib/settings.js';
import { VerdictBadge } from './Badge.js';
import { stringifyError } from './format.js';

export type VerifyRunner = (commitmentHash: string) => Promise<VerifyResult>;

export interface VerifyViewProps {
  /** Pre-filled hash when arriving from a detail row. */
  initialHash?: string | undefined;
  run: VerifyRunner | null;
  runUnavailableReason?: string | undefined;
}

/**
 * Public verify: the hash is chain state's, not the gateway's.
 *
 * The computation and verdict vocabulary come from `@limccn/longstone-surface`
 * (`verifyCommitment`), which reads both expected digests from the registry
 * before touching any gateway bytes. This view only renders what it returns —
 * a CID alone is never shown as a successful verification.
 */
export function VerifyView({ initialHash, run, runUnavailableReason }: VerifyViewProps) {
  const [input, setInput] = useState(initialHash ?? '');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isCommitmentHash(input.trim());

  async function verify(): Promise<void> {
    if (run === null) return;
    const hash = input.trim();
    if (!isCommitmentHash(hash)) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await run(hash));
    } catch (err) {
      setError(stringifyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="verify">
      <h2>Verify a memory</h2>
      <p className="hint">
        The expected digests are read <strong>from the chain</strong>, then the
        bytes fetched from the gateway are hashed and compared. A gateway that
        substitutes the content cannot produce <code>verified</code>.
      </p>

      <div className="row">
        <input
          data-testid="verify-input"
          className="mono wide"
          placeholder="0x… (32-byte commitment hash)"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button
          type="button"
          data-testid="verify-run"
          disabled={busy || !valid || run === null}
          onClick={() => void verify()}
        >
          {busy ? 'Verifying…' : 'Verify'}
        </button>
      </div>
      {!valid && input.trim() !== '' && (
        <p className="error">A commitment hash is 0x plus 64 hex characters.</p>
      )}
      {run === null && runUnavailableReason !== undefined && (
        <p className="hint">{runUnavailableReason}</p>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result !== null && (
        <div data-testid="verify-result" className={`verdict ${result.verdict}`}>
          <div className="row row-between">
            <h3>Verdict</h3>
            <VerdictBadge verdict={result.verdict} />
          </div>
          {result.message !== undefined && <p>{result.message}</p>}
          <dl className="facts">
            <dt>Mode</dt>
            <dd>{result.mode}</dd>
            {result.commitmentHash !== null && (
              <>
                <dt>Commitment</dt>
                <dd className="mono">{result.commitmentHash}</dd>
              </>
            )}
            {result.cid !== null && (
              <>
                <dt>CID (as fetched)</dt>
                <dd className="mono">{result.cid}</dd>
              </>
            )}
            <dt>keccak256(bytes) == contentHash</dt>
            <dd data-testid="keccak-match">
              {result.keccakMatches === null ? '—' : String(result.keccakMatches)}
            </dd>
            <dt>sha256(bytes) == cidDigest</dt>
            <dd data-testid="sha256-match">
              {result.sha256Matches === null ? '—' : String(result.sha256Matches)}
            </dd>
            <dt>deep (anchored)</dt>
            <dd>{String(result.anchored)}</dd>
            <dt>active</dt>
            <dd>{String(result.active)}</dd>
            <dt>bytes</dt>
            <dd>{result.bytesLength}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
