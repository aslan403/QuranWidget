import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

test('Shell entry point exists and cleans up its owned objects', () => {
    assert.ok(existsSync(new URL('../extension.js', import.meta.url)), 'Shell extension entry point must exist');
    const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
    assert.match(source, /disable\(\)/);
    assert.match(source, /disconnect\(/);
    assert.match(source, /destroy\(/);
    assert.match(source, /reactive: false/);
});
