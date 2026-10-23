import { useMemo, useState } from 'react';
import {
  filterByTags,
  statesForOwner,
  type ChainIndex,
  type MemoryState,
} from '@limccn/longstone-surface';
import { StateBadges } from './Badge.js';
import { shortHash } from './format.js';
import { commitmentUrl, timelineUrl, retractUrl } from '../lib/deepLinks.js';

export interface TimelineViewProps {
  index: ChainIndex;
  owner: string;
  fromBlock: bigint;
  toBlock: bigint;
  onSelect: (commitmentHash: string) => void;
  onOpenLink: (url: string) => void;
}

export function TimelineView({
  index,
  owner,
  fromBlock,
  toBlock,
  onSelect,
  onOpenLink,
}: TimelineViewProps) {
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const ownerAddress = owner as `0x${string}`;

  const states = useMemo(
    () => filterByTags(statesForOwner(index, ownerAddress), tagFilter),
    [index, ownerAddress, tagFilter],
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const state of statesForOwner(index, ownerAddress)) {
      for (const tag of state.tags) tags.add(tag);
    }
    return [...tags].sort();
  }, [index, ownerAddress]);

  return (
    <section data-testid="timeline">
      <div className="row row-between">
        <h2>Timeline</h2>
        <button type="button" className="link-button" onClick={() => onOpenLink(timelineUrl())}>
          Open in web app ↗
        </button>
      </div>
      <p className="hint">
        Your anchored memories with <code>deep</code> / <code>active</code> badges.
        Retracted memories stay listed — a retract is a tombstone, not a deletion.
      </p>

      {allTags.length > 0 && (
        <div className="chips" data-testid="tag-filter">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={tagFilter.includes(tag) ? 'chip on' : 'chip'}
              onClick={() =>
                setTagFilter((prev) =>
                  prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag],
                )
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {states.length === 0 && (
        <p className="empty" data-testid="timeline-empty">
          No commitments for this address in blocks {fromBlock.toString()}–
          {toBlock.toString()}. Widen the scan start block in Settings if the
          history is older.
        </p>
      )}

      {states.length > 0 && (
        <ul className="memory-list" data-testid="timeline-list">
          {states.map((state) => (
            <MemoryRow key={state.commitmentHash} state={state} onSelect={onSelect} onOpenLink={onOpenLink} />
          ))}
        </ul>
      )}

      <p className="hint small">
        Scanned blocks {fromBlock.toString()}–{toBlock.toString()}.
      </p>
    </section>
  );
}

function MemoryRow({
  state,
  onSelect,
  onOpenLink,
}: {
  state: MemoryState;
  onSelect: (commitmentHash: string) => void;
  onOpenLink: (url: string) => void;
}) {
  const webUrl = commitmentUrl(state.commitmentHash);
  const retract = retractUrl(state.commitmentHash);

  return (
    <li className="memory-item">
      <button
        type="button"
        className="memory-main"
        onClick={() => onSelect(state.commitmentHash)}
        title={state.commitmentHash}
      >
        <span className="mono">{shortHash(state.commitmentHash)}</span>
        <span className="memory-meta">
          {state.tags.length > 0 ? state.tags.join(' · ') : 'no tags'} · block{' '}
          {state.committedAt.toString()}
        </span>
      </button>
      <div className="memory-side">
        <StateBadges state={state} />
        <div className="memory-actions">
          {webUrl !== null && (
            <button type="button" className="link-button" onClick={() => onOpenLink(webUrl)}>
              Detail ↗
            </button>
          )}
          {retract !== null && state.active && (
            <button type="button" className="link-button warn" onClick={() => onOpenLink(retract)}>
              Retract ↗
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
