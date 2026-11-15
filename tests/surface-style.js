import Cairo from 'cairo';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import {drawMadaniPage} from '../madaniRenderer.js';
import {drawPage} from '../renderer.js';

const directory = GLib.dir_make_tmp('quran-surface-style-XXXXXX');
const content = {page: 1, juz: 1, sections: []};
// Explicit synthetic solid-ink fixture, not Quran text or a source page.
const mask = new Cairo.ImageSurface(Cairo.Format.ARGB32, 100, 100);
const ink = new Cairo.Context(mask);
ink.setSourceRGBA(1, 1, 1, 1); ink.paint(); ink.$dispose();
const asset = {surface: mask};
let sequence = 0;
function render(options, textLayout = false) {
    const height = textLayout ? 800 : 960;
    const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 560, height);
    const cr = new Cairo.Context(surface);
    if (textLayout) drawPage(cr, 560, height, content, options);
    else drawMadaniPage(cr, 560, height, content, asset, options);
    const path = `${directory}/${sequence++}.png`;
    surface.writeToPNG(path); cr.$dispose();
    const image = GdkPixbuf.Pixbuf.new_from_file(path);
    const pixels = image.get_pixels();
    return (x, y) => {
        const offset = y * image.rowstride + x * image.n_channels;
        return [pixels[offset], pixels[offset + 1], pixels[offset + 2],
            image.n_channels === 4 ? pixels[offset + 3] : 255];
    };
}
function expect(condition, message) {
    if (!condition) throw new Error(message);
    print(`PASS: ${message}`);
}
const translucent = render({theme: 'light', backgroundOpacity: .25});
expect(translucent(5, 480)[3] >= 63 && translucent(5, 480)[3] <= 65,
    `background opacity affects the paper independently (RGBA ${translucent(5, 480)})`);
expect(translucent(280, 480)[3] === 255, 'Quran ink remains fully opaque over translucent paper');
const transparent = render({theme: 'light', backgroundOpacity: 0});
expect(transparent(5, 480)[3] === 0 && transparent(280, 480)[3] === 255,
    'zero paper opacity leaves ink visible on a transparent background');
const overall = render({theme: 'light', backgroundOpacity: 1, opacity: .5});
expect(overall(280, 480)[3] >= 127 && overall(280, 480)[3] <= 129,
    'existing overall opacity still fades ink and paper together');
const backdrop = render({showBackdrop: true, backgroundOpacity: .25}, true);
expect(backdrop(30, 400)[3] >= 63 && backdrop(30, 400)[3] <= 65,
    'transparent-text backdrop uses independent background opacity');
const solidBackdrop = render({showBackdrop: true, backgroundOpacity: 1}, true);
expect(solidBackdrop(30, 400)[3] === 255, '100% background opacity is solid in both layouts');
const square = render({theme: 'light', cornerRadius: 0});
expect(square(0, 0)[3] === 255, 'zero corner radius keeps square edges');
const rounded = render({theme: 'light', cornerRadius: 32});
expect(rounded(0, 0)[3] === 0 && rounded(5, 5)[3] === 0,
    'rounded page corners are transparent, not a painted square');
expect(rounded(280, 1)[3] === 255, 'rounding preserves the straight top edge');
let antialiased = 0;
for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
        const alpha = rounded(x, y)[3];
        if (alpha > 0 && alpha < 255) antialiased++;
    }
}
expect(antialiased > 10, 'rounded edges have smooth partial-alpha antialiasing');
const textRounded = render({showBackdrop: true, cornerRadius: 32}, true);
expect(textRounded(20, 15)[3] === 0 && textRounded(30, 400)[3] > 0,
    'transparent-text backing also uses rounded corners');
print(`Native RGBA evidence: ${directory}`);
