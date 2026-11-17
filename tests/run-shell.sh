#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="$PWD"
glib-compile-schemas --strict "$PROJECT/schemas"
SOURCE_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/quran-desktop/madani-1024-v8"
TAJWEED_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/quran-desktop/tajweed-85e22a0"
AUDIO_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/quran-desktop/audio-v1/alafasy"
COORDINATE_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/quran-desktop/verse-bounds-v1"
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
mkdir -p "$XDG_CACHE_HOME/quran-desktop/audio-v1/alafasy" "$XDG_CACHE_HOME/quran-desktop/verse-bounds-v1"
for clip in 001001 001002 112003; do
    if [[ -f "$AUDIO_CACHE/$clip.mp3" ]]; then cp "$AUDIO_CACHE/$clip.mp3" "$XDG_CACHE_HOME/quran-desktop/audio-v1/alafasy/"; fi
done
if [[ -d "$COORDINATE_CACHE" ]]; then cp -a "$COORDINATE_CACHE/." "$XDG_CACHE_HOME/quran-desktop/verse-bounds-v1/"; fi
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
if [[ "${QURAN_TEST_SCOPE:-all}" == navigation ]]; then
    GSETTINGS_SCHEMA_DIR="$PROJECT/schemas" gsettings set org.gnome.shell.extensions.quran-desktop mushaf-edition tajweed
fi
gsettings set org.gnome.desktop.notifications show-banners false
gsettings set org.gnome.desktop.background picture-uri ""
gsettings set org.gnome.desktop.background picture-uri-dark ""
gsettings set org.gnome.desktop.background primary-color "#19282c"
MONITORS=(--virtual-monitor 1440x1080)
if [[ "${QURAN_TEST_SCOPE:-all}" == displays || "${QURAN_TEST_SCOPE:-all}" == audio ]]; then
    gsettings set org.gnome.mutter experimental-features "[\"scale-monitor-framebuffer\"]"
    MONITORS+=(--virtual-monitor 1024x768)
fi
LIBGL_ALWAYS_SOFTWARE=1 gnome-shell --headless --wayland --no-x11 "${MONITORS[@]}" > "$QURAN_TEST_ROOT/shell.log" 2>&1 &
SHELL_PID=$!
trap "kill $SHELL_PID 2>/dev/null || true" EXIT
sleep 3
if [[ "${QURAN_TEST_SCOPE:-all}" == navigation || "${QURAN_TEST_SCOPE:-all}" == displays || "${QURAN_TEST_SCOPE:-all}" == audio ]]; then
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "Main.overview.hide(); true"
    sleep 0.3
else
    gjs -m "$PROJECT/tests/shell-client.js"
fi
if [[ "${QURAN_TEST_SCOPE:-all}" == displays ]]; then
    gjs -m "$PROJECT/tests/multi-monitor-client.js"
elif [[ "${QURAN_TEST_SCOPE:-all}" == audio ]]; then
    gjs -m "$PROJECT/tests/audio-shell-client.js"
else
    gjs -m "$PROJECT/tests/navigation-search-client.js"
fi
if [[ "${QURAN_TEST_SCOPE:-all}" == all ]]; then gjs -m "$PROJECT/tests/audio-shell-client.js"; fi
export WAYLAND_DISPLAY=wayland-0
cd "$PROJECT"
GI_TYPELIB_PATH="/usr/lib/gnome-shell/girepository-1.0${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}" gjs -m "$PROJECT/tests/prefs.js"
'
