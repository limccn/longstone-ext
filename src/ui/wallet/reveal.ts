/**
 * One rule for every secret on screen (ux-flows §10.1, A-4): a reveal is
 * explicit, lasts at most 60 seconds, and ends immediately when the panel is
 * hidden. Callers keep the plaintext out of the DOM while `active` is false.
 *
 * The policy lives in a small controller with injected timing/visibility
 * sources so the boundary is unit-testable without a DOM; `useAutoHide` is the
 * React adapter that supplies `window.setTimeout` and `document`.
 */
import { useEffect } from 'react';

export const SECRET_AUTO_HIDE_MS = 60_000;

export interface AutoHideDependencies {
  /** Runs `callback` once after `delayMs`; the returned handle is opaque. */
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancelTimer: (handle: unknown) => void;
  /** Subscribes to visibility changes; the listener receives `hidden`. */
  subscribeVisibility: (listener: (hidden: boolean) => void) => () => void;
  onHide: () => void;
  /** Defaults to `SECRET_AUTO_HIDE_MS`. */
  delayMs?: number;
}

export interface AutoHideController {
  /**
   * Starts the hide window. Calling it while the window is running is a no-op;
   * calling it with `false` ends the window immediately.
   */
  setActive(active: boolean): void;
  /** Cancels the timer and drops the visibility subscription. */
  dispose(): void;
}

/**
 * Timing/visibility rule for secret reveals. The window is fresh on every
 * transition from inactive to active, and a fire (timer or hidden panel) ends
 * it so a stale timer cannot hide a later reveal.
 */
export function createAutoHideController(deps: AutoHideDependencies): AutoHideController {
  const delayMs = deps.delayMs ?? SECRET_AUTO_HIDE_MS;
  let timer: unknown = null;
  let unsubscribe: (() => void) | null = null;

  function stop(): void {
    if (timer !== null) {
      deps.cancelTimer(timer);
      timer = null;
    }
    if (unsubscribe !== null) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  function hide(): void {
    stop();
    deps.onHide();
  }

  return {
    setActive(active) {
      if (!active) {
        stop();
        return;
      }
      if (timer !== null || unsubscribe !== null) return;
      timer = deps.schedule(hide, delayMs);
      unsubscribe = deps.subscribeVisibility((hidden) => {
        if (hidden) hide();
      });
    },
    dispose: stop,
  };
}

export function useAutoHide(active: boolean, onHide: () => void): void {
  useEffect(() => {
    const controller = createAutoHideController({
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelTimer: (handle) => window.clearTimeout(handle as number),
      subscribeVisibility: (listener) => {
        const onVisibility = (): void => listener(document.visibilityState === 'hidden');
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
      },
      onHide,
    });
    controller.setActive(active);
    return () => controller.dispose();
  }, [active, onHide]);
}
