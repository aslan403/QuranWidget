import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pageContent} from '../model.js';
const data = JSON.parse(readFileSync(new URL('../data/quran.json', import.meta.url)));
test('bundled source has all 114 surahs, 6236 ayahs, and 604 populated pages', () => {
    assert.equal(data.surahs.length, 114);
    assert.equal(data.ayahs.length, 6236);
    assert.equal(new Set(data.ayahs.map(a => a.page)).size, 604);
    assert.equal(data.ayahs[0].number, 1);
    assert.equal(data.ayahs.at(-1).number, 6236);
    assert.equal(data.ayahs.at(-1).surah, 114);
    for (let page = 1; page <= 604; page++) {
        const content = pageContent(data, page);
        assert.ok(content.sections.length > 0, `Page ${page} is populated`);
        assert.ok(content.sections.every(section => section.text.length > 0));
    }
    for (const [index, ayah] of data.ayahs.entries()) {
        assert.equal(ayah.number, index + 1);
        assert.match(ayah.text, /[\u0600-\u06ff]/u);
        assert.ok(ayah.page >= 1 && ayah.page <= 604);
    }
});
