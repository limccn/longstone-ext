# longstone-ext

A Chrome / Edge side panel for MemoryOverEth: browse an owner's anchored
memories, inspect a commitment, verify that the bytes behind it match what the
chain says, and keep an **encrypted local wallet** for your Base Sepolia
identity.

Version 0.2 adds the wallet vault. It **does not sign**: there is no
transaction method, no `window.ethereum`, and write actions still open the web
app. The wallet exists so the extension can hold and export the identity you
use there, under a password only you know.

- Chain: Base Sepolia (84532); the registry address can point at another
  deployment on that chain.
- Distribution target: Chrome Web Store and Microsoft Edge Add-ons (v0.2 is a
  sideloadable unpacked build; nothing is published by this repo yet).
- Previous release: 0.1.1 was the read-only viewer. 0.2.0 is the wallet
  increment.

---

## What it does

| Surface | Behaviour |
|---|---|
| **Side panel** (primary) | Owner timeline with `deep` / `active` badges and tag filters; commitment detail with predecessor/successor links; verify. |
| **Wallet tab** | Create or import a Base Sepolia account, unlock the encrypted vault, add/rename/delete accounts, export a key or phrase after re-entering the password, change the password, reset the vault. |
| **Options page** | RPC, registry, IPFS gateway, hisaishi URL, default owner, scan chunk/start. Stored in `chrome.storage.local`. |
| **Toolbar button** | Opens the side panel. |
| **Deep links** | "Retract", "Manage signers", "Detail" and "Verify" buttons open `https://longstone.app` in a new tab (`https://longstone-ui.pages.dev` serves the same build for older links). |

### Verification is chain-first

Verify reads **both expected digests from the registry** (`getCommitment`,
`isDeep`, `isActive`) before fetching any bytes. The bytes are then hashed in
the extension and compared:

- `keccak256(bytes) == commitment.contentHash`
- `sha256(bytes) == commitment.cidDigest`

The gateway is a transport, never an authority. A gateway that returns
substituted bytes yields `content-mismatch`, never `verified`. This is the
`verifyCommitment` API from `@limccn/longstone-surface`; the extension does not
reimplement hashing, ABI decoding, or the verdict vocabulary.

A CID alone is never presented as an on-chain verification, and a retract is
shown as a tombstone (`deep` but not `active`), not a deletion.

---

## Wallet vault: what is stored, and where

The vault is a single encrypted record in `chrome.storage.local` plus an
optional one-time pending record used by password rotation. The crypto, record
format, derivation and vault lifecycle come from
`@limccn/longstone-wallet`; this extension supplies only the storage adapter
and the self-write guard:

- Password input is NFC-normalised, tagged with `longstone/wallet.v1/kdf\0`, and
  stretched with **Argon2id** (Whitelisted parameters only; creation starts at
  `m=65536, t=3, p=1` and steps down only if the browser reports KDF
  unavailability).
- The 32-byte Argon2id output is run through **HKDF-SHA256** with the domain tag
  `longstone/wallet.v1/enc`.
