# Verification

Executed on GNOME Shell 46.0 / GJS 1.80.2, with real native GTK4 / Adwaita preferences and a separate headless Wayland compositor.

## Executed checks

### Page-navigation freeze fix

- Reproduced a cold Tajweed conversion blocking the standalone GJS event loop for 157 ms, and reproduced the full Shell suite stalling on its Tajweed-night screenshot with sweeping-phase callback warnings. The normal desktop journal also contained the same callback warnings; the issue was not treated as harmless headless-test flakiness.
- Moved grayscale-mask generation, Tajweed night pixel conversion, and PNG encoding/writing to an owned, cancellable GJS subprocess. Theme changes now await a prepared asset; paint-time theme access is read-only. Prepared night cache keys include brightness and source-file revision. Cancelling a request or destroying its store stops and reaps the worker without deleting valid source PNGs.
- `npm run test:render` passed, including the new `test:responsiveness` regression: cold Madani processing had a 21 ms maximum loop gap and cold Tajweed night processing 24 ms in the recorded run. The test enforces a 100 ms maximum gap, checks persistent prepared-cache reuse and independent brightness variants, confirms original bytes are unchanged, and verifies cancellation/destruction leave no running workers.
- The previously failing full `npm run test:shell` suite passed on two consecutive fresh isolated compositor runs. Its strengthened regression exercises rapid navigation across real Tajweed pages and explicit GC; maximum measured Shell heartbeat gap was 71 ms, below its 200 ms limit. All screenshots, image-style assertions, keyboard/search tests, and native preferences passed, with no JS errors or GC callback warnings in either compositor log.
- `npm run test:displays` passed again, including rapid Tajweed dark navigation and forced GC with both display actors active, followed by a successful real two-display night screenshot. All existing display reconfiguration and preferences checks still passed.
- `npm test`: 21 Node tests and 2 Python archive tests passed. Quran source data, original images, page layout, and Tajweed colors remain unchanged.
- Rebuilt ZIP integrity and native installation passed in a private D-Bus/XDG session. All 23 runtime members, including `imageWorker.js`, matched source and installed bytes; tests, the unsafe driver, and page PNGs were excluded. `navigation-freeze-fixed.png` records both real display copies in Tajweed night mode after rapid navigation and GC.

### Multi-display update

- `npm test`: 21 Node tests and 2 Python tests passed. New tests cover primary/selected/all monitor selection, empty monitor lists, disconnected-index fallback/reconnection, negative coordinates, and fitting different portrait/landscape work areas.
- `npm run test:displays`: passed with two real virtual outputs (1440×1080 and 1024×768) in a private GNOME 46 compositor. Verified one click-through actor per logical display, independent work-area fitting, shared reading position and image store, and visibility on both displays during overview transitions.
- Used Mutter DisplayConfig temporary configurations to disable and re-enable the selected logical display, rotate an output to portrait, enable mixed display scales, and change the primary output. Pages refitted automatically; the unavailable selection was preserved rather than overwritten. The test restores its original private layout in a finally block. This exercises real compositor configuration signals, not mocked monitor arrays.
- Verified original Madani imagery on both displays using a shared decoded asset. Repeated mode changes did not leak actors; disabling destroyed all actors and reenabling restored exactly one per display.
- Native preferences passed all existing checks plus bidirectional all-display switching and disabling the irrelevant single-monitor selector. The actual Desktop tab and two-display rendering were visually inspected.
- `npm run test:navigation` and `npm run test:render` passed again after the actor-collection change. No JS errors or sweeping-phase warnings were found in the two-display compositor log. At that revision, the full graphics stress-suite timeout below remained an open issue; the navigation-freeze update above subsequently resolved it.
- Evidence: `multi-display.png` and `multi-display-preferences.png`.
- Strict schema/build and ZIP integrity passed; all 22 runtime members matched source and were installed with the native installer in a private XDG directory, then read back byte-for-byte. The installed `all-monitors` schema default is false, preserving single-display behavior until explicitly enabled.

### Navigation and offline search update

- `npm test`: 18 Node tests and 2 Python archive tests passed. New search coverage includes stable bounded pagination and exact totals, Arabic surah names and transliteration, ASCII/Arabic/Persian references, unmarked Arabic queries, and preservation of the original marked Quran text.
- `npm run test:render`: the existing native rendering checks passed, including fitting all 604 text pages, Madani cache/cancellation, colored Tajweed themes, and independent paper opacity / rounded corners.
- `npm run test:navigation`: passed in a real isolated GNOME 46 compositor with an actual Clutter virtual keyboard, not direct callback substitutes for shortcut activation. Exercises all six bindings, page boundaries, live rebinding and disabling, Arabic page input, focused native search, verse/surah/phrase matching, exact pagination totals, offscreen-result keyboard scrolling, Enter selection, Escape, preservation of the selected Mushaf, pending-search cancellation, and disable/re-enable cleanup.
- Native preferences passed: shortcut fields save valid accelerators, reject bare keys and duplicates, disable with an empty value, restore defaults, and retain the existing page, edition, theme, opacity and corner controls.
- Arabic results were visually inspected. Runtime layout assertions verify no horizontal result clipping and no dialog shrinkage on repeated searches. Focus is moved out of result actors before replacing them so Escape continues working after a focused result disappears.
- Search and shortcut-preferences screenshots are `search.png` and `navigation-preferences.png`.
- Strict build and ZIP integrity passed: all 22 runtime members matched source bytes, with no test driver or page-image cache. The native installer succeeded in a private XDG directory; all installed members were read back and matched the archive. All six installed shortcut schema defaults matched shared runtime/preference metadata. The focused compositor log contained no JS errors or sweeping-phase warnings.

**Resolved baseline issue:** the original full `test:shell` image/screenshot stress suite timed out on its Tajweed-night screenshot and logged GJS sweeping-phase callback warnings before navigation/search integration. The navigation-freeze fix above moved image preparation out of Shell and now passes the full suite, including a rapid-navigation/GC heartbeat regression.

### Earlier appearance verification

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
- `multi-display.png`: two real virtual desktop regions showing complete page 3 images from a shared asset.
- `multi-display-preferences.png`: native Desktop tab with Displays controls and existing opacity/corner controls.
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

Only GNOME 46, Madani 1405 / Hafs and sampled Tajweed images, and the installed Noto Arabic fonts were exercised. The complete 604-entry Tajweed source tree was enumerated; only pages 1, 2, 3, 187, and 604 were downloaded/verified, not the whole Tajweed collection. Actual Shell tests switch between editions and exercise Tajweed page 604; native preferences assert the exact Arabic selector label and persistence. Multiple virtual outputs and live logical reconfiguration were exercised, but physical cable/dock hotplug, interactions with third-party desktop-icon extensions, other GNOME releases, other Mushaf styles, audio, translation, and touch gestures remain outside this implementation/test matrix.

These source-data and image checks establish structural completeness and preservation, not independent scholarly certification. See `../data/SOURCE.md` and `../data/MADANI-SOURCE.md`. First use of an uncached Madani image requires internet; the transparent-text layout remains fully bundled/offline.
