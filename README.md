# Quran Desktop

A GNOME Shell **46** extension that places a Quran page on your desktop, behind application windows. Use the **قرآن** top-bar menu to navigate; the desktop page stays click-through.

## Two reading layouts

### Madani pages — Quran for Android

The default uses the **same Madani 1405 / Hafs page image source as Quran for Android**. Original line breaks, calligraphy, verse markers, and surah ornaments are preserved. The complete image is scaled proportionally, never reflowed or cropped.

Its native preferences include:

- **Light:** Quran Android’s shaded paper gradient.
- **Sepia:** its `#F8EBD5` paper color.
- **Dark:** white/gray ink on independently adjustable black/gray paper.
- **Match desktop theme:** switch between light and dark with GNOME.
- **Night text brightness:** 120–255, including the Android app’s contrast-compensation formula.
- **Night background brightness:** 0–64.
- **Classic yellow paper:** `#FFF4CB`, replacing the light gradient.
- **Page information:** surah, juz, and page number.
- Side margins, overall widget height, opacity, monitor, and placement.

This matches the **page presentation and related appearance settings**, not every feature of the Android app. Madani 1405 / Hafs and the color-coded **مصحف التجويد** edition are supported. Warsh, Qaloon, Naskh alternatives, audio, translations, verse selection, and Android navigation gestures are not implemented.

### مصحف التجويد — color-coded Tajweed

In **Reading → Page layout**, choose **Mushaf page images**, then select **مصحف التجويد** under **المصحف · Mushaf edition**. It is also selectable from the top-bar menu under **المصحف · Mushaf**. This is a separate page edition, not a Light / Sepia / Dark theme.

Tajweed uses original colored PNGs from a pinned 604-page community source associated with Quran Android's Tajweed work. Light and Sepia preserve the original colors. Dark uses the Android app's hue-preserving night matrix instead of flattening the image into a grayscale mask. Changing edition preserves your page number and keeps each edition's cache separate.

Tajweed pages download as needed from the pinned GitHub source and then work offline from cache. **The all-pages download helper below currently downloads Madani only**, not the Tajweed collection. Source, attribution limits, and tests: [data/TAJWEED-SOURCE.md](data/TAJWEED-SOURCE.md).

### Transparent text — Zclock style

The original minimal layout remains available under **Page layout → Transparent text**: warm-white Arabic typography, fine rules, and a quiet progress dial directly over your wallpaper. Its verses follow the 604-page source metadata but are **reflowed**, not fixed Mushaf images. Font, custom text color, and optional dark backdrop apply only to this layout.

Both layouts have previous/next, direct page jump, saved reading position, and optional hiding in Activities. Neither draws over the lock screen.

## Install / update

Requirements: GNOME Shell **46**, GJS with Soup 3 and GdkPixbuf, `glib-compile-schemas`, `zip`, and an Arabic-capable font for labels / transparent text (recommended: **Noto Naskh Arabic**). Python 3 is only needed for the optional full offline image download.

```sh
bash scripts/install.sh
```

Log out and back in after a first install or an update that GNOME has already loaded, then:

```sh
gnome-extensions enable quran-desktop@local
```

Or install the prebuilt archive:

```sh
gnome-extensions install --force dist/quran-desktop@local.shell-extension.zip
```

The installer does not enable the extension or replace your wallpaper. Only GNOME 46 is declared supported and exercised.

## Downloads and offline reading

**Madani images require an internet connection on first use.** Each requested page downloads over HTTPS from the Quran Android image host and is then cached under:

```text
${XDG_CACHE_HOME:-~/.cache}/quran-desktop/madani-1024-v8/
```

There are no accounts, API keys, analytics, or background polling. Cached pages work offline. If an uncached page cannot be fetched, the widget reports that it is unavailable; click the menu’s download status to retry, or switch to the fully bundled transparent-text layout. It does not silently substitute a differently typeset page.

