export const PAGE_COUNT = 604;
export const DESIGN_WIDTH = 560;
export const DESIGN_HEIGHT = 800;

export function monitorIndexes(monitors, primaryIndex, requested, all) {
    if (!monitors.length) return [];
    if (all) return monitors.map((_monitor, index) => index);
    const primary = primaryIndex >= 0 && primaryIndex < monitors.length ? primaryIndex : 0;
    return [requested >= 0 && requested < monitors.length ? requested : primary];
}

export function widgetBounds(area, requestedHeight, positionX, positionY, aspectRatio = 0.7) {
    const height = Math.max(1, Math.min(requestedHeight, area.height, area.width / aspectRatio));
    const width = height * aspectRatio;
    const fraction = value => Math.max(0, Math.min(100, value)) / 100;
    return {
        x: Math.round(area.x + (area.width - width) * fraction(positionX)),
        y: Math.round(area.y + (area.height - height) * fraction(positionY)),
        width, height,
    };
}

export function isArabicText(value) {
    return /[\u0600-\u06ff]/u.test(value);
}

export function arabicNumber(value) {
    return String(value).replace(/[0-9]/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
}

// Source text is never stripped, normalized, translated, or reconstructed.
export function pageContent(data, value) {
    const page = clampPage(value);
    const ayahs = data.ayahs.filter(ayah => ayah.page === page);
    const sections = [];
    const encoder = new TextEncoder();
    for (const ayah of ayahs) {
        let section = sections[sections.length - 1];
        if (!section || section.surah !== ayah.surah) {
            const surah = data.surahs.find(item => item.number === ayah.surah);
            section = {surah: ayah.surah, title: surah.name,
                englishName: surah.englishName, startsSurah: ayah.numberInSurah === 1, text: '', verses: []};
            sections.push(section);
        }
        const fragment = `${ayah.text} ﴿${arabicNumber(ayah.numberInSurah)}﴾`;
        const startByte = (section.verses.at(-1)?.endByte ?? 0) + (section.text ? 1 : 0);
        section.verses.push({number: ayah.number, startByte, endByte: startByte + encoder.encode(fragment).length});
        section.text += `${section.text ? ' ' : ''}${fragment}`;
    }
    return {page, juz: ayahs[0]?.juz ?? 1, sections};
}

export function clampPage(value) {
    return Number.isFinite(value) ? Math.max(1, Math.min(PAGE_COUNT, Math.trunc(value))) : 1;
}
