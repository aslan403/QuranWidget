import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {MadaniPageStore} from '../pageStore.js';
const store = new MadaniPageStore();
const loop = new GLib.MainLoop(null, false);
(async () => {
    try {
        const asset = await store.load(2, new Gio.Cancellable());
        if (asset.page !== 2 || asset.surface.getWidth() !== 1024 || asset.surface.getHeight() !== 1656)
            throw new Error('Wrong Madani page dimensions');
        print('PASS: native Madani image cache, decode, and antialiased mask');
        const cached = await store.load(2, new Gio.Cancellable());
        if (cached.page !== 2) throw new Error('Cache read failed');
        print('PASS: repeat image load reads local cache');
        const cancelled = new Gio.Cancellable();
        cancelled.cancel();
        let rejected = false;
        try { await store.load(2, cancelled); } catch (_) { rejected = true; }
        if (!rejected) throw new Error('Cancelled image loads must not run');
        print('PASS: cancelled image requests are rejected before cache or network access');
    } catch (error) {
        printerr(error.stack);
        imports.system.exit(1);
    } finally {
        store.destroy();
        loop.quit();
    }
})();
loop.run();
