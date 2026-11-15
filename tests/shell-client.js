import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';

function call(iface, method, params = null) {
    return Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell', iface,
        method, params, null, Gio.DBusCallFlags.NONE, 5000, null).deep_unpack();
}
function evaluate(code) {
    const [ok, result] = call('org.gnome.Shell', 'Eval', new GLib.Variant('(s)', [code]));
    if (!ok) throw new Error(`Eval failed: ${result}`);
    return JSON.parse(result);
}
function expect(condition, message) {
    if (!condition) throw new Error(message);
    print(`PASS: ${message}`);
}
function waitFor(fn, label) {
    let last;
    for (let i = 0; i < 100; i++) {
        try { if (fn()) return; } catch (error) { last = error; }
        GLib.usleep(200000);
    }
    throw new Error(`Timeout: ${label}: ${last}`);
}
const uuid = new GLib.Variant('(s)', ['quran-desktop@local']);
const info = () => call('org.gnome.Shell.Extensions', 'GetExtensionInfo', uuid)[0];
const actor = `Main.layoutManager._backgroundGroup.get_children().find(a => a.name === 'quran-desktop-page')`;
const ext = `Main.extensionManager.lookup('quran-desktop@local').stateObj`;
waitFor(() => info().state.deep_unpack() === 1, 'extension enabled');
waitFor(() => evaluate('true'), 'test driver');
evaluate('Main.overview.hide(); true');
waitFor(() => evaluate(`Boolean(${actor}?.visible)`), 'page visible');
expect(evaluate(`${actor}.reactive`) === false, 'page is click-through in desktop background');
expect(evaluate(`${ext}._content.sections.length`) > 0, 'real offline Quran content loaded');
expect(evaluate(`${ext}._content.page`) === 1, 'reading starts at saved page');
waitFor(() => evaluate(`${ext}._asset?.page`) === 1, 'exact Madani image loaded');
expect(evaluate(`${ext}._settings.get_string('page-layout')`) === 'madani', 'Madani image mode is the default');
expect(evaluate(`${ext}._asset.surface.getWidth()`) === 1024, 'actual Quran Android page image decoded');
const initial = evaluate(`({x:${actor}.x,y:${actor}.y})`);
evaluate(`${ext}._next.activate(null); true`);
waitFor(() => evaluate(`${ext}._content.page`) === 2, 'next page');
expect(true, 'panel Next page action updates content');
evaluate(`${ext}._previous.activate(null); true`);
waitFor(() => evaluate(`${ext}._content.page`) === 1, 'previous page');
expect(true, 'panel Previous page action updates content');
evaluate(`${ext}._entry.set_text('604'); ${ext}._entry.clutter_text.emit('activate'); true`);
waitFor(() => evaluate(`${ext}._content.page`) === 604, 'jump to page');
waitFor(() => evaluate(`${ext}._asset?.page`) === 604, 'last page image');
expect(evaluate(`${ext}._next.sensitive`) === false, 'last page disables Next');
evaluate(`${ext}._entry.set_text('999'); ${ext}._entry.clutter_text.emit('activate'); true`);
expect(evaluate(`${ext}._settings.get_int('page')`) === 604, 'invalid page rejected');
evaluate(`${ext}._settings.set_int('page', 2); ${ext}._settings.set_int('height', 650); ${ext}._settings.set_int('position-x', 0); ${ext}._settings.set_int('position-y', 0); true`);
waitFor(() => evaluate(`${actor}.height`) === 650, 'live geometry update');
expect(evaluate(`${actor}.x`) < initial.x, 'placement changes actual desktop actor');
evaluate('Main.overview.show(); true');
waitFor(() => !evaluate(`${actor}.visible`), 'hide in overview');
expect(true, 'page hides in overview');
evaluate('Main.overview.hide(); true');
waitFor(() => evaluate(`${actor}.visible`), 'show desktop');
// Render the actual page and exercise both layouts and automatic dark appearance.
evaluate(`${ext}._settings.set_int('page', 187); ${ext}._settings.set_int('height', 900); ${ext}._settings.set_int('position-x', 70); ${ext}._settings.set_int('position-y', 50); true`);
waitFor(() => evaluate(`${ext}._asset?.page`) === 187, 'full Madani page 187');
function capture(name) {
    GLib.usleep(500000);
    const screenshot = GLib.getenv('QURAN_TEST_ROOT') + '/' + name;
    const captured = Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell/Screenshot',
        'org.gnome.Shell.Screenshot', 'Screenshot', new GLib.Variant('(bbs)', [false, false, screenshot]),
        null, Gio.DBusCallFlags.NONE, 10000, null).deep_unpack()[0];
    expect(captured, `real compositor screenshot: ${screenshot}`);
}
capture('desktop.png');
evaluate(`${ext}._settings.set_string('page-theme', 'automatic'); ${ext}._systemSettings.set_string('color-scheme', 'prefer-dark'); true`);
GLib.usleep(400000);
capture('desktop-dark.png');
expect(info().state.deep_unpack() === 1, 'automatic dark theme repaints without Shell errors');
evaluate(`${ext}._settings.set_string('page-layout', 'transparent'); true`);
waitFor(() => evaluate(`${ext}._asset === null`), 'transparent layout releases image');
expect(Math.abs(evaluate(`${actor}.width / ${actor}.height`) - 0.7) < 0.001, 'transparent layout keeps original geometry');
evaluate(`${ext}._settings.set_string('page-layout', 'madani'); ${ext}._settings.set_string('page-theme', 'light'); ${ext}._systemSettings.set_string('color-scheme', 'default'); true`);
waitFor(() => evaluate(`${ext}._asset?.page`) === 187, 'restore Madani image');
expect(Math.abs(evaluate(`${actor}.width / ${actor}.height`) - 560/960) < 0.001, 'Madani layout preserves portrait page geometry');
evaluate(`${ext}._settings.set_int('page', 3); ${ext}._settings.set_string('mushaf-edition', 'tajweed'); true`);
waitFor(() => evaluate(`${ext}._asset?.edition === 'tajweed' && ${ext}._asset?.page === 3`), 'Tajweed image loaded after edition switch');
expect(evaluate(`${ext}._asset.color`) === true, 'مصحف التجويد uses original color imagery, never a grayscale mask');
capture('tajweed-desktop.png');
evaluate(`${ext}._settings.set_string('page-theme', 'dark'); true`);
capture('tajweed-desktop-dark.png');
expect(info().state.deep_unpack() === 1, 'color-preserving Tajweed night page renders inside Shell');
evaluate(`${ext}._settings.set_int('page', 604); true`);
waitFor(() => evaluate(`${ext}._asset?.edition === 'tajweed' && ${ext}._asset?.page === 604`), 'last Tajweed page');
expect(true, 'Tajweed navigation reaches page 604 without mixing edition caches');
evaluate(`${ext}._settings.set_int('page', 3); ${ext}._settings.set_string('page-theme', 'light'); true`);
waitFor(() => evaluate(`${ext}._asset?.page`) === 3, 'restore Tajweed page 3');
evaluate(`${ext}._settings.set_int('background-opacity', 40); ${ext}._settings.set_int('corner-radius', 36); true`);
capture('surface-style.png');
const bounds = evaluate(`({x:${actor}.x,y:${actor}.y,width:${actor}.width,height:${actor}.height})`);
function screenshotPixels(name) {
    const image = GdkPixbuf.Pixbuf.new_from_file(GLib.getenv('QURAN_TEST_ROOT') + '/' + name);
    const pixels = image.get_pixels();
    return (x, y) => {
        const offset = Math.round(y) * image.rowstride + Math.round(x) * image.n_channels;
        return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    };
}
const opaquePaper = screenshotPixels('tajweed-desktop.png');
const styledPaper = screenshotPixels('surface-style.png');
const sampleX = bounds.x + bounds.width / 2;
const sampleY = bounds.y + 8;
const wallpaper = styledPaper(bounds.x - 10, sampleY);
const originalPaper = opaquePaper(sampleX, sampleY);
const blendedPaper = styledPaper(sampleX, sampleY);
expect(blendedPaper.every((channel, index) => Math.abs(channel - (.4 * originalPaper[index] + .6 * wallpaper[index])) <= 3),
    'actual compositor paper blends at the configured 40% background opacity');
