# The sandbox's own `security` on macOS (see `keychainGuard` in sandbox.ts), after the two
# lines that set `log`, where each service asked for is written, and `real`, the system's
# `security`. It answers "not found" (exit 44), passing nothing on, where any service
# asked for is one of Claude Code's items with no folder's suffix: the person's own.

# Writes the service to the log; fails where it is the person's own Claude Code item.
asked() {
  printf '%s\n' "$1" >> "$log"
  case "$1" in
    "Claude Code"*-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) return 0 ;;
    "Claude Code"*) return 1 ;;
  esac
  return 0
}

refused=
interactive=
previous=
for argument in "$@"; do
  if [ "$previous" = "-s" ]; then
    asked "$argument" || refused=1
  else
    case "$argument" in
      -i) interactive=1 ;;
      # A service joined to its flag, as `-sName`.
      -s?*) asked "${argument#-s}" || refused=1 ;;
    esac
  fi
  previous=$argument
done

# With -i, the commands come on its input, as Claude Code writes its items: each line's
# service, quoted or not, is asked for alike, and the input passed on as it came.
if [ -n "$interactive" ]; then
  input=$(cat; printf x)
  input=${input%x}
  services=$(printf '%s' "$input" | sed -n -e 's/.* -s "\([^"]*\)".*/\1/p' -e 's/.* -s \([^" ][^ ]*\).*/\1/p')
  while IFS= read -r service; do
    [ -n "$service" ] && { asked "$service" || refused=1; }
  done <<EOF
$services
EOF
  [ -n "$refused" ] && exit 44
  # A pipeline runs in a subshell of its own: its status is the script's, and it ends here.
  printf '%s' "$input" | "$real" "$@"
  exit $?
fi

[ -n "$refused" ] && exit 44
exec "$real" "$@"
