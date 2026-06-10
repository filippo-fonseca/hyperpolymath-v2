# Releasing JARVIS Desktop

How to ship a signed, notarized macOS `.dmg` of JARVIS Desktop via GitHub
Releases. **No Mac App Store**, no Apple review, no distribution fees beyond
the $99/yr Apple Developer Program subscription.

The auth model is **bearer-token-by-paste**: user mints a token at
`/settings/desktop` in the web app, pastes it into the desktop app's Settings
sheet, app stores it via `tauri-plugin-store`. So distributing a DMG is enough
— no OAuth deeplinks, no first-launch onboarding handshake needed.

## TL;DR — once everything is configured

```bash
# Tag the release with a desktop-vX.Y.Z scheme
gh workflow run release-desktop.yml -f version=desktop-v0.1.0
```

A few minutes later, your release appears at
`https://github.com/<you>/hyperpolymath-v2/releases`. Done.

---

## One-time setup

Get this out of the way once and every future release is a single command.

### 1. Apple Developer Program ($99/yr)

If you don't have one yet: https://developer.apple.com/programs/enroll/ — sign
up with your Apple ID, $99 for an individual account, takes ~24h to activate.

### 2. Generate a Developer ID Application certificate

This is **NOT** the same as a "Mac App Distribution" cert — make sure you pick
the right one. App Distribution certs are for the App Store; Developer ID is
for direct distribution.

1. Open **Keychain Access** → Certificate Assistant → Request a Certificate
   from a Certificate Authority. Save the `.certSigningRequest` somewhere.
2. Go to https://developer.apple.com/account/resources/certificates/list →
   the `+` button → **Developer ID Application** → upload the CSR → download
   the resulting `.cer` → double-click to install into Keychain.
