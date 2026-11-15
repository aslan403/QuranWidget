import Cairo from 'cairo';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import {arabicNumber, isArabicText} from './model.js';
import {MADANI_WIDTH, MADANI_HEIGHT, fitPageImage, resolvePageTheme} from './pageModel.js';

function label(cr, text, x, y, width, size, color, alignment = Pango.Alignment.CENTER) {
    const layout = PangoCairo.create_layout(cr);
    layout.get_context().set_base_dir(isArabicText(text) ? Pango.Direction.RTL : Pango.Direction.LTR);
    layout.set_font_description(Pango.FontDescription.from_string('Noto Naskh Arabic'));
    const font = layout.get_font_description();
    font.set_absolute_size(size * Pango.SCALE);
    layout.set_font_description(font);
    layout.set_width(width * Pango.SCALE);
    layout.set_alignment(alignment);
    layout.set_text(text, -1);
    cr.setSourceRGB(...color);
    cr.moveTo(x, y);
    PangoCairo.show_layout(cr, layout);
}

export function drawMadaniPage(cr, width, height, content, asset, options = {}) {
    const palette = resolvePageTheme(options.theme ?? 'light', options);
    const margin = Math.max(12, Math.min(56, options.margin ?? 24));
    cr.save();
    cr.scale(width / MADANI_WIDTH, height / MADANI_HEIGHT);
    // Composite the whole paper and ink together, so global opacity is uniform.
    cr.pushGroup();
    if (palette.gradient) {
        const gradient = new Cairo.LinearGradient(0, 0, MADANI_WIDTH, 0);
        for (const [offset, rgb] of [[0,[220,218,213]], [.18,[253,253,244]], [.48,[255,255,255]], [1,[253,251,239]]])
            gradient.addColorStopRGB(offset, ...rgb.map(value => value / 255));
        cr.setSource(gradient);
    } else {
        cr.setSourceRGB(...palette.background);
    }
    cr.rectangle(0, 0, MADANI_WIDTH, MADANI_HEIGHT);
    cr.fill();
    const showInfo = options.showPageInfo !== false;
    if (showInfo) {
        label(cr, content.sections[0]?.title ?? 'القرآن الكريم', margin, 22, 260, 19, palette.ink, Pango.Alignment.LEFT);
        label(cr, `الجزء ${arabicNumber(content.juz)}`, 360, 22, 176, 19, palette.ink, Pango.Alignment.RIGHT);
    }
    const box = {x: margin, y: 66, width: MADANI_WIDTH - 2 * margin, height: 828};
    let bounds = null;
    if (asset) {
        bounds = fitPageImage(asset.surface.getWidth(), asset.surface.getHeight(), box);
        cr.save();
        cr.translate(bounds.x, bounds.y);
        cr.scale(bounds.width / asset.surface.getWidth(), bounds.height / asset.surface.getHeight());
        if (asset.color) {
            // Tajweed colors are authoritative page content, never a monochrome mask.
            cr.setSourceSurface(asset.forTheme(palette), 0, 0);
            cr.paint();
        } else {
            cr.setSourceRGB(...palette.ink);
            cr.maskSurface(asset.surface, 0, 0);
        }
        cr.restore();
    } else {
        label(cr, options.status ?? 'Downloading Madani page…', margin, 440, MADANI_WIDTH - 2 * margin, 18, palette.ink);
        label(cr, 'Use the top-bar Quran menu to retry or choose Transparent text.', margin, 480,
            MADANI_WIDTH - 2 * margin, 12, palette.ink);
    }
    if (showInfo)
        label(cr, arabicNumber(content.page), margin, 912, MADANI_WIDTH - 2 * margin, 23, palette.ink);
    cr.popGroupToSource();
    cr.paintWithAlpha(Math.max(0.2, Math.min(1, options.opacity ?? 1)));
    cr.restore();
    return bounds;
}
