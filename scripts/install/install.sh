#!/bin/sh
# Installs the latest stable Novadeck on x86_64 Linux:
#
#   curl -fsSL https://github.com/@REPOSITORY@/releases/latest/download/install.sh | sh
#
# It puts the AppImage in ~/.local/share/novadeck with a menu entry and a `novadeck`
# command. Every download is checked against the release's SHA256SUMS first. Running it
# again upgrades or repairs the install; installed apps update themselves after that.
#
# Ubuntu 24.04 and later stop unprivileged programs from creating the user namespaces
# Electron's sandbox needs, and the AppImage then runs without a sandbox. On such a system
# the install writes an AppArmor profile to /etc/apparmor.d/novadeck with sudo, which asks
# for a password once. If that fails, the install still finishes and says how to retry:
#
#   curl -fsSL https://github.com/@REPOSITORY@/releases/latest/download/install.sh | sh -s -- --sandbox
#
# --sandbox does only that step, for an existing install, such as one Homebrew made.
#
# The release workflow replaces @REPOSITORY@ with the repository it publishes from. These
# environment variables change it:
#
#   NOVADECK_INSTALL_BASE_URL         The folder to download from, for a mirror or a test.
#   XDG_DATA_HOME                     Where the install puts its files, as usual; the default
#                                     is ~/.local/share. The profile covers that path too.
#
# Test hooks, not for use otherwise:
#
#   NOVADECK_INSTALL_SBIN_DIRS        The folders searched, after the PATH, for
#                                     apparmor_parser and fusermount3, in place of
#                                     "/sbin /usr/sbin".
#   NOVADECK_INSTALL_USERNS_SYSCTL    The file that says whether unprivileged user
#                                     namespaces are restricted, in place of
#                                     /proc/sys/kernel/apparmor_restrict_unprivileged_userns.
#   NOVADECK_INSTALL_APPARMOR_DIR     The folder the profile goes to, in place of
#                                     /etc/apparmor.d.
#   NOVADECK_INSTALL_FUSE_DEVICE      The device AppImages mount through, in place of
#                                     /dev/fuse.
#
# Every definition comes before the one call on the last line, so a download that is cut
# short runs nothing.

fail() {
  printf 'novadeck install: %s\n' "$1" >&2
  exit 1
}

say() {
  printf '%s\n' "$1"
}

has() {
  command -v "$1" > /dev/null 2>&1
}

# Linux on x86_64 only; macOS and Windows have their own installers.
check_platform() {
  repository="$1"
  case "$(uname -s)" in
    Linux) ;;
    Darwin)
      fail "this installer is for Linux. On macOS, download https://github.com/$repository/releases/latest/download/novadeck-mac-universal.dmg and drag the app to Applications."
      ;;
    *)
      fail "this installer is for Linux. On Windows, download https://github.com/$repository/releases/latest/download/novadeck-win-x64-setup.exe."
      ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) ;;
    *) fail "Novadeck is built for x86_64 only, and this computer is $(uname -m)." ;;
  esac
}

# The path of a tool on the PATH or in the system folders a user's PATH often lacks, or
# nothing when it is nowhere.
find_tool() {
  if has "$1"; then
    command -v "$1"
    return 0
  fi
  # shellcheck disable=SC2086
  for dir in ${NOVADECK_INSTALL_SBIN_DIRS:-/sbin /usr/sbin}; do
    if [ -x "$dir/$1" ]; then
      printf '%s\n' "$dir/$1"
      return 0
    fi
  done
}

download() {
  curl -fsSL --retry 3 --retry-connrefused -o "$2" "$1" || fail "could not download $1"
}

# Succeeds only when the file's SHA-256 is the one SHA256SUMS lists for its name.
verify() {
  name="$1"
  expected="$(awk -v name="$name" '$2 == name || $2 == "*" name { print $1; exit }' SHA256SUMS)"
  [ -n "$expected" ] || fail "SHA256SUMS lists no $name."
  actual="$(sha256sum "$name" | awk '{ print $1 }')"
  [ "$expected" = "$actual" ] || fail "$name does not match its checksum in SHA256SUMS; try again, and report it if it persists."
}

fetch() {
  base="$1"
  name="$2"
  say "Downloading $name"
  download "$base/$name" "$name"
  verify "$name"
}

# Runs a command as root, through sudo unless this already is root. It fails, quietly, when
# there is no way to become root, and when sudo is declined.
as_root() {
  if [ "$(id -u)" = 0 ]; then
    "$@"
  elif has sudo; then
    sudo "$@"
  else
    return 1
  fi
}

# An AppImage mounts itself through FUSE 3's fusermount3 (or fusermount) and /dev/fuse.
check_fuse() {
  if [ -n "$(find_tool fusermount3)" ] || [ -n "$(find_tool fusermount)" ]; then
    if [ -e "${NOVADECK_INSTALL_FUSE_DEVICE:-/dev/fuse}" ]; then
      return 0
    fi
  fi
  say "Novadeck's AppImage needs FUSE 3, which this computer seems to lack."
  say "Install your distribution's fuse3 package, or start Novadeck with"
  say "--appimage-extract-and-run."
}

# Where the AppImage lives; the sandbox profile names this path.
image_path() {
  printf '%s\n' "${XDG_DATA_HOME:-$HOME/.local/share}/novadeck/novadeck.AppImage"
}

