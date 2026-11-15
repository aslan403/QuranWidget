import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

export const QuranSearchDialog = GObject.registerClass(
class QuranSearchDialog extends ModalDialog.ModalDialog {
    _init(index, onSelected) {
        super._init({styleClass: 'quran-search-dialog', shouldFadeIn: false, shouldFadeOut: false});
        this._index = index;
        this._onSelected = onSelected;
        this._searchSource = 0;
        this._matches = {results: [], total: 0, offset: 0, hasMore: false};
        this._resultButtons = [];
        const monitor = Main.layoutManager.monitors[global.display.get_current_monitor()] ?? Main.layoutManager.primaryMonitor;
        const width = Math.max(300, Math.min(700, monitor.width - 80));
        this.dialogLayout.set_width(width);
        this.contentLayout.set_style(`spacing: 12px; min-width: ${width - 128}px; max-width: ${width - 128}px;`);
        this._maxResultsHeight = Math.max(120, Math.min(400, monitor.height - 380));
        this.contentLayout.add_child(new St.Label({text: 'Search Quran · بحث في القرآن',
            style_class: 'quran-search-title', x_align: Clutter.ActorAlign.START}));
        const help = new St.Label({text: 'Arabic verse text, surah name, page number, or reference (2:255). Search stays offline.',
            style_class: 'quran-search-help', x_expand: true});
        help.clutter_text.set_line_wrap(true);
        help.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this.contentLayout.add_child(help);
        this._entry = new St.Entry({hint_text: 'Search…  الفاتحة / الحمد لله / 2:255 / 604',
            style_class: 'quran-search-query', can_focus: true, x_expand: true,
            accessible_name: 'Search Quran text, surah, or reference'});
        this._entry.clutter_text.set_max_length(160);
        this.contentLayout.add_child(this._entry);
        this._status = new St.Label({text: `Search ${index.ayahs.length.toLocaleString()} verses by text or reference.`,
            style_class: 'quran-search-status', x_align: Clutter.ActorAlign.START});
        this.contentLayout.add_child(this._status);
        this._resultsBox = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'quran-search-result-list'});
        this._scroll = new St.ScrollView({x_expand: true, overlay_scrollbars: true,
            height: this._maxResultsHeight, visible: false});
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._scroll.set_child(this._resultsBox);
        this.contentLayout.add_child(this._scroll);
        this._pagination = new St.BoxLayout({style_class: 'quran-search-pagination', visible: false});
        this._previousResults = new St.Button({label: 'Previous results', style_class: 'button', can_focus: true});
        this._nextResults = new St.Button({label: 'More results', style_class: 'button', can_focus: true});
        this._previousResults.connect('clicked', () => this._runSearch(Math.max(0, this._matches.offset - 8)));
        this._nextResults.connect('clicked', () => this._runSearch(this._matches.offset + 8));
        this._pagination.add_child(this._previousResults);
        this._pagination.add_child(this._nextResults);
        this.contentLayout.add_child(this._pagination);
        this._entry.clutter_text.connect('text-changed', () => this._scheduleSearch());
        this._entry.clutter_text.connect('activate', () => {
            this._runSearch(0);
            if (this._matches.results[0]) this._select(this._matches.results[0]);
        });
        this._entry.clutter_text.connect('key-press-event', (_text, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Down && this._resultButtons.length) {
                this._resultButtons[0].grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            if (event.get_key_symbol() === Clutter.KEY_Up && this._resultButtons.length) {
                this._resultButtons.at(-1).grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.setButtons([{label: 'Close', key: Clutter.KEY_Escape, action: () => this.close()}]);
        this.setInitialKeyFocus(this._entry);
        this.connect('destroy', () => {
            this._cancelPendingSearch();
            this._index = null;
            this._onSelected = null;
            this._resultButtons = [];
        });
    }

    _cancelPendingSearch() {
        if (this._searchSource) {
            GLib.Source.remove(this._searchSource);
            this._searchSource = 0;
        }
    }

    _scheduleSearch() {
        this._cancelPendingSearch();
        this._searchSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 160, () => {
            this._searchSource = 0;
            this._runSearch(0);
            return GLib.SOURCE_REMOVE;
        });
    }

    _runSearch(offset = 0) {
        this._cancelPendingSearch();
        this._matches = this._index.search(this._entry.get_text(), {offset, limit: 8});
        const focus = global.stage.get_key_focus();
        if (this._resultButtons.some(button => button === focus || (focus && button.contains(focus))))
            this._entry.grab_key_focus();
        this._resultsBox.destroy_all_children();
        this._resultButtons = [];
        const resultWidth = Math.max(180, (this._entry.width || this.dialogLayout.width - 128) - 32);
        for (const result of this._matches.results) {
            const button = new St.Button({style_class: 'quran-search-result', reactive: true,
                can_focus: true, x_expand: true, accessible_name: result.title});
            const box = new St.BoxLayout({vertical: true, x_expand: true});
            const title = new St.Label({text: result.title, style_class: 'quran-search-result-title',
                width: resultWidth, x_expand: true});
            title.clutter_text.set_line_wrap(true);
            title.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
            const text = new St.Label({text: result.text, style_class: 'quran-search-result-text',
                width: resultWidth, x_expand: true});
            text.clutter_text.set_line_wrap(true);
            text.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
            text.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            box.add_child(title);
            box.add_child(text);
            button.set_child(box);
            button.connect('clicked', () => this._select(result));
            button.connect('key-focus-in', () => {
                const adjustment = this._scroll.vadjustment;
                let value = adjustment.value;
                if (button.y < value) value = button.y;
                else if (button.y + button.height > value + adjustment.page_size)
                    value = button.y + button.height - adjustment.page_size;
                adjustment.value = Math.max(adjustment.lower, Math.min(adjustment.upper - adjustment.page_size, value));
            });
            const index = this._resultButtons.length;
            button.connect('key-press-event', (_actor, event) => {
                const key = event.get_key_symbol();
                if (key === Clutter.KEY_Down) {
                    (this._resultButtons[index + 1] ?? this._entry).grab_key_focus();
                    return Clutter.EVENT_STOP;
                }
                if (key === Clutter.KEY_Up) {
                    (this._resultButtons[index - 1] ?? this._entry).grab_key_focus();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            this._resultButtons.push(button);
            this._resultsBox.add_child(button);
        }
        const {total, results, hasMore} = this._matches;
        this._status.text = !this._entry.get_text().trim()
            ? `Search ${this._index.ayahs.length.toLocaleString()} verses by text or reference.`
            : total ? `${this._matches.offset + 1}–${this._matches.offset + results.length} of ${total.toLocaleString()} results · open a result to read its page`
                : 'No results. Try an Arabic phrase, a surah name, or a reference such as 2:255.';
        this._scroll.visible = results.length > 0;
        this._scroll.height = Math.min(this._maxResultsHeight, results.length === 1 ? 240 : 400);
        this._pagination.visible = total > 8;
        this._previousResults.reactive = this._previousResults.can_focus = this._matches.offset > 0;
        this._nextResults.reactive = this._nextResults.can_focus = hasMore;
        this._previousResults.opacity = this._matches.offset > 0 ? 255 : 100;
        this._nextResults.opacity = hasMore ? 255 : 100;
        const adjustment = this._scroll.vadjustment;
        adjustment.value = adjustment.lower;
    }

    _select(result) {
        const onSelected = this._onSelected;
        this.close();
        onSelected?.(result);
    }
});
