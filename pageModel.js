import {clampPage} from './model.js';
export const MADANI_BASE_URL = 'https://files.quran.app/hafs/madani/width_1024/';
export const MADANI_CACHE_NAME = 'madani-1024-v8';
export const MADANI_WIDTH = 560;
export const MADANI_HEIGHT = 960;

export function resolvePageTheme(requested, options = {}) {
    const name = requested === 'automatic' ? (options.systemDark ? 'dark' : 'light')
        : (['light', 'sepia', 'dark'].includes(requested) ? requested : 'light');
    if (name === 'dark') {
        const backgroundValue = Math.max(0, Math.min(64, options.backgroundBrightness ?? 0));
        const requestedText = Math.max(120, Math.min(255, options.textBrightness ?? 255));
        // Same contrast compensation as Quran Android's getPageTextBrightness().
        const text = Math.min(255, Math.trunc(50 * Math.log1p(backgroundValue) + requestedText)) / 255;
        const background = backgroundValue / 255;
        return {name, background: [background, background, background], ink: [text, text, text], gradient: false};
    }
    return {name, background: name === 'sepia' ? [248/255, 235/255, 213/255]
        : (options.oldBackground ? [1, 244/255, 203/255] : [1, 1, 1]),
    ink: [0, 0, 0], gradient: name === 'light' && !options.oldBackground};
}

export function fitPageImage(imageWidth, imageHeight, box) {
    const scale = Math.min(box.width / imageWidth, box.height / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return {x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height};
}

// Convert grayscale intensity into alpha; the source PNG itself is unchanged.
export function inkMask(pixels, width, height, rowstride, channels) {
    const mask = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const source = y * rowstride + x * channels;
            const target = (y * width + x) * 4;
            const luminance = (pixels[source] + pixels[source + 1] + pixels[source + 2]) / 3;
            const alpha = channels === 4 ? pixels[source + 3] : 255;
            mask[target] = mask[target + 1] = mask[target + 2] = 255;
            mask[target + 3] = Math.round(alpha * (255 - luminance) / 255);
        }
    }
    return mask;
}

export function pageFilename(page) {
    return `page${String(clampPage(Number(page))).padStart(3, '0')}.png`;
}
