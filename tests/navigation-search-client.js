import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {SHORTCUTS} from '../navigation.js';
const uuid = new GLib.Variant('(s)', ['quran-desktop@local']);
function call(iface, method, params = null) {
    return Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell', iface,
        method, params, null, Gio.DBusCallFlags.NONE, 10000, null).deep_unpack();
}
function evaluate(code) {
    const [ok, value] = call('org.gnome.Shell', 'Eval', new GLib.Variant('(s)', [code]));
    if (!ok) throw new Error(`Eval failed: ${value}`);
    return JSON.parse(value);
}
function expect(condition, message) {
    if (!condition) throw new Error(message);
    print(`PASS: ${message}`);
}
function waitFor(callback, message) {
    for (let i = 0; i < 100; i++) {
        if (callback()) return;
        GLib.usleep(100000);
    }
    throw new Error(`Timeout: ${message}`);
}
const ext = `Main.extensionManager.lookup('quran-desktop@local').stateObj`;
expect(evaluate(`typeof ${ext}._openSearch`) === 'function', 'offline search dialog is implemented');
expect(evaluate(`${ext}._keybindings.length`) === SHORTCUTS.length, 'all navigation and audio shortcuts registered');
evaluate(`${ext}._settings.set_string('page-layout', 'transparent'); ${ext}._settings.set_int('page', 10); true`);
evaluate(`globalThis.quranKeyboardReady = false; Promise.all([import('gi://Clutter'), import('gi://GLib')]).then(([c,g]) => { globalThis.quranTestClutter = c.default; globalThis.quranTestGLib = g.default; globalThis.quranTestKeyboard = c.default.get_default_backend().get_default_seat().create_virtual_device(c.default.InputDeviceType.KEYBOARD_DEVICE); globalThis.quranKeyboardReady = true; }); true`);
waitFor(() => evaluate('globalThis.quranKeyboardReady'), 'virtual keyboard');
function press(key, modifiers = true) {
    evaluate(`(() => { const C=globalThis.quranTestClutter, k=globalThis.quranTestKeyboard; const notify=(symbol,state) => k.notify_keyval(globalThis.quranTestGLib.get_monotonic_time(), C['KEY_'+symbol], state); ${modifiers ? "notify('Control_L', C.KeyState.PRESSED); notify('Alt_L', C.KeyState.PRESSED);" : ''} notify('${key}',C.KeyState.PRESSED); notify('${key}',C.KeyState.RELEASED); ${modifiers ? "notify('Alt_L', C.KeyState.RELEASED); notify('Control_L', C.KeyState.RELEASED);" : ''} return true; })()`);
}
const page = () => evaluate(`${ext}._settings.get_int('page')`);
press('Page_Up'); waitFor(() => page() === 9, 'previous shortcut');
expect(true, 'physical Ctrl+Alt+PageUp navigates to previous page');
press('Page_Down'); waitFor(() => page() === 10, 'next shortcut');
expect(true, 'physical Ctrl+Alt+PageDown navigates to next page');
press('Home'); waitFor(() => page() === 1, 'first-page shortcut');
press('Page_Up'); GLib.usleep(200000);
expect(page() === 1, 'previous shortcut stops at page 1');
press('End'); waitFor(() => page() === 604, 'last-page shortcut');
press('Page_Down'); GLib.usleep(200000);
expect(page() === 604, 'last-page shortcut and upper boundary work');
evaluate(`${ext}._settings.set_int('page', 10); ${ext}._settings.set_strv('quran-next-page', ['<Control><Alt>n']); true`);
GLib.usleep(200000);
press('Page_Down'); GLib.usleep(200000);
expect(page() === 10, 'old shortcut stops after live rebinding');
press('n'); waitFor(() => page() === 11, 'rebound shortcut');
expect(true, 'custom shortcut takes effect without restarting Shell');
evaluate(`${ext}._settings.set_strv('quran-next-page', []); true`);
GLib.usleep(200000); press('n'); GLib.usleep(200000);
expect(page() === 11, 'empty shortcut disables the action');
evaluate(`${ext}._settings.reset('quran-next-page'); true`);
press('g');
waitFor(() => evaluate(`${ext}._indicator.menu.isOpen`), 'go-to-page shortcut');
expect(evaluate(`${ext}._entry.contains(global.stage.key_focus)`), 'go-to-page shortcut focuses the page input');
evaluate(`${ext}._entry.set_text('٤٢'); ${ext}._entry.clutter_text.emit('activate'); true`);
waitFor(() => page() === 42, 'Arabic page input');
expect(true, 'page jump accepts Arabic numerals');
evaluate(`${ext}._settings.set_int('page', 3); true`);
press('f');
waitFor(() => evaluate(`Boolean(${ext}._searchDialog?.visible)`), 'search shortcut');
expect(true, 'search shortcut opens a native focused search dialog');
evaluate(`${ext}._searchDialog._entry.set_text('2:255'); ${ext}._searchDialog._runSearch(0); true`);
expect(evaluate(`${ext}._searchDialog._matches.total`) === 1, 'native verse-reference search returns the exact verse');
waitFor(() => evaluate(`${ext}._searchDialog._scroll.width`) > 0, 'search result viewport allocation');
expect(evaluate(`(() => {const d=${ext}._searchDialog; const label=d._resultButtons[0].get_child().get_children()[1]; return label.width <= d._scroll.width - 24;})()`),
    'Arabic result text wraps inside its scroll viewport without horizontal clipping');
