// CPU-heavy pixel conversion and PNG encoding must not run in GNOME Shell.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import System from 'system';
import {inkMask, nightModePixels} from './pageModel.js';

const [operation, sourcePath, targetPath, textValue, backgroundValue] = ARGV;
if (!['mask', 'night'].includes(operation) || !sourcePath || !targetPath) {
    printerr('Invalid image preparation arguments');
    System.exit(1);
}
let source;
try {
    source = GdkPixbuf.Pixbuf.new_from_file(sourcePath);
    if (source.width < 500 || source.width > 2000 || source.height < 100 || source.height > 3000 ||
        (operation === 'mask' && source.width !== 1024))
        throw new Error('Unexpected source image dimensions');
} catch (error) {
    printerr(error.message);
    System.exit(2);
}
try {
    const text = Number(textValue);
    const background = Number(backgroundValue);
    if (operation === 'night' && (!Number.isInteger(text) || text < 120 || text > 255 ||
        !Number.isInteger(background) || background < 0 || background > 64))
        throw new Error('Invalid night palette');
    const pixels = operation === 'mask'
        ? inkMask(source.get_pixels(), source.width, source.height, source.rowstride, source.n_channels)
        : nightModePixels(source.get_pixels(), source.width, source.height,
            source.rowstride, source.n_channels, text, background);
    const converted = GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(pixels),
        GdkPixbuf.Colorspace.RGB, true, 8, source.width, source.height, source.width * 4);
    const [ok, buffer] = converted.save_to_bufferv('png', [], []);
    if (!ok) throw new Error('Could not encode prepared page');
    Gio.File.new_for_path(targetPath).replace_contents(buffer, null, false, Gio.FileCreateFlags.PRIVATE, null);
} catch (error) {
    printerr(error.message);
    System.exit(1);
}
