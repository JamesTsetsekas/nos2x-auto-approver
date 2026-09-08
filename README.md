# nos2x Auto Approver

A Chromium-only [nos2x](https://github.com/fiatjaf/nos2x) fork for automated Nostr development and QA. It keeps the normal nos2x NIP-07 implementation and adds configurable hosts that may use the signer without opening an approval popup.

> [!CAUTION]
> Use a dedicated disposable test identity only. A silently approved website can read that identity, sign arbitrary Nostr events, and request encryption or decryption. Never import a personal, treasury, production merchant, or otherwise valuable key.

## Why this exists

Browser automation and agentic test runs stall when every NIP-07 operation requires a person to approve a popup. This fork supports unattended flows while keeping the exception narrow and visible:

- exact host allowlists;
- wildcard subdomains such as `*.preview.example.test`;
- a separate, deliberately alarming all-sites switch;
- ordinary nos2x prompts on every host outside the automatic allowlist.

The built-in allowlist covers local development and Conduit's current production and Cloudflare Pages test surfaces. It can be extended from the extension's options or changed in source for repeatable team builds.

## Install a release ZIP

Chrome on Windows and macOS does not normally install a self-hosted CRX. Releases therefore contain a ZIP intended for trusted developer-mode installation, following [Chrome's supported unpacked-extension workflow](https://developer.chrome.com/docs/extensions/how-to/distribute).

1. Download the release ZIP and verify its adjacent `.sha256` file.
2. Extract the ZIP to a durable directory.
3. Open `chrome://extensions` in the dedicated QA browser profile.
4. Enable **Developer mode**.
5. Disable other NIP-07 signers in that profile so providers do not compete.
6. Select **Load unpacked** and choose the extracted directory containing `manifest.json`.
7. Open the extension options, generate or import a disposable test key, and review the automatic approval settings.
8. Reload any test pages that were already open.

Do not load this extension in a personal browsing profile.

## Configure automatic approvals

Open the extension options to see the complete effective policy. Approved hosts are grouped by where they came from:

- **Built-in hosts** are version-controlled in [`extension/approved-hosts.mjs`](extension/approved-hosts.mjs). They remain visible in the UI and may be enabled or disabled per browser profile. Edit that file, run `bun run build`, and reload the extension to change the baseline for a repeatable team build.
- **Custom hosts** are stored in the current Chrome profile. Paste a hostname or full URL into the options page, select **add host**, then **save automatic approvals**. Custom entries can be removed from the same list.

Enabled built-in and custom hosts are combined. The options page displays every entry, labels its source, and makes profile-specific overrides obvious.

- `localhost` matches localhost on any port.
- `*.localhost` matches localhost subdomains.
- `shop.example.test` matches only that host.
- `*.preview.example.test` matches the apex and its subdomains.
- Full URLs may be pasted, but schemes, ports, paths, and trailing dots are intentionally ignored because NIP-07 permissions apply to the host.
- JavaScript comments may be used in the built-in host file to document team policy.
- A bare `*` is rejected. Use the separate **auto-approve every website** switch when a disposable environment truly requires it.

The all-sites switch is off by default. **Restore safe defaults** clears profile-specific custom hosts, disables all-sites mode, and re-enables the complete built-in allowlist. Turning off unattended approvals restores ordinary nos2x permission behavior everywhere.

## Supported NIP-07 operations

The signer preserves nos2x support for:

- `window.nostr.getPublicKey()`;
- `window.nostr.signEvent(event)`;
- NIP-04 encryption and decryption;
- NIP-44 encryption and decryption.

An allowed host receives automatic approval for all supported operations. Per-operation unattended permissions are intentionally not offered in the first release; a short, auditable host policy is easier to reason about.

## Develop

Requirements: Bun and a Chromium browser.

```sh
bun ci
bun run check
```

`bun run check` lints, tests, builds the extension, and creates:

```text
dist/nos2x-auto-approver-v0.2.0.zip
dist/nos2x-auto-approver-v0.2.0.zip.sha256
```

For local development, run `bun run build`, then load this repository's `extension/` directory unpacked. After every rebuild, click **Reload** for the extension and refresh open test pages; Chrome caches extension workers and content scripts.

## Releases

The release workflow runs on a version tag, verifies that the tag matches both `package.json` and `extension/manifest.json`, reruns the full check, and attaches the ZIP and checksum to a GitHub Release.

```sh
git tag v0.2.0
git push origin v0.2.0
```

Locally generated `.crx` and `.pem` files are ignored. The signing key for a CRX must never be committed, and Chrome restricts self-hosted CRX installation on Windows and macOS. A future Chrome Web Store listing can use the same release ZIP as its upload source.

## Upstream and license

This project is based on [fiatjaf/nos2x](https://github.com/fiatjaf/nos2x) and retains its public-domain/WTFPL license. The `upstream` Git remote tracks nos2x for focused compatibility updates.

The original icon was made by [Freepik](https://www.freepik.com/) from [Flaticon](https://www.flaticon.com/).
