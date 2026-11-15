import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {clampPage, pageContent, widgetBounds} from './model.js';
import {drawPage} from './renderer.js';
import {drawMadaniPage} from './madaniRenderer.js';
import {MadaniPageStore} from './pageStore.js';
import {MADANI_WIDTH, MADANI_HEIGHT} from './pageModel.js';

export default class QuranDesktopExtension extends Extension {
    enable() {
        this._signals = [];
        this._generation = {active: true};
        this._settings = this.getSettings();
        this._systemSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._store = new MadaniPageStore();
        this._imagePage = 0;
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
                        status: this._imageStatus,
                    });
                } else {
                    drawPage(cr, width, height, this._content, {
                        opacity: this._settings.get_int('opacity') / 100,
                        fontName: this._settings.get_string('font-name'),
                        textColor: this._settings.get_string('text-color'),
                        showBackdrop: this._settings.get_boolean('show-backdrop'),
                    });
                }
            } finally { cr.$dispose(); }
        });
        Main.layoutManager._backgroundGroup.add_child(this._area);
        this._createMenu();
        this._connect(this._settings, 'changed', () => this._update());
        this._connect(this._systemSettings, 'changed::color-scheme', () => this._area.queue_repaint());
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
            const value = this._entry.get_text().trim();
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
        const themes = new PopupMenu.PopupSubMenuMenuItem('Page appearance');
        for (const [key, title] of [['light','Light'], ['sepia','Sepia'], ['dark','Dark'], ['automatic','Match desktop theme']])
            themes.menu.addAction(title, () => this._settings.set_string('page-theme', key));
        this._indicator.menu.addMenuItem(themes);
        this._downloadStatus = this._indicator.menu.addAction('Loading page…', () => {
            if (this._settings.get_string('page-layout') === 'madani')
                this._loadMadaniPage(this._settings.get_int('page'));
        });
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._indicator.menu.addAction('Reading & appearance…', () => this.openPreferences());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    _changePage(delta) {
        this._settings.set_int('page', clampPage(this._settings.get_int('page') + delta));
    }

    async _loadMadaniPage(page) {
        this._cancellable?.cancel();
        const cancellable = new Gio.Cancellable();
        const generation = this._generation;
        this._cancellable = cancellable;
        this._imagePage = page;
        this._asset = null;
        this._imageStatus = 'Downloading Madani page…';
        this._downloadStatus.label.set_text('Loading Madani page…');
        this._area.queue_repaint();
        const current = () => generation.active && this._generation === generation && this._cancellable === cancellable;
        try {
            const asset = await this._store.load(page, cancellable);
            if (!current()) return;
            this._asset = asset;
            this._imageStatus = '';
            this._downloadStatus.label.set_text('Madani image cached · click to reload');
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
        if (this._content.page !== page) this._content = pageContent(this._data, page);
        this._title.label.set_text(`${this._content.sections[0]?.englishName ?? 'Quran'} · Page ${page} / 604`);
        this._previous.setSensitive(page > 1);
        this._next.setSensitive(page < 604);
        this._downloadStatus.visible = madani;
        if (madani && page !== this._imagePage) {
            this._loadMadaniPage(page);
        } else if (!madani) {
            this._cancellable?.cancel();
            this._asset = null;
            this._imagePage = 0;
        }
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
