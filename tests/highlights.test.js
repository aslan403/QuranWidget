import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pageContent} from '../model.js';
const data=JSON.parse(readFileSync(new URL('../data/quran.json',import.meta.url)));
test('verse highlight byte ranges preserve original Arabic, diacritics, BOM and markers',()=>{
    const content=pageContent(data,1);
    assert.ok(Array.isArray(content.sections[0].verses));
    for(const section of content.sections){
        const bytes=new TextEncoder().encode(section.text);
        for(const range of section.verses){
            const original=data.ayahs.find(a=>a.number===range.number);
            const selected=new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.slice(range.startByte,range.endByte));
            assert.ok(selected.startsWith(original.text));
            assert.ok(selected.endsWith('﴾'));
        }
    }
});
