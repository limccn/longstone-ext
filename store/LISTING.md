# Store listing copy — longstone memory viewer (draft)

Status: draft for Chrome Web Store and Microsoft Edge Add-ons. Not submitted.
Version: 0.1.1 (tag `v0.1.1`; see [CHECKLIST.md](CHECKLIST.md)).
Privacy policy: [PRIVACY.md](PRIVACY.md) (hosted URL still TODO).

## Single-purpose statement

browse and cryptographically verify MemoryOverEth on-chain memories

## Short description

Read-only viewer for MemoryOverEth: browse and verify on-chain agent memory.
Writes open in the web app, where your wallet signs.

This is the manifest description; it fits Chrome's 132-character limit.

## Long description

longstone memory viewer is a read-only Chrome/Edge side panel for
MemoryOverEth, an on-chain long-term memory registry for AI agents. The
current release targets the Base Sepolia test network (chain id 84532), and it
never asks for an account, a wallet, or a key.

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
  verification.

The extension is deliberately read-only. Retract and access-control/signers
actions open `https://longstone-ui.pages.dev` in a new tab, where your wallet
signs; the extension itself does not connect a wallet, hold a key, sign, or
send transactions.

Settings (RPC, registry, IPFS gateway, optional hisaishi gateway, default
owner, scan window) and the scan cache are stored in `chrome.storage.local` on
your machine. There is no account, no telemetry, no analytics, and no remote
code: all JavaScript and CSS is bundled, the extension-page CSP is
`script-src 'self'`, and the build audit rejects remote scripts, eval, and
wallet signing entry points.

Testnet only: Base Sepolia is a test chain; treat everything as throwaway.

Support/contact: [TODO: replace with the owner's support/security contact
before publication].

## Permission justifications

| Permission | Justification |
|---|---|
| `sidePanel` | The primary user interface: the timeline, commitment detail, and verify views render in the browser side panel. It does not inject script into pages. |
| `storage` | Stores your settings and the local scan cache in `chrome.storage.local`. Nothing is synced or uploaded. |
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
- Settings and the scan cache stay in `chrome.storage.local`; they are not
  synced to a browser account or uploaded by the extension.
- Network requests go only to the configured endpoints, the fixed web-app
  origin when you click a deep link, and the Base Sepolia block explorer when
  you open a transaction or contract link. Those third-party services see
  ordinary request metadata such as your IP address; the developer does not
  receive it.
- The extension holds no private keys, seed phrases, or wallet data. Wallet
  writes open the web app and are not performed by the extension.
- No remote code is loaded or evaluated; all code ships in the package.

## Suggested listing metadata

- Category: Productivity (owner to confirm in the store console).
- Language: English.
- Test instructions for reviewers: load the unpacked build, leave the default
  Base Sepolia endpoints or set your own, save (approve the one host-access
  prompt for those origins), then paste an owner address that has commitments.
  No account or wallet is needed. Wallet write buttons only open the web app.
