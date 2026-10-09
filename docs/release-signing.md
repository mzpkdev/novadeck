# Release signing

Releases from `main` are signed on every platform once the signing credentials are in
the repository's settings. Until a platform's credentials are there, its package is
built unsigned, as before. Pull requests are never signed.

| Platform | What is signed                                                                                          | How                                                |
| -------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| macOS    | The app bundle and every binary in it, the relay included, plus the voice engine's server and libraries | Developer ID, hardened runtime, notarized, stapled |
| Windows  | The portable executable, the app inside it, its DLLs and native modules, the relay and the voice engine | Azure Artifact Signing                             |
| All      | Every release asset                                                                                     | GitHub build provenance attestations               |

The release workflow turns each platform on by itself: macOS when any of its secrets is
set, Windows when any of its `AZURE_SIGNING_*` variables is. From then on the release
fails and names whatever that platform still lacks, rather than shipping it unsigned. After packaging, it checks the signatures: `codesign`,
`spctl` and `stapler` on macOS, and `Get-AuthenticodeSignature` on Windows.

## macOS

You need the [Apple Developer Program](https://developer.apple.com/programs/enroll/)
(99 USD a year). A sole proprietorship enrolls as an individual, so the certificate and
the Gatekeeper prompt show the owner's name.

1. Create a **Developer ID Application** certificate (Xcode → Settings → Accounts →
   Manage Certificates, or Certificates on developer.apple.com). Export it from Keychain
   Access as a `.p12` with a password, including its private key.
2. In App Store Connect → Users and Access → Integrations → App Store Connect API,
   generate a team key with Developer access. Download the `.p8`, which Apple offers
   only once, and note its key ID and the issuer ID.
3. Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret                       | Value                                                    |
| ---------------------------- | -------------------------------------------------------- |
| `MACOS_CERTIFICATE`          | The `.p12`, base64-encoded: `base64 -i developer-id.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | The `.p12`'s password                                    |
| `APPLE_API_KEY`              | The text of `AuthKey_<key id>.p8`                        |
| `APPLE_API_KEY_ID`           | The key ID                                               |
| `APPLE_API_ISSUER`           | The issuer ID                                            |

The app's entitlements are in `application/host/resources/entitlements.mac.plist`. The
hardened runtime denies, without asking, any protected resource the app has no
entitlement for, and macOS counts the programs run in Novadeck's terminals as the app.
So the app holds the entitlements a terminal needs (microphone, camera, Apple Events,
contacts, calendars, location and photos). Every resource macOS asks about has its usage
description in `mac.extendInfo`, which is the text of the prompt. Some resources, such as
Bluetooth, the Desktop and Documents folders and the local network, have a description
but no hardened-runtime entitlement, so they need nothing in the plist.

## Windows

[Azure Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
(formerly Trusted Signing) keeps the key in Microsoft's service and issues short-lived
certificates. Its Basic tier costs about 10 USD a month and needs a paid Azure
subscription. Microsoft offers individual validation only in the US and Canada, so a
Polish sole proprietorship validates as an organization, with its CEIDG name.

1. In an Azure subscription, register the `Microsoft.CodeSigning` resource provider and
   create an Artifact Signing account. Poland Central's endpoint is
   `https://plc.codesigning.azure.net`.
2. Complete a **Public Trust** identity validation for the organization, then create a
   Public Trust certificate profile from it.
3. Create an app registration with a client secret, and give its service principal the
   **Artifact Signing Certificate Profile Signer** role on the account.
4. Add these repository secrets and variables. The four variables turn Windows signing
   on; the release then needs the three secrets too:

| Name                      | Kind     | Value                                                |
| ------------------------- | -------- | ---------------------------------------------------- |
| `AZURE_TENANT_ID`         | Secret   | The directory (tenant) ID                            |
| `AZURE_CLIENT_ID`         | Secret   | The app registration's application (client) ID       |
| `AZURE_CLIENT_SECRET`     | Secret   | Its client secret                                    |
| `AZURE_SIGNING_ENDPOINT`  | Variable | The account's regional endpoint                      |
| `AZURE_SIGNING_ACCOUNT`   | Variable | The Artifact Signing account's name                  |
| `AZURE_SIGNING_PROFILE`   | Variable | The certificate profile's name                       |
| `AZURE_SIGNING_PUBLISHER` | Variable | The certificate's subject, such as `CN=…, O=…, C=PL` |

A client secret expires; renew it in the app registration before then and update
`AZURE_CLIENT_SECRET`.

Signing does not skip SmartScreen at once. No certificate, EV included, does that any
more: reputation builds for the publisher and each file as people download them. What
signing gives straight away is a named publisher rather than "Unknown publisher", and
fewer antivirus false positives.

## Provenance on every platform

Each release attests every asset it publishes. The attestation records which workflow
run, commit and repository built a file, and is logged in Sigstore's public
transparency log. Linux checks no signature when an AppImage starts, so this and
`SHA256SUMS` are how a Linux download is checked:

```sh
gh attestation verify novadeck-<version>-linux-x86_64.AppImage --repo mzpkdev/novadeck
```

## The voice engine

The engine is built and signed in the same job as the app, with the same identity. Its
CI cache is keyed on that identity, so the first signed release, and the first after a
certificate changes, builds it afresh; pull requests, never signed, keep an unsigned
engine of their own. A signature's timestamp makes every signed build different bytes,
so a rebuilt engine has a new SHA-256 and installed apps download it again; that happens
only when the cache misses.

The engine isn't notarized: the runner downloads it with its own HTTP client, so macOS
doesn't quarantine it and Gatekeeper doesn't assess it. Its Developer ID signature is
what lets it run on Apple silicon, and what still stands if macOS ever asks for more.
