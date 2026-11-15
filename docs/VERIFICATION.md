# Verification

Executed on GNOME Shell 46.0 / GJS 1.80.2.

## Checks that passed

- `node --test tests/*.test.js`: 7 tests, 7 passed, 0 failed.
- `gjs -m tests/render.js`: native Cairo / Pango Arabic shaping and auto-fitting passed.
- `gjs -m tests/all-pages.js`: every one of the 604 source pages fits the available layout; zero missing glyphs with the installed Noto Naskh Arabic font. Smallest reference font: 17.75 px on page 565.
- `bash tests/run-shell.sh`: real isolated GNOME Shell 46 headless Wayland compositor. Verified offline content loading, click-through background actor, panel next/previous controls, jump to 604, invalid-page rejection, last-page boundary, live placement, overview visibility, disable cleanup and single-actor re-enable.
- Native preferences actually opened under that compositor. Verified six numeric controls, bidirectional page bindings, invalid-color rejection, and valid-color persistence.
- `bash scripts/build.sh`: strict schema compilation and archive creation passed.
- ZIP integrity checked; every archive member compared byte-for-byte against source; no test driver or test code packaged.
- `gnome-extensions install --force` succeeded in an isolated `XDG_DATA_HOME`; installed files read back and compared with source.

## Evidence

- `desktop.png`: real compositor screenshot, not a mockup.
- `preferences.png`: real native Adwaita preferences window.
- `page-1.png`, `page-2.png`, `page-187.png`, `page-604.png`: offscreen renders from the same renderer as the extension.

The private compositor test uses an unsafe-mode driver solely to access Shell Eval for assertions and screenshots. That driver is never shipped. No extension was installed or enabled in the user's normal desktop session.

Quran source completeness and preservation are structural/byte comparisons, not an independent scholarly certification. See `../data/SOURCE.md`. Unsupported GNOME versions, different fonts, real multi-monitor hotplug, and other extensions' interaction with desktop icons remain outside the exercised test matrix.
