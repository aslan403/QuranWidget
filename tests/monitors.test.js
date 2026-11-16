import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../model.js';

const monitors = [{x: -1200, y: 0, width: 1200, height: 900},
    {x: 0, y: 0, width: 1920, height: 1080}];

test('display selection supports primary, explicit, and all connected logical monitors', () => {
    assert.equal(typeof model.monitorIndexes, 'function');
    assert.deepEqual(model.monitorIndexes(monitors, 1, -1, false), [1]);
    assert.deepEqual(model.monitorIndexes(monitors, 1, 0, false), [0]);
    assert.deepEqual(model.monitorIndexes(monitors, 1, 0, true), [0, 1]);
});
test('disconnected display falls back without changing the saved selection', () => {
    assert.equal(typeof model.monitorIndexes, 'function');
    assert.deepEqual(model.monitorIndexes(monitors.slice(0, 1), 0, 1, false), [0]);
    assert.deepEqual(model.monitorIndexes(monitors, 0, 1, false), [1]);
    assert.deepEqual(model.monitorIndexes([], -1, 1, true), []);
    assert.deepEqual(model.monitorIndexes(monitors, -1, 15, false), [0]);
});
test('each display uses its own logical work area and fits portrait or negative-coordinate layouts', () => {
    for (const area of [...monitors, {x: 1920, y: -640, width: 600, height: 960}]) {
        const bounds = model.widgetBounds(area, 1600, 100, 100, 560 / 960);
        assert.ok(bounds.x >= area.x && bounds.y >= area.y);
        assert.ok(bounds.x + bounds.width <= area.x + area.width + 1);
        assert.ok(bounds.y + bounds.height <= area.y + area.height + 1);
        assert.ok(Math.abs(bounds.width / bounds.height - 560 / 960) < 0.00001);
    }
});
