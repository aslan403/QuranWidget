# Verification

Executed on GNOME Shell 46.0 / GJS 1.80.2, with real native GTK4 / Adwaita preferences and a separate headless Wayland compositor.

## Executed checks

- `npm test`: 14 Node tests and 2 Python archive tests passed. Covers page boundaries, both portrait aspect ratios, complete bundled text, Arabic digits / direction, theme colors and Android contrast compensation, grayscale alpha-mask conversion, full-image fitting, safe filenames, missing-pack rejection, invalidation of stale derived masks, pinned Tajweed URLs / separate caches, and color-preserving Tajweed night pixels.
- `npm run test:render`: native Cairo / Pango text rendering, all 604 text pages fitting without missing glyphs, native Madani image decoding and caching, cancellation, and original-image rendering in Light / Sepia / Dark passed.
- Full source image pack: all 604 original PNGs validated for hashes, dimensions, and successful PNG verification. Original image data totals 56,620,780 bytes; no image pack is included in the software ZIP.
- `bash tests/run-shell.sh`: real isolated Shell loading and click-through background actor; actual 1024-pixel Madani image decoded; panel next/previous and jump to page 604; invalid page rejected; last-page boundary; live placement; overview hiding; automatic dark theme repaint; switching to transparent text and back with the appropriate aspect ratios; disable cleanup and single-actor re-enable.
- Native preferences actually opened in that compositor: eleven numeric controls, bidirectional page/background-opacity/corner-radius bindings, font/color controls, rejected invalid color, theme-preview buttons writing settings, independent night background control, and automatic appearance clearing manual selection. Real image preview cards were visually inspected after yielding the GJS promise job queue.
- `gjs -m tests/surface-style.js`: native RGBA tests verify independent paper opacity, fully opaque ink at 0% and 25% paper opacity, preserved overall-opacity behavior, consistent opacity for the text backing, square/rounded corner endpoints, and partially transparent antialiased edge pixels.
- Real compositor screenshot pixels verify 40% background blending with the wallpaper while an opaque black Quran ink pixel stays black. Native preferences exercise full 0–100% background opacity and 0–64 px corner-radius ranges and both directions of their GSettings bindings.
- Strict schema compilation and explicit-allowlist ZIP build.
- ZIP integrity checked and every archive member compared against the source; no tests, unsafe-mode driver, or full page image cache packaged.
- Native `gnome-extensions install --force` in an isolated XDG_DATA_HOME, followed by installed-file readback comparisons.

## Evidence

- `desktop.png`: real compositor rendering of Madani page 187.
- `desktop-dark.png`: same page after automatic desktop-theme matching switches it to dark.
- `preferences.png`: actual native preferences with three original-image theme cards.
- `tajweed-themes.png`: original Tajweed page 3 in Light, Sepia, and Dark; color markings retained in every theme.
- `tajweed-desktop.png`, `tajweed-desktop-dark.png`: actual compositor screenshots of the colored edition.
- `tajweed-preferences.png`: native Arabic Mushaf selector with مصحف التجويد selected.
- `surface-style.png`: actual GNOME page at 40% paper opacity with a 36 px corner radius.
- `surface-style-preferences.png`: actual Desktop tab with Background & corners controls and separate Overall opacity.
- `madani-themes.png`: same original page rendered in the three page colors, using the production renderer.
- `page-{1,2,187,604}.png`: original transparent-text renderer examples, retained to document that option.

The private compositor's unsafe-mode companion exists solely for assertions and screenshots and is never distributed. No extension was installed or enabled in the normal desktop session. Original Madani PNGs were cached locally for offline use under the user's cache directory.

## Limits

Only GNOME 46, Madani 1405 / Hafs and sampled Tajweed images, and the installed Noto Arabic fonts were exercised. The complete 604-entry Tajweed source tree was enumerated; only pages 1, 2, 3, 187, and 604 were downloaded/verified, not the whole Tajweed collection. Actual Shell tests switch between editions and exercise Tajweed page 604; native preferences assert the exact Arabic selector label and persistence. Real monitor hotplug, interactions with third-party desktop-icon extensions, other GNOME releases, other Mushaf styles, audio, translation, and touch gestures remain outside this implementation/test matrix.

These source-data and image checks establish structural completeness and preservation, not independent scholarly certification. See `../data/SOURCE.md` and `../data/MADANI-SOURCE.md`. First use of an uncached Madani image requires internet; the transparent-text layout remains fully bundled/offline.
