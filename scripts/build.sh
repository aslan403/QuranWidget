#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for command in glib-compile-schemas zip; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Missing required build tool: %s\n' "$command" >&2
        exit 1
    fi
done

glib-compile-schemas --strict schemas

# An explicit allowlist prevents development files and stale artifacts shipping.
files=(
    extension.js
    model.js
    renderer.js
    madaniRenderer.js
    pageModel.js
    pageStore.js
    scripts/download-pages.py
    prefs.js
    metadata.json
    schemas/*.xml
    schemas/gschemas.compiled
    data/quran.json
    data/SOURCE.md
    data/MADANI-SOURCE.md
    README.md
    LICENSE
)
for file in "${files[@]}"; do
    if [[ ! -f "$file" ]]; then
        printf 'Missing runtime file: %s\n' "$file" >&2
        exit 1
    fi
done

mkdir -p dist
archive='dist/quran-desktop@local.shell-extension.zip'
# Write a new archive; updating an existing zip could retain removed entries.
rm -f -- "$archive"
zip -q -X "$archive" "${files[@]}"
printf 'Built %s/%s\n' "$ROOT" "$archive"
