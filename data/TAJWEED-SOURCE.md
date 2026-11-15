# مصحف التجويد — page source and rendering

## Source

The colored edition uses the **indexed PNG page set** in:

https://github.com/HiIAmMoot/quran-android-tajweed-page-provider

Pinned commit: `85e22a084b59fbe6b51d0ad9f090f9e0d4ceae97`.

Individual page URL pattern:

```text
https://raw.githubusercontent.com/HiIAmMoot/quran-android-tajweed-page-provider/85e22a084b59fbe6b51d0ad9f090f9e0d4ceae97/images/indexed/003.png
```

The repository tree was checked programmatically and contains exactly the consecutively named `images/indexed/001.png` through `604.png`. The page provider is linked from the Quran Android Tajweed development discussion: https://github.com/quran/quran_android/issues/439 . This is a pinned community page source, **not a claim that it is the current official Quran Android download endpoint or a newly licensed publisher edition**.

The actual PNGs for pages **1, 2, 3, 187, and 604** were retrieved successfully over HTTPS and verified locally. Those sampled images are 1340 × 1890. Page 3 SHA-256:

```text
8e1bfa08a0632af0899b11583c748addaea4e328525883d92c65e46825d3ec7b
```

Only requested pages are cached. The extension does not claim to have downloaded or independently proofread all 604 Tajweed images. The separate Madani offline pack helper does not preload Tajweed.

## Preservation

- Original colored PNG bytes remain unchanged in `quran-desktop/tajweed-85e22a0/` under the XDG cache directory.
- This cache is separate from `madani-1024-v8`; switching edition cannot reuse a monochrome Madani mask as a Tajweed page.
- Light and Sepia draw the original RGBA image, preserving its color-coded glyphs and alpha.
- Dark uses the **hue-preserving lightness transform** from Quran Android's `NightModeColorMatrix.kt`. It retains original alpha and relative color-channel ordering while turning ordinary dark text light. No new Tajweed rules, colors, verse spellings, or glyph positions are inferred.
- The full image is fit proportionally without cropping or reflowing. Page metadata labels come from the existing bundled Hafs page dataset.
- `tests/page-model.test.js` covers night-transform endpoints, retained red/blue dominance, unchanged source bytes, edition URL selection, and separate cache identities.
- `tests/tajweed-render.js` uses a real original PNG, rather than a mocked Quran page, to render the three themes. Real Shell and native preferences tests switch to Tajweed, check the Arabic selector label, exercise page 604, and capture day/night screenshots.

The inspected renderer matrix is in `app/src/main/java/com/quran/labs/androidquran/view/NightModeColorMatrix.kt` at the Quran Android reference commit recorded in `MADANI-SOURCE.md`.

## Rights and attribution limits

The source repository did not expose a top-level README or an explicit license grant for these page images in the inspected tree. Public download availability is not treated as a grant to relicense or redistribute the artwork. Full Tajweed images and derived cache files are **not packaged in Git or the extension ZIP**. They are fetched from their original pinned source for local reading. Source attribution is shown in preferences and retained here.

The extension's GPL software license is separate from the rights in Quran page artwork and publisher material. Seek clarification from the relevant rights holder before distributing full image collections or using them commercially. Screenshots illustrate the extension; they are not a licensed full-page collection. No independent scholarly certification, publisher endorsement, or affiliation is claimed.
