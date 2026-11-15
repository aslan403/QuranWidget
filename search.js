// Search normalization is index-only. Display/source text is never rewritten.
export function asciiDigits(value) {
    return String(value ?? '').normalize('NFKC').replace(/[٠-٩۰-۹]/gu, digit =>
        String(digit.charCodeAt(0) - (digit >= '۰' ? '۰'.charCodeAt(0) : '٠'.charCodeAt(0))));
}

export function normalizeSearchText(value) {
    return String(value ?? '').normalize('NFKD').toLowerCase()
        .replace(/[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed\u08d3-\u08ff\u200b-\u200f\ufeff]/gu, '')
        .replace(/ٱ/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ء/g, '')
        .replace(/[^\p{L}\p{N}\s:]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function latinKey(value) {
    return value.replace(/[^a-z]/gu, '').replace(/([aeiou])\1+/gu, '$1').replace(/h$/u, '');
}

export class QuranSearchIndex {
    constructor(data) {
        const surahs = new Map(data.surahs.map(surah => [surah.number, surah]));
        this.ayahs = data.ayahs.map(ayah => ({
            id: `${ayah.surah}:${ayah.numberInSurah}`, kind: 'ayah', page: ayah.page, surah: ayah.surah,
            numberInSurah: ayah.numberInSurah, text: ayah.text,
            title: `${surahs.get(ayah.surah).name} · ${ayah.surah}:${ayah.numberInSurah} · Page ${ayah.page}`,
            normalized: normalizeSearchText(ayah.text),
            // A second search-only form covers Uthmani dagger-alif spellings.
            expanded: normalizeSearchText(ayah.text.replace(/و\u0670/gu, 'ا').replace(/\u0670/gu, 'ا')),
        }));
        this.byReference = new Map(this.ayahs.map(ayah => [ayah.id, ayah]));
        this.byPage = new Map();
        const counts = new Map();
        for (const ayah of data.ayahs) {
            counts.set(ayah.surah, (counts.get(ayah.surah) ?? 0) + 1);
            if (!this.byPage.has(ayah.page))
                this.byPage.set(ayah.page, {id: `page:${ayah.page}`, kind: 'page', page: ayah.page,
                    surah: ayah.surah, title: `Page ${ayah.page}`,
                    text: `${surahs.get(ayah.surah).name} · Juz ${ayah.juz}`});
        }
        this.surahs = data.surahs.map(surah => {
            const first = this.byReference.get(`${surah.number}:1`);
            return {id: `surah:${surah.number}`, kind: 'surah', surah: surah.number, page: first.page,
                title: `${surah.name} · ${surah.englishName}`,
                text: `Surah ${surah.number} · ${counts.get(surah.number)} verses · Page ${first.page}`,
                normalized: normalizeSearchText(`${surah.name} ${surah.englishName}`),
                latin: latinKey(surah.englishName.toLowerCase())};
        });
    }

    search(query, options = {}) {
        const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(50, Math.trunc(options.limit))) : 8;
        const requestedOffset = Number.isFinite(options.offset) ? Math.max(0, Math.trunc(options.offset)) : 0;
        const paginate = matches => {
            const offset = Math.min(requestedOffset, matches.length);
            const results = matches.slice(offset, offset + limit);
            return {results, total: matches.length, offset, hasMore: offset + results.length < matches.length};
        };
        if (String(query ?? '').length > 160) return paginate([]);
        const normalized = normalizeSearchText(asciiDigits(query));
        const reference = normalized.match(/^(\d{1,3})\s*:\s*(\d{1,3})$/u);
        if (reference) {
            const found = this.byReference.get(`${Number(reference[1])}:${Number(reference[2])}`);
            return paginate(found ? [found] : []);
        }
        const page = normalized.match(/^(?:(?:page|صفحه)\s+)?(\d{1,3})$/u);
        if (page) {
            const found = this.byPage.get(Number(page[1]));
            return paginate(found ? [found] : []);
        }
        const surahNumber = normalized.match(/^(?:surah|sura|سوره)\s+(\d{1,3})$/u);
        if (surahNumber) {
            const found = this.surahs.find(surah => surah.surah === Number(surahNumber[1]));
            return paginate(found ? [found] : []);
        }
        const named = normalized.replace(/^(?:surah|sura|سوره)\s+/u, '');
        const tokens = named.split(' ').filter(Boolean);
        const latin = /^[a-z\s]+$/u.test(named) ? latinKey(named) : '';
        const chapters = tokens.length ? this.surahs.filter(surah =>
            tokens.every(token => surah.normalized.includes(token)) || (latin && surah.latin.includes(latin))) : [];
        const verses = tokens.length ? this.ayahs.filter(ayah =>
            tokens.every(token => ayah.normalized.includes(token) || ayah.expanded.includes(token))) : [];
        const results = [...chapters, ...verses];
        return paginate(results);
    }
}
