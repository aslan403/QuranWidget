# Recitation and verse-highlight sources

## Playback

This extension is an independent desktop implementation, not an official Quran for Android release. Its controls follow the verse-by-verse workflow: start from the visible page or an explicit `surah:verse`, pause/resume, previous/next verse, repeat a verse/page, and optionally follow page changes. GStreamer playbin3 runs in a persistent owned system-Python/PyGObject process because its gapless preparation callback runs on a streaming thread, not the GJS main thread. Two future clips are cached ahead and queued without restarting the output. Highlight changes use the sink segment's running time and actual pipeline clock/latency, not preparation callbacks, guessed verse timers or fabricated timestamps. Original clip bytes, silence and recitation are unchanged: no trimming, crossfade, overlap or extra basmalah is inserted. Slow uncached downloads may still starve the queue; this is not word-level synchronization or a single-file surah source.

Verified HTTPS reciter directories:

- Mishary Rashid Alafasy: `https://everyayah.com/data/Alafasy_128kbps/`
- Mahmoud Khalil Al-Husary: `https://everyayah.com/data/Husary_128kbps/`
- Muhammad Siddiq Al-Minshawi: `https://everyayah.com/data/Minshawy_Murattal_128kbps/`

File format is `SSSAAA.mp3`, such as `001001.mp3` and `002255.mp3`. Real `001001.mp3` samples from all three reciters were downloaded and decoded through actual GStreamer EOS using the privately installed worker and a synchronized silent sink: Alafasy 146,830 bytes, Husary 82,164 bytes, and Minshawi 79,540 bytes. Native controller tests also exercise Alafasy 1:1; the real cache preserves its bytes. The whole 6,236-file collection for every reciter was not independently audited.

Downloads occur only after explicit playback, under `${XDG_CACHE_HOME:-~/.cache}/quran-desktop/audio-v1/RECITER/`. Cached clips work offline. No account/API key, microphone, or recording is used. Enabling never autoplays. Manual page changes, changing reciter/layout/edition, locking, and disabling stop playback. Normal playback uses the desktop's GStreamer audio output. Automated tests explicitly select a silent, clock-synchronized fakesink; they do not test the physical speaker/headphone path.

## Printed-page geometry

Quran Android source was inspected at commit `1552d4786a79585dedd00e34f7553bf9fa5a98ee`, particularly `MadaniPageProvider.kt` and `AyahInfoDatabaseHandler.java`. Like Android, glyph bounds are merged separately for each verse and line. Native-image coordinates are transformed with the exact image scaling and letterbox translation; Madani boxes are never stretched to fit Tajweed.

### Madani 1024

- Download: `https://files.quran.app/hafs/madani/databases/ayahinfo/ayahinfo_1024.zip`
- Extracted file: `ayahinfo_1024.db`
- Pinned database SHA-256: `30fa152370e19097ad1b4ddac2ea59a05f7ad0a4aa932b427ed87047c75cef69`
- Native image: 1024×1656; 88,246 glyph records, 6,236 verses, 604 pages.

Some original glyph records have inverted extents; the per-verse/per-line aggregates were numerically validated. Individual word bounds are not advertised as defect-free.

### Community Tajweed 1340

- Pinned source: `https://raw.githubusercontent.com/HiIAmMoot/quran-android-tajweed-page-provider/85e22a084b59fbe6b51d0ad9f090f9e0d4ceae97/glyphs.sql`
- Raw SQL SHA-256: `3376459dc9940f5f7f2ed33059d9893179890da899e2d5d783586a6dd87f98a9`
- Matching original image pin is documented in `TAJWEED-SOURCE.md`.
- Native image: 1340×1890; 83,881 glyph records, 6,236 verses, 604 pages.

The upstream SQL has a trailing-comma syntax defect. The worker does **not execute upstream SQL**: only literal ten-integer glyph rows are parsed and inserted into the extension's own SQLite schema. Source checksums and row counts are verified before use.

**Known omission:** page 604, 112:3 lacks word position 2 (`يلد`). Its recorded positions are 1,3,4,5. The extension detects this gap and refuses to draw a knowingly partial or invented image rectangle. While reciting that verse, its complete original bundled text is highlighted in the page footer instead. The menu and Audio preferences explain this fallback. No missing rectangle was guessed, and the original printed image was not altered.

Geometry is downloaded and prepared on request in an out-of-process Python 3 helper using only standard-library modules, then cached under `quran-desktop/verse-bounds-v1/`. It is not bundled. If geometry cannot be fetched or validated, audio reports the unavailable highlighting data; Transparent text can still highlight exact bundled verse ranges without any coordinate download.

## Transparent-text highlights

Pango attributes use UTF-8 byte ranges computed from the exact rendered verse strings, including original diacritics, embedded U+FEFF, and displayed verse markers. The underlying Quran text is never normalized, reconstructed, or replaced for highlighting.

## Attribution and limits

Recordings and third-party coordinate/page assets remain associated with their respective providers and rights holders. No separate redistribution license for the downloaded coordinate assets or community Tajweed repository was established. Public availability is not a claim of licensing clearance. No recordings, upstream SQL/SQLite databases, or page images are shipped in the software ZIP; the code's GPL license does not relicense those assets.

Pages 1, 3, 187 and 604 were inspected against real images; all aggregated bounds were structurally checked, but this is not a full visual audit of every verse or independent scholarly certification. Continuous boundaries were measured on a synchronized silent sink, not physical speaker hardware. Physical dock/lock and speaker variations, word-level timings, seeking, and Android media-session parity are not claimed.
