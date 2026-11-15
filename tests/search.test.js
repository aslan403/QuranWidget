import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../data/quran.json', import.meta.url)));
const search = await import('../search.js').catch(() => ({}));

test('bounded result pages have exact totals, stable ordering, and no duplicates', () => {
    const index = new search.QuranSearchIndex(data);
    const first = index.search('الله', {limit: 3, offset: 0});
    const second = index.search('الله', {limit: 3, offset: 3});
    assert.equal(first.results.length, 3);
    assert.equal(second.results.length, 3);
    assert.ok(first.total > 6);
    assert.equal(second.total, first.total);
    assert.equal(first.hasMore, true);
    assert.equal(second.offset, 3);
    assert.equal(new Set([...first.results, ...second.results].map(item => item.id)).size, 6);
    assert.equal(index.search('الله', {offset: first.total, limit: 3}).hasMore, false);
    assert.equal(index.search('').total, 0);
    assert.equal(index.search('   ').results.length, 0);
    assert.equal(index.search('an impossible search phrase').total, 0);
});

test('surah lookup supports Arabic names, transliteration, and explicit surah numbers', () => {
    const index = new search.QuranSearchIndex(data);
    for (const query of ['الفاتحة', 'Al-Faatiha', 'fatiha', 'surah 1', 'سورة ١']) {
        const result = index.search(query).results[0];
        assert.equal(result.kind, 'surah', query);
        assert.equal(result.surah, 1, query);
        assert.equal(result.page, 1, query);
    }
    assert.equal(index.search('Baqarah').results[0].surah, 2);
});

test('verse and page references accept ASCII, Arabic, and Persian digits', () => {
    const index = new search.QuranSearchIndex(data);
    const expected = data.ayahs.find(ayah => ayah.surah === 2 && ayah.numberInSurah === 255);
    for (const query of ['2:255', '٢:٢٥٥', '۲:۲۵۵']) {
        const found = index.search(query);
        assert.equal(found.total, 1);
        assert.equal(found.results[0].page, expected.page);
        assert.equal(found.results[0].text, expected.text);
    }
    for (const query of ['604', '٦٠٤', 'page 604', 'صفحة ٦٠٤']) {
        const found = index.search(query);
        assert.equal(found.results[0].kind, 'page');
        assert.equal(found.results[0].page, 604);
    }
    for (const query of ['2:999', '0', '605', '115:1'])
        assert.equal(index.search(query).total, 0, query);
});

test('offline Arabic search tolerates Quran marks and preserves original verses', () => {
    assert.equal(typeof search.QuranSearchIndex, 'function', 'offline Quran search must exist');
    const index = new search.QuranSearchIndex(data);
    const original = data.ayahs.find(ayah => ayah.surah === 1 && ayah.numberInSurah === 2).text;
    const found = index.search('الحمد لله رب العالمين');
    const result = found.results.find(item => item.surah === 1 && item.numberInSurah === 2);
    assert.ok(result, 'unmarked Arabic finds the original marked verse');
    assert.equal(result.text, original);
    assert.equal(data.ayahs.find(ayah => ayah.surah === 1 && ayah.numberInSurah === 2).text, original);
});