3. In Keychain Access, find the new certificate (under "login" → "My
   Certificates"). Right-click → **Export "Developer ID Application: ..."**.
   Save as `.p12`. Set a strong password — you'll paste it into a GitHub
   secret. Keep the `.p12` file around for now.

### 3. Find your Team ID

https://developer.apple.com/account → top-right shows your membership info.
The **Team ID** is a 10-character string like `ABCD123456`.

### 4. Generate an app-specific password for notarization

Notarization needs to log in to Apple as you, but your real Apple ID password
isn't allowed in CI. Use an app-specific one:

1. https://appleid.apple.com → Sign-In and Security → App-Specific Passwords
2. Generate a new one labeled "JARVIS Desktop notarization"
3. Save the resulting `xxxx-xxxx-xxxx-xxxx` string — you'll paste it into a
   GitHub secret.

### 5. Base64-encode the .p12

GitHub Secrets stores text, not files. Encode:

```bash
base64 -i ~/Downloads/jarvis-desktop-signing.p12 -o jarvis-desktop-signing.p12.base64
cat jarvis-desktop-signing.p12.base64 | pbcopy   # copies to clipboard
```

You'll paste the **whole base64 blob** into `APPLE_CERTIFICATE`.

After this, **delete the `.p12` and `.base64` files from your laptop** if you
don't need them locally — they're in GitHub Secrets now.

### 6. Add the GitHub Secrets

Repo on github.com → **Settings → Secrets and variables → Actions → New
repository secret**. Add **six** secrets:

| Secret name                  | Value                                                                  |
| ---------------------------- | ---------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | the base64 blob from step 5                                            |
| `APPLE_CERTIFICATE_PASSWORD` | the password you set in step 2 when exporting the .p12                 |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: Your Name (TEAMID)` — full string from Keychain Access ("Get Info" on the cert shows it) |
| `APPLE_ID`                   | your Apple ID email                                                    |
| `APPLE_PASSWORD`             | the app-specific password from step 4                                  |
| `APPLE_TEAM_ID`              | the 10-char team ID from step 3                                        |

### 7. Add the repo variable

Same page, but **Variables** tab → **New repository variable**. Add **one**:

| Variable name     | Value                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| `PROD_SITE_URL`   | your production web URL, e.g. `https://hyperpolymath.com` — baked into the build so the desktop app talks to prod, not localhost |

---

## Per release

### Cut a release

```bash
# Pick the next version following semver
gh workflow run release-desktop.yml -f version=desktop-v0.1.0

# Or to mark it as prerelease (won't be set as "latest")
gh workflow run release-desktop.yml -f version=desktop-v0.2.0-rc.1 -f prerelease=true
```

Watch it run: `gh run watch` or the Actions tab. Build takes ~6–10 minutes
(cold Rust compile dominates).

### What gets published

A GitHub Release at the tag you specified, containing:

- `JARVIS Desktop_<version>_aarch64.dmg` — Apple Silicon
- (when you add `x86_64-apple-darwin` to the matrix, also Intel)

The DMG is signed with your Developer ID cert and Apple-stapled, so users get
no "unidentified developer" warning on first open.

### Verify the release locally

```bash
# Download
gh release download desktop-v0.1.0 -p '*.dmg'

# Confirm the cert
codesign -dv --verbose=4 /Volumes/JARVIS\ Desktop/JARVIS\ Desktop.app 2>&1 | grep "Authority"
# Should print: Authority=Developer ID Application: Your Name (TEAMID)

# Confirm notarization (after mounting the dmg)
spctl -a -t exec -vv /Volumes/JARVIS\ Desktop/JARVIS\ Desktop.app
# Should print: accepted    source=Notarized Developer ID
```

If either of these fail, the workflow ran but a signing/notarization step
silently degraded. Check the workflow logs for `tauri-action`.

---

## Local unsigned builds (for development)

You don't need signing to test a local build:

```bash
pnpm --filter desktop tauri build
# Output: apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg
```

The DMG won't be signed/notarized. **First-launch on another machine** will
require: right-click the app → **Open** → click **Open** in the dialog. After
that, macOS remembers. Fine for personal testing; ship the signed flow above
for anything beyond that.

---

## Distribution to end users

Send them the release URL:
`https://github.com/<you>/hyperpolymath-v2/releases/latest`

They:
1. Click the `.dmg` to download
2. Open it, drag JARVIS Desktop to Applications
3. Open JARVIS Desktop from Applications (signed + notarized → no warning)
4. On the web at `/settings/desktop` → mint a device token → copy
5. In JARVIS Desktop's Settings sheet → paste the token under "Device token"

That last step is the auth handshake — bearer token in, the app calls the
prod API forever using that token until you revoke it from `/settings/desktop`.

---

## Future: auto-updater (v2)

The DMG flow above is "user re-downloads on each release." For true
auto-update prompts inside the app, you'd add:

1. `@tauri-apps/plugin-updater` to `apps/desktop/package.json`
2. A signing keypair: `pnpm tauri signer generate -w ~/.tauri/jarvis-desktop.key`
3. Updater config in `tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "endpoints": ["https://github.com/<you>/hyperpolymath-v2/releases/latest/download/latest.json"],
       "pubkey": "<contents of jarvis-desktop.key.pub>"
     }
   }
   ```
4. Add `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to
   GitHub Secrets (your private key, base64'd)
5. Add `--config '{"plugins":{"updater":{"active":true}}}'` to the `tauri-action` step
6. Boot the updater inside the app on launch (a few lines of Rust + JS)

Defer until you actually have non-you users. Adds moving parts that aren't
load-bearing for a personal release.

---

## What happens if a step fails

| Failure                                          | Fix                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Workflow can't find `APPLE_CERTIFICATE`          | Secret name typo or wrong repo. Re-check Settings → Actions secrets.               |
| `codesign` errors with "no identity found"       | `APPLE_SIGNING_IDENTITY` doesn't match the cert in the imported keychain. Use exactly the string Keychain Access shows. |
| `notarytool` says "Invalid"                      | App-specific password is stale OR team ID is wrong OR the bundle has unsigned binaries. Re-check secrets first; if all match, check that all native deps are inside the Tauri bundle. |
| Tauri build fails before signing                 | Run `pnpm --filter desktop tauri build` locally to reproduce — same error.         |
| Release is created but `.dmg` is empty           | `tauri-action` v0 → v0.5.x mismatch. Pin to a specific version if it keeps biting. |
