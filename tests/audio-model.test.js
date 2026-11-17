import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const audio = await import('../audioModel.js').catch(() => ({}));
const data = JSON.parse(readFileSync(new URL('../data/quran.json', import.meta.url)));

test('recitation sources use fixed HTTPS reciter paths and strict verse filenames', () => {
    assert.equal(typeof audio.audioUrl, 'function');
    assert.equal(audio.audioUrl('alafasy', 2, 255), 'https://everyayah.com/data/Alafasy_128kbps/002255.mp3');
    assert.throws(() => audio.audioUrl('../other', 2, 255));
    for (const [s,v] of [[0,1],[115,1],[1,0],[2,287],[1.5,1],['1',1]])
        assert.throws(() => audio.audioUrl('alafasy',s,v));
});
test('verse navigation follows real source order across surahs and stops at the Quran end', () => {
    assert.equal(typeof audio.RecitationIndex, 'function');
    const index = new audio.RecitationIndex(data);
    const verse = index.find(1,7);
    assert.equal(index.adjacent(verse,1).surah,2);
    assert.equal(index.adjacent(verse,1).numberInSurah,1);
    assert.equal(index.adjacent(index.find(114,6),1),null);
    assert.equal(index.adjacent(index.find(1,1),-1),null);
    assert.equal(index.find(114,7),null);
    assert.equal(index.firstOnPage(3).page,3);
    assert.equal(index.firstOnPage(605),null);
    assert.equal(index.find(2,255).text,data.ayahs.find(a=>a.surah===2 && a.numberInSurah===255).text);
});
test('repeat verse, repeat page, and stop-at-page-boundary use exact source metadata', () => {
    const index = new audio.RecitationIndex(data);
    const last = data.ayahs.filter(a=>a.page===1).at(-1);
    assert.equal(index.next(last,{repeat:'verse'}).number,last.number);
    assert.equal(index.next(last,{repeat:'page',loopPage:1}).number,index.firstOnPage(1).number);
    assert.equal(index.next(last,{continuous:false}),null);
    assert.equal(index.next(last,{continuous:true}).page,2);
});
