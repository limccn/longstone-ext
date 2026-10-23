/**
 * AC-7: the 60-second reveal rule, exercised without a DOM (design §8.1).
 *
 * `createAutoHideController` owns the timing/visibility policy; `useAutoHide`
 * only wires it to React. The controller takes its scheduler and visibility
 * source as injected dependencies, so the boundary (59_999 vs 60_000), the
 * hidden-panel path and cleanup are asserted exactly instead of through a
 * timer-dependent E2E.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAutoHideController,
  SECRET_AUTO_HIDE_MS,
} from '../../src/ui/wallet/reveal.js';

function harness() {
  const subscribers: Array<(hidden: boolean) => void> = [];
  let unsubscribeCalls = 0;
  const hide = vi.fn();
  const schedule = vi.fn((callback: () => void, delayMs: number) =>
    setTimeout(callback, delayMs),
  );
  const cancelTimer = vi.fn((handle: unknown) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  );
  const controller = createAutoHideController({
    schedule,
    cancelTimer,
    subscribeVisibility: (listener) => {
      subscribers.push(listener);
      return () => {
        unsubscribeCalls += 1;
      };
    },
    onHide: hide,
  });

  return {
    controller,
    hide,
    schedule,
    cancelTimer,
    get unsubscribeCalls(): number {
      return unsubscribeCalls;
    },
    emitVisibility(hidden: boolean): void {
      for (const listener of subscribers) listener(hidden);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('auto-hide controller', () => {
  it('schedules nothing while inactive', () => {
    const h = harness();
    h.controller.setActive(false);

    expect(h.schedule).not.toHaveBeenCalled();
    expect(h.unsubscribeCalls).toBe(0);
    vi.advanceTimersByTime(SECRET_AUTO_HIDE_MS);
    expect(h.hide).not.toHaveBeenCalled();
  });

  it('hides at exactly 60 000 ms, not one millisecond earlier', () => {
    expect(SECRET_AUTO_HIDE_MS).toBe(60_000);
    const h = harness();
    h.controller.setActive(true);

    vi.advanceTimersByTime(SECRET_AUTO_HIDE_MS - 1);
    expect(h.hide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(h.hide).toHaveBeenCalledTimes(1);
    expect(h.unsubscribeCalls).toBe(1);
  });

  it('hides immediately when the panel becomes hidden', () => {
    const h = harness();
    h.controller.setActive(true);

    h.emitVisibility(false);
    expect(h.hide).not.toHaveBeenCalled();

    h.emitVisibility(true);
    expect(h.hide).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(SECRET_AUTO_HIDE_MS);
    expect(h.hide).toHaveBeenCalledTimes(1);
    expect(h.cancelTimer).toHaveBeenCalledTimes(1);
    expect(h.unsubscribeCalls).toBe(1);
  });

  it('cancels the timer and unsubscribes on cleanup', () => {
    const h = harness();
    h.controller.setActive(true);
    h.controller.dispose();

    expect(h.cancelTimer).toHaveBeenCalledTimes(1);
    expect(h.unsubscribeCalls).toBe(1);

    vi.advanceTimersByTime(SECRET_AUTO_HIDE_MS);
    expect(h.hide).not.toHaveBeenCalled();
  });

  it('starts a fresh window on a second activation', () => {
    const h = harness();
    h.controller.setActive(true);
    vi.advanceTimersByTime(30_000);

    h.controller.setActive(false);
    h.controller.setActive(true);

    vi.advanceTimersByTime(SECRET_AUTO_HIDE_MS - 1);
    expect(h.hide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(h.hide).toHaveBeenCalledTimes(1);
    expect(h.schedule).toHaveBeenCalledTimes(2);
  });

  it('does not restart a window that is already running', () => {
    const h = harness();
    h.controller.setActive(true);
    h.controller.setActive(true);

    expect(h.schedule).toHaveBeenCalledTimes(1);
  });
});
