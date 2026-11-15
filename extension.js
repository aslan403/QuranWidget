import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {clampPage, pageContent, widgetBounds} from './model.js';
import {drawPage} from './renderer.js';
import {drawMadaniPage} from './madaniRenderer.js';
import {MadaniPageStore} from './pageStore.js';
import {MADANI_WIDTH, MADANI_HEIGHT, mushafEdition, resolvePageTheme} from './pageModel.js';
import {asciiDigits, QuranSearchIndex} from './search.js';
import {QuranSearchDialog} from './searchDialog.js';
import {SHORTCUTS} from './navigation.js';

export default class QuranDesktopExtension extends Extension {
    enable() {
        this._signals = [];
        this._keybindings = [];
        this._searchDialog = null;
        this._searchIndex = null;
        this._generation = {active: true};
        this._settings = this.getSettings();
        this._systemSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._store = new MadaniPageStore(null, this._settings.get_string('mushaf-edition'));
        this._imagePage = 0;
        this._imageEdition = null;
        this._asset = null;
        this._cancellable = null;
        this._imageStatus = 'Downloading Madani page…';
        const [ok, bytes] = this.dir.get_child('data').get_child('quran.json').load_contents(null);
        if (!ok) throw new Error('Could not read bundled Quran data');
        this._data = JSON.parse(new TextDecoder().decode(bytes));
        this._content = pageContent(this._data, this._settings.get_int('page'));
        this._area = new St.DrawingArea({
            name: 'quran-desktop-page', reactive: false, can_focus: false,
            accessible_name: 'Quran desktop page',
        });
        this._area.connect('repaint', () => {
            const cr = this._area.get_context();
            try {
                const [width, height] = this._area.get_surface_size();
                if (this._settings.get_string('page-layout') === 'madani') {
                    drawMadaniPage(cr, width, height, this._content, this._asset, {
                        theme: this._settings.get_string('page-theme'),
                        systemDark: this._systemSettings.get_string('color-scheme') === 'prefer-dark',
                        textBrightness: this._settings.get_int('night-text-brightness'),
                        backgroundBrightness: this._settings.get_int('night-background-brightness'),
                        oldBackground: this._settings.get_boolean('use-old-background'),
                        showPageInfo: this._settings.get_boolean('show-page-info'),
                        margin: this._settings.get_int('page-margin'),
                        opacity: this._settings.get_int('opacity') / 100,
                        backgroundOpacity: this._settings.get_int('background-opacity') / 100,
                        cornerRadius: this._settings.get_int('corner-radius'),
                        status: this._imageStatus,
                    });
                } else {
                    drawPage(cr, width, height, this._content, {
                        opacity: this._settings.get_int('opacity') / 100,
                        fontName: this._settings.get_string('font-name'),
                        textColor: this._settings.get_string('text-color'),
                        showBackdrop: this._settings.get_boolean('show-backdrop'),
                        backgroundOpacity: this._settings.get_int('background-opacity') / 100,
                        cornerRadius: this._settings.get_int('corner-radius'),
                    });
                }
            } finally { cr.$dispose(); }
        });
        Main.layoutManager._backgroundGroup.add_child(this._area);
        this._createMenu();
        this._registerShortcuts();
        this._connect(this._settings, 'changed', () => this._update());
        this._connect(this._systemSettings, 'changed::color-scheme', () => {
            this._prepareColorPage();
            this._area.queue_repaint();
        });
        this._connect(Main.layoutManager, 'monitors-changed', () => this._update());
        this._connect(global.display, 'workareas-changed', () => this._update());
        this._connect(Main.overview, 'showing', () => this._syncVisibility());
        this._connect(Main.overview, 'hidden', () => this._syncVisibility());
        this._connect(Main.sessionMode, 'updated', () => this._syncVisibility());
        this._update();
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _createMenu() {
        this._indicator = new PanelMenu.Button(0.0, 'Quran desktop');
        this._panelLabel = new St.Label({text: 'قرآن', y_align: Clutter.ActorAlign.CENTER});
        this._indicator.add_child(this._panelLabel);
        this._title = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._indicator.menu.addMenuItem(this._title);
        this._previous = this._indicator.menu.addAction('Previous page', () => this._changePage(-1));
        this._next = this._indicator.menu.addAction('Next page', () => this._changePage(1));
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const jump = new PopupMenu.PopupBaseMenuItem({activate: false});
        jump.add_child(new St.Label({text: 'Go to page', y_align: Clutter.ActorAlign.CENTER}));
        this._entry = new St.Entry({hint_text: '1–604', can_focus: true, x_expand: true,
            accessible_name: 'Quran page number'});
        this._entry.set_width(110);
        this._entry.clutter_text.connect('activate', () => {
            const value = asciiDigits(this._entry.get_text()).trim();
            if (/^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 604) {
                this._settings.set_int('page', Number(value));
                this._indicator.menu.close();
            } else {
                this._entry.hint_text = 'Enter 1–604';
                this._entry.set_text('');
            }
        });
        jump.add_child(this._entry);
        this._indicator.menu.addMenuItem(jump);
        const editions = new PopupMenu.PopupSubMenuMenuItem('المصحف · Mushaf');
        for (const key of ['madani', 'tajweed'])
            editions.menu.addAction(mushafEdition(key).title, () => this._settings.set_string('mushaf-edition', key));
        this._indicator.menu.addMenuItem(editions);
        const themes = new PopupMenu.PopupSubMenuMenuItem('Page appearance');
        for (const [key, title] of [['light','Light'], ['sepia','Sepia'], ['dark','Dark'], ['automatic','Match desktop theme']])
            themes.menu.addAction(title, () => this._settings.set_string('page-theme', key));
        this._indicator.menu.addMenuItem(themes);
        this._downloadStatus = this._indicator.menu.addAction('Loading page…', () => {
            if (this._settings.get_string('page-layout') === 'madani')
                this._loadMadaniPage(this._settings.get_int('page'));
        });
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._indicator.menu.addAction('Search Quran…', () => this._openSearch());
        this._indicator.menu.addAction('Reading & appearance…', () => this.openPreferences());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    _changePage(delta) {
        this._settings.set_int('page', clampPage(this._settings.get_int('page') + delta));
    }

    _registerShortcuts() {
        const actions = {
            'quran-previous-page': () => this._changePage(-1),
            'quran-next-page': () => this._changePage(1),
            'quran-first-page': () => this._settings.set_int('page', 1),
            'quran-last-page': () => this._settings.set_int('page', 604),
            'quran-go-to-page': () => this._openPageJump(),
            'quran-search': () => this._openSearch(),
        };
        for (const {name} of SHORTCUTS) {
            Main.wm.addKeybinding(name, this._settings, Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL, actions[name]);
            this._keybindings.push(name);
        }
    }

    _openPageJump() {
        if (Main.sessionMode.isLocked) return;
        Main.overview.hide();
        this._indicator.menu.open();
        this._entry.set_text(String(this._settings.get_int('page')));
        this._entry.clutter_text.grab_key_focus();
        this._entry.clutter_text.set_selection(0, -1);
    }

    _openSearch() {
        if (Main.sessionMode.isLocked) return;
        if (this._searchDialog) {
            this._searchDialog._entry.clutter_text.grab_key_focus();
            return;
        }
        Main.overview.hide();
        this._indicator.menu.close();
        this._searchIndex ??= new QuranSearchIndex(this._data);
        const dialog = new QuranSearchDialog(this._searchIndex, result => {
            if (this._settings) this._settings.set_int('page', result.page);
        });
        this._searchDialog = dialog;
        dialog.connect('destroy', () => {
            if (this._searchDialog === dialog) this._searchDialog = null;
        });
        if (!dialog.open()) {
            this._searchDialog = null;
            dialog.destroy();
        }
    }

    _prepareColorPage() {
        if (!this._asset?.color) return;
        const theme = resolvePageTheme(this._settings.get_string('page-theme'), {
            systemDark: this._systemSettings.get_string('color-scheme') === 'prefer-dark',
            textBrightness: this._settings.get_int('night-text-brightness'),
            backgroundBrightness: this._settings.get_int('night-background-brightness'),
        });
        // Native decoding / disk writes must finish before the compositor paints.
        this._asset.forTheme(theme);
    }

    async _loadMadaniPage(page) {
        this._cancellable?.cancel();
        const edition = this._settings.get_string('mushaf-edition');
        const title = mushafEdition(edition).title;
        if (this._store.edition !== edition) {
            this._store.destroy();
            this._store = new MadaniPageStore(null, edition);
        }
        const cancellable = new Gio.Cancellable();
        const generation = this._generation;
        this._cancellable = cancellable;
        this._imagePage = page;
        this._imageEdition = edition;
        this._asset = null;
        this._imageStatus = `Loading ${title}…`;
        this._downloadStatus.label.set_text(`Loading ${title}…`);
        this._area.queue_repaint();
        const current = () => generation.active && this._generation === generation && this._cancellable === cancellable;
        try {
            const asset = await this._store.load(page, cancellable);
            if (!current()) return;
            this._asset = asset;
            this._prepareColorPage();
            this._imageStatus = '';
            this._downloadStatus.label.set_text(`${title} · cached · click to reload`);
            this._area.queue_repaint();
        } catch (error) {
            if (!current() || cancellable.is_cancelled()) return;
            this._imageStatus = 'Page image unavailable';
            this._downloadStatus.label.set_text('Download failed · click to retry');
            this._area.queue_repaint();
            console.warn(`[Quran Desktop] Could not load page ${page}: ${error.message}`);
        }
    }

    _update() {
        const page = this._settings.get_int('page');
        const madani = this._settings.get_string('page-layout') === 'madani';
        const edition = this._settings.get_string('mushaf-edition');
        if (this._content.page !== page) this._content = pageContent(this._data, page);
        this._title.label.set_text(`${madani ? mushafEdition(edition).title + ' · ' : ''}${this._content.sections[0]?.englishName ?? 'Quran'} · Page ${page} / 604`);
        this._previous.setSensitive(page > 1);
        this._next.setSensitive(page < 604);
        this._downloadStatus.visible = madani;
        if (madani && (page !== this._imagePage || edition !== this._imageEdition)) {
            this._loadMadaniPage(page);
        } else if (!madani) {
            this._cancellable?.cancel();
            this._asset = null;
            this._imagePage = 0;
        }
        this._prepareColorPage();
        const monitors = Main.layoutManager.monitors;
        if (monitors.length) {
            const requested = this._settings.get_int('monitor');
            const index = requested >= 0 && requested < monitors.length ? requested : Math.max(0, Main.layoutManager.primaryIndex);
            const bounds = widgetBounds(Main.layoutManager.getWorkAreaForMonitor(index),
                this._settings.get_int('height'), this._settings.get_int('position-x'),
                this._settings.get_int('position-y'), madani ? MADANI_WIDTH / MADANI_HEIGHT : 0.7);
            this._area.set_position(bounds.x, bounds.y);
            this._area.set_size(bounds.width, bounds.height);
            this._area.queue_repaint();
        }
        this._syncVisibility();
    }

    _syncVisibility() {
        this._area.visible = Main.layoutManager.monitors.length > 0 && !Main.sessionMode.isLocked &&
            !(Main.overview.visible && this._settings.get_boolean('hide-in-overview'));
    }

    disable() {
        for (const name of this._keybindings ?? []) Main.wm.removeKeybinding(name);
        this._keybindings = [];
        this._searchDialog?.close();
        this._searchDialog = null;
        this._searchIndex = null;
        if (this._generation) this._generation.active = false;
        this._cancellable?.cancel();
        this._store?.destroy();
        for (const [object, id] of this._signals ?? []) object.disconnect(id);
        this._signals = [];
        this._area?.destroy();
        this._indicator?.destroy();
        this._area = this._indicator = this._panelLabel = this._title = null;
        this._previous = this._next = this._entry = this._downloadStatus = null;
        this._settings = this._systemSettings = this._store = this._asset = null;
        this._cancellable = this._data = this._content = null;
    }
}
