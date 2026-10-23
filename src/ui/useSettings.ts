import { useEffect, useState } from 'react';
import type { Settings } from '../lib/settings.js';

/**
 * Loads settings and re-reads them when storage changes.
 *
 * The side panel and the options page are separate documents; saving in one
 * must not require reopening the other. `onChanged` is injected so a missing
 * storage-event API can never crash the panel.
 */
export function useSettings(
  load: () => Promise<Settings>,
  onChanged: (callback: () => void) => () => void,
): { settings: Settings | null; reload: () => void } {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setSettings(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load, nonce]);

  useEffect(() => onChanged(() => setNonce((value) => value + 1)), [onChanged]);

  return { settings, reload: () => setNonce((value) => value + 1) };
}
