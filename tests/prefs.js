import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const {default: Preferences} = await import('../prefs.js');
Gtk.init();
Adw.init();
const path = GLib.get_current_dir();
const [, bytes] = Gio.File.new_for_path(`${path}/metadata.json`).load_contents(null);
const metadata = JSON.parse(new TextDecoder().decode(bytes));
metadata.dir = Gio.File.new_for_path(path);
metadata.path = path;
const prefs = new Preferences(metadata);
const settings = prefs.getSettings();
const window = new Adw.PreferencesWindow();
prefs.fillPreferencesWindow(window);
const descendants = [];
function walk(widget) {
    descendants.push(widget);
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        walk(child);
}
walk(window);
function expect(condition, message) {
    if (!condition) throw new Error(message);
    print(`PASS: ${message}`);
}
const spins = descendants.filter(widget => widget instanceof Gtk.SpinButton);
expect(spins.length === 11, 'native preferences contain all eleven numeric controls');
const allDisplays = descendants.find(widget => widget instanceof Adw.SwitchRow && widget.title === 'Show on all displays');
const monitorRow = descendants.find(widget => widget instanceof Adw.ActionRow && widget.title === 'Monitor');
expect(Boolean(allDisplays && monitorRow), 'native preferences expose all-display mode and single-monitor selection');
allDisplays.active = true;
expect(settings.get_boolean('all-monitors') && !monitorRow.sensitive, 'all-display switch saves settings and disables irrelevant monitor selection');
settings.set_boolean('all-monitors', false);
expect(!allDisplays.active && monitorRow.sensitive, 'single-display selection returns when all-display mode is disabled');
const backgroundOpacity = spins.find(widget => widget.name === 'background-opacity');
const cornerRadius = spins.find(widget => widget.name === 'corner-radius');
expect(backgroundOpacity.adjustment.lower === 0 && backgroundOpacity.adjustment.upper === 100,
    'background opacity exposes the full 0–100% range');
backgroundOpacity.set_value(35);
expect(settings.get_int('background-opacity') === 35, 'background opacity control writes GSettings');
settings.set_int('background-opacity', 80);
expect(backgroundOpacity.value === 80, 'background opacity updates from GSettings');
expect(cornerRadius.adjustment.lower === 0 && cornerRadius.adjustment.upper === 64,
    'corner radius exposes square through rounded edges');
cornerRadius.set_value(36);
expect(settings.get_int('corner-radius') === 36, 'corner radius control writes GSettings');
settings.set_int('corner-radius', 24);
expect(cornerRadius.value === 24, 'corner radius updates from GSettings');
settings.set_int('background-opacity', 40);
settings.set_int('corner-radius', 36);
const pageSpin = spins.find(widget => widget.adjustment.upper === 604);
pageSpin.set_value(42);
expect(settings.get_int('page') === 42, 'native page control writes GSettings');
settings.set_int('page', 17);
expect(pageSpin.value === 17, 'GSettings changes update native page control');
const color = descendants.find(widget => widget instanceof Gtk.Entry && widget.text === '#f4f1e9');
expect(Boolean(color), 'native text-color input exists');
color.text = 'invalid';
expect(settings.get_string('text-color') === '#f4f1e9' && color.has_css_class('error'), 'invalid color is rejected');
color.text = '#abcdef';
expect(settings.get_string('text-color') === '#abcdef', 'valid color is saved');
settings.set_string('text-color', '#f4f1e9');
settings.set_int('page', 3);
const edition = descendants.find(widget => widget instanceof Adw.ComboRow && widget.name === 'mushaf-edition');
expect(Boolean(edition) && edition.model.get_string(1) === 'مصحف التجويد', 'native Mushaf selector includes the exact مصحف التجويد label');
edition.selected = 0;
expect(settings.get_string('mushaf-edition') === 'madani', 'native edition selector can return to Madani');
edition.selected = 1;
expect(settings.get_string('mushaf-edition') === 'tajweed', 'native edition selector saves Tajweed selection');
const darkButton = descendants.find(widget => widget instanceof Gtk.ToggleButton && widget.name === 'theme-dark');
expect(Boolean(darkButton), 'native page theme preview cards exist');
darkButton.active = true;
expect(settings.get_string('page-theme') === 'dark', 'Dark preview card saves page appearance');
const nightBackground = spins.find(widget => widget.name === 'night-background-brightness');
nightBackground.set_value(32);
expect(settings.get_int('night-background-brightness') === 32, 'night background control saves independent brightness');
settings.set_string('page-theme', 'automatic');
expect(!darkButton.active, 'automatic appearance clears manual color selection');
settings.set_string('page-theme', 'light');
settings.set_int('night-background-brightness', 0);
const shortcutEntry = descendants.find(widget => widget instanceof Gtk.Entry && widget.name === 'quran-next-page-entry');
const shortcutApply = descendants.find(widget => widget instanceof Gtk.Button && widget.name === 'quran-next-page-apply');
const shortcutReset = descendants.find(widget => widget instanceof Gtk.Button && widget.name === 'quran-next-page-reset');
expect(Boolean(shortcutEntry && shortcutApply && shortcutReset), 'native preferences expose editable navigation shortcuts');
const defaultShortcut = settings.get_strv('quran-next-page')[0];
shortcutEntry.text = 'a'; shortcutApply.emit('clicked');
expect(shortcutEntry.has_css_class('error') && settings.get_strv('quran-next-page')[0] === defaultShortcut,
    'bare typing keys cannot become global navigation shortcuts');
