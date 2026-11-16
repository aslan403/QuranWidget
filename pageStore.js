import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {clampPage} from './model.js';
import {mushafEdition, editionPageUrl, pageFilename} from './pageModel.js';

export class MadaniPageStore {
    constructor(cacheDirectory = null, edition = 'madani') {
        this.info = mushafEdition(edition);
        this.edition = this.info.key;
        this.cacheDirectory = cacheDirectory ?? GLib.build_filenamev([
            GLib.get_user_cache_dir(), 'quran-desktop', this.info.cacheName]);
        this._session = new Soup.Session({timeout: 30, user_agent: 'QuranDesktop/0.2 (GNOME Shell)'});
        this._workers = new Set();
        this._closed = false;
    }

    async load(value, cancellable, palette = null) {
        const page = clampPage(value);
        cancellable.set_error_if_cancelled();
        if (this._closed) throw new Error('Page store was destroyed');
        const file = Gio.File.new_for_path(GLib.build_filenamev([this.cacheDirectory, pageFilename(page)]));
        const maskFile = Gio.File.new_for_path(file.get_path().replace('.png', '-mask.png'));
        // Corrupt or interrupted cache entries are repairable, not permanent failures.
        if (file.query_exists(null)) {
            try {
                return await this._decode(file, maskFile, page, cancellable, palette);
            } catch (error) {
                cancellable.set_error_if_cancelled();
                if (!error.invalidSource) throw error;
                if (file.query_exists(null)) file.delete(null);
                if (maskFile.query_exists(null)) maskFile.delete(null);
            }
        }
        const message = Soup.Message.new('GET', editionPageUrl(this.edition, page));
        const bytes = await new Promise((resolve, reject) => {
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                try { resolve(session.send_and_read_finish(result)); } catch (error) { reject(error); }
            });
        });
        cancellable.set_error_if_cancelled();
        if (message.status_code !== Soup.Status.OK)
            throw new Error(`Page download returned HTTP ${message.status_code}`);
        const data = bytes.get_data();
        if (data.length < 24 || data.length > 5 * 1024 * 1024 ||
            data[0] !== 137 || data[1] !== 80 || data[2] !== 78 || data[3] !== 71)
            throw new Error('Page server returned an invalid PNG');
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        if (!this._validDimensions(view.getUint32(16), view.getUint32(20)))
            throw new Error('Unexpected page image dimensions');
        GLib.mkdir_with_parents(this.cacheDirectory, 0o700);
        await new Promise((resolve, reject) => {
            file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.PRIVATE, cancellable, (target, result) => {
                try { target.replace_contents_finish(result); resolve(); } catch (error) { reject(error); }
            });
        });
        return this._decode(file, maskFile, page, cancellable, palette);
    }

    _validDimensions(width, height) {
        return (this.info.color ? width >= 500 && width <= 2000 : width === 1024) && height >= 100 && height <= 3000;
    }

    _surface(file, original = false, expected = null) {
        try {
            const surface = Cairo.ImageSurface.createFromPNG(file.get_path());
            if (!this._validDimensions(surface.getWidth(), surface.getHeight()))
                throw new Error('Unexpected page image dimensions');
            if (expected && (surface.getWidth() !== expected.getWidth() || surface.getHeight() !== expected.getHeight()))
                throw new Error('Prepared image dimensions differ from the original');
            return surface;
        } catch (error) {
            if (original) error.invalidSource = true;
            throw error;
        }
    }

    async _prepare(operation, source, target, cancellable, ...parameters) {
        cancellable.set_error_if_cancelled();
        if (this._closed) throw new Error('Page store was destroyed');
        const script = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('imageWorker.js');
        const worker = Gio.Subprocess.new(['gjs', '-m', script.get_path(), operation,
            source.get_path(), target.get_path(), ...parameters.map(String)],
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_PIPE);
        this._workers.add(worker);
        let finished = false;
        const cancelled = cancellable.connect(() => {
            if (!finished && worker.get_identifier() !== null) worker.force_exit();
        });
        try {
            if (cancellable.is_cancelled() && worker.get_identifier() !== null) worker.force_exit();
            const stderr = await new Promise((resolve, reject) => {
                // Reap even cancelled workers; do not leave conversions running in the background.
                worker.communicate_utf8_async(null, null, (process, result) => {
                    finished = true;
                    try { const [, , errorText] = process.communicate_utf8_finish(result); resolve(errorText); }
                    catch (error) { reject(error); }
                });
            });
            cancellable.set_error_if_cancelled();
            if (this._closed) throw new Error('Page store was destroyed');
            if (!worker.get_successful()) {
                const error = new Error(stderr?.trim() || 'Page image preparation failed');
                error.invalidSource = worker.get_if_exited() && worker.get_exit_status() === 2;
                throw error;
            }
        } finally {
            if (cancelled) cancellable.disconnect(cancelled);
            this._workers.delete(worker);
        }
    }

    async _decodeColor(file, page, cancellable, palette) {
        const surface = this._surface(file, true);
        let nightSurface = null;
        let prepared = null;
        if (palette?.name === 'dark') {
            const text = Math.round(palette.ink[0] * 255);
            const background = Math.round(palette.background[0] * 255);
            prepared = `${text}/${background}`;
            const info = file.query_info('standard::size,time::modified,time::modified-usec', Gio.FileQueryInfoFlags.NONE, cancellable);
            const revision = `${info.get_size()}-${info.get_attribute_uint64('time::modified')}-${info.get_attribute_uint32('time::modified-usec')}`;
            const target = Gio.File.new_for_path(file.get_path().replace('.png', `-night-v2-${text}-${background}-${revision}.png`));
            if (target.query_exists(null)) {
                try { nightSurface = this._surface(target, false, surface); }
                catch (_) { target.delete(null); }
            }
            if (!nightSurface) {
                await this._prepare('night', file, target, cancellable, text, background);
                nightSurface = this._surface(target, false, surface);
            }
        }
        cancellable.set_error_if_cancelled();
        return {page, edition: this.edition, color: true, surface,
            forTheme: requested => {
                if (requested.name !== 'dark') return surface;
                const key = `${Math.round(requested.ink[0] * 255)}/${Math.round(requested.background[0] * 255)}`;
                if (key !== prepared || !nightSurface) throw new Error('Night image must be prepared asynchronously before rendering');
                return nightSurface;
            }};
    }

    async _decode(file, maskFile, page, cancellable, palette) {
        cancellable.set_error_if_cancelled();
        if (this.info.color) return this._decodeColor(file, page, cancellable, palette);
        if (maskFile.query_exists(null)) {
            try { return {page, surface: this._surface(maskFile)}; }
            catch (_) { maskFile.delete(null); }
        }
        await this._prepare('mask', file, maskFile, cancellable);
        return {page, surface: this._surface(maskFile)};
    }

    destroy() {
        this._closed = true;
        for (const worker of this._workers)
            if (worker.get_identifier() !== null) worker.force_exit();
        this._session.abort();
    }
}
