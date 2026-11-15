import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class QuranDesktopPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(580, 720);
        window.set_search_enabled(true);

        const page = new Adw.PreferencesPage({
            title: 'Quran Desktop',
            icon_name: 'accessories-dictionary-symbolic',
        });
        window.add(page);

        const reading = new Adw.PreferencesGroup({
            title: 'Reading',
            description: 'Page references follow the 604-page Quran. Arabic text is reflowed to fit the widget, not a scanned Mushaf page.',
        });
        page.add(reading);
        this._addSpin(reading, settings, 'page', 'Page', 'Reading page · 1–604', 1, 604);

        const appearance = new Adw.PreferencesGroup({title: 'Appearance'});
        page.add(appearance);
        this._addSpin(appearance, settings, 'height', 'Height', 'Logical pixels · 320–1600', 320, 1600, 10);
        this._addSpin(appearance, settings, 'opacity', 'Opacity', 'Percent · 20–100', 20, 100);
        this._addEntry(appearance, settings, 'font-name', 'Arabic font',
            'Installed font family, for example Noto Naskh Arabic',
            value => value.trim().length > 0,
            'Enter a non-empty font family name.');
        this._addEntry(appearance, settings, 'text-color', 'Text color',
            'Hexadecimal RGB, for example #f4f1e9',
            value => /^#[0-9a-fA-F]{6}$/.test(value),
            'Enter a color in #RRGGBB format.');
        const backdrop = new Adw.SwitchRow({
            title: 'Subtle backdrop',
            subtitle: 'Off keeps the desktop transparent behind the text',
        });
        settings.bind('show-backdrop', backdrop, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(backdrop);

        const placement = new Adw.PreferencesGroup({
            title: 'Placement',
            description: 'Positions are percentages of the available space on the selected monitor.',
        });
        page.add(placement);
        this._addSpin(placement, settings, 'position-x', 'Horizontal position', '0% left · 100% right', 0, 100);
        this._addSpin(placement, settings, 'position-y', 'Vertical position', '0% top · 100% bottom', 0, 100);
        this._addSpin(placement, settings, 'monitor', 'Monitor', '−1 primary monitor · 0–15 monitor index', -1, 15);
        const overview = new Adw.SwitchRow({
            title: 'Hide in overview',
            subtitle: 'Hide the widget while Activities is open',
        });
        settings.bind('hide-in-overview', overview, 'active', Gio.SettingsBindFlags.DEFAULT);
        placement.add(overview);
    }

    _addSpin(group, settings, key, title, subtitle, lower, upper, step = 1) {
        const row = new Adw.ActionRow({title, subtitle});
        const spin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower,
                upper,
                step_increment: step,
                page_increment: step * 10,
            }),
            numeric: true,
            digits: 0,
            valign: Gtk.Align.CENTER,
            width_chars: 5,
        });
        settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(spin);
        row.set_activatable_widget(spin);
        group.add(row);
    }

    _addEntry(group, settings, key, title, subtitle, isValid, errorMessage) {
        const row = new Adw.ActionRow({title, subtitle});
        const entry = new Gtk.Entry({
            valign: Gtk.Align.CENTER,
            width_chars: 18,
            max_width_chars: 24,
            hexpand: false,
        });
        // Read settings normally; only write complete, valid user input.
        settings.bind(key, entry, 'text', Gio.SettingsBindFlags.GET);
        entry.connect('changed', () => {
            const valid = isValid(entry.text);
            if (valid) {
                entry.remove_css_class('error');
                entry.set_tooltip_text(null);
                if (settings.get_string(key) !== entry.text)
                    settings.set_string(key, entry.text);
            } else {
                entry.add_css_class('error');
                entry.set_tooltip_text(errorMessage);
            }
        });
        row.add_suffix(entry);
        row.set_activatable_widget(entry);
        group.add(row);
    }
}
