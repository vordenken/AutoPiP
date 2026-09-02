# AGENTS.md

Operational guidance for coding agents working on **AutoPiP for Safari**. This
file complements `README.md`, `BUILD.md`, and `CONTRIBUTING.md`. Read it before
changing code, release automation, permissions, or persistent settings.

> **Language:** Write code, identifiers, comments, commit messages, issues, and
> pull requests in English. Maintainer-facing conversation may use the language
> chosen by the maintainer.

---

## 1. Project Overview

AutoPiP is a **Safari Web Extension** with a small **Cocoa host app** for macOS
13.5 and later. It automatically enters Picture-in-Picture for HTML5 video when
the user changes tabs or windows, or scrolls a YouTube video out of view.

The Xcode project contains two product targets plus unit and UI test targets:

```text
AutoPiP/                                  # Cocoa host app
  AppDelegate.swift                       # App lifecycle and update controller
  ViewController.swift                    # WKWebView/native message bridge
  UpdateController.swift                  # Sparkle wrapper and beta channel
  Resources/Base.lproj/Main.html          # Host UI
  Resources/{Script.js,Style.css}          # Host UI behavior and styling

AutoPiP Extension/                        # Safari Web Extension (Manifest V2)
  SafariWebExtensionHandler.swift         # Native message handler
  Resources/manifest.json                 # Permissions and extension wiring
  Resources/content.js                    # Video discovery and PiP behavior
  Resources/popup.{html,css,js}            # Safari toolbar popup
  Resources/_locales/en/messages.json     # Maintained localization
  Resources/images/                       # Extension assets

AutoPiPTests/                              # Swift unit tests
AutoPiPUITests/                            # macOS UI-test target
tests/                                     # Dependency-free Node.js tests
scripts/update_appcast.py                  # Structured Sparkle feed updater
.github/workflows/tests.yml                # Pull-request and branch tests
.github/workflows/build-release.yml        # Beta and stable publishing
```

Important constraints:

- Automatic PiP without a user gesture relies on Safari/WebKit behavior.
- Extension settings stay in `browser.storage.local`.
- The extension must not make outbound network requests or collect telemetry.
- The host app accesses GitHub only through Sparkle for update checks/downloads.
- Sparkle is the only Swift package dependency and is resolved through SwiftPM.
- See `PRIVACY.md` before changing permissions or data handling.

---

## 2. Local Setup and Commands

| Purpose | Command |
| ------- | ------- |
| Clone and open | `git clone https://github.com/vordenken/AutoPiP.git && cd AutoPiP && open AutoPiP.xcodeproj` |
| Resolve Swift packages | `xcodebuild -resolvePackageDependencies -project AutoPiP.xcodeproj -scheme AutoPiP` |
| Run JavaScript tests | `node --test tests/*.test.js` |
| Run Swift unit tests | `xcodebuild test -project AutoPiP.xcodeproj -scheme AutoPiP -destination 'platform=macOS,arch=arm64' -only-testing:AutoPiPTests CODE_SIGNING_ALLOWED=NO` |
| Validate workflows | `actionlint .github/workflows/build-release.yml .github/workflows/tests.yml` |
| Validate the appcast | `xmllint --noout appcast.xml` |
| Build an unsigned archive | `xcodebuild archive -project AutoPiP.xcodeproj -scheme AutoPiP -configuration Release CODE_SIGNING_ALLOWED=NO` |
| Encode a signing certificate | `base64 -i certificate.p12 \| pbcopy` |

Build and run the signed app from Xcode with the `AutoPiP` scheme. Node.js 24 is
used in CI. There is no npm package, bundler, transpiler, or formatter setup.
JavaScript is plain ES2020, and Swift follows normal Xcode formatting.

---

## 3. Architecture and State

- `content.js` owns automatic and manual PiP state transitions.
- `popup.js` persists extension settings and broadcasts changes to open tabs.
- `ViewController.swift` receives host-page messages and forwards update settings
  to `UpdateController`.
- `UpdateController.swift` owns Sparkle preferences and allowed beta channels.
- `OnboardingCompleted` and `BetaUpdatesEnabled` are stored in `UserDefaults`.
- Extension preferences, lists, and shortcut configuration are stored in
  `browser.storage.local`.

Treat storage keys and native message strings as contracts. Changes may require
migration logic and coordinated edits on both sides of the bridge.

---

## 4. Branches, Commits, and Releases

### Branches

- `main` is stable. A push releases only when `semver.txt` changed.
- A release-relevant push to `feature/*` creates the next immutable beta tag,
  `vX.Y.Z-betaN`.
