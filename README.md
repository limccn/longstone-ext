# longstone-ext

A **read-only** Chrome / Edge side panel for the MemoryOverEth memory registry.
Browse an owner's anchored memories, inspect a commitment, and verify that the
bytes behind it match what the chain says — without leaving the current tab.

Writes are **not** implemented here, on purpose. Retract and access-control
changes open the web app, where your wallet signs.

- Chain: Base Sepolia (84532); the registry address can point at another
  deployment on that chain.
- Distribution target: Chrome Web Store and Microsoft Edge Add-ons (v1 is a
  sideloadable unpacked build; nothing is published by this repo yet).

---

## What it does

| Surface | Behaviour |
|---|---|
| **Side panel** (primary) | Owner timeline with `deep` / `active` badges and tag filters; commitment detail with predecessor/successor links; verify. |
| **Options page** | RPC, registry, IPFS gateway, hisaishi URL, default owner, scan chunk/start. Stored in `chrome.storage.local`. |
| **Toolbar button** | Opens the side panel. |
| **Deep links** | "Retract", "Manage signers", "Detail" and "Verify" buttons open `https://longstone-ui.pages.dev` in a new tab. |

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

## Scope: read-only by construction

There is **no wallet code in the bundle**: no `window.ethereum`, no
`signTransaction`/`sendTransaction`, no private key or mnemonic, and no
`LONGSTONE_KEY`. The audit fails the build on those entry-point names, on
`LONGSTONE_*KEY` names, and on any `0x` + 64-hex literal outside a reviewed
public-constant allowlist; the manifest declares no permission that could sign
or inject script into a page.

The bundled chain client (`viem`'s public client) also carries generic
public-RPC action definitions such as `sendRawTransaction`,
`sendRawTransactionSync`, and `prepareTransactionRequest`. These take an
already-signed payload; the extension has no signer, account, wallet,
`window.ethereum`, or signing entry point, and no source path calls them. The
audit remains strict: it fails the build on `signTransaction`,
`sendTransaction`, `window.ethereum`, key-material names, and off-allowlist
`0x` + 64-hex literals.

The extension never asks you for a key and has no field that could accept one.

### Deep links

Write actions happen in the web app, where the user's wallet is. Links are
built in `src/lib/deepLinks.ts` under three rules (security review PS-8):

1. The base URL is a **fixed constant** — `https://longstone-ui.pages.dev`.
   No caller can supply a different host.
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
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

| Item | Why |
|---|---|
| `sidePanel` | The primary surface. |
| `storage` | Settings and the scan cache, locally. Nothing is synced or uploaded. |
| `optional_host_permissions` | Read access to the RPC / IPFS / hisaishi endpoints **you configure**. They are optional, and the options page requests exactly those configured origins in **one prompt**, from your Save click (PS-7). A CORS-enabled endpoint works without the grant; an endpoint that does not send CORS headers needs it. |
| Extension-page CSP | Bundled code only: no `unsafe-eval`, no remote script. |

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

No analytics, no accounts, no telemetry, no remote config. Settings and the
scan cache live in `chrome.storage.local` and stay on the machine. Network
requests go only to the RPC, IPFS gateway and hisaishi endpoints you set, plus
the fixed web-app origin when you click a deep link, and the Base Sepolia
block explorer when you open a transaction or contract link.

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
corepack pnpm --dir longstone-ui/packages/longstone-surface build   # dist is consumed
corepack pnpm --dir menhir/ts build                                 # menhir-core dist

# from this directory
corepack pnpm dev             # chrome, hot reload
corepack pnpm dev:edge        # edge
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build           # chrome + edge
corepack pnpm run audit       # inspects .output/{chrome,edge}-mv3
```

`pnpm build` produces `.output/chrome-mv3` and `.output/edge-mv3`.
`pnpm zip` additionally writes store-ready zips.

### What the audit enforces

`scripts/audit-extension.mjs` reads the **built** output, not the source:

- no `<script src="http…` and no remote stylesheet link;
- no `eval(` and no `new Function(`;
- no `signTransaction`, `sendTransaction`, or `window.ethereum`;
- no `LONGSTONE_KEY` / `LONGSTONE_OWNER_KEY` names;
- no `0x` + 64-hex literal outside an exact allowlist of reviewed public
  constants (secp256k1 curve parameters and ERC-6492 / EIP-7702 sentinels that
  `viem` bundles). Any new literal fails until reviewed;
- manifest: MV3, `side_panel` present, options page present, exactly the
  required permissions, no `host_permissions`, no content scripts, no
  `web_accessible_resources`, no broad optional pattern, and no CSP widening.

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
  exists — the built manifests for both browsers.

There is no Playwright dependency: a browser smoke test is a manual
sideload step (see *Validation* below), not a CI gate.

### Layout

```
entrypoints/
  sidepanel/       index.html + main.tsx + style.css   (primary surface)
  options/         index.html + main.tsx + style.css   (settings page)
  background.ts    opens the panel on toolbar click; no network
src/
  lib/             manifest policy, settings, deep links, permissions,
                   chain window, scan orchestration, cache, chrome adapter
  ui/              React views (timeline, detail, verify, settings)
scripts/
  audit-extension.mjs
test/
```

`src/lib/chromeApi.ts` is the only module that touches `browser.*`; every other
module takes an injected seam, which is why the tests need no browser.

### Manual validation (v1)

1. `pnpm build` and load `.output/chrome-mv3` unpacked.
2. Save settings; approve the single host-access prompt covering the
   configured origins.
3. Paste a Base Sepolia owner with known commitments and confirm the timeline
   and that retracted rows show `retracted`.
4. Open a commitment, click **Verify content**, and confirm both digest checks
   and the verdict.
5. Repeat in Edge with `.output/edge-mv3`.
6. Click **Retract ↗** and confirm the web app opens on the retract screen and
   asks for a wallet — the extension itself never does.

---

## Status and limitations (v1)

- **Testnet only.** Base Sepolia is a test chain; treat everything as
  throwaway.
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
- Multi-chain configuration (chain id + per-chain registry), with validation
  tied to the RPC's reported `eth_chainId`.
- Firefox (`sidebar_action`) if the surface is wanted; requires a separate
  manifest target and review of the Firefox extension policies.
- Content viewing (render the verified bytes, not just the digests), with
  labels that keep memory text visibly untrusted.
- Deeper history without an explicit start block: deploy-block discovery, or a
  cached index equivalent to the web app's.
- Still no wallet and no signing: write actions remain deep links to the web
  app. WalletConnect inside the extension and offscreen-document key custody
  are explicitly out of scope.

## License

Apache-2.0. See [LICENSE](./LICENSE).
