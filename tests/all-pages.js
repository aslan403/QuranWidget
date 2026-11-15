import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {pageContent} from '../model.js';
import {layoutPage, drawPage} from '../renderer.js';

const [, bytes] = Gio.File.new_for_path('data/quran.json').load_contents(null);
const data = JSON.parse(new TextDecoder().decode(bytes));
const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 560, 800);
const cr = new Cairo.Context(surface);
let smallest = {size: 100, page: 0};
for (let page = 1; page <= 604; page++) {
    const content = pageContent(data, page);
    const plan = layoutPage(cr, content);
    if (plan.height > 552 || plan.items.some(item => item.layout.get_unknown_glyphs_count() > 0))
        throw new Error(`Page ${page} overflows or has unsupported glyphs (${plan.height}px)`);
    if (plan.fontSize < smallest.size)
        smallest = {size: plan.fontSize, page};
}
cr.$dispose();
print(`PASS: all 604 real Quran pages fit, no missing glyphs; smallest font ${smallest.size.toFixed(2)}px on page ${smallest.page}`);
GLib.mkdir_with_parents('docs', 0o755);
for (const page of [1, 2, 187, 604]) {
    const shot = new Cairo.ImageSurface(Cairo.Format.ARGB32, 840, 1040);
    const ctx = new Cairo.Context(shot);
    ctx.setSourceRGB(0.055, 0.09, 0.105);
    ctx.paint();
    ctx.translate(77, 30);
    drawPage(ctx, 686, 980, pageContent(data, page));
    shot.writeToPNG(`docs/page-${page}.png`);
    ctx.$dispose();
}
print('PASS: real renderer previews written to docs/page-{1,2,187,604}.png');
