import test from 'node:test';
import assert from 'node:assert/strict';

const model = await import('../model.js').catch(() => ({}));
test('widget geometry keeps its aspect ratio and stays inside the work area', () => {
    assert.equal(typeof model.widgetBounds, 'function', 'desktop geometry must exist');
    assert.deepEqual(model.widgetBounds({x: 100, y: 30, width: 1200, height: 800}, 600, 100, 50),
        {x: 880, y: 130, width: 420, height: 600});
    const small = model.widgetBounds({x: -800, y: 0, width: 300, height: 200}, 1200, 0, 100);
    assert.equal(small.height, 200);
    assert.equal(small.width, 140);
    assert.equal(small.x, -800);
    assert.equal(small.y, 0);
});
test('page sections preserve source text, verse order, and surah boundaries', () => {
    assert.equal(typeof model.pageContent, 'function', 'page grouping must exist');
    const data = {surahs: [{number: 1, name: 'One', englishName: 'First'}, {number: 2, name: 'Two', englishName: 'Second'}], ayahs: [
        {number: 1, numberInSurah: 1, surah: 1, page: 1, juz: 1, text: 'source text A'},
        {number: 2, numberInSurah: 2, surah: 1, page: 1, juz: 1, text: 'source text B'},
        {number: 3, numberInSurah: 1, surah: 2, page: 2, juz: 1, text: 'source text C'},
    ]};
    const page = model.pageContent(data, 1);
    assert.equal(page.page, 1);
    assert.equal(page.juz, 1);
    assert.equal(page.sections.length, 1);
    assert.equal(page.sections[0].title, 'One');
    assert.equal(page.sections[0].text, 'source text A ﴿١﴾ source text B ﴿٢﴾');
    assert.equal(model.pageContent(data, 2).sections[0].title, 'Two');
    assert.equal(model.pageContent(data, 604).sections.length, 0);
});
test('numeric footer labels stay LTR while Quran text is RTL', () => {
    assert.equal(typeof model.isArabicText, 'function');
    assert.equal(model.isArabicText('001 / 604'), false);
    assert.equal(model.isArabicText('PAGE'), false);
    assert.equal(model.isArabicText('القرآن الكريم'), true);
});
test('Arabic digits preserve multi-digit page and verse numbers', () => {
    assert.equal(model.arabicNumber(604), '٦٠٤');
    assert.equal(model.arabicNumber(0), '٠');
});
test('page navigation clamps at the first and last Mushaf page', () => {
    assert.equal(typeof model.clampPage, 'function', 'page navigation must exist');
    assert.equal(model.clampPage(0), 1);
    assert.equal(model.clampPage(605), 604);
    assert.equal(model.clampPage(42), 42);
    assert.equal(model.clampPage(NaN), 1);
    assert.equal(model.clampPage(2.9), 2);
});
