// Per-ayah recordings: playback EOS is the verse boundary, not a guessed timer.
export const RECITERS = Object.freeze([
    Object.freeze({id: 'alafasy', name: 'Mishary Rashid Alafasy · مشاري العفاسي', folder: 'Alafasy_128kbps'}),
    Object.freeze({id: 'husary', name: 'Mahmoud Khalil Al-Husary · محمود خليل الحصري', folder: 'Husary_128kbps'}),
    Object.freeze({id: 'minshawi', name: 'Muhammad Siddiq Al-Minshawi · محمد صديق المنشاوي', folder: 'Minshawy_Murattal_128kbps'}),
]);

export function audioFilename(surah, verse) {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 ||
        !Number.isInteger(verse) || verse < 1 || verse > 286)
        throw new Error('Invalid surah or verse number');
    return `${String(surah).padStart(3,'0')}${String(verse).padStart(3,'0')}.mp3`;
}

export function audioUrl(reciter, surah, verse) {
    const source = RECITERS.find(item => item.id === reciter);
    if (!source) throw new Error('Unknown reciter');
    return `https://everyayah.com/data/${source.folder}/${audioFilename(surah,verse)}`;
}

export class RecitationIndex {
    constructor(data) {
        this.verses = data.ayahs;
        this._refs = new Map();
        this._positions = new Map();
        this._pages = new Map();
        this.verses.forEach((verse, position) => {
            this._refs.set(`${verse.surah}:${verse.numberInSurah}`, verse);
            this._positions.set(verse.number, position);
            if (!this._pages.has(verse.page)) this._pages.set(verse.page, verse);
        });
    }

    find(surah, verse) { return this._refs.get(`${surah}:${verse}`) ?? null; }
    firstOnPage(page) { return this._pages.get(page) ?? null; }

    adjacent(verse, delta) {
        const position = this._positions.get(verse?.number);
        return position === undefined ? null : this.verses[position + delta] ?? null;
    }

    next(verse, {repeat = 'none', loopPage = verse.page, continuous = true} = {}) {
        if (repeat === 'verse') return this.find(verse.surah, verse.numberInSurah);
        const next = this.adjacent(verse, 1);
        if (repeat === 'page' && (!next || next.page !== loopPage)) return this.firstOnPage(loopPage);
        if (!continuous && next?.page !== verse.page) return null;
        return next;
    }
}
