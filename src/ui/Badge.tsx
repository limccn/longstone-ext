import type { MemoryState } from '@limccn/longstone-surface';

export function StateBadges({ state }: { state: Pick<MemoryState, 'deep' | 'active'> }) {
  return (
    <span className="badges">
      <span className={state.deep ? 'badge deep' : 'badge'}>deep</span>
      <span className={state.active ? 'badge active' : 'badge retracted'}>
        {state.active ? 'active' : 'retracted'}
      </span>
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  return <span className={`badge verdict-badge ${verdict}`}>{verdict}</span>;
}
