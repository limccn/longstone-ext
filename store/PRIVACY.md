# Privacy policy — longstone memory viewer

Status: final text for Chrome Web Store and Microsoft Edge Add-ons. The hosted
copy must be published by the owner before submission.
Effective date: `[OWNER: set the date when the policy is published]`.
Contact: <https://github.com/limccn/longstone-ext/issues>.
Hosted URL: `[OWNER: public URL of this policy]`.

This policy covers the `longstone memory viewer` browser extension
(`longstone-ext`, version 0.2.0). It is a MemoryOverEth viewer with a local,
encrypted wallet for the Base Sepolia test network.

## Summary

- No account, sign-in, or user profile.
- No telemetry, analytics, crash reporting, advertising, or tracking.
- No collection, sale, sharing, or transfer of personal data by the extension
  or its developer.
- The local wallet stores keys only in encrypted form on your machine. The
  password, recovery phrases, and private keys are never uploaded, and the
  extension sends no wallet data anywhere.
- There is no password recovery. Losing the password means the encrypted vault
  cannot be opened.
- No remote code. All JavaScript and CSS is bundled in the package; the
  extension-page CSP is `script-src 'self' 'wasm-unsafe-eval'; object-src
  'self'` (the wasm token is required by the inlined Argon2id implementation).
  The build audit rejects eval/Function, remote script tags, wallet signing
  entry points, and off-allowlist 64-hex literals.

## Data the extension reads and where it goes

The extension reads public blockchain data (the configured MemoryRegistry
contract and its event logs) through the JSON-RPC endpoint configured in
Settings. When you verify a memory, it may fetch content bytes from the IPFS
gateway and/or hisaishi gateway configured in Settings. The extension ships
with default public endpoints (listed in the README); every endpoint is
editable.

Wallet operations are entirely local: key generation, import, address
derivation, encryption, decryption, and export run in the side panel and do not
make network requests.

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
closed side panel can resume.

The wallet is stored in `chrome.storage.local` as a single encrypted record
(plus an optional short-lived record used during password rotation). The
record contains the Argon2id salt and parameters, an AES-GCM IV, and the
encrypted payload; the password, recovery phrase, private keys, account labels,
and account list are inside the ciphertext. The password is never stored. The
decrypted payload and the AES key exist only in the side panel's page memory
while unlocked, and are dropped when the panel locks (closing or hiding the
panel, a lock button, or the optional idle timeout).

This data is not synced to your browser account and is not uploaded anywhere.
It remains until you clear the extension's storage or uninstall the extension.
Resetting the wallet deletes the encrypted record; it cannot be recovered
without the password or an exported recovery phrase/private key. The extension
does not store memory content bytes.

## Permissions

- `sidePanel` — shows the extension's primary UI in the browser side panel.
- `storage` — stores the local settings, scan cache, and encrypted wallet
  record described above.
- Optional host permissions — requested only for the exact RPC/IPFS/hisaishi
  origins you save in Settings, from your Save click. The manifest's
  `https://*/*` entry is the ceiling that makes user-configured HTTPS
  endpoints possible; the extension never requests `<all_urls>`, and it
  declares no `tabs`, `activeTab`, `scripting`, or content scripts.

You can revoke host access at any time from the browser's extension details
page. Denying it leaves the setting saved, but the endpoint may be unreadable.

## Wallet and write actions

The wallet creates or imports a Base Sepolia identity locally. It does not
sign transactions in this release and does not connect to a wallet provider.
Retract, ACL/signers, and verify buttons open `https://longstone-ui.pages.dev`;
that web app is a separate site with its own privacy policy, and any wallet
interaction there is performed by you.

Exporting a private key or recovery phrase requires re-entering the wallet
password and an explicit reveal. The secret remains visible for at most 60
seconds, until you hide it, or until the panel is hidden. The clipboard may
retain a copy after you leave; that is your operating system's behaviour, not
an upload by the extension.

## Changes and contact

The hosted URL above is the authoritative copy of this policy once the owner
publishes it. Material changes will be reflected there and in the extension's
store listing metadata. Questions or requests:
<https://github.com/limccn/longstone-ext/issues>.
