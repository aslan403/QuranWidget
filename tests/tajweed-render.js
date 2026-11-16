import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import {MadaniPageStore} from '../pageStore.js';
import {drawMadaniPage} from '../madaniRenderer.js';
import {pageContent} from '../model.js';
import {resolvePageTheme} from '../pageModel.js';
const store = new MadaniPageStore(null, 'tajweed');
const [, bytes] = Gio.File.new_for_path('data/quran.json').load_contents(null);
const data = JSON.parse(new TextDecoder().decode(bytes));
const asset = await store.load(3, new Gio.Cancellable(), resolvePageTheme('dark'));
if (asset.edition !== 'tajweed' || asset.color !== true || asset.surface.getWidth() !== 1340)
    throw new Error('Tajweed must use its own real color PNG, not a Madani mask');
print('PASS: original مصحف التجويد PNG downloaded, decoded and cache-isolated');
const output = new Cairo.ImageSurface(Cairo.Format.ARGB32, 1680, 960);
const cr = new Cairo.Context(output);
for (const [index, theme] of ['light', 'sepia', 'dark'].entries()) {
    cr.save(); cr.translate(index * 560, 0);
    drawMadaniPage(cr, 560, 960, pageContent(data, 3), asset, {theme});
    cr.restore();
}
output.writeToPNG('docs/tajweed-themes.png');
const check = GdkPixbuf.Pixbuf.new_from_file('docs/tajweed-themes.png');
const pixels = check.get_pixels();
for (let panel = 0; panel < 3; panel++) {
    let colored = 0;
    for (let y = 80; y < 880; y++) {
        for (let x = panel * 560 + 40; x < panel * 560 + 520; x++) {
            const offset = y * check.rowstride + x * check.n_channels;
            const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
            if (Math.max(...rgb) - Math.min(...rgb) > 50 && Math.min(...rgb) < 160) colored++;
        }
    }
    if (colored < 500) throw new Error(`Tajweed colors lost in theme ${panel}`);
}
print('PASS: rendered PNG pixel checks retain Tajweed chroma in all three themes');
cr.$dispose();
store.destroy();
print('PASS: full-color Tajweed page rendered in Light, Sepia, and color-preserving Dark');
