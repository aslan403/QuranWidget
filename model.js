export const PAGE_COUNT = 604;
export const DESIGN_WIDTH = 560;
export const DESIGN_HEIGHT = 800;

export function widgetBounds(area, requestedHeight, positionX, positionY) {
    const height = Math.max(1, Math.min(requestedHeight, area.height, area.width / 0.7));
    const width = height * 0.7;
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
    for (const ayah of ayahs) {
        let section = sections[sections.length - 1];
        if (!section || section.surah !== ayah.surah) {
            const surah = data.surahs.find(item => item.number === ayah.surah);
            section = {surah: ayah.surah, title: surah.name,
                englishName: surah.englishName, startsSurah: ayah.numberInSurah === 1, text: ''};
            sections.push(section);
        }
        section.text += `${section.text ? ' ' : ''}${ayah.text} ﴿${arabicNumber(ayah.numberInSurah)}﴾`;
    }
    return {page, juz: ayahs[0]?.juz ?? 1, sections};
}

export function clampPage(value) {
    return Number.isFinite(value) ? Math.max(1, Math.min(PAGE_COUNT, Math.trunc(value))) : 1;
}
