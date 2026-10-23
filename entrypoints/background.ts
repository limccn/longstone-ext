import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';

/**
 * One job, no network: open the side panel when the toolbar button is
 * clicked. There is deliberately no `browser.runtime.onInstalled` handler
 * asking for permissions, no message routing, and no fetch.
 *
 * `setPanelBehavior` needs the `sidePanel` permission, which the manifest
 * already declares. A browser without the API (older Chromium) simply keeps
 * the button inert instead of failing the whole background script.
 */
export default defineBackground(() => {
  const sidePanel = (browser as { sidePanel?: { setPanelBehavior?: (behavior: { openPanelOnActionClick: boolean }) => Promise<void> } }).sidePanel;
  void sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {
    // Not fatal: the panel is also reachable from the side-panel picker.
  });
});