To cache **all 604 pages** in advance, from this source directory:

```sh
python3 scripts/download-pages.py
```

This downloads the upstream pack (~61 MB), selects only its 604 PNG pages, verifies the version marker and image headers, and writes a per-page SHA-256 provenance manifest. No databases or arbitrary ZIP paths are extracted. Original PNG bytes are preserved. Separate local ink-mask files support theme coloring while retaining antialiasing.

Images and image caches are **not bundled in the extension ZIP or Git repository**; ownership of the page/font assets remains with their upstream owner. Source attribution and limits are documented in [data/MADANI-SOURCE.md](data/MADANI-SOURCE.md).

## Preferences

Open **Reading & appearance…** from the top-bar menu, or run:

```sh
gnome-extensions prefs quran-desktop@local
```

The **Reading** tab has page selection, layout, theme preview cards, and page configuration. The **Desktop** tab contains placement, transparency, text-only styling, and source credits. The desktop itself never consumes pointer input.

### Background transparency and rounded corners

Open **Desktop → Background & corners**:

- **Background opacity:** 0–100%. At 0%, the drawn paper is transparent; at 100%, it is solid. Quran text and Tajweed colors keep their own opacity. Default: 100%.
- **Corner radius:** 0–64 logical pixels, with smooth antialiased edges. 0 restores square corners. Default: 24 px. The radius stays consistent when resizing the desktop widget.
- **Overall opacity**, under **Size & placement**, still fades the entire widget—paper and ink together—and is independent of the paper-only setting.

Both controls apply to Madani and Tajweed page presentation. In **Transparent text** mode they style the optional **Text backdrop** when enabled; no backing is painted when it is off. Original opaque artwork inside a source PNG is still part of that image, not the configurable paper layer. Changes apply live, including theme previews.

Remove:

```sh
gnome-extensions disable quran-desktop@local
gnome-extensions uninstall quran-desktop@local
```

Uninstalling the extension does not remove the downloaded image cache.

## Develop and verify

No npm dependencies or transpilation are needed.

```sh
npm test
python3 tests/download-pages-test.py
npm run test:render
bash scripts/build.sh
bash tests/run-shell.sh
```

Native image tests require their pages to be cached or an internet connection. Shell tests seed a few images from your existing cache into **private XDG directories**, use a separate D-Bus session, and start an isolated headless compositor. They never enable the extension in your normal desktop. Their unsafe-mode helper is test-only and never packaged.

- `extension.js`: background actor, panel controls, async page loading, visibility, and lifecycle.
- `pageStore.js`: HTTPS image download, repairable disk cache, cancellation, and native PNG decoding.
- `pageModel.js`: theme colors, image fitting, and antialiased ink-mask conversion.
- `madaniRenderer.js`: fixed-layout image renderer and page furniture.
- `model.js` / `renderer.js`: original offline text model and reflowed text rendering.
- `prefs.js`: native GTK4 / Adwaita preferences.
- `scripts/download-pages.py`: optional full offline pack installer.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for executed checks and limitations.

## Credits and licensing

- **Quran for Android:** page provider, appearance settings, and visual reference — https://github.com/quran/quran_android .
- **Quran Image Generator / King Fahd Quran Complex:** original Madani page assets — https://github.com/quran/quran.com-images .
- **Zclock:** transparent-layout and desktop-layer inspiration — https://github.com/lorens-osman-dev/zclock .
- **Awesome-Muslims:** initial resource discovery — https://github.com/choubari/Awesome-Muslims .
- **Tanzil Project — https://tanzil.net/**, via AlQuran Cloud: bundled Quran text, preserved unchanged. See [data/SOURCE.md](data/SOURCE.md).

Extension code is GPL-3.0-or-later; see `LICENSE`. That software license does **not** grant ownership or a new license to third-party Quran text, fonts, or page assets. See the source-specific notices. This is an independent desktop extension, not an official Quran for Android release.
