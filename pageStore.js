import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Soup from 'gi://Soup?version=3.0';
import {clampPage} from './model.js';
import {MADANI_BASE_URL, MADANI_CACHE_NAME, inkMask, pageFilename} from './pageModel.js';

export class MadaniPageStore {
    constructor(cacheDirectory = null) {
        this.cacheDirectory = cacheDirectory ?? GLib.build_filenamev([
            GLib.get_user_cache_dir(), 'quran-desktop', MADANI_CACHE_NAME]);
        this._session = new Soup.Session({timeout: 30, user_agent: 'QuranDesktop/0.2 (GNOME Shell)'});
    }

    async load(value, cancellable) {
        const page = clampPage(value);
        cancellable.set_error_if_cancelled();
        const file = Gio.File.new_for_path(GLib.build_filenamev([this.cacheDirectory, pageFilename(page)]));
        const maskFile = Gio.File.new_for_path(file.get_path().replace('.png', '-mask.png'));
        // Corrupt or interrupted cache entries are repairable, not permanent failures.
        if (file.query_exists(null)) {
            try {
                return this._decode(file, maskFile, page, cancellable);
            } catch (error) {
                cancellable.set_error_if_cancelled();
                file.delete(null);
                if (maskFile.query_exists(null)) maskFile.delete(null);
            }
        }
        const message = Soup.Message.new('GET', `${MADANI_BASE_URL}${pageFilename(page)}`);
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
        if (view.getUint32(16) !== 1024 || view.getUint32(20) > 3000 || view.getUint32(20) < 100)
            throw new Error('Unexpected page image dimensions');
        GLib.mkdir_with_parents(this.cacheDirectory, 0o700);
        await new Promise((resolve, reject) => {
            file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.PRIVATE, cancellable, (target, result) => {
                try { target.replace_contents_finish(result); resolve(); } catch (error) { reject(error); }
            });
        });
        return this._decode(file, maskFile, page, cancellable);
    }

    _decode(file, maskFile, page, cancellable) {
        cancellable.set_error_if_cancelled();
        if (maskFile.query_exists(null)) {
            try {
                const surface = Cairo.ImageSurface.createFromPNG(maskFile.get_path());
                if (surface.getWidth() !== 1024 || surface.getHeight() > 3000 || surface.getHeight() < 100)
                    throw new Error('Invalid mask dimensions');
                return {page, surface};
            } catch (_) {
                maskFile.delete(null);
            }
        }
        const source = GdkPixbuf.Pixbuf.new_from_file(file.get_path());
        const width = source.width;
        const height = source.height;
        if (width !== 1024 || height > 3000 || height < 100)
            throw new Error('Unexpected cached page image dimensions');
        const pixels = inkMask(source.get_pixels(), width, height, source.rowstride, source.n_channels);
        const mask = GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(pixels),
            GdkPixbuf.Colorspace.RGB, true, 8, width, height, width * 4);
        cancellable.set_error_if_cancelled();
        const [ok, buffer] = mask.save_to_bufferv('png', [], []);
        if (!ok) throw new Error('Could not build page ink mask');
        maskFile.replace_contents(buffer, null, false, Gio.FileCreateFlags.PRIVATE, cancellable);
        return {page, surface: Cairo.ImageSurface.createFromPNG(maskFile.get_path())};
    }

    destroy() {
        this._session.abort();
    }
}