- Documentation-only, repository-metadata, test-only, and generated appcast
  changes do not trigger a release.
- Other branch names do not trigger the release workflow. Use `feature/*` when a
  beta build is required.
- Long-lived branches should fetch and merge `origin/main` regularly because the
  release bot advances `main` with appcast commits.

### Commits and Pull Requests

- Use a short imperative subject, preferably no longer than 72 characters.
- Conventional Commits are welcome but not required.
- Keep each commit focused on one logical change.
- Open pull requests against `main`; do not commit directly to `main`.
- Explain what changed and why. Include screenshots or recordings for UI work.
- Obtain maintainer review before merging.

### Version Source of Truth

`semver.txt` contains the release version and changelog:

```text
X.Y.Z
---
### Section
- Current release entry

## X.Y.(Z-1)
- Previous release history
```

- Line 1 must be strict `X.Y.Z` SemVer.
- `---` starts the current release notes.
- A heading matching `## X.Y.Z` starts historical notes.
- Preserve all historical sections.
- Do not edit release versions for individual CI runs; the workflow injects
  them. Keep the checked-in `CURRENT_PROJECT_VERSION` aligned with the latest
  published build so local development builds are not offered older updates.
- Do not edit `appcast.xml` manually. `scripts/update_appcast.py` updates the
  canonical feed on `main`, keeps all stable entries, and retains five betas.
- Do not create, move, or force-push release tags unless explicitly requested.

### Release Pipeline

The release workflow:

1. Selects the stable or beta channel from the branch name.
2. Reads version and release notes from `semver.txt`.
3. Runs JavaScript and Swift unit tests.
4. Archives and signs the app, then creates the DMG.
5. Signs the DMG with Sparkle's EdDSA tool.
6. Publishes the GitHub Release.
7. Updates the canonical appcast and, for stable releases, the Homebrew cask on
  `main`.

Release jobs are globally serialized because all branches share tags and one
appcast. Running releases are not cancelled. GitHub Actions use floating major
tags, and the Sparkle tools use `SPARKLE_VERSION`, which tests require to match
`Package.resolved`. See `BUILD.md` for secrets and branch-protection setup.

---

## 5. Code Conventions

### Swift

- Use four-space indentation and Xcode's standard style.
- Keep identifiers, comments, and user-facing strings in English.
- Prefer the narrowest practical access level (`private` or `fileprivate`).
- Use `os_log` for diagnostics; do not add `print()` or `NSLog()` calls.
- Dispatch UI updates to the main queue from SafariServices callbacks.
- Prefer `guard let`; force unwrap only compile-time-guaranteed bundle resources.
- Guard versioned macOS APIs with `if #available` and provide a fallback where
  the deployment target requires one.
- Prefer recoverable errors and diagnostic logging over fatal termination.

### JavaScript

- Use vanilla ES2020 and the `browser.*` WebExtension API.
- Keep configuration constants near the beginning of the file.
- Use `const` by default and `let` for mutable state.
- Route diagnostic output through the debug-logging mechanism; do not add
  unconditional `console.log` calls.
- Wrap storage reads and writes in the existing safe storage helpers.
- Never use `eval()` or assign untrusted data to `innerHTML`; use `textContent`.
- Check `event.isTrusted` for visibility and focus events.
- Preserve the short blur delay that distinguishes window changes from internal
  focus changes such as clicking YouTube live chat.
- Treat new manifest permissions as privacy-sensitive changes.

### HTML and CSS

- Keep CSS in `popup.css` or `Style.css`, not inline HTML attributes.
- Do not load external fonts, scripts, or CDN assets.
- Keep extension resource paths relative to the `Resources` directory.
- Preserve the established compact Safari-style UI unless a redesign is agreed.

### Manifest and Localization

- Keep `manifest_version: 2` until Safari's Manifest V3 support is explicitly
  adopted by the maintainer.
- Add extension-facing strings to `Resources/_locales/en/messages.json`.
- English is the only actively maintained locale; additional translations are
  welcome but must not block English updates.

---

## 6. Validation Before a Pull Request

Run the automated checks relevant to the change:

```bash
node --test tests/*.test.js
xcodebuild test \
  -project AutoPiP.xcodeproj \
  -scheme AutoPiP \
  -destination 'platform=macOS,arch=arm64' \
  -only-testing:AutoPiPTests \
  CODE_SIGNING_ALLOWED=NO
```

For workflow or release changes, also run:

```bash
actionlint .github/workflows/build-release.yml .github/workflows/tests.yml
xmllint --noout appcast.xml
```