install_appimage() {
  base="$1"
  data="${XDG_DATA_HOME:-$HOME/.local/share}"
  bin="$HOME/.local/bin"
  folder="$data/novadeck"
  image="$(image_path)"

  fetch "$base" novadeck-linux-x86_64.AppImage
  chmod +x novadeck-linux-x86_64.AppImage

  # The icon comes out of the AppImage without mounting it, so this needs no FUSE.
  icon=""
  if ./novadeck-linux-x86_64.AppImage --appimage-extract usr/share/icons/hicolor/512x512/apps/novadeck.png > /dev/null 2>&1 &&
    [ -f squashfs-root/usr/share/icons/hicolor/512x512/apps/novadeck.png ]; then
    icon="$data/icons/hicolor/512x512/apps/novadeck.png"
    mkdir -p "$data/icons/hicolor/512x512/apps"
    cp squashfs-root/usr/share/icons/hicolor/512x512/apps/novadeck.png "$icon"
  else
    say "Could not extract the icon; the menu entry will have none."
  fi

  # A new file renamed over the old one, so an upgrade works while Novadeck is running.
  mkdir -p "$folder" "$data/applications" "$bin"
  cp novadeck-linux-x86_64.AppImage "$image.new"
  chmod +x "$image.new"
  mv -f "$image.new" "$image"
  ln -sf "$image" "$bin/novadeck"

  cat > "$data/applications/dev.mzpk.novadeck.desktop" << EOF
[Desktop Entry]
Type=Application
Name=novadeck.
Comment=A workspace for parallel terminals.
Exec="$image" %U
Icon=${icon:-novadeck}
Terminal=false
Categories=Utility;
StartupWMClass=dev.mzpk.novadeck
EOF

  say "Installed Novadeck to $image"
  case ":$PATH:" in
    *":$bin:"*) ;;
    *) say "Add $bin to your PATH to start it as \`novadeck\`: export PATH=\"$bin:\$PATH\"" ;;
  esac
  check_fuse
  setup_sandbox "$base"
}

# One profile block: it lets the program at an attached path create user namespaces, and
# leaves everything else about it unconfined.
profile_block() {
  printf 'profile %s %s flags=(unconfined) {\n  userns,\n  include if exists <local/%s>\n}\n' "$1" "$2" "$1"
}

# The AppArmor profile for the AppImage in the default folder, where Homebrew's cask puts
# it, and wherever XDG_DATA_HOME moved this install. The abi line is for AppArmor 4 and
# later; older versions are written without it.
write_profile() {
  printf 'abi <abi/4.0>,\ninclude <tunables/global>\n\n'
  profile_block novadeck '@{HOME}/{.local/share/novadeck,Applications}/novadeck.AppImage'
  if [ "$1" != "$HOME/.local/share/novadeck/novadeck.AppImage" ]; then
    printf '\n'
    profile_block novadeck-custom "\"$1\""
  fi
}

sandbox_warning() {
  say "Warning: Novadeck will run without its sandbox: $1"
  say "To set it up later, run:"
  say "  curl -fsSL $2/install.sh | sh -s -- --sandbox"
}

# True when AppArmor stops unprivileged programs from creating user namespaces, which is
# what Electron's sandbox needs; Ubuntu 24.04 and later do. Without that sysctl there is
# nothing to fix.
userns_restricted() {
  [ "$(cat "${NOVADECK_INSTALL_USERNS_SYSCTL:-/proc/sys/kernel/apparmor_restrict_unprivileged_userns}" 2> /dev/null || true)" = 1 ]
}

# Lets the AppImage create user namespaces by loading an AppArmor profile. A failure here
# only costs the sandbox, so it warns and returns instead of failing the install.
setup_sandbox() {
  base="$1"
  userns_restricted || return 0
  parser="$(find_tool apparmor_parser)"
  [ -n "$parser" ] || return 0

  target="${NOVADECK_INSTALL_APPARMOR_DIR:-/etc/apparmor.d}/novadeck"
  location="$(image_path)"
  case "$location" in
    *[\"{}\[\]*?^,\\]* | *[![:print:]]*)
      sandbox_warning "the install path $location has characters AppArmor profiles cannot name." "$base"
      return 0
      ;;
  esac
  write_profile "$location" > profile
  # The check electron-builder's deb does too, as an AppArmor without the abi line fails it.
  if ! "$parser" --skip-kernel-load --debug profile > /dev/null 2>&1; then
    sandbox_warning "this system's AppArmor rejected the profile." "$base"
    return 0
  fi
  say "Writing an AppArmor profile so Novadeck's sandbox works on this system."
  if as_root cp profile "$target" && as_root "$parser" --replace "$target" > /dev/null; then
    say "Novadeck's sandbox is set up."
  else
    sandbox_warning "the profile could not be written and loaded as root." "$base"
  fi
}

usage() {
  printf 'usage: install.sh [--sandbox]\n' >&2
  exit 2
}

main() {
  set -eu
  sandbox_only=false
  for arg in "$@"; do
    case "$arg" in
      --sandbox) sandbox_only=true ;;
      *) usage ;;
    esac
  done
  repository='@REPOSITORY@'
  base="${NOVADECK_INSTALL_BASE_URL:-https://github.com/$repository/releases/latest/download}"
  base="${base%/}"

  check_platform "$repository"

  work="$(mktemp -d)" || fail "could not create a temporary folder."
  trap 'rm -rf "$work"' EXIT
  cd "$work" || fail "could not enter $work."

  if [ "$sandbox_only" = true ]; then
    userns_restricted || say "This system does not restrict user namespaces, so Novadeck's sandbox needs no setup."
    setup_sandbox "$base"
    return 0
  fi

  has curl || fail "curl is required."
  has sha256sum || fail "sha256sum is required."

  say "Installing Novadeck"
  download "$base/SHA256SUMS" SHA256SUMS
  install_appimage "$base"
  say "Done. Novadeck updates itself from here."
}

main "$@"
