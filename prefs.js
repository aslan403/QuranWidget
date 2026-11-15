import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {MadaniPageStore} from './pageStore.js';
import {drawMadaniPage} from './madaniRenderer.js';
import {pageContent} from './model.js';
import {resolvePageTheme} from './pageModel.js';
import {SHORTCUTS} from './navigation.js';

export default class QuranDesktopPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const signals = [];
        const connect = (signal, callback) => signals.push(settings.connect(signal, callback));
        let store = null;
        let cancellable = new Gio.Cancellable();
        let closed = false;
        const cleanup = () => {
            if (closed) return;
            closed = true;
            cancellable.cancel();
            store?.destroy();
            for (const id of signals) settings.disconnect(id);
        };
        window.connect('close-request', () => {cleanup(); return false;});
        window.connect('unrealize', cleanup);
        window.set_default_size(660, 820);
        window.set_search_enabled(true);

        const page = new Adw.PreferencesPage({title: 'Reading', icon_name: 'accessories-dictionary-symbolic'});
        window.add(page);
        const reading = new Adw.PreferencesGroup({title: 'Quran pages',
            description: 'Choose a Mushaf edition. Original line breaks, ornaments, and Tajweed colors are preserved; pages download once and are cached locally.'});
        page.add(reading);
        this._addSpin(reading, settings, 'page', 'Page', 'Reading position · 1–604', 1, 604);
        const layout = new Adw.ComboRow({title: 'Page layout',
            subtitle: 'Original printed page or the minimal wallpaper-style text',
            model: Gtk.StringList.new(['Mushaf page images', 'Transparent text']),
            selected: settings.get_string('page-layout') === 'madani' ? 0 : 1});
        reading.add(layout);
        layout.connect('notify::selected', () => settings.set_string('page-layout', layout.selected === 0 ? 'madani' : 'transparent'));
        connect('changed::page-layout', () => {layout.selected = settings.get_string('page-layout') === 'madani' ? 0 : 1;});
        const edition = new Adw.ComboRow({name: 'mushaf-edition', title: 'المصحف · Mushaf edition',
            subtitle: 'Color-coded Tajweed is a separate edition, not a theme',
            model: Gtk.StringList.new(['المصحف المدني', 'مصحف التجويد']),
            selected: settings.get_string('mushaf-edition') === 'tajweed' ? 1 : 0});
        reading.add(edition);
        edition.connect('notify::selected', () => settings.set_string('mushaf-edition', edition.selected === 1 ? 'tajweed' : 'madani'));
        connect('changed::mushaf-edition', () => {edition.selected = settings.get_string('mushaf-edition') === 'tajweed' ? 1 : 0;});

        const previewGroup = new Adw.PreferencesGroup({title: 'Page appearance',
            description: 'Quran Android colors: shaded light paper, warm sepia, or a configurable night page.'});
        page.add(previewGroup);
        const appearance = new Adw.PreferencesGroup({title: 'Page configuration'});
        page.add(appearance);
        const cards = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, homogeneous: true,
            margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12});
        previewGroup.add(cards);
        const [, bytes] = this.dir.get_child('data').get_child('quran.json').load_contents(null);
        const data = JSON.parse(new TextDecoder().decode(bytes));
        let content = pageContent(data, settings.get_int('page'));
        let asset = null;
        const preparePreview = () => {
            if (asset?.color) asset.forTheme(resolvePageTheme('dark', {
                textBrightness: settings.get_int('night-text-brightness'),
                backgroundBrightness: settings.get_int('night-background-brightness'),
            }));
        };
        const buttons = [];
        const previews = [];
        for (const [theme, title] of [['light','Light'], ['sepia','Sepia'], ['dark','Dark']]) {
            const button = new Gtk.ToggleButton({name: `theme-${theme}`, tooltip_text: `${title} page`, hexpand: true});
            const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
            const preview = new Gtk.DrawingArea({content_width: 144, content_height: 240, hexpand: true});
            preview.set_draw_func((_area, cr, width, height) => {
                drawMadaniPage(cr, width, height, content, asset, {theme,
                    status: 'القرآن الكريم', oldBackground: settings.get_boolean('use-old-background'),
                    textBrightness: settings.get_int('night-text-brightness'),
                    backgroundBrightness: settings.get_int('night-background-brightness'),
                    backgroundOpacity: settings.get_int('background-opacity') / 100,
                    cornerRadius: settings.get_int('corner-radius') * height / settings.get_int('height')});
            });
            box.append(preview);
            box.append(new Gtk.Label({label: title, margin_bottom: 6}));
            button.set_child(box);
            button.connect('toggled', () => {
                if (button.active && settings.get_string('page-theme') !== theme) settings.set_string('page-theme', theme);
            });
            cards.append(button);
            buttons.push([button, theme]);
            previews.push(preview);
        }
        const loadPreview = () => {
            cancellable.cancel();
            store?.destroy();
            cancellable = new Gio.Cancellable();
            const request = cancellable;
            asset = null;
            content = pageContent(data, settings.get_int('page'));
            for (const preview of previews) preview.queue_draw();
            if (settings.get_string('page-layout') !== 'madani') return;
            store = new MadaniPageStore(null, settings.get_string('mushaf-edition'));
            store.load(content.page, request).then(result => {
                if (closed || request !== cancellable) return;
                asset = result;
                preparePreview();
                for (const preview of previews) preview.queue_draw();
            }).catch(error => {
                if (!closed && request === cancellable && !request.is_cancelled())
                    console.warn(`[Quran Desktop] Page preview unavailable: ${error.message}`);
            });
        };
        connect('changed::mushaf-edition', loadPreview);
        connect('changed::page', loadPreview);
        connect('changed::page-layout', loadPreview);
        loadPreview();
        const automatic = new Adw.SwitchRow({title: 'Match desktop theme',
            subtitle: 'Follow GNOME’s light / dark appearance automatically'});
        appearance.add(automatic);
        automatic.connect('notify::active', () => {
            const isAuto = settings.get_string('page-theme') === 'automatic';
            if (automatic.active !== isAuto) settings.set_string('page-theme', automatic.active ? 'automatic' : 'light');
        });
        const textBrightness = this._addSpin(appearance, settings, 'night-text-brightness', 'Night text brightness',
            'Quran Android range · 120–255', 120, 255);
        const backgroundBrightness = this._addSpin(appearance, settings, 'night-background-brightness', 'Night background brightness',
            'Black to soft gray · 0–64', 0, 64);
        const old = this._addSwitch(appearance, settings, 'use-old-background', 'Classic yellow paper',
            'Use the old #FFF4CB background instead of the light gradient');
        this._addSwitch(appearance, settings, 'show-page-info', 'Page information', 'Show surah, juz, and page number');
        this._addSpin(appearance, settings, 'page-margin', 'Page margins', 'Side margins · image aspect ratio is always preserved', 12, 56);
        const sync = () => {
            const theme = settings.get_string('page-theme');
            automatic.active = theme === 'automatic';
            for (const [button, key] of buttons) button.active = key === theme;
            textBrightness.sensitive = backgroundBrightness.sensitive = theme === 'dark' || theme === 'automatic';
            old.sensitive = theme === 'light' || theme === 'automatic';
            appearance.sensitive = previewGroup.sensitive = settings.get_string('page-layout') === 'madani';
            edition.sensitive = settings.get_string('page-layout') === 'madani';
            preparePreview();
            for (const preview of previews) preview.queue_draw();
        };
        connect('changed', sync);
        sync();

        const widget = new Adw.PreferencesPage({title: 'Desktop', icon_name: 'preferences-desktop-display-symbolic'});
        window.add(widget);
        const surfaceStyle = new Adw.PreferencesGroup({title: 'Background &amp; corners',
            description: 'Adjust the paper without fading the Quran text. Also applies to the optional transparent-text backdrop.'});
        widget.add(surfaceStyle);
        this._addSpin(surfaceStyle, settings, 'background-opacity', 'Background opacity',
            '0% transparent · 100% solid · Quran ink stays opaque', 0, 100);
        this._addSpin(surfaceStyle, settings, 'corner-radius', 'Corner radius',
            'Logical pixels · 0 square · 64 rounded · smooth edges', 0, 64, 2);
        const placement = new Adw.PreferencesGroup({title: 'Size &amp; placement', description: 'The page stays below your windows and remains click-through.'});
        widget.add(placement);
        this._addSpin(placement, settings, 'height', 'Height', 'Logical pixels · 320–1600', 320, 1600, 10);
        this._addSpin(placement, settings, 'opacity', 'Overall opacity', 'Fades both Quran ink and paper · 20–100%', 20, 100);
        this._addSpin(placement, settings, 'position-x', 'Horizontal position', '0% left · 100% right', 0, 100);
        this._addSpin(placement, settings, 'position-y', 'Vertical position', '0% top · 100% bottom', 0, 100);
        this._addSpin(placement, settings, 'monitor', 'Monitor', '−1 primary monitor · 0–15 monitor index', -1, 15);
        this._addSwitch(placement, settings, 'hide-in-overview', 'Hide in overview', 'Hide the page while Activities is open');
        const transparent = new Adw.PreferencesGroup({title: 'Transparent text only',
            description: 'These controls apply to the reflowed Zclock-style layout, not to the fixed Madani images.'});
        widget.add(transparent);
        this._addEntry(transparent, settings, 'font-name', 'Arabic font', 'For example Noto Naskh Arabic', value => value.trim().length > 0, 'Enter a font family.');
        this._addEntry(transparent, settings, 'text-color', 'Text color', '#RRGGBB', value => /^#[0-9a-fA-F]{6}$/.test(value), 'Enter a #RRGGBB color.');
        this._addSwitch(transparent, settings, 'show-backdrop', 'Text backdrop', 'Enable a dark backing; style it with Background opacity and Corner radius above');
        const sources = new Adw.PreferencesGroup({title: 'Sources &amp; offline use',
            description: 'Madani images: King Fahd Quran Complex via Quran for Android. Tajweed: pinned community page-provider images; original colors preserved. Text: Tanzil via AlQuran Cloud. Images cache as read and are not bundled. The full offline download helper currently covers Madani only. See the source-specific notices.'});
        widget.add(sources);
        sources.add(new Gtk.LinkButton({uri: 'https://github.com/quran/quran_android', label: 'Quran for Android · source and credits'}));
        sources.add(new Gtk.LinkButton({uri: 'https://github.com/HiIAmMoot/quran-android-tajweed-page-provider', label: 'مصحف التجويد · original page source'}));
        sources.add(new Gtk.LinkButton({uri: 'https://tanzil.net/', label: 'Tanzil Project · Quran text'}));

        const navigation = new Adw.PreferencesPage({title: 'Navigation', icon_name: 'input-keyboard-symbolic'});
        window.add(navigation);
        const shortcuts = new Adw.PreferencesGroup({title: 'Keyboard shortcuts',
            description: 'Enter a GTK accelerator such as &lt;Control&gt;&lt;Alt&gt;Page_Down, then click Set. Clear the field and Set to disable; the undo button restores its default. Use Ctrl, Alt, or Super to avoid stealing ordinary typing keys. System shortcut conflicts may take precedence.'});
        navigation.add(shortcuts);
        for (const shortcut of SHORTCUTS)
            this._addShortcutRow(shortcuts, settings, shortcut, connect);
        const searchHelp = new Adw.PreferencesGroup({title: 'Offline search',
            description: 'Use Search Quran in the top-bar menu, or its shortcut. Search Arabic text without diacritics, surah names (الفاتحة / fatiha), pages (604 / ٦٠٤), and references (2:255 / ٢:٢٥٥). Select a result or use Down and Enter to open its page. Escape closes search. Translations are not bundled; uncached page images may still require internet.'});
        navigation.add(searchHelp);
    }

    _addShortcutRow(group, settings, shortcut, connect) {
        const {name, title} = shortcut;
        const row = new Adw.ActionRow({title});
        const entry = new Gtk.Entry({name: `${name}-entry`, width_chars: 16, max_width_chars: 20,
            valign: Gtk.Align.CENTER, placeholder_text: 'Disabled'});
        const apply = new Gtk.Button({name: `${name}-apply`, label: 'Set', valign: Gtk.Align.CENTER});
        const reset = new Gtk.Button({name: `${name}-reset`, icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Restore default shortcut', valign: Gtk.Align.CENTER});
        const refresh = () => {
            const value = settings.get_strv(name)[0] ?? '';
            entry.text = value;
            const [ok, key, modifiers] = Gtk.accelerator_parse(value);
            row.subtitle = ok ? GLib.markup_escape_text(Gtk.accelerator_get_label(key, modifiers), -1) : 'Disabled';
            entry.remove_css_class('error');
            entry.set_tooltip_text(null);
        };
        const save = () => {
            const value = entry.text.trim();
            if (!value) {settings.set_strv(name, []); refresh(); return;}
            const [ok, key, modifiers] = Gtk.accelerator_parse(value);
            const required = Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK | Gdk.ModifierType.SUPER_MASK;
            if (!ok || !Gtk.accelerator_valid(key, modifiers) || !(modifiers & required)) {
                entry.add_css_class('error');
                entry.set_tooltip_text('Enter a valid shortcut with Ctrl, Alt, or Super, or clear the field to disable.');
                return;
            }
            const canonical = Gtk.accelerator_name(key, modifiers);
            for (const other of SHORTCUTS) {
                if (other.name === name) continue;
                for (const used of settings.get_strv(other.name)) {
                    const [valid, otherKey, otherModifiers] = Gtk.accelerator_parse(used);
                    if (valid && Gtk.accelerator_name(otherKey, otherModifiers) === canonical) {
                        entry.add_css_class('error');
                        entry.set_tooltip_text(`Already used by ${other.title}. Choose another shortcut.`);
                        return;
                    }
                }
            }
            settings.set_strv(name, [canonical]);
            refresh();
        };
        apply.connect('clicked', save);
        entry.connect('activate', save);
        reset.connect('clicked', () => {settings.reset(name); refresh();});
        connect(`changed::${name}`, refresh);
        row.add_suffix(entry);
        row.add_suffix(apply);
        row.add_suffix(reset);
        row.set_activatable_widget(entry);
        group.add(row);
        refresh();
    }

    _addSwitch(group, settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({title, subtitle});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        return row;
    }

    _addSpin(group, settings, key, title, subtitle, lower, upper, step = 1) {
        const row = new Adw.ActionRow({title, subtitle});
        const spin = new Gtk.SpinButton({name: key, adjustment: new Gtk.Adjustment({lower, upper,
            step_increment: step, page_increment: step * 10}), numeric: true, digits: 0,
        valign: Gtk.Align.CENTER, width_chars: 5});
        settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(spin);
        row.set_activatable_widget(spin);
        group.add(row);
        return row;
    }

    _addEntry(group, settings, key, title, subtitle, isValid, errorMessage) {
        const row = new Adw.ActionRow({title, subtitle});
        const entry = new Gtk.Entry({valign: Gtk.Align.CENTER, width_chars: 18, max_width_chars: 24, hexpand: false});
        settings.bind(key, entry, 'text', Gio.SettingsBindFlags.GET);
        entry.connect('changed', () => {
            if (isValid(entry.text)) {
                entry.remove_css_class('error'); entry.set_tooltip_text(null);
                if (settings.get_string(key) !== entry.text) settings.set_string(key, entry.text);
            } else {
                entry.add_css_class('error'); entry.set_tooltip_text(errorMessage);
            }
        });
        row.add_suffix(entry);
        row.set_activatable_widget(entry);
        group.add(row);
    }
}
