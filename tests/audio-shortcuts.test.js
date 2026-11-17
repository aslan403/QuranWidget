import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as navigation from '../navigation.js';

test('audio shortcuts have unique defaults and matching typed schema entries', () => {
    const audio = navigation.AUDIO_SHORTCUTS;
    assert.ok(Array.isArray(audio), 'Audio shortcut metadata is exported');
    assert.deepEqual(audio.map(item => item.name), [
        'quran-audio-toggle', 'quran-audio-stop', 'quran-audio-previous',
        'quran-audio-next', 'quran-audio-volume-up', 'quran-audio-volume-down',
    ]);
    assert.equal(new Set(navigation.SHORTCUTS.map(item => item.name)).size, navigation.SHORTCUTS.length);
    assert.equal(new Set(navigation.SHORTCUTS.map(item => item.accelerator)).size, navigation.SHORTCUTS.length);
    const schema = readFileSync(new URL('../schemas/org.gnome.shell.extensions.quran-desktop.gschema.xml', import.meta.url), 'utf8');
    for (const {name, accelerator} of audio) {
        const key = schema.match(new RegExp(`<key name="${name}" type="as">([\\s\\S]*?)</key>`));
        assert.ok(key, `${name} has a string-array setting`);
        const decoded = key[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>');
        assert.ok(decoded.includes(`['${accelerator}']`), `${name} schema default matches metadata`);
    }
});
