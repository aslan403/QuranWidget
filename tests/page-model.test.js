import test from 'node:test';
import assert from 'node:assert/strict';
const page = await import('../pageModel.js').catch(() => ({}));

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
