import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {MadaniPageStore} from '../pageStore.js';
import {drawMadaniPage} from '../madaniRenderer.js';
import {pageContent} from '../model.js';
const [, bytes] = Gio.File.new_for_path('data/quran.json').load_contents(null);
const data = JSON.parse(new TextDecoder().decode(bytes));
const store = new MadaniPageStore();
const loop = new GLib.MainLoop(null, false);
(async () => {
    try {
        const asset = await store.load(187, new Gio.Cancellable());
        const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 1680, 960);
        const cr = new Cairo.Context(surface);
        for (const [index, theme] of ['light', 'sepia', 'dark'].entries()) {
            cr.save(); cr.translate(index * 560, 0);
            const bounds = drawMadaniPage(cr, 560, 960, pageContent(data, 187), asset, {theme});
            if (bounds.y < 60 || bounds.y + bounds.height > 900 || bounds.width > 512)
                throw new Error('Original page image is cropped');
            cr.restore();
        }
        surface.writeToPNG('docs/madani-themes.png');
        cr.$dispose();
        print('PASS: real Madani page image rendered without cropping in Light, Sepia, Dark');
    } catch (error) {printerr(error.stack); imports.system.exit(1);}
    finally {store.destroy(); loop.quit();}
})();
loop.run();
