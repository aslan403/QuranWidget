import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const uuid = new GLib.Variant('(s)', ['quran-desktop@local']);
const ext = `Main.extensionManager.lookup('quran-desktop@local').stateObj`;
function call(iface, method, params = null) {
    return Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell', iface,
        method, params, null, Gio.DBusCallFlags.NONE, 10000, null).deep_unpack();
}
function evaluate(code) {
    const [ok, result] = call('org.gnome.Shell', 'Eval', new GLib.Variant('(s)', [code]));
    if (!ok) throw new Error(result);
    return JSON.parse(result);
}
function expect(value, label) {
    if (!value) throw new Error(label);
    print(`PASS: ${label}`);
}
function waitFor(callback, label) {
    for (let i = 0; i < 100; i++) {
        if (callback()) return;
        GLib.usleep(100000);
    }
    throw new Error(`Timeout: ${label}`);
}
function settings(code) { evaluate(`${ext}._settings.${code}; true`); }
const count = () => evaluate(`${ext}._areas.length`);
function checkBounds() {
    return evaluate(`${ext}._areas.every(a => {const r=Main.layoutManager.getWorkAreaForMonitor(a._quranMonitorIndex); return !a.reactive && a.width>0 && a.height>0 && a.x>=r.x && a.y>=r.y && a.x+a.width<=r.x+r.width+1 && a.y+a.height<=r.y+r.height+1;})`);
}
expect(evaluate('Main.layoutManager.monitors.length') === 2, 'isolated compositor has two real logical displays');
expect(evaluate(`Array.isArray(${ext}._areas)`), 'extension owns a collection of per-display actors');
settings("set_string('page-layout', 'transparent')");
expect(count() === 1, 'default remains primary-display only');
settings("set_int('monitor', 1)");
expect(evaluate(`${ext}._area._quranMonitorIndex`) === 1 && checkBounds(), 'explicit display selection uses that display work area');
settings("set_boolean('all-monitors', true)");
expect(count() === 2 && checkBounds(), 'all-displays mode creates one click-through page per logical display');
evaluate(`globalThis.quranOriginalStore=${ext}._store; globalThis.quranDestroyedAreas=0; ${ext}._areas.forEach(a => a.connect('destroy', () => globalThis.quranDestroyedAreas++)); true`);
settings("set_int('page', 187)");
expect(evaluate(`${ext}._content.page === 187 && ${ext}._store === globalThis.quranOriginalStore`), 'display copies share one reading position and image store');
settings("set_int('height', 1600)");
settings("set_int('position-x', 100)");
settings("set_int('position-y', 100)");
expect(checkBounds(), 'each page fits its own differently sized work area');
settings("set_int('height', 600)");
settings("set_int('position-x', 65)");
settings("set_int('position-y', 50)");
evaluate('Main.overview.show(); true');
waitFor(() => evaluate(`${ext}._areas.every(a => !a.visible)`), 'both pages hide in overview');
evaluate('Main.overview.hide(); true');
waitFor(() => evaluate(`${ext}._areas.every(a => a.visible)`), 'both pages return after overview');
expect(true, 'overview visibility applies to every display');

function displayCall(method, params = null) {
    return Gio.DBus.session.call_sync('org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig',
        'org.gnome.Mutter.DisplayConfig', method, params, null, Gio.DBusCallFlags.NONE, 10000, null).deep_unpack();
}
const [, physical, logical] = displayCall('GetCurrentState');
const modes = new Map(physical.map(([spec, available]) => [spec[0],
    (available.find(mode => mode[6]['is-current']?.deep_unpack()) ?? available[0])[0]]));
const original = logical.map(([x,y,scale,transform,primary,specs]) =>
    [x,y,scale,transform,primary,specs.map(spec => [spec[0],modes.get(spec[0]),{}])]);
