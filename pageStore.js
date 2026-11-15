import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Soup from 'gi://Soup?version=3.0';
import {clampPage} from './model.js';
import {mushafEdition, editionPageUrl, nightModePixels, inkMask, pageFilename} from './pageModel.js';

export class MadaniPageStore {
    constructor(cacheDirectory = null, edition = 'madani') {
        this.info = mushafEdition(edition);
        this.edition = this.info.key;
        this.cacheDirectory = cacheDirectory ?? GLib.build_filenamev([
            GLib.get_user_cache_dir(), 'quran-desktop', this.info.cacheName]);
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
        return this._decode(file, maskFile, page, cancellable);
    }

    _validDimensions(width, height) {
        return (this.info.color ? width >= 500 && width <= 2000 : width === 1024) && height >= 100 && height <= 3000;
    }

    _decodeColor(file, page) {
        const surface = Cairo.ImageSurface.createFromPNG(file.get_path());
        if (!this._validDimensions(surface.getWidth(), surface.getHeight()))
            throw new Error('Invalid Tajweed image dimensions');
        let key = null;
        let nightSurface = null;
        return {page, edition: this.edition, color: true, surface,
            forTheme: palette => {
                if (palette.name !== 'dark') return surface;
                const text = Math.round(palette.ink[0] * 255);
                const background = Math.round(palette.background[0] * 255);
                const requested = `${text}/${background}`;
                if (key !== requested) {
                    const source = GdkPixbuf.Pixbuf.new_from_file(file.get_path());
                    const pixels = nightModePixels(source.get_pixels(), source.width, source.height,
                        source.rowstride, source.n_channels, text, background);
                    const converted = GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(pixels),
                        GdkPixbuf.Colorspace.RGB, true, 8, source.width, source.height, source.width * 4);
                    const [ok, buffer] = converted.save_to_bufferv('png', [], []);
                    if (!ok) throw new Error('Could not prepare color-preserving Tajweed night image');
                    const target = Gio.File.new_for_path(file.get_path().replace('.png', '-night.png'));
                    target.replace_contents(buffer, null, false, Gio.FileCreateFlags.PRIVATE, null);
                    nightSurface = Cairo.ImageSurface.createFromPNG(target.get_path());
                    key = requested;
                }
                return nightSurface;
            },
        };
    }

    _decode(file, maskFile, page, cancellable) {
        cancellable.set_error_if_cancelled();
        if (this.info.color) return this._decodeColor(file, page);
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
