import { execFile } from "node:child_process"
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { updateVersionPattern } from "@novadeck/protocol/bridge"

import { isNewerVersion } from "./applications-folder.js"
import {
  dataHome,
  installedImage,
  installedImages,
  type InstallLocationHost,
} from "./install-location.js"

// Where an AppImage keeps its icon at the size the installer extracts.
const iconPath = "usr/share/icons/hicolor/512x512/apps/novadeck.png"

/**
 * Every place an install writes to, as `scripts/install/install.sh` lays them out: the
 * AppImage, a `novadeck` command that links to it, a menu entry, and the icon the entry
 * names, under the data folder `XDG_DATA_HOME` names.
 */
export type InstallLayout = {
  readonly image: string
  readonly link: string
  readonly desktop: string
  readonly icon: string
}

export const installLayout = (host: Pick<InstallLocationHost, "env" | "home">): InstallLayout => {
  const data = dataHome(host)
  return {
    image: installedImage(host),
    link: `${host.home}/.local/bin/novadeck`,
    desktop: `${data}/applications/dev.mzpk.novadeck.desktop`,
    icon: `${data}/icons/hicolor/512x512/apps/novadeck.png`,
  }
}

/**
 * A path as the inside of a quoted `Exec` argument in a desktop entry, as `exec_quote`
 * in install.sh writes it. The desktop entry specification escapes `"`, `` ` ``, `$` and
 * `\\` with a backslash, and then, as `Exec` is a string, every backslash again, so a
 * backslash in a path becomes four and each of the others two. A percent sign is doubled,
 * as it starts a field code.
 */
