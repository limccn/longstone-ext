# Store listing copy — longstone memory viewer

Status: submission-ready copy for Chrome Web Store and Microsoft Edge Add-ons.
Version: 0.2.0 (release tag `v0.2.0`). Not submitted.
Privacy policy: [PRIVACY.md](PRIVACY.md), published at
`https://longstone.app/privacy`.
Support: <support@longstone.app>. Developer issues:
<https://github.com/limccn/longstone-ext/issues>.

## Single-purpose statement

Provide a MemoryOverEth memory browser with a local, encrypted wallet.

## Short description

Browse MemoryOverEth memories, verify content, and keep an encrypted local
wallet. v1 does not sign; writes open in the web app.

This is the manifest description; it fits Chrome's 132-character limit.

## Long description

longstone memory viewer is a Chrome/Edge side panel for MemoryOverEth, an
on-chain long-term memory registry for AI agents. The current release targets
the Base Sepolia test network (chain id 84532).

Use it to:

- browse an owner's anchored memories in a timeline, with `deep` / `active`
  badges and tag filters;
- inspect a commitment's hashes, signer, advisory block height, transaction,
  and predecessor/successor links;
- verify that the bytes behind a commitment match the chain: the expected
  keccak256 and sha256 digests are read from the MemoryRegistry contract, the
  content is fetched from your configured gateway, and both digests are
  compared in the extension. A gateway that substitutes content cannot produce
  a `verified` result, and a CID alone is never presented as an on-chain
  verification;
- create or import a Base Sepolia identity in the local wallet, unlock it with
  a password you choose, add or rename accounts, export an account's private
  key or recovery phrase after re-entering the password, change the password,
  or reset the vault.

The wallet is encrypted locally and never leaves the browser. The password is
stretched with Argon2id and the payload is protected with AES-256-GCM; the
decrypted key exists only in the side panel's memory. Closing or hiding the
panel locks the wallet immediately, with an optional 15-minute idle lock while
it stays open. There is no password recovery: if you forget the password, the
local vault cannot be opened, so export your recovery material first if you
need a backup.

This release does **not sign transactions**. The wallet is a local identity
vault; retract and access-control/signers actions still open
`https://longstone.app` in a new tab, where your wallet signs. The same web app
is also served at `https://longstone-ui.pages.dev` for older links. The
extension does not connect a wallet provider, expose `window.ethereum`, or send
transactions.

Settings (RPC, registry, IPFS gateway, optional hisaishi gateway, default
owner, scan window), the scan cache, and the encrypted wallet record are stored
in `chrome.storage.local` on your machine. There is no account, no telemetry,
no analytics, and no remote code: all JavaScript and CSS is bundled, the
extension-page CSP is `script-src 'self' 'wasm-unsafe-eval'; object-src
'self'` (the wasm token covers the inlined Argon2id implementation), and the
build audit rejects remote scripts, eval, wallet signing entry points, and
off-allowlist key material.

Testnet only: Base Sepolia is a test chain; treat everything as throwaway.

Support/contact: <support@longstone.app>. Developer issues:
<https://github.com/limccn/longstone-ext/issues>. Security reports can use the
issue tracker; do not include secrets or recovery phrases in a public issue.

## Permission justifications

| Permission | Justification |
|---|---|
| `sidePanel` | The primary user interface: timeline, commitment detail, verify, and the wallet render in the browser side panel. It does not inject script into pages. |
| `storage` | Stores your settings, the local scan cache, and the encrypted wallet record in `chrome.storage.local`. The wallet password and decrypted keys are never stored or synced. |
| `optional_host_permissions` | Lets the extension read the RPC, IPFS gateway, and hisaishi endpoints **you configure**. Only those exact origins are requested, at the moment you click Save, from a user gesture. `https://*/*` is the optional ceiling that makes arbitrary user-configured HTTPS endpoints possible; the runtime never requests `<all_urls>` or a wildcard host. The extension declares no `host_permissions`, `tabs`, `activeTab`, `scripting`, content scripts, or `web_accessible_resources`. |

Host access is a reliability mechanism, not a data path: extension pages fetch
cross-origin under normal CORS rules, so a CORS-enabled endpoint answers
without a grant. The grant exists for endpoints that do not send CORS headers.
You can revoke access from the browser's extension details page.

## Data-use disclosure

- The extension collects no personal data and sells, shares, or transfers
  none.
- It reads public on-chain data through the configured RPC endpoint and may
  fetch public content bytes from the configured IPFS/hisaishi gateway.
- Settings, the scan cache, and the encrypted wallet record stay in
  `chrome.storage.local`; they are not synced to a browser account or uploaded
  by the extension.
- The wallet password, recovery phrases, and private keys are never sent over
  the network. Keys exist in plaintext only in the side panel's memory after an
  explicit unlock or reveal, and are dropped when the panel locks.
- Network requests go only to the configured endpoints, the fixed web-app
  origin when you click a deep link, and the Base Sepolia block explorer when
  you open a transaction or contract link. Those third-party services see
  ordinary request metadata such as your IP address; the developer does not
  receive it.
- No remote code is loaded or evaluated; all code ships in the package.

## Suggested listing metadata

- Category: Productivity (owner to confirm in the store console).
- Language: English.
- Store icon: `assets/icon-128.png` (128x128 PNG; source
  `assets/icon-source.svg`).
- Screenshots: `assets/screenshot-01-timeline.png` through
  `assets/screenshot-05-wallet-locked.png` (1280x800; see
  [SUBMISSION.md](SUBMISSION.md) for provenance).
- Test instructions for reviewers: load the unpacked build, leave the default
  Base Sepolia endpoints or set your own, save (approve the one host-access
  prompt for those origins), then paste an owner address that has commitments.
  No account is needed to browse. The Wallet tab can create a new testnet
  wallet entirely offline; signing is not part of this release, and write
  buttons only open the web app.
