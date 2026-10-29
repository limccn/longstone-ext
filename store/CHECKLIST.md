# Store submission checklist — longstone memory viewer

Status: listing materials are ready for 0.2.0. Submission is still an owner
action: it requires the owner's Chrome Web Store developer account and
Microsoft Partner Center/Edge Add-ons account, fees, identity verification, a
hosted privacy-policy URL, and the owner's approval of the published listing.
Nothing in this repository has been submitted.

Current package: `@limccn/longstone-ext` 0.2.0 (manifest and package versions
match). Zips are produced as:

- `.output/limccnlongstone-ext-0.2.0-chrome.zip`
- `.output/limccnlongstone-ext-0.2.0-edge.zip`

Version/tag: **0.2.0**; tag `v0.2.0` on the release commit. This version adds
the encrypted local wallet to the 0.1.1 read/verify viewer. The wallet does not
sign transactions.

## Completed for this submission

- [x] **Store icon:** `assets/icon-128.png` (128x128 PNG) with reusable source
      `assets/icon-source.svg` and generator `scripts/render-store-icon.mjs`.
      The manifest's packaged 16/32/48/128 icons remain unchanged and are
      deferred to 0.2.1, so the 0.2.0 product artifact is untouched.
- [x] **Screenshots:** five real 1280x800 captures from the 0.2.0 Chrome build:
      `assets/screenshot-01-timeline.png` (timeline),
      `assets/screenshot-02-verify.png` (verified verdict),
      `assets/screenshot-03-wallet-welcome.png`,
      `assets/screenshot-04-wallet-accounts.png`, and
      `assets/screenshot-05-wallet-locked.png`.
- [x] **Listing copy:** [LISTING.md](LISTING.md) is updated to 0.2.0, with the
      single-purpose statement, permission justifications, data-use
      disclosure, no-remote-code/no-telemetry statements, and the support
      contact `support@longstone.app` (developer issues:
      `https://github.com/limccn/longstone-ext/issues`).
- [x] **Privacy policy:** [PRIVACY.md](PRIVACY.md) has final policy text, the
      same support contact, and the hosted URL
      `https://longstone.app/privacy`; only the owner's publication date and
      the live-page check remain.
- [x] **Submission guide:** [SUBMISSION.md](SUBMISSION.md) records the owner
      steps, prepared assets, pending URLs, and screenshot provenance.
- [x] **Version boundary:** the 0.2.0 manifest, package, and built product were
      not modified by this materials pass.

## Owner-only before submission

- [ ] Chrome Web Store developer account, registration fee, and identity
      verification.
- [ ] Microsoft Partner Center / Edge Add-ons account and any applicable fees.
- [ ] Confirm the privacy policy is live at
      `https://longstone.app/privacy` (the URL recorded in LISTING, PRIVACY,
      and SUBMISSION) and that the page covers the text in
      [PRIVACY.md](PRIVACY.md); the web app's `PrivacyView` keeps a "Browser
      extension (longstone memory viewer)" section for exactly that.
- [ ] Confirm `support@longstone.app` forwards to the owner's mailbox (set up
      with Cloudflare Email Routing); GitHub Issues remains the developer
      channel.
- [ ] Confirm the cairn icon (`assets/icon-128.png`) visually; replace the SVG
      source and regenerate if the owner wants a different mark.
- [ ] Confirm category (suggested: Productivity) and language (suggested:
      English) in each store console.
- [ ] Review and approve [LISTING.md](LISTING.md) and [PRIVACY.md](PRIVACY.md).
- [ ] Load `.output/chrome-mv3` unpacked in Chrome and `.output/edge-mv3` in
      Edge; run the live Base Sepolia timeline/verify check and the local wallet
      flow listed below. This is a manual unpacked check, not an automated
      substitute.
- [ ] Upload the final zip, assets, and copy; submit for review in each store.
      These steps are owner actions and are not performed by the repository.

## Chrome Web Store (owner)

- [ ] Sign in with the owner's developer account; pay the registration fee if
      required.
- [ ] Upload the Chrome zip produced by `pnpm zip`.
- [ ] Store listing: name `longstone memory viewer`, short description, long
      description, category, language (copy in [LISTING.md](LISTING.md)).