shortcutEntry.text = settings.get_strv('quran-previous-page')[0]; shortcutApply.emit('clicked');
expect(shortcutEntry.has_css_class('error') && settings.get_strv('quran-next-page')[0] === defaultShortcut,
    'duplicate Quran shortcuts are rejected');
shortcutEntry.text = '<Control><Alt>n'; shortcutApply.emit('clicked');
expect(settings.get_strv('quran-next-page')[0] === '<Control><Alt>n', 'native shortcut editor saves valid custom accelerators');
shortcutEntry.text = ''; shortcutApply.emit('clicked');
expect(settings.get_strv('quran-next-page').length === 0, 'native shortcut editor can disable an action');
shortcutReset.emit('clicked');
expect(settings.get_strv('quran-next-page')[0] === defaultShortcut && shortcutEntry.text === defaultShortcut,
    'native shortcut reset restores the default and refreshes the editor');
window.present();
// Yield the JS job queue so cached-image promises can update the preview cards.
await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
const screenshot = GLib.getenv('QURAN_TEST_ROOT') + '/preferences.png';
const [captured] = Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell/Screenshot',
    'org.gnome.Shell.Screenshot', 'Screenshot', new GLib.Variant('(bbs)', [false, false, screenshot]),
    null, Gio.DBusCallFlags.NONE, 10000, null).deep_unpack();
expect(captured, `native preferences screenshot: ${screenshot}`);
const desktop = descendants.find(widget => widget instanceof Adw.PreferencesPage && widget.title === 'Desktop');
window.set_visible_page(desktop);
await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
const styleScreenshot = GLib.getenv('QURAN_TEST_ROOT') + '/surface-style-preferences.png';
const [styleCaptured] = Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell/Screenshot',
    'org.gnome.Shell.Screenshot', 'Screenshot', new GLib.Variant('(bbs)', [false, false, styleScreenshot]),
    null, Gio.DBusCallFlags.NONE, 10000, null).deep_unpack();
expect(styleCaptured, `background and corner controls screenshot: ${styleScreenshot}`);
const navigation = descendants.find(widget => widget instanceof Adw.PreferencesPage && widget.title === 'Navigation');
window.set_visible_page(navigation);
await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
const navigationScreenshot = GLib.getenv('QURAN_TEST_ROOT') + '/navigation-preferences.png';
const [navigationCaptured] = Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell/Screenshot',
    'org.gnome.Shell.Screenshot', 'Screenshot', new GLib.Variant('(bbs)', [false, false, navigationScreenshot]),
    null, Gio.DBusCallFlags.NONE, 10000, null).deep_unpack();
expect(navigationCaptured, `navigation shortcut controls screenshot: ${navigationScreenshot}`);
window.destroy();
print('All native preferences checks passed.');