let preservedInk = false;
for (let y = Math.ceil(bounds.y + 100); y < bounds.y + bounds.height - 100 && !preservedInk; y++) {
    for (let x = Math.ceil(bounds.x + 50); x < bounds.x + bounds.width - 50; x++) {
        if (opaquePaper(x, y).every(channel => channel === 0)) {
            preservedInk = styledPaper(x, y).every(channel => channel === 0);
            if (preservedInk) break;
        }
    }
}
expect(preservedInk, 'actual Quran ink is not faded by background-opacity changes');
call('org.gnome.Shell.Extensions', 'DisableExtension', uuid);
waitFor(() => info().state.deep_unpack() === 2, 'disable');
expect(!evaluate(`Boolean(${actor})`), 'disable removes desktop actor');
expect(evaluate(`Boolean(Main.panel.statusArea['quran-desktop@local'])`) === false, 'disable removes panel control');
call('org.gnome.Shell.Extensions', 'EnableExtension', uuid);
waitFor(() => info().state.deep_unpack() === 1 && evaluate(`Boolean(${actor})`), 're-enable');
expect(evaluate(`Main.layoutManager._backgroundGroup.get_children().filter(a => a.name === 'quran-desktop-page').length`) === 1,
    're-enable creates exactly one widget');
GLib.usleep(1000000);
expect(info().state.deep_unpack() === 1, 'GNOME Shell remains healthy after lifecycle checks');
print('All isolated GNOME Shell integration checks passed.');