- [ ] Graphics: `assets/icon-128.png`, the five 1280x800 screenshots, and any
      optional promotional tiles the owner chooses to produce.
- [ ] Single-purpose statement:
      "Provide a MemoryOverEth memory browser with a local, encrypted wallet."
- [ ] Privacy policy URL and support URL from the owner-only list above.
- [ ] Privacy practices: declare **no data collection or sale**; local
      settings/cache and encrypted wallet only; justify `sidePanel`, `storage`,
      and the optional host permissions as user-configured endpoints; declare
      **no remote code** and **no telemetry**.
- [ ] Permission justification: optional host access is requested only for the
      exact RPC/IPFS/hisaishi origins saved from the Save click; no
      `<all_urls>` requirement, no `tabs`/`activeTab`/`scripting`/content
      scripts.
- [ ] Review notes: the wallet is local and encrypted; it does **not sign** and
      exposes no `window.ethereum` or transaction method; keys are never
      uploaded; the panel locks when hidden/closed; there is no password
      recovery; all code bundled; CSP
      `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` (wasm covers
      the inlined Argon2id); deep links open the web app for wallet writes.
- [ ] Submit for review (owner action).

## Microsoft Edge Add-ons (owner)

- [ ] Sign in to Partner Center with the owner's account; create the extension
      submission.
- [ ] Upload the Edge zip produced by `pnpm zip` (same MV3 package as Chrome).
- [ ] Listing copy, privacy-policy URL, support contact, and the same five
      screenshots; confirm Partner Center's current image requirements.
- [ ] Complete the Partner Center metadata/permission disclosures; state that
      host access is optional and user-scoped, and that the wallet is local-only
      and does not sign.
- [ ] Allow for Edge certification time (the plan quotes up to 7 business days).
- [ ] Submit for review (owner action).

## Manual unpacked check (owner)

Run in a normal Chrome/Edge window with the unpacked build:

- [ ] Load `.output/chrome-mv3` in Chrome and `.output/edge-mv3` in Edge; save
      settings and approve the single host-access prompt.
- [ ] Paste an owner with known Base Sepolia commitments; confirm timeline,
      detail, and both digest checks in Verify.
- [ ] Create a throwaway wallet; confirm the 4-word phrase check, lock/unlock,
      masked/60-second export, password change with old-password rejection,
      last-account deletion, and reset.
- [ ] Confirm the wallet does not sign, exposes no `window.ethereum` or signing
      entry point, and never uploads keys; confirm no plaintext phrase or
      private key appears in `chrome.storage.local`, `localStorage`, or
      IndexedDB.
- [ ] Click Retract, Signers, and Verify deep links; confirm they open the web
      app for the write action and that the extension itself never signs or
      submits a transaction.

## Pre-submission verification (release engineer)

Run from the workspace root (`d:/Workspace/MemoryOverEth`). These are gates
before an upload, not AI-filled submission items:

```powershell
corepack pnpm --dir longstone-ext typecheck
corepack pnpm --dir longstone-ext test
corepack pnpm --dir longstone-ext build
node longstone-ext/scripts/audit-extension.mjs
corepack pnpm --dir longstone-ext e2e
corepack pnpm --dir longstone-ext zip
```

Then inspect `.output/chrome-mv3/manifest.json` and
`.output/edge-mv3/manifest.json`:

- `permissions` exactly `["sidePanel","storage"]`;
- `optional_host_permissions` only the HTTPS ceiling plus loopback;
- no required `host_permissions`, `tabs`, `activeTab`, `scripting`, content
  scripts, or `web_accessible_resources`;
- `side_panel.default_path` and `options_ui.page` point at shipped files;
- CSP is `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`;
- no remote code, signing entry point, or key material in the built output.

To regenerate the screenshots after a rebuild, with the local chain fixture
running:

```powershell
corepack pnpm --dir longstone-ext e2e
$env:STORE_SCREENSHOTS = "1"
corepack pnpm --dir longstone-ext exec playwright test -c playwright.extension.config.ts test/e2e/store-screenshots.spec.ts
```

Do not submit with placeholder text or missing screenshots.
