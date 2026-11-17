import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {clampPage, monitorIndexes, pageContent, widgetBounds} from './model.js';
import {drawPage} from './renderer.js';
import {drawMadaniPage} from './madaniRenderer.js';
import {MadaniPageStore} from './pageStore.js';
import {MADANI_WIDTH, MADANI_HEIGHT, mushafEdition, resolvePageTheme} from './pageModel.js';
import {asciiDigits, QuranSearchIndex} from './search.js';
import {QuranSearchDialog} from './searchDialog.js';
import {SHORTCUTS} from './navigation.js';
import {RECITERS} from './audioModel.js';
import {RecitationController} from './recitationController.js';
import {CoordinateStore} from './coordinateStore.js';

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
        this._imageTheme = null;
        this._asset = null;
        this._cancellable = null;
        this._imageStatus = 'Downloading Madani page…';
        const [ok, bytes] = this.dir.get_child('data').get_child('quran.json').load_contents(null);
        if (!ok) throw new Error('Could not read bundled Quran data');
        this._data = JSON.parse(new TextDecoder().decode(bytes));
        this._content = pageContent(this._data, this._settings.get_int('page'));
        this._areas = [];
        this._area = null;
        this._coordinateStore = new CoordinateStore();
        this._coordinates = null;
        this._coordinateStatus = '';
        this._audioLayout = `${this._settings.get_string('page-layout')}/${this._settings.get_string('mushaf-edition')}`;
        this._audio = new RecitationController(this._data,() => this._onRecitationChanged(),
            (verse,cancel) => this._prepareRecitation(verse,cancel));
        this._createMenu();
        this._registerShortcuts();
        this._connect(this._settings, 'changed', () => this._update());
        this._connect(this._systemSettings, 'changed::color-scheme', () => this._update());
        this._connect(Main.layoutManager, 'monitors-changed', () => this._update());
        this._connect(global.display, 'workareas-changed', () => this._update());
        this._connect(Main.overview, 'showing', () => this._syncVisibility());
        this._connect(Main.overview, 'hidden', () => this._syncVisibility());
        this._connect(Main.sessionMode, 'updated', () => this._syncVisibility());
        this._update();
    }

    _createArea() {
        const area = new St.DrawingArea({
            name: 'quran-desktop-page', reactive: false, can_focus: false,
            accessible_name: 'Quran desktop page',
        });
        area.connect('repaint', () => {
            const cr = area.get_context();
            try {
                const [width, height] = area.get_surface_size();
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
                        activeVerse: this._audio?.active,
                        coordinates: this._coordinates,
                    });
                } else {
                    drawPage(cr, width, height, this._content, {
                        opacity: this._settings.get_int('opacity') / 100,
                        fontName: this._settings.get_string('font-name'),
                        textColor: this._settings.get_string('text-color'),
                        showBackdrop: this._settings.get_boolean('show-backdrop'),
                        activeVerse: this._audio?.active,
                        backgroundOpacity: this._settings.get_int('background-opacity') / 100,
                        cornerRadius: this._settings.get_int('corner-radius'),
                    });
                }
            } finally { cr.$dispose(); }
        });
        Main.layoutManager._backgroundGroup.add_child(area);
        return area;
    }

    _queueRepaint() {
        for (const area of this._areas) area.queue_repaint();
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
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._audioStatus = new PopupMenu.PopupMenuItem('Audio · stopped',{reactive:false});
        this._audioStatus.label.set_style('max-width: 480px;');
        this._audioStatus.label.clutter_text.set_line_wrap(true);
        this._indicator.menu.addMenuItem(this._audioStatus);
        this._audioPlay = this._indicator.menu.addAction('Play from this page',() => this._toggleRecitation());
        this._audioStop = this._indicator.menu.addAction('Stop recitation',() => this._audio.stop());
        this._audioPrevious = this._indicator.menu.addAction('Previous verse',() => this._stepRecitation(-1));
        this._audioNext = this._indicator.menu.addAction('Next verse',() => this._stepRecitation(1));
        const audioJump = new PopupMenu.PopupBaseMenuItem({activate:false});
        audioJump.add_child(new St.Label({text:'Play verse',y_align:Clutter.ActorAlign.CENTER}));
        this._audioEntry = new St.Entry({hint_text:'2:255 / ٢:٢٥٥',can_focus:true,x_expand:true,accessible_name:'Recitation verse reference'});
        this._audioEntry.set_width(180);
        this._audioEntry.clutter_text.connect('activate',() => {
            const match = asciiDigits(this._audioEntry.get_text()).trim().match(/^(\d{1,3}):(\d{1,3})$/);
            if (match && this._audio.playVerse(Number(match[1]),Number(match[2]))) this._indicator.menu.close();
            else { this._audioEntry.set_text(''); this._audioEntry.hint_text = 'Enter a valid surah:verse'; }
        });
        audioJump.add_child(this._audioEntry);
        this._indicator.menu.addMenuItem(audioJump);
        const reciters = new PopupMenu.PopupSubMenuMenuItem('Reciter');
        for (const reciter of RECITERS)
            reciters.menu.addAction(reciter.name,() => this._settings.set_string('audio-reciter',reciter.id));
        this._indicator.menu.addMenuItem(reciters);
        this._indicator.menu.addAction('Reading & appearance…', () => this.openPreferences());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    async _prepareRecitation(verse,cancel) {
        if (this._settings.get_boolean('audio-follow-page')) this._settings.set_int('page',verse.page);
        if (this._settings.get_string('page-layout') !== 'madani') {
            this._coordinates = null;
            this._coordinateStatus = '';
            return;
        }
        const edition = this._settings.get_string('mushaf-edition');
        this._coordinateStatus = 'Preparing verse bounds…';
        this._syncAudioControls();
        try {
            const [coordinates] = await Promise.all([
                this._coordinateStore.load(edition,verse.page,cancel),
                this._imagePromise ?? Promise.resolve(),
            ]);
            cancel.set_error_if_cancelled();
            if (!this._generation.active) return;
            this._coordinates = coordinates;
            const entry = coordinates.verses[`${verse.surah}:${verse.numberInSurah}`];
            this._coordinateStatus = entry?.complete ? '' : entry && verse.surah === 112 && verse.numberInSurah === 3
                ? 'Upstream bounds incomplete · full-verse footer fallback'
                : 'Verse bounds unavailable · use Transparent text for highlighting';
        } catch (error) {
            if (cancel.is_cancelled()) throw error;
            this._coordinates = null;
            this._coordinateStatus = 'Verse bounds unavailable · use Transparent text for highlighting';
            console.warn(`[Quran Desktop] Verse bounds: ${error.message}`);
        }
        this._syncAudioControls();
        this._queueRepaint();
    }

    _onRecitationChanged() {
        if (!this._generation?.active) return;
        if (this._audio.active && this._settings.get_boolean('audio-follow-page'))
            this._settings.set_int('page',this._audio.active.page);
        this._syncAudioControls();
        this._queueRepaint();
    }

    _syncAudioControls() {
        if (!this._audioStatus) return;
        const audio = this._audio;
        const reference = audio.current ? ` · ${audio.current.surah}:${audio.current.numberInSurah}` : '';
        this._audioStatus.label.set_text(audio.state === 'error' ? `Audio error · ${audio.error.slice(0,150)}`
            : `Audio · ${audio.state}${reference}${audio.current && this._coordinateStatus ? ' · '+this._coordinateStatus : ''}`);
        this._audioPlay.label.set_text(audio.state === 'playing' ? 'Pause recitation' : audio.state === 'paused'
            ? 'Resume recitation' : audio.state === 'loading' ? 'Preparing audio…' : 'Play from this page');
        this._audioPlay.setSensitive(audio.state !== 'loading');
        this._audioStop.setSensitive(audio.state !== 'stopped');
        this._audioPrevious.setSensitive(Boolean(audio.index.adjacent(audio.current,-1)));
        this._audioNext.setSensitive(Boolean(audio.index.adjacent(audio.current,1)));
        this._panelLabel.set_text(audio.state === 'playing' ? 'قرآن ▶' : audio.state === 'paused' ? 'قرآن Ⅱ' : 'قرآن');
    }

    _changePage(delta) {
        this._settings.set_int('page', clampPage(this._settings.get_int('page') + delta));
    }

    _toggleRecitation() {
        if (Main.sessionMode.isLocked || !this._audio) return;
        if (this._audio.state === 'playing') this._audio.pause();
        else if (this._audio.state === 'paused') this._audio.resume();
        else if (this._audio.state !== 'loading') this._audio.playPage(this._settings.get_int('page'));
    }

    _stepRecitation(delta) {
        if (!Main.sessionMode.isLocked && this._audio?.index.adjacent(this._audio.current,delta)) this._audio.step(delta);
    }

    _changeRecitationVolume(delta) {
        if (Main.sessionMode.isLocked) return;
        this._settings.set_int('audio-volume', Math.max(0, Math.min(100, this._settings.get_int('audio-volume') + delta)));
    }

    _registerShortcuts() {
        const actions = {
            'quran-previous-page': () => this._changePage(-1),
            'quran-next-page': () => this._changePage(1),
            'quran-first-page': () => this._settings.set_int('page', 1),
            'quran-last-page': () => this._settings.set_int('page', 604),
            'quran-go-to-page': () => this._openPageJump(),
            'quran-search': () => this._openSearch(),
            'quran-audio-toggle': () => this._toggleRecitation(),
            'quran-audio-stop': () => this._audio.stop(),
            'quran-audio-previous': () => this._stepRecitation(-1),
            'quran-audio-next': () => this._stepRecitation(1),
            'quran-audio-volume-up': () => this._changeRecitationVolume(5),
            'quran-audio-volume-down': () => this._changeRecitationVolume(-5),
        };
        for (const {name} of SHORTCUTS) {
            const flags = name === 'quran-audio-toggle' ? Meta.KeyBindingFlags.IGNORE_AUTOREPEAT : Meta.KeyBindingFlags.NONE;
            Main.wm.addKeybinding(name, this._settings, flags,
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

    _pagePalette() {
        return resolvePageTheme(this._settings.get_string('page-theme'), {
            systemDark: this._systemSettings.get_string('color-scheme') === 'prefer-dark',
            textBrightness: this._settings.get_int('night-text-brightness'),
            backgroundBrightness: this._settings.get_int('night-background-brightness'),
        });
    }

    _imageThemeKey(palette) {
        return this._settings.get_string('mushaf-edition') === 'tajweed' && palette.name === 'dark'
            ? `${Math.round(palette.ink[0] * 255)}/${Math.round(palette.background[0] * 255)}` : 'original';
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
        const palette = this._pagePalette();
        this._imageTheme = this._imageThemeKey(palette);
        this._asset = null;
        this._imageStatus = `Loading ${title}…`;
        this._downloadStatus.label.set_text(`Loading ${title}…`);
        this._queueRepaint();
        const current = () => generation.active && this._generation === generation && this._cancellable === cancellable;
        try {
            const asset = await this._store.load(page, cancellable, palette);
            if (!current()) return;
            this._asset = asset;
            this._imageStatus = '';
            this._downloadStatus.label.set_text(`${title} · cached · click to reload`);
            this._queueRepaint();
        } catch (error) {
            if (!current() || cancellable.is_cancelled()) return;
            this._imageStatus = 'Page image unavailable';
            this._downloadStatus.label.set_text('Download failed · click to retry');
            this._queueRepaint();
            console.warn(`[Quran Desktop] Could not load page ${page}: ${error.message}`);
        }
    }

    _update() {
        const page = this._settings.get_int('page');
        const madani = this._settings.get_string('page-layout') === 'madani';
        const edition = this._settings.get_string('mushaf-edition');
        const audioLayout = `${this._settings.get_string('page-layout')}/${edition}`;
        if (this._audio.current && ((this._content.page !== page && this._audio.current.page !== page) || this._audioLayout !== audioLayout))
            this._audio.stop();
        this._audioLayout = audioLayout;
        this._audio.configure({reciter:this._settings.get_string('audio-reciter'),volume:this._settings.get_int('audio-volume')/100,
            repeat:this._settings.get_string('audio-repeat'),continuous:this._settings.get_boolean('audio-continuous')});
        if (this._content.page !== page) this._content = pageContent(this._data, page);
        this._title.label.set_text(`${madani ? mushafEdition(edition).title + ' · ' : ''}${this._content.sections[0]?.englishName ?? 'Quran'} · Page ${page} / 604`);
        this._previous.setSensitive(page > 1);
        this._next.setSensitive(page < 604);
        this._downloadStatus.visible = madani;
        if (madani && (page !== this._imagePage || edition !== this._imageEdition ||
            this._imageThemeKey(this._pagePalette()) !== this._imageTheme)) {
            this._imagePromise = this._loadMadaniPage(page);
        } else if (!madani) {
            this._cancellable?.cancel();
            this._asset = null;
            this._imagePage = 0;
        }
        const monitors = Main.layoutManager.monitors;
        const indexes = monitorIndexes(monitors, Main.layoutManager.primaryIndex,
            this._settings.get_int('monitor'), this._settings.get_boolean('all-monitors'));
        while (this._areas.length > indexes.length) this._areas.pop().destroy();
        while (this._areas.length < indexes.length) this._areas.push(this._createArea());
        this._area = this._areas[0] ?? null;
        indexes.forEach((index, slot) => {
            const area = this._areas[slot];
            area._quranMonitorIndex = index;
            const bounds = widgetBounds(Main.layoutManager.getWorkAreaForMonitor(index),
                this._settings.get_int('height'), this._settings.get_int('position-x'),
                this._settings.get_int('position-y'), madani ? MADANI_WIDTH / MADANI_HEIGHT : 0.7);
            area.set_position(bounds.x, bounds.y);
            area.set_size(bounds.width, bounds.height);
            area.queue_repaint();
        });
        this._syncVisibility();
        this._syncAudioControls();
    }

    _syncVisibility() {
        if (Main.sessionMode.isLocked && this._audio && this._audio.state !== 'stopped') this._audio.stop();
        const visible = Main.layoutManager.monitors.length > 0 && !Main.sessionMode.isLocked &&
            !(Main.overview.visible && this._settings.get_boolean('hide-in-overview'));
        for (const area of this._areas) area.visible = visible;
    }

    disable() {
        for (const name of this._keybindings ?? []) Main.wm.removeKeybinding(name);
        this._keybindings = [];
        this._searchDialog?.close();
        this._searchDialog = null;
        this._searchIndex = null;
        if (this._generation) this._generation.active = false;
        this._audio?.destroy();
        this._coordinateStore?.destroy();
        this._cancellable?.cancel();
        this._store?.destroy();
        for (const [object, id] of this._signals ?? []) object.disconnect(id);
        this._signals = [];
        for (const area of this._areas ?? []) area.destroy();
        this._areas = [];
        this._indicator?.destroy();
        this._area = this._indicator = this._panelLabel = this._title = null;
        this._previous = this._next = this._entry = this._downloadStatus = null;
        this._settings = this._systemSettings = this._store = this._asset = null;
        this._cancellable = this._data = this._content = null;
        this._audio = this._coordinateStore = this._coordinates = this._imagePromise = null;
        this._audioStatus = this._audioPlay = this._audioStop = this._audioPrevious = this._audioNext = this._audioEntry = null;
    }
}
