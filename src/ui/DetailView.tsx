import {
  predecessorOf,
  successorOf,
  type ChainIndex,
  type MemoryState,
} from '@limccn/longstone-surface';
import { cidV1RawFromDigest } from '@limccn/menhir-core';
import { StateBadges } from './Badge.js';
import { aclUrl, commitmentUrl, retractUrl, verifyUrl } from '../lib/deepLinks.js';

export interface DetailViewProps {
  index: ChainIndex;
  commitmentHash: string;
  onBack: () => void;
  onSelect: (commitmentHash: string) => void;
  onOpenLink: (url: string) => void;
  onVerify: (commitmentHash: string) => void;
}

export function DetailView({
  index,
  commitmentHash,
  onBack,
  onSelect,
  onOpenLink,
  onVerify,
}: DetailViewProps) {
  const state = index.byHash.get(commitmentHash as `0x${string}`);

  if (state === undefined) {
    return (
      <section data-testid="detail">
        <button type="button" className="link-button" onClick={onBack}>
          ← Back to timeline
        </button>
        <p className="empty">Unknown commitment on this registry and window.</p>
        <p className="hint">
          The side panel scans a bounded window. If this commitment is older, set
          a lower scan start block in Settings, or open the full history in the web app.
        </p>
      </section>
    );
  }

  const prev = predecessorOf(index, state);
  const next = successorOf(index, state);
  const cid =
    state.commitment !== undefined ? cidV1RawFromDigest(state.commitment.cidDigest) : null;

  const web = commitmentUrl(state.commitmentHash);
  const retract = retractUrl(state.commitmentHash);
  const verify = verifyUrl(state.commitmentHash);

  return (
    <section data-testid="detail">
      <button type="button" className="link-button" onClick={onBack}>
        ← Back to timeline
      </button>
      <div className="row row-between">
        <h2>Commitment</h2>
        <StateBadges state={state} />
      </div>

      <dl className="facts">
        <dt>Commitment hash</dt>
        <dd className="mono">{state.commitmentHash}</dd>
        <dt>Owner</dt>
        <dd className="mono">{state.owner}</dd>
        <dt>Content hash (keccak256)</dt>
        <dd className="mono">{state.contentHash ?? '—'}</dd>
        <dt>cidDigest (sha256)</dt>
        <dd className="mono">{state.commitment?.cidDigest ?? '—'}</dd>
        {cid !== null && (
          <>
            <dt>CID (derived, raw v1)</dt>
            <dd className="mono">{cid}</dd>
          </>
        )}
        <dt>Signer</dt>
        <dd className="mono">{state.commitment?.signer ?? '—'}</dd>
        <dt>Advisory block height</dt>
        <dd>{state.commitment?.blockHeight.toString() ?? '—'}</dd>
        <dt>Tags</dt>
        <dd>{state.tags.length === 0 ? '—' : state.tags.join(', ')}</dd>
        <dt>Committed at block</dt>
        <dd>{state.committedAt.toString()}</dd>
        <dt>Tx</dt>
        <dd>
          {/^0x[0-9a-fA-F]{64}$/.test(state.txHash) ? (
            <a
              href={`https://base-sepolia.blockscout.com/tx/${encodeURIComponent(state.txHash)}`}
              target="_blank"
              rel="noreferrer"
            >
              {state.txHash}
            </a>
          ) : (
            <span className="mono">{state.txHash}</span>
          )}
        </dd>
        <dt>Predecessor (prev)</dt>
        <dd>
          {prev === undefined ? (
            'none (chain root)'
          ) : (
            <button
              type="button"
              className="link-button mono"
              onClick={() => onSelect(prev.commitmentHash)}
            >
              {prev.commitmentHash}
            </button>
          )}
        </dd>
        <dt>Successor (replacedBy)</dt>
        <dd>
          {next === undefined ? (
            'none'
          ) : (
            <button
              type="button"
              className="link-button mono"
              onClick={() => onSelect(next.commitmentHash)}
            >
              {next.commitmentHash}
            </button>
          )}
        </dd>
      </dl>

      <div className="actions">
        <button type="button" onClick={() => onVerify(state.commitmentHash)}>
          Verify content
        </button>
        {web !== null && (
          <button type="button" className="ghost" onClick={() => onOpenLink(web)}>
            Open in web app ↗
          </button>
        )}
        {verify !== null && (
          <button type="button" className="ghost" onClick={() => onOpenLink(verify)}>
            Verify in web app ↗
          </button>
        )}
        {state.active && retract !== null && (
          <button type="button" className="ghost warn" onClick={() => onOpenLink(retract)}>
            Retract in web app ↗
          </button>
        )}
        <button type="button" className="ghost" onClick={() => onOpenLink(aclUrl())}>
          Manage signers ↗
        </button>
      </div>
      <p className="hint small">
        Writes are signed by your wallet in the web app. This extension holds no
        key and never asks for one.
      </p>
    </section>
  );
}