function configure(layout) {
    const [serial] = displayCall('GetCurrentState');
    // Method 1 applies temporarily; method 0 only verifies the proposed layout.
    displayCall('ApplyMonitorsConfig', new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [serial,1,layout,{}]));
}
try {
    settings("set_boolean('all-monitors', false)");
    configure([[0,0,1,0,true,original[0][5]]]);
    waitFor(() => evaluate('Main.layoutManager.monitors.length') === 1, 'logical display removal');
    expect(count() === 1 && checkBounds() && evaluate(`${ext}._settings.get_int('monitor')`) === 1,
        'disabling selected display falls back to primary without overwriting selection');
    settings("set_boolean('all-monitors', true)");
    configure(original);
    waitFor(() => evaluate('Main.layoutManager.monitors.length') === 2 && count() === 2, 'logical display reconnection');
    expect(checkBounds(), 'reenabling a display restores its page automatically');
    const portrait = original.map((entry, index) => entry.map((value, field) => index === 1 && field === 3 ? 1 : value));
    configure(portrait);
    waitFor(() => evaluate('Main.layoutManager.monitors.some(m => m.height > m.width)'), 'portrait display rotation');
    expect(count() === 2 && checkBounds(), 'rotating a display refits its page without cropping');
    configure(original);
    const firstMode = physical.find(([spec]) => spec[0] === original[0][5][0][0])[1]
        .find(mode => mode[0] === original[0][5][0][1]);
    const scale = firstMode[5].find(value => value > 1);
    if (scale) {
        const scaled = original.map(entry => [...entry]);
        scaled[0][2] = scale;
        scaled[1][0] = Math.round(firstMode[1] / scale);
        configure(scaled);
        waitFor(() => evaluate(`Main.layoutManager.monitors.some(m => m.width === ${Math.round(firstMode[1] / scale)})`), 'display scale change');
        expect(count() === 2 && checkBounds(), 'mixed display scales use logical work areas');
        configure(original);
    } else {
        print('NOT EXERCISED: this virtual output exposes no scale above 1');
    }
    const secondPrimary = original.map((entry, index) => entry.map((value, field) => field === 4 ? index === 1 : value));
    const oldPrimary = evaluate('Main.layoutManager.primaryIndex');
    configure(secondPrimary);
    waitFor(() => evaluate('Main.layoutManager.primaryIndex') !== oldPrimary, 'Mutter primary display update');
    settings("set_boolean('all-monitors', false)");
    settings("set_int('monitor', -1)");
    waitFor(() => evaluate(`${ext}._area._quranMonitorIndex === Main.layoutManager.primaryIndex`), 'primary display change');
    expect(checkBounds(), 'primary-only mode follows a changed primary display');
} finally {
    configure(original);
}
settings("set_boolean('all-monitors', true)");
waitFor(() => count() === 2, 'restore both pages');
settings("set_string('page-layout', 'madani')");
settings("set_int('page', 3)");
waitFor(() => evaluate(`Boolean(${ext}._asset)`), 'shared Madani image load');
expect(evaluate(`${ext}._areas.length === 2 && ${ext}._asset.surface.getWidth() === 1024`) && checkBounds(),
    'original Mushaf imagery renders through both display actors using one asset');
GLib.usleep(500000);
const screenshot = GLib.getenv('QURAN_TEST_ROOT') + '/multi-display.png';
const [captured] = Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell/Screenshot',
    'org.gnome.Shell.Screenshot', 'Screenshot', new GLib.Variant('(bbs)', [false,false,screenshot]),
    null, Gio.DBusCallFlags.NONE,10000,null).deep_unpack();
expect(captured, `two-display compositor screenshot: ${screenshot}`);
for (let i = 0; i < 3; i++) {
    settings("set_boolean('all-monitors', false)");
    settings("set_boolean('all-monitors', true)");
}
expect(evaluate(`Main.layoutManager._backgroundGroup.get_children().filter(a => a.name === 'quran-desktop-page').length`) === 2,
    'repeated display-mode changes do not leak background actors');
call('org.gnome.Shell.Extensions','DisableExtension',uuid);
expect(evaluate(`Main.layoutManager._backgroundGroup.get_children().filter(a => a.name === 'quran-desktop-page').length`) === 0,
    'disable destroys every per-display actor');
expect(evaluate('globalThis.quranDestroyedAreas') === 2, 'both original actors were explicitly destroyed');
call('org.gnome.Shell.Extensions','EnableExtension',uuid);
waitFor(() => count() === 2, 're-enable on two displays');
expect(checkBounds(), 're-enable creates exactly one page per display');
settings("set_boolean('all-monitors', false)");
settings("set_int('monitor', -1)");
print('All multi-display integration checks passed.');
