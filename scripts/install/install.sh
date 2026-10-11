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
# the install writes an AppArmor profile to /etc/apparmor.d/novadeck-appimage-<uid> with
# sudo, which asks for a password once. If that fails, the install still finishes and says how to retry:
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
#                                     is ~/.local/share, and a path that is not absolute
#                                     counts as unset. The profile covers that path too.
#
# Test hooks, not for use otherwise:
#
#   NOVADECK_INSTALL_SBIN_DIRS        The folders searched, after the PATH, for
#                                     apparmor_parser, in place of "/sbin /usr/sbin".
#   NOVADECK_INSTALL_USERNS_SYSCTL    The file that says whether unprivileged user
#                                     namespaces are restricted, in place of
#                                     /proc/sys/kernel/apparmor_restrict_unprivileged_userns.
#   NOVADECK_INSTALL_APPARMOR_DIR     The folder the profile goes to, in place of
#                                     /etc/apparmor.d.
#   NOVADECK_INSTALL_PROFILES         The folder with one folder per loaded AppArmor
#                                     profile, each holding a `name` file, in place of
#                                     /sys/kernel/security/apparmor/policy/profiles.
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

# An AppImage mounts itself through fusermount and /dev/fuse. The static runtime takes any
# setuid fusermount* on the PATH, FUSE 2's fusermount included, so either one will do; it
# does not look in the system folders, and neither does this.
check_fuse() {
  if has fusermount3 || has fusermount; then
    if [ -e "${NOVADECK_INSTALL_FUSE_DEVICE:-/dev/fuse}" ]; then
      return 0
    fi
  fi
  say "Novadeck's AppImage needs FUSE 3, which this computer seems to lack."
  say "Install your distribution's fuse3 package, or start Novadeck with"
  say "--appimage-extract-and-run."
}

# XDG_DATA_HOME, which the XDG spec says to ignore unless it is an absolute path.
data_home() {
  case "${XDG_DATA_HOME:-}" in
    /*) printf '%s\n' "$XDG_DATA_HOME" ;;
    *) printf '%s\n' "$HOME/.local/share" ;;
  esac
}

# Where the AppImage lives; the sandbox profile names this path.
image_path() {
  printf '%s\n' "$(data_home)/novadeck/novadeck.AppImage"
}

install_appimage() {
  base="$1"
  data="$(data_home)"
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

# The path AppArmor matches for a file: the real one, with symlinks resolved. For a file
# that is not there yet, it is the real path of the nearest folder that is, and the rest
# as written.
canonical_path() {
  folder="${1%/*}"
  rest="${1##*/}"
  # A relative path has no slash left to strip at some point, and stops there.
  while [ -n "$folder" ] && [ ! -d "$folder" ] && [ "$folder" != "${folder%/*}" ]; do
    rest="${folder##*/}/$rest"
    folder="${folder%/*}"
  done
  if [ -e "$1" ]; then
    readlink -f "$1"
  else
    folder="$(readlink -f "${folder:-/}")"
    printf '%s/%s\n' "${folder%/}" "$rest"
  fi
}

# One profile: it lets the program at one path create user namespaces and leaves
# everything else about it unconfined. A quoted attachment takes a single literal path.
profile_block() {
  printf 'profile %s "%s" flags=(unconfined) {\n  userns,\n  include if exists <local/%s>\n}\n' "$1" "$2" "$1"
}

# The AppArmor profiles for this user's AppImage, and for the one Homebrew's cask puts in
# ~/Applications. The abi line makes AppArmor 3 and earlier, which lack it, reject the
# file; the dry run in setup_sandbox catches that.
write_profile() {
  name="novadeck-appimage-$1"
  printf 'abi <abi/4.0>,\ninclude <tunables/global>\n\n'
  profile_block "$name" "$2"
  if [ "$2" != "$3" ]; then
    printf '\n'
    profile_block "$name-brew" "$3"
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

# True when the kernel already has a profile of that name. Anyone can list the folder of
# loaded profiles, unlike the file of their names that only root may read.
profile_loaded() {
  for entry in "${NOVADECK_INSTALL_PROFILES:-/sys/kernel/security/apparmor/policy/profiles}"/*; do
    [ "$(cat "$entry/name" 2> /dev/null || true)" = "$1" ] && return 0
  done
  return 1
}

# The numeric owner of the home folder.
home_owner() {
  # shellcheck disable=SC2012
  ls -ndL "$HOME" | awk '{ print $3 }'
}

# Lets the AppImage create user namespaces by loading an AppArmor profile. A failure here
# only costs the sandbox, so it warns and returns instead of failing the install.
setup_sandbox() {
  base="$1"
  userns_restricted || return 0
  parser="$(find_tool apparmor_parser)"
  if [ -z "$parser" ]; then
    sandbox_warning "apparmor_parser, which loads the profile, is not installed." "$base"
    return 0
  fi

  uid="$(id -u)"

  # One file per user, named for the uid, so one user's install never replaces another's,
  # and apart from the novadeck name the .deb's own profile uses.
  name="novadeck-appimage-$uid"
  target="${NOVADECK_INSTALL_APPARMOR_DIR:-/etc/apparmor.d}/$name"
  location="$(canonical_path "$(image_path)")"
  brew="$(canonical_path "$HOME/Applications/novadeck.AppImage")"
  for path in "$location" "$brew"; do
    case "$path" in
      *[\"{}\[\]*?^,\\]* | *[[:cntrl:]]*)
        sandbox_warning "the path $path has characters AppArmor profiles cannot name." "$base"
        return 0
        ;;
    esac
  done
  write_profile "$uid" "$location" "$brew" > profile
  # AppArmor 3 and earlier lack the abi file, and fail here before anything is installed.
  if ! "$parser" --skip-kernel-load --debug profile > /dev/null 2>&1; then
    sandbox_warning "this system's AppArmor rejected the profile." "$base"
    return 0
  fi
  brewname="$name-brew"
  if cmp -s profile "$target" && profile_loaded "$name" && { [ "$location" = "$brew" ] || profile_loaded "$brewname"; }; then
    say "Novadeck's sandbox is already set up."
    return 0
  fi
  say "Writing an AppArmor profile so Novadeck's sandbox works on this system."
  # Loaded before it is saved, so a profile that will not load never replaces a working one
  # and never loads at the next boot.
  if ! as_root "$parser" --replace profile > /dev/null; then
    sandbox_warning "the profile could not be loaded as root." "$base"
  elif as_root cp profile "$target"; then
    say "Novadeck's sandbox is set up."
  else
    say "Novadeck's sandbox works until the next restart, as the profile could not be saved."
    say "After a restart, run this again:"
    say "  curl -fsSL $base/install.sh | sh -s -- --sandbox"
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

  [ -n "${HOME:-}" ] && [ -d "$HOME" ] || fail "HOME is not set to an existing folder."
  # Run through sudo, whether plain (HOME is root's) or with -E (HOME is the user's), this
  # would write everything as root, out of reach of the user's own updates and re-runs, and
  # Electron will not start as root with a sandbox. Real root logins set no SUDO_UID.
  if [ "$(id -u)" = 0 ] && { [ "${SUDO_UID:-0}" != 0 ] || [ "$(home_owner)" != 0 ]; }; then
    fail "this is running as root for another user's account. Run install.sh as the user who runs Novadeck, without sudo."
  fi

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