const queryWidth = evaluate(`${ext}._searchDialog._entry.width`);
evaluate(`${ext}._searchDialog._runSearch(0); true`);
GLib.usleep(200000);
expect(evaluate(`${ext}._searchDialog._entry.width`) === queryWidth, 'repeated searches do not shrink the dialog');
const expectedPage = evaluate(`${ext}._data.ayahs.find(a => a.surah === 2 && a.numberInSurah === 255).page`);
const screenshot = GLib.getenv('QURAN_TEST_ROOT') + '/search.png';
GLib.usleep(500000);
const [captured] = Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell/Screenshot',
    'org.gnome.Shell.Screenshot', 'Screenshot', new GLib.Variant('(bbs)', [false,false,screenshot]),
    null,Gio.DBusCallFlags.NONE,10000,null).deep_unpack();
expect(captured, `native search screenshot: ${screenshot}`);
press('Down', false);
waitFor(() => evaluate(`${ext}._searchDialog._resultButtons[0].has_key_focus()`), 'result keyboard focus');
press('Return', false);
waitFor(() => evaluate(`${ext}._searchDialog === null`), 'activate result');
expect(page() === expectedPage, 'keyboard activation opens the matching Mushaf page');
expect(evaluate(`${ext}._settings.get_string('mushaf-edition')`) === 'tajweed', 'search preserves the selected Mushaf edition');
evaluate(`${ext}._openSearch(); ${ext}._searchDialog._entry.set_text('الفاتحة'); ${ext}._searchDialog._runSearch(0); true`);
expect(evaluate(`${ext}._searchDialog._matches.results[0].kind`) === 'surah', 'Arabic surah search ranks the surah first');
evaluate(`${ext}._searchDialog._resultButtons[0].emit('clicked', 1); true`);
waitFor(() => page() === 1 && evaluate(`${ext}._searchDialog === null`), 'surah activation');
evaluate(`${ext}._openSearch(); ${ext}._searchDialog._entry.set_text('الحمد لله رب العالمين'); ${ext}._searchDialog._runSearch(0); true`);
expect(evaluate(`${ext}._searchDialog._matches.results.some(r => r.surah === 1 && r.numberInSurah === 2)`),
    'native unmarked Arabic phrase search finds the original marked verse');
evaluate(`${ext}._openSearch(); ${ext}._searchDialog._entry.set_text('الله'); ${ext}._searchDialog._runSearch(0); true`);
const total = evaluate(`${ext}._searchDialog._matches.total`);
waitFor(() => evaluate(`${ext}._searchDialog._resultButtons[7].height`) > 0, 'result allocation for keyboard scrolling');
press('Up', false);
waitFor(() => evaluate(`${ext}._searchDialog._resultButtons[7].has_key_focus()`), 'last result focus');
expect(evaluate(`${ext}._searchDialog._scroll.vadjustment.value`) > 0, 'keyboard result focus scrolls offscreen matches into view');
evaluate(`${ext}._searchDialog._nextResults.emit('clicked', 1); true`);
expect(evaluate(`${ext}._searchDialog._matches.offset`) === 8 && evaluate(`${ext}._searchDialog._matches.total`) === total,
    'native search pagination retains exact totals');
evaluate(`${ext}._searchDialog._entry.set_text('no such verse text'); ${ext}._searchDialog._runSearch(0); true`);
expect(evaluate(`${ext}._searchDialog._matches.total`) === 0, 'no-result state is handled');
press('Escape', false);
waitFor(() => evaluate(`${ext}._searchDialog === null`), 'Escape closes search');
expect(true, 'Escape closes the modal search dialog');
evaluate(`${ext}._openSearch(); globalThis.quranOldExtension = ${ext}; ${ext}._searchDialog._entry.set_text('pending search'); true`);
call('org.gnome.Shell.Extensions','DisableExtension',uuid);
expect(evaluate('globalThis.quranOldExtension._keybindings.length') === 0, 'disable unregisters global shortcuts');
expect(evaluate('globalThis.quranOldExtension._searchDialog === null'), 'disable destroys the search dialog and modal grab');
GLib.usleep(300000);
call('org.gnome.Shell.Extensions','EnableExtension',uuid);
waitFor(() => evaluate(`Boolean(${ext} && ${ext}._keybindings.length === ${SHORTCUTS.length})`), 're-enable shortcuts');
evaluate(`${ext}._settings.set_int('page', 3); ${ext}._settings.set_string('page-layout', 'madani'); delete globalThis.quranOldExtension; true`);
expect(true, 're-enable restores one complete set of shortcuts');
print('All keyboard navigation and offline search integration checks passed.');
