# Auto-update

Installed apps look for a newer release on GitHub, download it in the background and
install it the next time the app quits. The app never restarts on its own: it
offers a restart instead, which saves every page first, as quitting does.

## Which builds update

| Build                          | Updates                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| Linux AppImage                 | Yes, replacing the AppImage file                                      |
| Linux `.deb` and `.rpm`        | No, the package manager owns them                                     |
| Windows installer (`-setup`)   | Yes                                                                   |
| Windows portable (`-portable`) | No, it has nowhere to install to                                      |
| macOS                          | Yes, once the app is Developer ID signed; an unsigned one never tries |
| Local and pull request builds  | No, they carry version 0.0.0                                          |

Squirrel.Mac refuses to install into an app that is not Developer ID signed, so a macOS
build checks its own signature once at launch with `codesign` and stays out of the
update loop, without downloading anything, until releases are signed. See
[release-signing.md](release-signing.md).

Setting `NOVADECK_UPDATES=off` turns updating off for a launch. The smoke tests and the
release workflow's package checks set it, so they never reach the network.

## How it works

- `application/host/src/main/updater.ts` decides whether the build updates, checks about
  ten seconds after launch and every four hours, and tells the app's pages the version of
  a downloaded update. Failed checks, offline or rate limited, are logged and the next
  interval tries again.
- `electron-updater` reads GitHub Releases of `mzpkdev/novadeck`. Every release is still a
  prerelease, so the updater is told to accept prereleases.
- `electron-builder.yml`'s `publish` block makes builder write `resources/app-update.yml`
  into the app, which names that repository, and the `latest*.yml` metadata beside the
  packages, even with `--publish never`.

## Release assets

Each platform's metadata is uploaded with its packages by `.github/workflows/release.yml`,
and each file's `url` must name an uploaded asset exactly:

| File               | Describes                                                          |
| ------------------ | ------------------------------------------------------------------ |
| `latest-linux.yml` | `novadeck-<version>-linux-x86_64.AppImage`                         |
| `latest.yml`       | `novadeck-<version>-win-x64-setup.exe`, not the portable           |
| `latest-mac.yml`   | `novadeck-<version>-mac-universal.zip`, and the disk image         |
| `*.blockmap`       | The installer's and the macOS packages' differential download maps |

The AppImage embeds its own block map. The metadata carries the SHA-512 of each package, so
the workflow must not change a package after builder wrote it.
