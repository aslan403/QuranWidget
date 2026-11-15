import test from 'node:test';
import assert from 'node:assert/strict';
const page = await import('../pageModel.js').catch(() => ({}));

test('Tajweed is a separate color edition with an isolated pinned source', () => {
    assert.equal(typeof page.mushafEdition, 'function');
    const tajweed = page.mushafEdition('tajweed');
    assert.equal(tajweed.title, 'مصحف التجويد');
    assert.equal(tajweed.color, true);
    assert.notEqual(tajweed.cacheName, page.mushafEdition('madani').cacheName);
    assert.match(tajweed.baseUrl, /85e22a084b59fbe6b51d0ad9f090f9e0d4ceae97/);
    assert.equal(page.editionPageUrl('tajweed', 3), tajweed.baseUrl + '003.png');
    assert.equal(page.editionPageUrl('madani', 3), page.MADANI_BASE_URL + 'page003.png');
    assert.equal(page.mushafEdition('invalid').key, 'madani');
});

test('Tajweed night rendering keeps colored channels and source alpha', () => {
    assert.equal(typeof page.nightModePixels, 'function');
    const input = new Uint8Array([0,0,0,255, 255,255,255,255, 220,20,20,128, 20,40,220,255]);
    const original = input.slice();
    const output = page.nightModePixels(input, 4, 1, 16, 4, 230, 32);
    assert.deepEqual([...output.slice(0, 4)], [230,230,230,255]);
    assert.deepEqual([...output.slice(4, 8)], [32,32,32,255]);
    assert.ok(output[8] > output[9] && output[8] > output[10], 'red Tajweed marking must remain red-dominant');
    assert.equal(output[11], 128);
    assert.ok(output[14] > output[12] && output[14] > output[13], 'blue Tajweed marking must remain blue-dominant');
    assert.deepEqual(input, original);
});

test('themes match Quran Android colors and bounded night controls', () => {
    assert.equal(typeof page.resolvePageTheme, 'function');
    assert.deepEqual(page.resolvePageTheme('sepia'), {name: 'sepia', background: [248/255,235/255,213/255], ink: [0,0,0], gradient: false});
    assert.equal(page.resolvePageTheme('light').gradient, true);
    assert.deepEqual(page.resolvePageTheme('light', {oldBackground: true}).background, [1,244/255,203/255]);
    assert.equal(page.resolvePageTheme('automatic', {systemDark: true}).name, 'dark');
    assert.equal(page.resolvePageTheme('automatic', {systemDark: false}).name, 'light');
    const dark = page.resolvePageTheme('dark', {textBrightness: 999, backgroundBrightness: 999});
    assert.deepEqual(dark.background, [64/255,64/255,64/255]);
    assert.deepEqual(dark.ink, [1,1,1]);
    const compensated = page.resolvePageTheme('dark', {textBrightness: 120, backgroundBrightness: 1});
    const expected = Math.trunc(50 * Math.log1p(1) + 120) / 255;
    assert.deepEqual(compensated.ink, [expected, expected, expected]);
    assert.equal(page.resolvePageTheme('invalid').name, 'light');
});

test('ink mask preserves antialiasing and transparency without touching source', () => {
    assert.equal(typeof page.inkMask, 'function');
    const source = new Uint8Array([0,0,0,255, 128,128,128,255, 255,255,255,0]);
    const original = source.slice();
    assert.deepEqual([...page.inkMask(source, 3, 1, 12, 4)], [255,255,255,255, 255,255,255,127, 255,255,255,0]);
    assert.deepEqual(source, original);
});

test('page image fitting preserves the entire original aspect ratio', () => {
    assert.equal(typeof page.fitPageImage, 'function');
    const fit = page.fitPageImage(1024, 1656, {x: 0, y: 0, width: 512, height: 900});
    assert.deepEqual(fit, {x: 0, y: 36, width: 512, height: 828});
});

test('Madani assets have a fixed safe page name', () => {
    assert.equal(typeof page.pageFilename, 'function', 'Madani page helpers must exist');
    assert.equal(page.pageFilename(1), 'page001.png');
    assert.equal(page.pageFilename(604), 'page604.png');
    assert.equal(page.pageFilename('../oops'), 'page001.png');
});