The automated suite exercises content-script events, popup state, onboarding
messages, native onboarding parsing, and appcast transformations. It does not
replace Safari integration testing.

Perform the applicable Safari smoke tests before release:

1. Build and run in Xcode with no build warnings.
2. Enable AutoPiP under Safari Settings > Extensions and grant website access.
3. Play a YouTube video and switch tabs; PiP should enter and then exit on return.
4. Switch windows; internal page focus changes must not trigger PiP.
5. Scroll a YouTube video out of view and back into view.
6. Disable AutoPiP in the popup; active automatic PiP should close.
7. Verify blacklist and whitelist behavior for the current site.
8. Verify the configured keyboard shortcut, including the standard API fallback.
9. Clear `browser.storage.local`, reload, and verify defaults are restored.
10. Exercise clean-install onboarding and stable/beta Sparkle update checks.
11. Confirm the content-script console has no unexpected errors.

---

## 7. High-Value Code Anchors

- Automatic PiP triggers: `AutoPiP Extension/Resources/content.js`
- Video selection and cache: `getVideo()` in `content.js`
- Extension storage and messages: safe storage helpers and `messageHandlers`
- Popup/content bridge: `popup.js` and `content.js`
- Host onboarding: `AutoPiP/Resources/Base.lproj/Main.html`, `Script.js`, and
  `ViewController.swift`
- Sparkle preferences and channels: `AutoPiP/UpdateController.swift`
- Release source of truth: `semver.txt`
- Release orchestration: `.github/workflows/build-release.yml`
- Appcast transformation: `scripts/update_appcast.py`
- Homebrew cask transformation: `scripts/update_homebrew_cask.py`
- Automated checks: `.github/workflows/tests.yml`, `tests/`, and `AutoPiPTests/`

---

## 8. Change Boundaries for Agents

### Allowed Without Prior Approval

- Focused bug fixes and behavior-preserving refactors with passing tests.
- Reliability and performance improvements to content-script DOM handling.
- New message handlers when the sending and receiving sides are updated together.
- Tests and documentation that reflect verified behavior.
- Compatibility documentation for streaming sites that were actually tested.

### Ask the Maintainer First

- New or broader manifest permissions.
- Storage-schema or native-message protocol changes that need migration.
- Substantial host or popup UI redesigns.
- Migration to Manifest V3.
- New Swift packages, npm dependencies, or external services.
- Release workflow, version parser, signing, or appcast behavior changes.
- Deleting releases, moving tags, or changing branch-protection behavior.

### Never Do

- Add tracking, telemetry, analytics, or unrelated network calls.
- Commit secrets, tokens, certificates, private keys, or Apple IDs.
- Add `print()` or `NSLog()` diagnostics to shipped Swift code.
- Remove `semver.txt` history or edit generated appcast entries by hand.
- Force-push release tags or commit directly to `main`.
- Introduce large unrelated formatting changes.
- Change or remove copyright or license headers without explicit instruction.

---

## 9. Common Failure Modes

- **No signing certificate:** Configure the local development team in Xcode or
  use `CODE_SIGNING_ALLOWED=NO` for tests and unsigned validation builds.
- **Extension missing in Safari:** Restart Safari or macOS. The legacy fallback is
  `defaults write com.apple.Safari WebKitExtensionsEnabled -bool true`.
- **PiP unavailable on a site:** Check whether the page sets
  `disablePictureInPicture` and inspect debug logs before changing selectors.
- **Release skipped:** Test-only/documentation-only changes are intentionally
  ignored. On `main`, `semver.txt` must change. Other branches must use the
  `feature/*` naming convention or `workflow_dispatch`.
- **Appcast push rejected:** Verify the GitHub App credentials, Contents write
  permission, installation, and branch-protection bypass described in `BUILD.md`.
- **Sparkle version mismatch:** Keep `SPARKLE_VERSION` in the release workflow in
  sync with `Package.resolved`; the release tests enforce this.
- **Sparkle update not visible:** Check channel selection, appcast caching, build
  numbers, and the enclosure URL before republishing.
- **Actionlint reports `app-id`/`client-id`:** `.github/actionlint.yaml` suppresses
  only the stale schema warning for the current floating v3 action.

---

## 10. Escalation Checklist

Ask before proceeding when a change affects permissions, privacy, persisted
settings, native message compatibility, release/signing behavior, dependencies,
or the product's UI structure. For ordinary focused fixes, tests, and small
refactors, proceed on a feature branch and open a pull request.

---

*Last updated: 2026-08-31. Keep this file synchronized with architecture,
testing, manifest, and release-workflow changes.*
