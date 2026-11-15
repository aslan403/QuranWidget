# Quran Desktop

A GNOME Shell 46 extension that puts an Arabic Quran page directly on your wallpaper, below application windows. It is a desktop decoration, not a floating app.

## Design

Inspired by **Zclock**: transparent background, warm-white typography, fine rules, a quiet progress dial, and no persistent animation. The page is click-through; use the **قرآن** menu in the top bar to navigate.

- Offline Arabic Quran, with the source's 604-page grouping.
- Previous / next page, direct jump, and saved reading position.
- Native preferences for size, horizontal/vertical position, monitor, opacity, font, text color, and optional dark backing for busy wallpapers.
- Hides in the overview by default and never appears on the lock screen.
- No API keys, accounts, telemetry, timers, or runtime network access.

**Layout note:** These are typeset Arabic verses grouped by Mushaf page metadata, **not scanned pages or an exact 15-line Madani Mushaf facsimile**. Text reflows to fit. Font support determines how Uthmani marks appear. No translation, tafsir, or recitation is bundled.

## Install

Requirements: GNOME Shell **46**, GJS, `glib-compile-schemas`, `zip`, and an Arabic-capable font (recommended: **Noto Naskh Arabic**). Only GNOME 46 is declared supported; newer releases need their own runtime checks.

From this directory:

```sh
bash scripts/install.sh
```

Log out and back in if this is the first install, then:

```sh
gnome-extensions enable quran-desktop@local
```

Or install the prebuilt archive:

```sh
gnome-extensions install --force dist/quran-desktop@local.shell-extension.zip
```

This project does not replace your wallpaper or change your existing extensions. The install script installs the archive but does not enable it automatically.

## Read and customize

Click **قرآن** in the top bar. Choose Previous page / Next page, enter a page from 1 to 604 and press Enter, or open **Reading & appearance…**. Your current page is saved by GSettings. At either end, navigation stops rather than wrapping around.

The desktop itself stays click-through so it does not block icons or the wallpaper menu. On bright or detailed wallpapers, enable the dark backing or choose a darker text color. Increase widget height for easier reading; dense pages use a smaller font so no verses are clipped.

Open preferences directly:

```sh
gnome-extensions prefs quran-desktop@local
```

Remove:

```sh
gnome-extensions disable quran-desktop@local
gnome-extensions uninstall quran-desktop@local
```

## Develop and verify

No npm dependencies or transpilation are needed.

```sh
node --test tests/*.test.js
gjs -m tests/render.js
bash scripts/build.sh
bash tests/run-shell.sh
```

The Shell test creates private XDG directories and a separate D-Bus session, launches a **headless GNOME Shell**, and exercises the real extension without enabling anything in your everyday desktop session. It prints the scratch artifact path, including a real compositor screenshot and Shell log. Its unsafe-mode helper is test-only and is never packaged.

- `extension.js`: background actor, panel controls, visibility and lifecycle.
- `model.js`: page grouping, digits, placement, and boundary logic.
- `renderer.js`: Cairo / Pango shaping and measured page fitting.
- `prefs.js`: native Adwaita settings.
- `data/`: bundled source text and provenance.

## Credits and licensing

- Zclock by lorens-osman-dev: visual and desktop-layer inspiration. See https://github.com/lorens-osman-dev/zclock .
- Awesome-Muslims by choubari: resource discovery. See https://github.com/choubari/Awesome-Muslims .
- Quran text source, retrieval details, license, and integrity checks: **[data/SOURCE.md](data/SOURCE.md)**.

Quran text is supplied by the **Tanzil Project — https://tanzil.net/**, via AlQuran Cloud. Its wording is preserved unchanged; see the separate attribution and conditions in `data/SOURCE.md`.

Extension code is GPL-3.0-or-later; see `LICENSE`. Quran data retains its separately documented source terms. Quran text must not be casually edited or normalized. Preview images and test fixtures are not substitutes for the bundled source text.
