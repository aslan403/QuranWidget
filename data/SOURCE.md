# Offline Quran data: source, attribution, and validation

## Provenance

Research began with choubari/Awesome-Muslims. Its README links Quran.com API, Quran API Multi, Quran JSON (semarketir/quranjson), and Tanzil Quranic Fonts as Quran-development resources. The Awesome-Muslims list is a discovery aid, not the supplier or license for the bundled Quran text.[1]

`quran.json` was downloaded from the complete AlQuran Cloud API endpoint:

<https://api.alquran.cloud/v1/quran/quran-uthmani>

Retrieval completed on **2026-11-15**, over HTTPS with certificate verification enabled, with **HTTP 200** and API response `code: 200`, `status: "OK"`. The actual API response, not example data or generated text, was normalized into this file.[2]

- Provider: AlQuran Cloud / Islamic Network.[3]
- Requested and returned edition identifier: `quran-uthmani`.[2]
- Returned edition name: `القرآن الكريم برسم العثماني (uthmani)`.[2]
- Returned English edition name: `Uthmani`; language `ar`; format `text`; type `quran`.[2]
- API credits list Tanzil.net among the Quran-text suppliers. The credits page does not establish the exact Tanzil release underlying this edition; no particular Tanzil release, checksum equivalence, or independent scholarly certification is claimed here.[3]

The original HTTP response was retained in the task scratch directory, not in the distributed extension. Its SHA-256 was:

```text
0df03e1d6da4fc8138208fec1688f2b416f0dd4ebbd514179f3e5e0fbaf4195f
```

## Copyright, license, and redistribution

**Text attribution: Tanzil Project — <https://tanzil.net/>.** AlQuran Cloud lists Tanzil among its text sources; this attribution and the following restrictions are retained conservatively for offline redistribution.[3][5]

> Copyright (C) 2007-2021 Tanzil Project

Tanzil labels its Quran text with **Creative Commons Attribution 3.0** and imposes the following accompanying conditions: redistribution must leave the Quran wording intact; the text may be embedded in applications and websites with prominent Tanzil attribution and a link to Tanzil so users can track updates; its copyright notice must accompany substantial copies and derived data files. Tanzil prohibits alterations to the Quran text. Preserve this provenance file beside `quran.json`, keep the copyright attribution with distributed copies, and expose Tanzil attribution/link in the extension's About or documentation. Consult the upstream notice for the exact conditions and future changes.[5]

This is an application of the upstream attribution/restrictions, not a claim that this Quran text is covered by the extension's software license. The AlQuran Cloud site separately declares its own software MIT-licensed; that must not be confused with a blanket MIT license for all underlying Quran text or third-party content.[4]

Upstream copyright/conditions: <https://tanzil.net/docs/Text_License>.

## Data contract and text fidelity

The compact UTF-8 JSON has exactly these top-level properties:

- `source`: the HTTPS API endpoint, as a string.
- `edition`: the complete returned API edition object, not only its identifier.
- `surahs`: objects containing `number`, `name`, `englishName`.
- `ayahs`: objects containing `number`, `numberInSurah`, `surah` (integer surah number), `page`, `juz`, `text`.

Each `text` string was copied directly from the decoded source JSON. Every one of the 6,236 source/output text pairs was compared after UTF-8 encoding and matched byte-for-byte. The surrounding JSON structure and whitespace were normalized; the complete HTTP response is therefore intentionally not byte-identical to `quran.json`.

No Unicode normalization, stripping, spelling correction, diacritic processing, or added/removed basmala was performed. In particular, the source's U+FEFF at the start of the first ayah is preserved **inside its text string**, not added as a JSON-file encoding signature. The source includes basmala prefixes in some surah-opening ayah strings; consumers must not prepend another basmala automatically. Page membership is the upstream `page` field, not computed from typography. The source provides page assignments, not printed page geometry or line-by-line Mushaf layout.[2]

## Validation actually executed

Local assertions checked the fetched response, compact output, and JSON roundtrip:

| Check | Result |
| --- | --- |
| Surahs | 114, numbered consecutively 1–114 |
| Ayahs | 6,236, globally numbered consecutively 1–6,236 |
| Pages represented | All 604 integers, 1–604, with no missing pages |
| Juz represented | All 30 integers, 1–30 |
| Intra-surah verse numbering | Consecutive starting at 1 for every surah |
| Page and juz progression | Nondecreasing in canonical ayah order |
| Nonempty source text | All 6,236 ayahs |
| Source/output UTF-8 text equality | 6,236 of 6,236 |
| First / last ayah | 1:1 / 114:6 |
| Output size | 1,833,258 bytes |
| Serialization | Compact UTF-8 JSON; decoded roundtrip identical |

`quran.json` SHA-256:

```text
da86a0a15fe7a3d873908a2fd415a970ccc1fff7483d9254fc7c4314ab71c389
```

The checks establish structural completeness and preservation of the downloaded text, not an independent verse-by-verse scholarly comparison with a printed Mushaf.

## Sources

[1] https://github.com/choubari/Awesome-Muslims
[2] https://api.alquran.cloud/v1/quran/quran-uthmani
[3] https://alquran.cloud/credits
[4] https://alquran.cloud/terms-and-conditions
[5] https://tanzil.net/docs/Text_License
