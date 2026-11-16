import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {MadaniPageStore} from '../pageStore.js';
import {resolvePageTheme} from '../pageModel.js';

const root = GLib.dir_make_tmp('quran-responsiveness-XXXXXX');
let previous = GLib.get_monotonic_time();
let worstGap = 0;
let pulses = 0;
const pulse = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
    const now = GLib.get_monotonic_time();
    worstGap = Math.max(worstGap, (now - previous) / 1000);
    previous = now;
    pulses++;
    return GLib.SOURCE_CONTINUE;
});
const delay = milliseconds => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
try {
    for (const edition of ['madani', 'tajweed']) {
        const sourceStore = new MadaniPageStore(null, edition);
        await sourceStore.load(3, new Gio.Cancellable());
        const directory = GLib.build_filenamev([root, edition]);
        GLib.mkdir_with_parents(directory, 0o700);
        Gio.File.new_for_path(GLib.build_filenamev([sourceStore.cacheDirectory, 'page003.png']))
            .copy(Gio.File.new_for_path(GLib.build_filenamev([directory, 'page003.png'])), Gio.FileCopyFlags.NONE, null, null);
        sourceStore.destroy();
        const store = new MadaniPageStore(directory, edition);
        const originalFile = Gio.File.new_for_path(GLib.build_filenamev([directory, 'page003.png']));
        const [originalBytes] = originalFile.load_bytes(null);
        await delay(30);
        worstGap = 0;
        const before = pulses;
        const started = GLib.get_monotonic_time();
        const palette = resolvePageTheme('dark');
        const asset = await store.load(3, new Gio.Cancellable(), palette);
        if (asset.color) asset.forTheme(palette);
        await delay(30);
        print(`${edition}: total=${Math.round((GLib.get_monotonic_time()-started)/1000)}ms max-main-loop-gap=${Math.round(worstGap)}ms pulses=${pulses-before}`);
        if (worstGap > 100) throw new Error(`${edition} image preparation blocked the UI event loop for ${Math.round(worstGap)}ms (limit 100ms)`);
        const cached = store.load(3, new Gio.Cancellable(), palette);
        if (store._workers.size !== 0) throw new Error('Prepared page was recomputed instead of using its cache');
        await cached;
        if (asset.color) {
            const changedPalette = resolvePageTheme('dark', {textBrightness: 150});
            let rejected = false;
            try { asset.forTheme(changedPalette); } catch (_) { rejected = true; }
            if (!rejected || store._workers.size !== 0) throw new Error('Rendering must never start an implicit conversion');
            const changed = await store.load(3, new Gio.Cancellable(), changedPalette);
            changed.forTheme(changedPalette);
            asset.forTheme(palette);
            print('PASS: independent night palettes are prepared asynchronously; drawing is read-only');
        }
        if (!originalBytes.equal(originalFile.load_bytes(null)[0])) throw new Error('Source image bytes were modified');
        store.destroy();
        print(`PASS: ${edition} prepared-cache reuse and original image preservation`);
    }
    for (const closeStore of [false, true]) {
        const directory = GLib.build_filenamev([root, closeStore ? 'destroyed' : 'cancelled']);
        GLib.mkdir_with_parents(directory, 0o700);
        Gio.File.new_for_path(GLib.build_filenamev([root, 'madani', 'page003.png']))
            .copy(Gio.File.new_for_path(GLib.build_filenamev([directory, 'page003.png'])), Gio.FileCopyFlags.NONE, null, null);
        const store = new MadaniPageStore(directory);
        const cancellable = new Gio.Cancellable();
        const pending = store.load(3, cancellable);
        const workers = [...store._workers];
        if (workers.length !== 1) throw new Error('Cold preparation did not start its worker');
        if (closeStore) store.destroy(); else cancellable.cancel();
        let rejected = false;
        try { await pending; } catch (_) { rejected = true; }
        if (!rejected || store._workers.size !== 0 || workers.some(worker => worker.get_identifier() !== null))
            throw new Error('Cancelled preparation left a running worker or accepted a stale result');
        if (!Gio.File.new_for_path(GLib.build_filenamev([directory, 'page003.png'])).query_exists(null))
            throw new Error('Cancellation deleted a valid original page');
        store.destroy();
        print(`PASS: ${closeStore ? 'destroying a store' : 'cancelling navigation'} stops and reaps conversion workers`);
    }
    print('PASS: cold image preparation and Tajweed dark conversion leave the main loop responsive');
} finally {
    GLib.Source.remove(pulse);
}