- The payload (accounts, labels, the active account, idle setting, and each
  account's mnemonic or private key) is encrypted with **AES-256-GCM** and a
  fresh 12-byte IV. Only the ciphertext is long base64 in the record; the salt
  and IV are short, fixed-size values.
- The decrypted payload and the non-extractable AES key live **only in the side
  panel's page memory**. They are never written to the background service
  worker, never sent over the network, and never logged. There is no `fetch`,
  `XMLHttpRequest`, `WebSocket`, or `console.*` call in the wallet modules.
- Address derivation uses `@scure/bip39` + `@scure/bip32` +
  `@noble/curves` at `m/44'/60'/0'/0/0`. `viem/accounts` (`privateKeyToAccount`,
  `mnemonicToAccount`) is forbidden in the build; the audit fails on those
  entry points.
- The extension-page CSP is
  `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. The wasm token is
  required by hash-wasm's inlined Argon2id; `'unsafe-eval'` and remote scripts
  are still rejected.

### Locking

The vault locks when it should, not only when the page is destroyed:

- closing or hiding the side panel (`visibilitychange` → `hidden`, with
  `pagehide` as a fallback) locks immediately;
- an optional 15-minute idle timeout can be turned off in the Wallet tab; it
  does **not** weaken the hidden/close lock;
- a lock drops the decrypted payload and key before any await, bumps an epoch,
  and discards any in-flight KDF result that resolves afterwards (so an unlock
  that finishes after the panel was hidden cannot restore an unlocked UI);
- another extension context writing or deleting the vault record locks the
  panel; the panel's own save is suppressed by a per-page write guard, so
  renaming an account or adding one does not lock you out.

The locked screen deliberately shows no address, account count, or label.

### There is no recovery

Forgetting the password means the vault cannot be opened. The UI says so
before creation and offers only a reset that deletes the encrypted record. If
you need a backup, export the recovery phrase or private key first (the export
dialog asks for the password again and masks the secret until you reveal it;
the reveal auto-hides after 60 seconds or when the panel is hidden).

This is a **testnet** wallet: a browser-held key is not the same trust model as
a hardware wallet, and v0.2 still cannot sign anything.

---

## Load unpacked

Build first (see [Development](#development)), then:

### Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select `<repo>/.output/chrome-mv3`.
4. Pin the extension, then click its toolbar button. The side panel opens.
5. Click **Settings** in the panel header (or the extension's *Options*) and
   save your endpoints. Saving asks for host access to exactly those origins.

Requires Chrome 114 or newer (the `chrome.sidePanel` API). The manifest
declares `minimum_chrome_version: "114"`.

### Edge

1. Open `edge://extensions`.
2. Enable **Developer mode** (left sidebar).
3. Click **Load unpacked** and select `<repo>/.output/edge-mv3`.
4. Same settings flow as Chrome. Edge 114+ ships the equivalent side-panel API.

If the toolbar button does not open the panel, open it from the side-panel
picker (the panel icon at the right of the toolbar); the
`setPanelBehavior` call only controls the click shortcut.

---

## Scope: no signing, no remote key path

The extension still contains **no signing entry point**: no `window.ethereum`,
no `signTransaction`/`sendTransaction`, and no `eth_sendTransaction` call path.
The audit fails the build on those names and on `LONGSTONE_*KEY` names.

The bundled chain client (`viem`'s public client) carries generic public-RPC
action definitions such as `sendRawTransaction`,
`sendRawTransactionSync`, and `prepareTransactionRequest`. These take an
already-signed payload; nothing in the extension calls them, and the wallet
module exposes no signer or transaction method. The audit remains strict: it
fails on the signing names, `window.ethereum`, key-material names, and any `0x`
+ 64-hex literal outside the reviewed public-constant allowlist. The wallet's
test vectors live under `test/`, never in `src/` or the bundle.

The extension never asks for a key over the network and has no field that
uploads one. Keys are entered only in the local import flow or generated
locally; the vault is local-only.

### Deep links

Write actions happen in the web app, where the user's wallet is. Links are
built in `src/lib/deepLinks.ts` under three rules (security review PS-8):

1. The base URL is a **fixed constant** — `https://longstone.app`.
   No caller can supply a different host. (The app is also served at
   `https://longstone-ui.pages.dev` for older links, but new links target the
   custom domain.)
2. The only dynamic path segment is a commitment hash, validated as
   `0x` + exactly 64 hex characters **before** the URL is built. An invalid
   value returns `null`, and the button is not rendered.
3. Values are passed through `encodeURIComponent` even after validation.

The web app re-validates everything on arrival.

| Link | Target |
|---|---|
| Detail | `/commitment/<hash>` |
| Retract | `/retract` (hash, when present, is carried in the fragment) |
| Signers / ACL | `/acl` |
| Verify | `/verify` |

---

## Permissions and why

The built manifest declares exactly:

```json
{
  "permissions": ["sidePanel", "storage"],
  "optional_host_permissions": [
    "https://*/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

| Item | Why |
|---|---|
| `sidePanel` | The primary surface. |
| `storage` | Settings, the scan cache, and the encrypted wallet record, locally. Nothing is synced or uploaded. |
| `optional_host_permissions` | Read access to the RPC / IPFS / hisaishi endpoints **you configure**. They are optional, and the options page requests exactly those configured origins in **one prompt**, from your Save click (PS-7). A CORS-enabled endpoint works without the grant; an endpoint that does not send CORS headers needs it. |
| Extension-page CSP | Bundled code only: no `unsafe-eval`, no remote script. `'wasm-unsafe-eval'` is limited to the inlined Argon2id wasm. |

What is **not** declared, deliberately: `<all_urls>` as a required host,
`host_permissions`, `tabs`, `activeTab`, `scripting`, `debugger`, `webRequest`,
`cookies`, content scripts (no page injection at all), and
`web_accessible_resources`.

The optional `https://*/*` entry is the *ceiling* the browser allows a user to
approve for a configured HTTPS endpoint; the extension itself only ever calls
`permissions.request` with the `https://<host>/*` patterns derived from the
URLs you saved. `test/permissions.test.ts` fails if a broad pattern reaches
that call.

Host permission is a reliability mechanism, not a data path: extension pages
fetch cross-origin under normal CORS rules, so a CORS-enabled RPC/gateway
answers without any grant. The grant exists for endpoints that do not send
CORS headers (many private RPCs). Either way, only the endpoints in your
settings are contacted.

Chrome match patterns have no port field (a grant covers every port on the
host) and cannot express IPv6 literals. An IPv6 loopback endpoint therefore
cannot be granted; it still works if it sends CORS headers.

`chrome.tabs.create` (used for deep links) does not require the `tabs`
permission — that permission only grants reading tab metadata.

### What it does not collect

No analytics, no accounts, no telemetry, no remote config. Settings, the scan
cache, and the encrypted wallet record live in `chrome.storage.local` and stay
on the machine. The wallet password, recovery phrase, and private keys are
never sent anywhere. Network requests go only to the RPC, IPFS gateway and
hisaishi endpoints you set, plus the fixed web-app origin when you click a deep
link, and the Base Sepolia block explorer when you open a transaction or
contract link.

---

## Settings

| Field | Default | Notes |
|---|---|---|
| RPC endpoint | `https://sepolia.base.org` | https, or http only on loopback. |
| Registry contract | the deployed Base Sepolia registry | `0x` + 40 hex. |
| IPFS gateway | `https://gateway.pinata.cloud/ipfs` | Used when no hisaishi URL is set. |
| Memory gateway (hisaishi) | the deployed Worker | Optional; digest route for content. A self-hosted gateway must expose `x-ipfs-cid` via CORS (`Access-Control-Expose-Headers`) or verification cannot name the CID it fetched. |
| Default owner | blank | Paste an address in the panel when blank. |
| Scan chunk size | 200 | Base Sepolia's public RPC caps `eth_getLogs` at 200 blocks. |
| Scan start block | blank | Blank scans the last 50,000 blocks. |

The panel scans **backwards from the tip in a bounded window** because a side
panel is opened for seconds, not left running. That is a deliberate difference
from the web app, which caches a full index in IndexedDB. The panel states the
window it covered, so "no memories found" is never mistaken for "no memories
exist". Set an explicit start block for older history, or use the web app.

Progress is **durable per slice**: each persisted slice lands in
`chrome.storage.local` before the next one starts, so closing the panel
mid-scan resumes from the last completed slice instead of starting over. Rows
appear as slices complete rather than only at the end.

Settings reload automatically when the options page saves; changing the RPC or
registry invalidates the cached scan instead of merging it.

---

## Development

```bash
# from the MemoryOverEth workspace root
corepack pnpm install
corepack pnpm --dir longstone-surface build   # dist is consumed
corepack pnpm --dir menhir/ts build                                 # menhir-core dist

# from this directory
corepack pnpm dev             # chrome, hot reload
corepack pnpm dev:edge        # edge
corepack pnpm typecheck
corepack pnpm test            # vitest unit/integration tests
corepack pnpm e2e             # Playwright against .output/chrome-mv3
corepack pnpm build           # chrome + edge
corepack pnpm run audit       # inspects .output/{chrome,edge}-mv3
```

`pnpm build` produces `.output/chrome-mv3` and `.output/edge-mv3`.
`pnpm zip` additionally writes store-ready zips.

The E2E suite needs `playwright install chromium` once on a fresh machine. It
uses `channel: 'chromium'` (the branded Chrome channel no longer accepts
`--load-extension` under automation), a persistent context, and an extension id
read from the service-worker URL. `test/e2e/read-verify.spec.ts` runs against a
deterministic in-repo JSON-RPC + gateway fixture; it exercises the real viem
transport and the real registry ABI without needing an external chain.

### What the audit enforces

`scripts/audit-extension.mjs` reads the **built** output, not the source:

- no `<script src="http…` and no remote stylesheet link;
- no `eval(` and no `new Function(`;
- no `signTransaction`, `sendTransaction`, or `window.ethereum`;
- no `LONGSTONE_KEY` / `LONGSTONE_OWNER_KEY` names;
- no `0x` + 64-hex literal outside an exact allowlist of reviewed public
  constants (secp256k1 curve parameters and ERC-6492 / EIP-7702 sentinels that
  `viem` bundles, plus the reviewed wallet curve constants). Any new literal
  fails until reviewed;
- manifest: MV3, `side_panel` present, options page present, exactly the
  required permissions, no `host_permissions`, no content scripts, no
  `web_accessible_resources`, no broad optional pattern, and no CSP widening
  (including keeping `'wasm-unsafe-eval'` and refusing `'unsafe-eval'`).

It exits non-zero if `.output/` is missing — the audit is only meaningful on a
build.

### Tests

`test/*.test.ts` (vitest, node environment) cover the parts that must not
regress silently:

- deep-link validation and encoding (PS-8);
- settings validation, URL/address rules, storage round-trip and fallback;
- per-origin permission requests and refusal of broad patterns (PS-7);
- scan-window and cache-invalidation rules;
- manifest policy, source-tree signing/wallet checks, and — when `.output/`
  exists — the built manifests for both browsers;
- the host-side wallet guard and the `src`/`ui` purity gate (no network,
  console, derivation library or second crypto implementation in the app);
  the core's Argon2id vectors, envelope, payload and password-rotation tests
  live in `@limccn/longstone-wallet`.

`test/e2e/*.spec.ts` (Playwright) load the built extension and exercise:

- create → confirm phrase → password → lock → wrong password → unlock;
- add an imported key, export both secrets, verify the derived key at the
  fixed path;
- change the password and confirm the old one fails;
- hidden/pagehide locks, including during an in-flight KDF;
- self-write vs external-write vs external-delete;
- reset and last-account deletion;
- three storage dumps plus DOM searches for the runtime-generated phrase,
  private key, and every consecutive 4-word fragment;
- timeline/detail/verify against the local RPC fixture (verified,
  not-anchored, and content-mismatch).

### Layout

```
entrypoints/
  sidepanel/       index.html + main.tsx + style.css   (primary surface)
  options/         index.html + main.tsx + style.css   (settings page)
  background.ts    opens the panel on toolbar click; no wallet, no network
src/
  lib/             manifest policy, settings, deep links, permissions,
                   chain window, scan orchestration, cache, chrome adapter
  lib/wallet/      host-specific self-write guard; the vault core lives in
                   @limccn/longstone-wallet
  ui/              React views (timeline, detail, verify, settings)
  ui/wallet/       wallet views, forms, dialogs, copy, rate limiting
scripts/
  audit-extension.mjs
test/
  e2e/             Playwright specs + extension fixture + local RPC fixture
```

`src/lib/chromeApi.ts` is the only module that touches `browser.*`; every other
module takes an injected seam, which is why the unit tests need no browser.

### Manual validation (v0.2)

1. `pnpm build` and load `.output/chrome-mv3` unpacked.
2. Save settings; approve the single host-access prompt covering the
   configured origins.
3. Paste a Base Sepolia owner with known commitments and confirm the timeline
   and that retracted rows show `retracted`.
4. Open a commitment, click **Verify content**, and confirm both digest checks
   and the verdict.
5. Open the Wallet tab, create a wallet, confirm the 4-word check and password,
   lock it, unlock it, export the private key and phrase, change the password,
   and confirm the old password fails.
6. Hide/close the panel and reopen it; confirm the locked state. Forgetting the
   password (on a throwaway wallet) must lead only to Reset.
7. Repeat in Edge with `.output/edge-mv3`.
8. Click **Retract ↗** and confirm the web app opens on the retract screen and
   asks for a wallet — the extension itself never signs.

---

## Status and limitations (v0.2)

- **Testnet only.** Base Sepolia is a test chain; treat everything as
  throwaway.
- **No signing.** The wallet is a local identity vault for exports, backed by
  the shared `@limccn/longstone-wallet` core. Transaction signing is a separate
  security review.
- **No password recovery.** Forgetting the password means the local vault is
  unrecoverable. Export first if you need a backup.
- **Not published.** Draft store materials live under [`store/`](store/); no
  listing has been submitted and the hosted policy URL, icon, and screenshots
  are still TODO. Loading unpacked is the supported path.
- **Single chain per configuration.** Chain id is fixed to Base Sepolia; the
  registry address can point at another deployment on that chain, but the UI
  does not offer an arbitrary-chain picker.
- **No staging view.** The hisaishi staging read routes are unauthenticated
  until the gateway hardening lands; the extension deliberately does not spend
  its review budget on them.
- **Bounded scan window.** Older history requires an explicit start block or
  the web app. A wide window (say, 370k blocks) is correct but slow against a
  capped public RPC; the default 50k window is the practical setting.
- **Cross-surface extraction.** The wallet core lives in
  `@limccn/longstone-wallet` (extracted in Phase 0 of
  `longstone-vscode-wallet-vault`). This extension consumes it through
  `workspace:*` and keeps only the host-specific write guard; it does not copy
  the core into another repository (DR-04).

## Store submission (draft)

- [Privacy policy](store/PRIVACY.md)
- [Listing copy and permission justifications](store/LISTING.md)
- [Chrome Web Store / Edge Add-ons submission checklist](store/CHECKLIST.md)

These are drafts for the owner to review. The 128px icon, screenshots/store
tiles, hosted privacy-policy URL, and support contact are still TODO.
Submission is an owner action; nothing has been submitted.

## v2 (expected, not started)

- Store listings: publish the drafted materials in [`store/`](store/) after the
  owner supplies the icon, screenshots, hosted policy URL, and contact.
- Local signing, if approved by a new security review. Until then, wallet write
  actions remain deep links to the web app.
- VS Code wallet surface on the shared `@limccn/longstone-wallet` core
  (extraction done in Phase 0); keep one implementation and one audited
  envelope.
- Multi-chain configuration (chain id + per-chain registry), with validation
  tied to the RPC's reported `eth_chainId`.
- Firefox (`sidebar_action`) if the surface is wanted; requires a separate
  manifest target and review of the Firefox extension policies.
- Content viewing (render the verified bytes, not just the digests), with
  labels that keep memory text visibly untrusted.
- Deeper history without an explicit start block: deploy-block discovery, or a
  cached index equivalent to the web app's.

## License

Apache-2.0. See [LICENSE](./LICENSE).
