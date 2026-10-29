# Store submission guide — longstone memory viewer 0.2.0

Status: prepared for owner submission. Nothing has been uploaded to the Chrome
Web Store or Microsoft Edge Add-ons, and no developer account, fee, identity
verification, or listing was created by this repository.

Package: `@limccn/longstone-ext` 0.2.0. The store zips are produced by
`corepack pnpm --dir longstone-ext zip`:

- `.output/limccnlongstone-ext-0.2.0-chrome.zip`
- `.output/limccnlongstone-ext-0.2.0-edge.zip`

## Prepared assets

| Asset | Size | SHA-256 | Use |
|---|---|---|---|
| `assets/icon-128.png` | 128x128 | `A0894D1A2A09C34EB8F8A8453E3C721A635F134953738BD8FBA112209819E11F` | Store icon |
| `assets/icon-source.svg` | vector | — | Editable icon source |
| `assets/screenshot-01-timeline.png` | 1280x800 | `6AFC875EFCCB23BE94546B29CA4B89A6F80670F4A772901DE80DB151F167D616` | Timeline |
| `assets/screenshot-02-verify.png` | 1280x800 | `A22175B572EB43298982C10EDE8D20C482FA342879B52880F2AE0C46D8F7EA9D` | Verified verdict |
| `assets/screenshot-03-wallet-welcome.png` | 1280x800 | `011936D0CE49072F0C67E3916375A4FCBAD9FA7BE9794DFD1B963DA33C4B3F0B` | Wallet welcome |
| `assets/screenshot-04-wallet-accounts.png` | 1280x800 | `1AD3588D3981D2FB773B3E8B04C48C556CD8ED7C07A831B4C376EF29ACD05C7D` | Wallet accounts |
| `assets/screenshot-05-wallet-locked.png` | 1280x800 | `F12E8DF8E3F1CB1730DBDBD2E8DA477579C66B30E480C892B4B7F18A0D64118B` | Wallet locked |

The icon is rendered from `icon-source.svg` by
`scripts/render-store-icon.mjs`. The manifest's packaged extension icons are
unchanged; adding 16/32/48/128 package icons is deferred to 0.2.1 so the 0.2.0
product artifact is not modified.

Screenshot provenance: generated on 2026-10-29 from the real 0.2.0 Chrome build
(`.output/chrome-mv3`, manifest version `0.2.0`) through
`test/e2e/store-screenshots.spec.ts`. The side panel portion is the actual
rendered extension UI, including a real scanned timeline, a real verified
verdict, and a real generated wallet record. The left-hand area of each
1280x800 image is a decorative backdrop with the cairn mark; it is not
simulated extension UI. Regenerate with:

```powershell
corepack pnpm --dir longstone-ext e2e
$env:STORE_SCREENSHOTS = "1"
corepack pnpm --dir longstone-ext exec playwright test -c playwright.extension.config.ts test/e2e/store-screenshots.spec.ts
```

The first command boots the local chain and writes `test/e2e/.chain.json`; the
screenshot spec consumes that fixture and does not change any existing test
assertion.

## Listing copy

Use [LISTING.md](LISTING.md) for the name, short description, long description,
single-purpose statement, permission justifications, and data-use disclosure.
Use [PRIVACY.md](PRIVACY.md) for the privacy-policy text.

- Single-purpose statement: "Provide a MemoryOverEth memory browser with a
  local, encrypted wallet."
- Category: Productivity (owner to confirm).
- Language: English (owner to confirm).
- Support: <support@longstone.app> (developer issues:
  <https://github.com/limccn/longstone-ext/issues>).
- Privacy policy public URL: `https://longstone.app/privacy`.
- Privacy policy effective date: `[OWNER: publication date]`.

## Chrome Web Store — owner steps

1. Sign in to the Chrome Web Store developer dashboard with the owner account;
   complete registration, fee, and identity verification if not already done.
2. Create a new item and upload
   `.output/limccnlongstone-ext-0.2.0-chrome.zip`.
3. Fill the store listing from [LISTING.md](LISTING.md): name, short
   description, long description, category, language, support URL.
4. Upload `assets/icon-128.png` and the five 1280x800 screenshots. Optional
   promotional tiles are owner-produced; they are not required for review.
5. Paste the hosted privacy-policy URL and complete the privacy practices
   questionnaire: no data collection or sale, local settings/cache and
   encrypted wallet only, no remote code, no telemetry.
6. Add the permission justifications from [LISTING.md](LISTING.md), including
   the optional host access explanation.
7. Add the review notes: local encrypted wallet, no signing, no
   `window.ethereum`, keys never uploaded, lock on hide/close, no password
   recovery, all code bundled.
8. Review the preview, confirm the owner's approval, and submit for review.

## Microsoft Edge Add-ons — owner steps

1. Sign in to Microsoft Partner Center with the owner account and create the
   extension submission.
2. Upload `.output/limccnlongstone-ext-0.2.0-edge.zip`.
3. Fill the listing from [LISTING.md](LISTING.md); confirm Partner Center's
   current screenshot/icon requirements before upload.
4. Upload the same icon and screenshots; use the same privacy-policy URL and
   support URL.
5. Complete the metadata and permission disclosures: optional user-scoped host
   access, local-only wallet, no signing, no remote code, no telemetry.
6. Submit for certification. The plan allows up to 7 business days.

## Pending owner fields

| Field | Current value | Owner action |
|---|---|---|
| Hosted privacy-policy URL | `https://longstone.app/privacy` | Confirm the `/privacy` route is live on `longstone.app` and covers the policy text in `PRIVACY.md` |
| Privacy-policy effective date | `[OWNER: publication date]` | Set the date the hosted policy goes live |
| Support contact | `support@longstone.app` (developer issues: `https://github.com/limccn/longstone-ext/issues`) | Confirm the mailbox forwards to the owner (Cloudflare Email Routing) |
| Icon visual | cairn mark in `assets/icon-128.png` | Confirm the mark; edit `icon-source.svg` and rerun `scripts/render-store-icon.mjs` if it should change |
| Developer accounts / fees | none | Register and pay in each store |
| Category / language | Productivity / English | Confirm in each console |
| Final submission | not submitted | Upload, review, and submit in each store |
| Manual unpacked check | not run by the materials pass | Run the checklist in [CHECKLIST.md](CHECKLIST.md) before uploading |
