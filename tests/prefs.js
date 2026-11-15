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
expect(spins.length === 9, 'native preferences contain all nine numeric controls');
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
const nightBackground = spins.find(widget => widget.adjustment.upper === 64);
nightBackground.set_value(32);
expect(settings.get_int('night-background-brightness') === 32, 'night background control saves independent brightness');
settings.set_string('page-theme', 'automatic');
expect(!darkButton.active, 'automatic appearance clears manual color selection');
settings.set_string('page-theme', 'light');
settings.set_int('night-background-brightness', 0);
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
window.destroy();
print('All native preferences checks passed.');