export const execQuote = (path: string): string =>
  path
    .replaceAll("\\", "\\\\\\\\")
    .replaceAll(/["`$]/gu, (character) => `\\\\${character}`)
    .replaceAll("%", "%%")

/**
 * The menu entry for the AppImage at `image`, byte for byte what install.sh writes. A
 * missing `icon` leaves the name `novadeck`, which the icon theme may still find.
 */
export const desktopEntry = (image: string, icon: string | undefined): string =>
  [
    "[Desktop Entry]",
    "Type=Application",
    "Name=novadeck.",
    "Comment=A workspace for parallel terminals.",
    `Exec="${execQuote(image)}" %U`,
    `Icon=${icon ?? "novadeck"}`,
    "Terminal=false",
    "Categories=Utility;",
    "StartupWMClass=dev.mzpk.novadeck",
    "",
  ].join("\n")

/** An installed AppImage and the version it reports, if that could be read. */
export type InstalledCopy = { readonly image: string; readonly version: string | undefined }

/**
 * The installed copy that is a newer version than `running`, or the newest if several
 * are. A copy whose version could not be read is not known to be newer, so it does not
 * count, and the install replaces it.
 */
export const newerCopy = (
  copies: readonly InstalledCopy[],
  running: string,
): (InstalledCopy & { readonly version: string }) | undefined => {
  let best: (InstalledCopy & { readonly version: string }) | undefined
  for (const copy of copies) {
    const { version } = copy
    if (version === undefined || !isNewerVersion(version, running)) continue
    if (best === undefined || isNewerVersion(version, best.version)) best = { ...copy, version }
  }
  return best
}

/**
 * The version an AppImage's menu entry names, `X-AppImage-Version`, which electron-builder
 * writes from the package version, or undefined when it names none a release has.
 */
export const imageVersionOf = (desktop: string): string | undefined => {
  const version = /^X-AppImage-Version=(.*)$/mu.exec(desktop)?.[1]?.trim()
  return version !== undefined && updateVersionPattern.test(version) ? version : undefined
}

/**
 * Runs `image --appimage-extract <pattern>` with `into` as the working directory, which
 * leaves what matched under `into/squashfs-root`. The AppImage extracts itself without
 * mounting, so this needs no FUSE and starts no app.
 */
export type Extract = (image: string, pattern: string, into: string) => Promise<void>

/** The extraction as a child process; a hung or failing AppImage ends it with an error. */
export const extractWithProcess: Extract = (image, pattern, into) =>
  new Promise((resolve, reject) => {
    execFile(
      image,
      ["--appimage-extract", pattern],
      { cwd: into, timeout: 20_000, maxBuffer: 1 << 20 },
      (error) => (error ? reject(error) : resolve()),
    )
  })

// Runs `work` in a temporary folder, which is gone afterwards however it went.
const inTemporaryFolder = async <T>(work: (folder: string) => Promise<T>): Promise<T> => {
  const folder = await mkdtemp(join(tmpdir(), "novadeck-"))
  try {
    return await work(folder)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

/**
 * The version of the AppImage at `image`, read from the menu entry inside it without
 * running the app, or undefined when it cannot be read.
 */
export const readImageVersion = async (
  image: string,
  extract: Extract,
): Promise<string | undefined> => {
  try {
    return await inTemporaryFolder(async (folder) => {
      await extract(image, "*.desktop", folder)
      const root = join(folder, "squashfs-root")
      const entry = (await readdir(root)).find((name) => name.endsWith(".desktop"))
      return entry === undefined
        ? undefined
        : imageVersionOf(await readFile(join(root, entry), "utf8"))
    })
  } catch {
    return undefined
  }
}

/**
 * The AppImages already installed: each of the places the installer and Homebrew use that
 * holds a file, once even when one links to the other, with its version.
 */
export const findInstalled = async (
  host: Pick<InstallLocationHost, "env" | "home">,
  extract: Extract,
): Promise<InstalledCopy[]> => {
  const files = await Promise.all(
    installedImages(host).map(async (image) => {
      const real = await realpath(image).catch(() => undefined)
      const file = real !== undefined && (await stat(real)).isFile()
      return file ? { image, real } : undefined
    }),
  )
  const found = files.filter((file) => file !== undefined)
  return Promise.all(
    found
      .filter(({ real }, index) => found.findIndex((other) => other.real === real) === index)
      .map(async ({ image, real }) => ({ image, version: await readImageVersion(real, extract) })),
  )
}

/** How installing went: the AppImage now installed, or why nothing was. */
export type InstallOutcome =
  | { readonly kind: "installed"; readonly image: string }
  | { readonly kind: "failed"; readonly reason: string }

/** A short sentence for the person about why `error` stopped an install into `folder`. */
export const failureReason = (error: unknown, folder: string): string => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === "ENOSPC") return "There is no space left on the disk."
  if (code === "EACCES" || code === "EPERM" || code === "EROFS")
    return `Novadeck cannot write to ${folder}.`
  return error instanceof Error && error.message !== ""
    ? `Installing failed: ${error.message}`
    : "Installing failed."
}

// The icon from inside the AppImage, copied to `target`, or undefined when it has none.
const copyIcon = async (
  source: string,
  target: string,
  extract: Extract,
): Promise<string | undefined> => {
  try {
    return await inTemporaryFolder(async (folder) => {
      await extract(source, iconPath, folder)
      await mkdir(dirname(target), { recursive: true })
      await copyFile(join(folder, "squashfs-root", iconPath), target)
      return target
    })
  } catch {
    return undefined
  }
}

/**
 * Installs the AppImage `source` as install.sh installs a download: the icon, then the
 * file copied beside its destination and renamed over it, so a running install is
 * replaced whole and a copy that fails leaves the destination as it was, the `novadeck`
 * command linked to it, and the menu entry. A file with no icon gets an entry without
 * one. Running it again repairs a step that failed, so a failure after the file moved
 * is reported, though the new copy is in place. The installed copy updates itself from
 * there; this needs no network.
 *
 * `target` is the file to write, the installed copy being replaced; it defaults to the
 * installer's own path. Only a write to that path adds the icon, command and menu entry:
 * a copy elsewhere, such as Homebrew's in `~/Applications`, is integrated by whatever
 * put it there, and gets the file alone.
 */
export const installAppImage = async (
  source: string,
  layout: InstallLayout,
  extract: Extract,
  target: string = layout.image,
): Promise<InstallOutcome> => {
  const { link, desktop } = layout
  const image = target
  const integrate = target === layout.image
  // A line break would end the entry's Exec line early.
  if (/[\p{Cc}]/u.test(image)) return { kind: "failed", reason: "The install path is not valid." }
  const staged = `${image}.new`
  const icon = integrate ? await copyIcon(source, layout.icon, extract) : undefined
  try {
    await mkdir(dirname(image), { recursive: true })
    await copyFile(source, staged)
    await chmod(staged, 0o755)
    await rename(staged, image)
    if (!integrate) return { kind: "installed", image }
    await mkdir(dirname(link), { recursive: true })
    await rm(link, { force: true })
    await symlink(image, link)
    await mkdir(dirname(desktop), { recursive: true })
    await writeFile(desktop, desktopEntry(image, icon))
    return { kind: "installed", image }
  } catch (error) {
    await rm(staged, { force: true }).catch(() => {})
    return { kind: "failed", reason: failureReason(error, dirname(image)) }
  }
}
