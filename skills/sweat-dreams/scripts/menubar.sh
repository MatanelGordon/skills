#!/usr/bin/env bash
# sweat-dreams menubar — build/install/remove the menu bar indicator.
#   menubar install    compile (if needed) and start it, and load at login
#   menubar start      just start it now
#   menubar stop       stop it
#   menubar uninstall  stop it and remove the login item
#   menubar probe      report what's present
set -uo pipefail
HOME_DIR="${SWEAT_DREAMS_HOME:-$HOME/.sweat-dreams}"
SRC="$HOME_DIR/menubar.swift"
BIN="$HOME_DIR/sweat-dreams-menubar"
PLIST="$HOME/Library/LaunchAgents/com.sweatdreams.menubar.plist"
LABEL="com.sweatdreams.menubar"

build() {
  command -v swiftc >/dev/null 2>&1 || { echo "menubar: swiftc not found (install Xcode CLT: xcode-select --install)" >&2; return 1; }
  [ -f "$SRC" ] || { echo "menubar: missing $SRC" >&2; return 1; }
  if [ ! -x "$BIN" ] || [ "$SRC" -nt "$BIN" ]; then
    echo "menubar: compiling…"
    swiftc -O -o "$BIN" "$SRC" 2>&1 | sed 's/^/  /' || return 1
  fi
  [ -x "$BIN" ]
}

start() { pgrep -f "$BIN" >/dev/null 2>&1 && { echo "menubar: already running"; return 0; }
          "$BIN" >/dev/null 2>&1 & sleep 0.5
          pgrep -f "$BIN" >/dev/null 2>&1 && echo "menubar: running — look for ☕︎ in your menu bar" || { echo "menubar: failed to start" >&2; return 1; }; }

stop()  { pkill -f "$BIN" 2>/dev/null; echo "menubar: stopped"; }

write_plist() {
  mkdir -p "$(dirname "$PLIST")"
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$BIN</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
</dict></plist>
EOF
}

case "${1:-probe}" in
  install)
    build || exit 1
    write_plist
    launchctl unload "$PLIST" 2>/dev/null
    launchctl load "$PLIST" 2>/dev/null
    start
    echo "menubar: will also start at login"
    ;;
  start)     build || exit 1; start ;;
  stop)      stop ;;
  uninstall) stop; launchctl unload "$PLIST" 2>/dev/null; rm -f "$PLIST"; echo "menubar: login item removed" ;;
  plugin)
    echo "$HOME_DIR/sweat-dreams.5s.sh"
    echo "  Install SwiftBar (brew install --cask swiftbar) or xbar, then copy that file"
    echo "  into your plugin folder. Zero compilation required."
    ;;
  probe)
    echo "  swiftc:  $(command -v swiftc || echo 'MISSING')"
    if [ -f /Library/Developer/CommandLineTools/usr/include/swift/module.modulemap ] \
       && [ -f /Library/Developer/CommandLineTools/usr/include/swift/bridging.modulemap ]; then
      echo "  !! swiftc is BROKEN on this Mac: two modulemaps both define SwiftBridging."
      echo "     Stale file left by a CLT upgrade. One-line fix (needs sudo, your call):"
      echo "       sudo mv /Library/Developer/CommandLineTools/usr/include/swift/module.modulemap \\"
      echo "               /Library/Developer/CommandLineTools/usr/include/swift/module.modulemap.stale"
      echo "     Or skip the build entirely:  sweat-dreams menubar plugin"
    fi
    echo "  source:  $([ -f "$SRC" ] && echo present || echo missing)"
    echo "  binary:  $([ -x "$BIN" ] && echo built || echo 'not built')"
    echo "  running: $(pgrep -f "$BIN" >/dev/null 2>&1 && echo yes || echo no)"
    echo "  login:   $([ -f "$PLIST" ] && echo installed || echo 'not installed')"
    ;;
  *) echo "menubar: unknown subcommand: $1" >&2; exit 64 ;;
esac
