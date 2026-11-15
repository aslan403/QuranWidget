#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="$PWD"
SOURCE_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/quran-desktop/madani-1024-v8"
TAJWEED_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/quran-desktop/tajweed-85e22a0"
export QURAN_TEST_ROOT="$(mktemp -d "${TMPDIR:-$HOME/.cache}/quran-shell.XXXXXX")"
export XDG_CONFIG_HOME="$QURAN_TEST_ROOT/config"
export XDG_DATA_HOME="$QURAN_TEST_ROOT/data"
export XDG_CACHE_HOME="$QURAN_TEST_ROOT/cache"
export XDG_RUNTIME_DIR="$QURAN_TEST_ROOT/run"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
mkdir -p "$XDG_CACHE_HOME/quran-desktop/madani-1024-v8"
for page in 001 002 003 187 604; do
    if [[ -f "$SOURCE_CACHE/page$page.png" ]]; then
        cp "$SOURCE_CACHE/page$page.png" "$XDG_CACHE_HOME/quran-desktop/madani-1024-v8/"
    fi
done
mkdir -p "$XDG_CACHE_HOME/quran-desktop/tajweed-85e22a0"
for page in 001 002 003 187 604; do
    if [[ -f "$TAJWEED_CACHE/page$page.png" ]]; then
        cp "$TAJWEED_CACHE/page$page.png" "$XDG_CACHE_HOME/quran-desktop/tajweed-85e22a0/"
    fi
done
cp -a "$PROJECT" "$XDG_DATA_HOME/gnome-shell/extensions/quran-desktop@local"
DRIVER="$XDG_DATA_HOME/gnome-shell/extensions/quran-test-driver@local"
mkdir -p "$DRIVER"
cp tests/driver.js "$DRIVER/extension.js"
printf '%s\n' '{"uuid":"quran-test-driver@local","name":"Private Quran test driver","description":"Isolated test only","shell-version":["46"]}' > "$DRIVER/metadata.json"
printf 'Isolated test artifacts: %s\n' "$QURAN_TEST_ROOT"
export PROJECT
exec dbus-run-session -- bash -c '
set -euo pipefail
unset DISPLAY WAYLAND_DISPLAY
gsettings set org.gnome.shell enabled-extensions "[\"quran-test-driver@local\", \"quran-desktop@local\"]"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.desktop.interface enable-animations false
gsettings set org.gnome.desktop.notifications show-banners false
gsettings set org.gnome.desktop.background picture-uri ""
gsettings set org.gnome.desktop.background picture-uri-dark ""
gsettings set org.gnome.desktop.background primary-color "#19282c"
LIBGL_ALWAYS_SOFTWARE=1 gnome-shell --headless --wayland --no-x11 --virtual-monitor 1440x1080 > "$QURAN_TEST_ROOT/shell.log" 2>&1 &
SHELL_PID=$!
trap "kill $SHELL_PID 2>/dev/null || true" EXIT
sleep 3
gjs -m "$PROJECT/tests/shell-client.js"
export WAYLAND_DISPLAY=wayland-0
cd "$PROJECT"
GI_TYPELIB_PATH="/usr/lib/gnome-shell/girepository-1.0${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}" gjs -m "$PROJECT/tests/prefs.js"
'
