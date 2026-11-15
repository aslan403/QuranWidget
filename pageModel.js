import {clampPage} from './model.js';
export const MADANI_BASE_URL = 'https://files.quran.app/hafs/madani/width_1024/';
export const MADANI_CACHE_NAME = 'madani-1024-v8';
export const MADANI_WIDTH = 560;
export const MADANI_HEIGHT = 960;
export const TAJWEED_COMMIT = '85e22a084b59fbe6b51d0ad9f090f9e0d4ceae97';
const EDITIONS = Object.freeze({
    madani: Object.freeze({key: 'madani', title: 'المصحف المدني', color: false,
        cacheName: MADANI_CACHE_NAME, baseUrl: MADANI_BASE_URL}),
    tajweed: Object.freeze({key: 'tajweed', title: 'مصحف التجويد', color: true,
        cacheName: 'tajweed-85e22a0',
        baseUrl: `https://raw.githubusercontent.com/HiIAmMoot/quran-android-tajweed-page-provider/${TAJWEED_COMMIT}/images/indexed/`}),
});

export function mushafEdition(key) {
    return EDITIONS[key] ?? EDITIONS.madani;
}

export function editionPageUrl(edition, page) {
    const info = mushafEdition(edition);
    return info.baseUrl + (info.color ? pageFilename(page).slice(4) : pageFilename(page));
}

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

// Quran Android NightModeColorMatrix: invert lightness, not each color channel.
export function nightModePixels(pixels, width, height, rowstride, channels, textBrightness, backgroundBrightness) {
    const text = Math.max(120, Math.min(255, textBrightness));
    const background = Math.max(0, Math.min(64, backgroundBrightness));
    const scale = 1 + (text - background) / 255;
    const output = new Uint8Array(width * height * 4);
    const clamp = value => Math.max(0, Math.min(255, Math.round(value)));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const source = y * rowstride + x * channels;
            const target = (y * width + x) * 4;
            const lightness = .3 * pixels[source] + .4 * pixels[source + 1] + .3 * pixels[source + 2];
            for (let channel = 0; channel < 3; channel++)
                output[target + channel] = clamp(pixels[source + channel] - scale * lightness + text);
            output[target + 3] = channels === 4 ? pixels[source + 3] : 255;
        }
    }
    return output;
}

export function pageFilename(page) {
    return `page${String(clampPage(Number(page))).padStart(3, '0')}.png`;
}
