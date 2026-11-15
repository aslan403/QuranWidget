#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v gnome-extensions >/dev/null 2>&1; then
    printf 'Missing required tool: gnome-extensions\n' >&2
    exit 1
fi

bash "$ROOT/scripts/build.sh"
gnome-extensions install --force "$ROOT/dist/quran-desktop@local.shell-extension.zip"

printf '%s\n' \
    'Installed Quran Desktop for your user account.' \
    'Log out and log back in to let GNOME Shell discover the extension.' \
    'Then enable it in Extensions, or run:' \
    '  gnome-extensions enable quran-desktop@local' \
    'The installer does not enable the extension or change desktop settings.'
