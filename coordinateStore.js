import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class CoordinateStore {
    constructor(directory = null) {
        this.directory = directory ?? GLib.build_filenamev([GLib.get_user_cache_dir(),'quran-desktop','verse-bounds-v1']);
        this._workers = new Set();
        this._memory = new Map();
        this._closed = false;
    }

    async _read(file,cancellable,edition,page) {
        const bytes = await new Promise((resolve,reject) => file.load_contents_async(cancellable,(target,result) => {
            try { const [,contents] = target.load_contents_finish(result); resolve(contents); } catch (error) { reject(error); }
        }));
        const data = JSON.parse(new TextDecoder().decode(bytes));
        if (data.version !== 1 || data.edition !== edition || data.page !== page || !data.verses ||
            !Number.isInteger(data.width) || !Number.isInteger(data.height)) throw new Error('Invalid verse geometry cache');
        const [width,height] = edition === 'madani' ? [1024,1656] : [1340,1890];
        if (data.width !== width || data.height !== height || typeof data.verses !== 'object' || Array.isArray(data.verses))
            throw new Error('Verse geometry does not match the selected edition');
        for (const [key,entry] of Object.entries(data.verses)) {
            if (!/^\d{1,3}:\d{1,3}$/.test(key) || typeof entry.complete !== 'boolean' || !Array.isArray(entry.rectangles) ||
                entry.rectangles.length > 64 || (entry.complete && entry.rectangles.length === 0) ||
                (!entry.complete && entry.rectangles.length !== 0)) throw new Error('Invalid verse geometry entry');
            for (const rectangle of entry.rectangles) {
                if (!Array.isArray(rectangle) || rectangle.length !== 4 || !rectangle.every(Number.isInteger))
                    throw new Error('Invalid verse rectangle');
                const [left,top,right,bottom] = rectangle;
                if (!(0 <= left && left < right && right <= width && 0 <= top && top < bottom && bottom <= height))
                    throw new Error('Verse rectangle lies outside the image');
            }
        }
        return data;
    }

    async load(edition,page,cancellable) {
        if (!['madani','tajweed'].includes(edition) || !Number.isInteger(page) || page < 1 || page > 604)
            throw new Error('Invalid coordinate request');
        cancellable.set_error_if_cancelled();
        if (this._closed) throw new Error('Verse coordinate store was closed');
        const key = `${edition}/${page}`;
        if (this._memory.has(key)) return this._memory.get(key);
        const file = Gio.File.new_for_path(GLib.build_filenamev([this.directory,edition,`page${String(page).padStart(3,'0')}.json`]));
        let data = null;
        if (file.query_exists(null)) {
            try { data = await this._read(file,cancellable,edition,page); }
            catch (error) { cancellable.set_error_if_cancelled(); file.delete(null); }
        }
        if (!data) {
            const script = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('coordinateWorker.py');
            const process = Gio.Subprocess.new(['python3',script.get_path(),edition,String(page),this.directory],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_PIPE);
            this._workers.add(process);
            const cancelId = cancellable.connect(()=>{if (process.get_identifier() !== null) process.force_exit();});
            try {
                const message = await new Promise((resolve,reject) => process.communicate_utf8_async(null,null,(child,result) => {
                    try { const [, ,stderr] = child.communicate_utf8_finish(result); resolve(stderr); } catch (error) { reject(error); }
                }));
                cancellable.set_error_if_cancelled();
                if (!process.get_successful()) throw new Error(message?.trim() || 'Verse bounds could not be prepared');
                data = await this._read(file,cancellable,edition,page);
            } finally {
                if (cancelId) cancellable.disconnect(cancelId);
                this._workers.delete(process);
            }
        }
        cancellable.set_error_if_cancelled();
        if (this._closed) throw new Error('Verse coordinate store was closed');
        this._memory.set(key,data);
        return data;
    }

    destroy() {
        this._closed = true;
        for (const process of this._workers) if (process.get_identifier() !== null) process.force_exit();
        this._memory.clear();
    }
}
