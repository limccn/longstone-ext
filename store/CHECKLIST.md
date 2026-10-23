# Store submission checklist — longstone memory viewer (draft)

Status: draft. **Submission is an owner action**: it requires the owner's
Chrome Web Store developer account and Microsoft Partner Center/Edge Add-ons
account, fees, identity verification, a hosted privacy-policy URL, final
screenshots/assets, and the owner's approval of the published listing. Nothing
in this repository has been submitted.

Current package: `@limccn/longstone-ext` 0.1.0 (manifest and package versions
match). Zips are produced as:

- `.output/limccnlongstone-ext-0.1.0-chrome.zip`
- `.output/limccnlongstone-ext-0.1.0-edge.zip`

Version/tag: **0.1.0**; git tag `v0.1.0` is TODO. This local repository
currently has no commits, so create the release commit/tag before submission.

## Still TODO (assets and account material)

- [ ] **Screenshots are still TODO.** At least one Chrome Web Store screenshot
      at **1280x800** or **640x480**; add more showing timeline, detail, and
      verify. Edge's Partner Center may state its own image requirements;
      confirm there before upload.
- [ ] **Store icon is still TODO: 128x128 PNG.** The manifest currently
      declares no `icons`; add the packaged extension icons (16/32/48/128) and
      the store icon as part of the release assets.
- [ ] Optional promotional tiles: **440x280** (small), **920x680** (large),
      **1400x560** (marquee).
- [ ] **Hosted privacy-policy URL:** [TODO: replace with the public URL for
      `store/PRIVACY.md`].
- [ ] Support URL and contact email: [TODO: owner support URL/contact].
- [ ] Owner developer accounts, registration fee, identity verification, and
      store-console declarations.
- [ ] Owner review of the listing copy in [LISTING.md](LISTING.md) and the
      policy in [PRIVACY.md](PRIVACY.md).
- [ ] Manual unpacked load in Chrome and Edge, plus a live Base Sepolia
      timeline/verify check (not run in the automated review environment).
- [ ] Category/language final choice (suggested: Productivity, English).

Do not submit with placeholder text or missing screenshots.

## Chrome Web Store

- [ ] Sign in with the owner's developer account; pay the registration fee if
      required.
- [ ] Upload the Chrome zip from `pnpm zip` (see the pre-submission commands
      below).
- [ ] Store listing: name `longstone memory viewer`, short description, long
      description, category, language (copy in [LISTING.md](LISTING.md)).
- [ ] Graphics: 128x128 store icon, screenshots, optional tiles (all TODO
      above).
- [ ] Single-purpose statement:
      "browse and cryptographically verify MemoryOverEth on-chain memories".
- [ ] Privacy policy URL (TODO) and support/contact URL (TODO).
- [ ] Privacy practices: declare **no data collection or sale**; local
      settings/cache only; justify `sidePanel`, `storage`, and the optional
      host permissions as user-configured endpoints; declare **no remote
      code**.
- [ ] Permission justification: optional host access is requested only for the
      exact RPC/IPFS/hisaishi origins saved from the Save click; no
      `<all_urls>` requirement, no `tabs`/`activeTab`/`scripting`/content
      scripts.
- [ ] Review notes: read-only; no wallet/key/signing; all code bundled; CSP
      `script-src 'self'`; deep links open the web app for wallet writes.
- [ ] Submit for review (owner action).

## Microsoft Edge Add-ons

- [ ] Sign in to Partner Center with the owner's account; create the extension
      submission.
- [ ] Upload the Edge zip from `pnpm zip` (same MV3 package as Chrome).
- [ ] Listing copy, privacy-policy URL, support contact, and screenshots
      (same TODO assets above; confirm Partner Center's current sizes).
- [ ] Complete the Partner Center metadata/permission disclosures; state that
      host access is optional and user-scoped.
- [ ] Allow for Edge certification time (the plan quotes up to 7 business days).
- [ ] Submit for review (owner action).

## Pre-submission verification

Run from the workspace root (`d:/Workspace/MemoryOverEth`):

- [ ] `corepack pnpm --dir longstone-ext typecheck`
- [ ] `corepack pnpm --dir longstone-ext test`
- [ ] `corepack pnpm --dir longstone-ext build`
- [ ] `node longstone-ext/scripts/audit-extension.mjs`
- [ ] `corepack pnpm --dir longstone-ext zip`
- [ ] Inspect `.output/chrome-mv3/manifest.json` and
      `.output/edge-mv3/manifest.json`: `permissions` exactly
      `["sidePanel","storage"]`; `optional_host_permissions` only the HTTPS
      ceiling plus loopback; no required `host_permissions`; no `tabs`,
      `activeTab`, `scripting`, content scripts, or `web_accessible_resources`;
      `side_panel.default_path` and `options_ui.page` point at shipped files;
      CSP is `script-src 'self'; object-src 'self'`.
- [ ] Load `.output/chrome-mv3` unpacked in Chrome and `.output/edge-mv3` in
      Edge; save settings and approve the single host-access prompt.
- [ ] Paste an owner with known Base Sepolia commitments; confirm timeline,
      detail, and both digest checks in Verify.
- [ ] Click Retract, Signers, and Verify deep links; confirm they open the web
      app and that the extension itself never asks for a wallet or key.
- [ ] Confirm no remote code, no signing entry point, and no key material in
      the built output.
