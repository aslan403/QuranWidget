# Madani page images and appearance reference

## Sources inspected

- Quran for Android: https://github.com/quran/quran_android , inspected commit `c94ebe12d5c5a10e72e0019e269f25599212d217`.
- Its Madani provider: `pages/madani/src/main/java/com/quran/data/page/provider/madani/MadaniPageProvider.kt` (Madani 1405, image version 8, original image base `https://android.quran.com/data/`).
- Image filenames and pack URL construction: `app/src/main/java/com/quran/labs/androidquran/util/QuranFileUtils.kt`.
- Page theme colors, ranges, gradient stops, and UI: `feature/pagetheme/src/main/`.
- Night-mode contrast compensation: `QuranSettings.java`, `getPageTextBrightness()`.
- Quran Image Generator: https://github.com/quran/quran.com-images , inspected commit `dbda5689691defc7e3b28314cc2d035ff027795c`.

The upstream image provider redirects to the current Quran app file host. The extension requests individual images at:

```text
https://files.quran.app/hafs/madani/width_1024/page001.png
…
https://files.quran.app/hafs/madani/width_1024/page604.png
```

The optional offline helper requests the same archive selected by the Android provider:

```text
https://android.quran.com/data/zips/images_1024.zip
```

It currently redirects to `https://files.quran.app/hafs/madani/zips/images_1024.zip`. Original HTTPS PNG / ZIP downloads succeeded. The retrieved archive contains the `width_1024/.v8` marker, all 604 page images, and additional databases / older version markers; **only the page PNGs are installed** by the helper.

## Preservation and local verification

The original PNGs are cached unchanged, not resampled or repainted on disk. For theme coloring, the extension derives a **separate** white-ink alpha mask, preserving original pixel geometry and grayscale antialiasing. The renderer scales the entire page proportionally without rearranging verses or cropping ornaments. Optional surrounding metadata comes from the bundled text dataset, not from a new scholarly transcription.

Executed checks covered all **604** original PNGs: complete page numbering, 1024-pixel width, permitted height, successful PNG validation, and SHA-256 equality with the local pack manifest. Original image data totals **56,620,780 bytes**. A per-page `SOURCE.json` is stored in the image cache by the full downloader.

Retrieved pack SHA-256:

```text
401b432deb2c7415818116d9b36db34c31e405f652b0206926da851943286b85
```

These establish preservation of the supplied assets, not independent scholarly certification or a guarantee that future upstream downloads have the same hash.

## Ownership, terms, and distribution

The Quran Image Generator README says its code is GPL and that its actual fonts and pages belong to the **King Fahd Quran Complex, Saudi Arabia**: https://qurancomplex.gov.sa . Quran for Android’s README separately credits the Madani image project, distinguishes code licensing from data licensing, and asks that its code and volunteered hosting not be used for profit.

The image project does **not** provide a blanket GPL grant over its fonts and pages. This extension does not claim such a grant. **Full page packs and cached originals / masks are not included in this Git repository or extension ZIP.** The application fetches page assets from their original host for the user’s local reading; the optional helper provides local offline caching. Review upstream terms and obtain appropriate permission before redistributing image packs or using them commercially. This note is provenance, not a legal determination of reuse rights.

Screenshots in `docs/` illustrate this independent extension’s local rendering; they are not a separately licensed full Quran image collection. Preserve the source credits when sharing the software. The extension is not affiliated with, endorsed by, or an official release of Quran for Android or the King Fahd Quran Complex.
