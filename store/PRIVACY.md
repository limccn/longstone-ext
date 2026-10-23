# Privacy policy — longstone memory viewer (draft)

Status: draft for Chrome Web Store and Microsoft Edge Add-ons submission.
Effective date: TODO (set when the policy is published).
Contact: [TODO: replace with the owner's support/security contact before publication]

This policy covers the `longstone memory viewer` browser extension
(`longstone-ext`, version 0.1.1). It is a **read-only** viewer for
MemoryOverEth memories on the Base Sepolia test network.

## Summary

- No account, sign-in, or user profile.
- No telemetry, analytics, crash reporting, advertising, or tracking.
- No collection, sale, sharing, or transfer of personal data by the extension
  or its developer.
- No wallet connection, private keys, seed phrases, or wallet data. The
  extension never asks for a key and has no field that could accept one.
- No remote code. All JavaScript and CSS is bundled in the package; the
  extension-page CSP is `script-src 'self'; object-src 'self'`. The build audit
  rejects eval/Function, remote script tags, wallet signing entry points, and
  off-allowlist 64-hex literals.

## Data the extension reads and where it goes

The extension reads public blockchain data (the configured MemoryRegistry
contract and its event logs) through the JSON-RPC endpoint configured in
Settings. When you verify a memory, it may fetch content bytes from the IPFS
gateway and/or hisaishi gateway configured in Settings. The extension ships
with default public endpoints (listed in the README); every endpoint is
editable.

Network requests go only to:

- the RPC, IPFS gateway, and hisaishi endpoints configured in Settings
  (including defaults left in place);
- `https://longstone-ui.pages.dev` when you click a deep link to the web app;
- `https://base-sepolia.blockscout.com` when you click a transaction or
  contract link.

As with any network request, those servers can see your IP address and request
metadata. The developer does not receive or collect that data. Those endpoints
are operated by third parties or by you, and their own privacy policies apply.
The browser vendor may process install/usage information under its own
policies; the extension itself has no telemetry.

## Local storage

Settings (RPC URL, registry address, gateway URLs, an optional default owner,
and scan-window settings) are stored in `chrome.storage.local` on your machine.
The extension also caches the scanned registry window there (public event
metadata such as commitment hashes, owners, tags, and block numbers) so a
closed side panel can resume. This data is not synced to your browser account
and is not uploaded anywhere. It remains until you clear the extension's
storage or uninstall the extension. The extension does not store memory
content bytes, keys, or wallet data.

## Permissions

- `sidePanel` — shows the extension's primary UI in the browser side panel.
- `storage` — stores the local settings and scan cache described above.
- Optional host permissions — requested only for the exact RPC/IPFS/hisaishi
  origins you save in Settings, from your Save click. The manifest's
  `https://*/*` entry is the ceiling that makes user-configured HTTPS
  endpoints possible; the extension never requests `<all_urls>`, and it
  declares no `tabs`, `activeTab`, `scripting`, or content scripts.

You can revoke host access at any time from the browser's extension details
page. Denying it leaves the setting saved, but the endpoint may be unreadable.

## Wallet and write actions

The extension does not connect a wallet, does not hold a key, and does not
sign or send transactions. Buttons for retract, ACL/signers, and verify open
`https://longstone-ui.pages.dev`; that web app is a separate site with its own
privacy policy, and any wallet interaction there is performed by you.

## Changes and contact

This draft will be replaced by the posted policy at the store listing URL
before publication. Questions or requests:
[TODO: replace with the owner's support/security contact before publication].
