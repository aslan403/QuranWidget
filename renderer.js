import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import {arabicNumber, isArabicText, DESIGN_WIDTH, DESIGN_HEIGHT} from './model.js';
import {roundedRectangle} from './drawing.js';

function makeLayout(cr, text, size, fontName, width, centered = false) {
    const layout = PangoCairo.create_layout(cr);
    layout.get_context().set_base_dir(isArabicText(text) ? Pango.Direction.RTL : Pango.Direction.LTR);
    const font = Pango.FontDescription.from_string(fontName);
    font.set_absolute_size(size * Pango.SCALE);
    layout.set_font_description(font);
    layout.set_text(text, -1);
    layout.set_width(width * Pango.SCALE);
    layout.set_wrap(Pango.WrapMode.WORD_CHAR);
    layout.set_auto_dir(true);
    layout.set_alignment(centered ? Pango.Alignment.CENTER : Pango.Alignment.LEFT);
    layout.set_justify(!centered);
    layout.set_spacing(3 * Pango.SCALE);
    return layout;
}

// One measured layout is used both for painting and the fit tests. No ellipsis
// or truncation: shrink the entire page uniformly until every verse fits.
export function layoutPage(cr, content, fontName = 'Noto Naskh Arabic') {
    function measure(size) {
        const items = [];
        let y = 0;
        for (const [index, section] of content.sections.entries()) {
            if (section.startsSurah || index === 0) {
                const layout = makeLayout(cr, section.title, Math.max(18, size * 0.95), fontName, 448, true);
                const height = layout.get_pixel_size()[1];
                items.push({layout, y, title: true});
                y += height + 9;
            }
            const layout = makeLayout(cr, section.text, size, fontName, 448,
                content.page === 1 || content.sections.length > 2);
            const height = layout.get_pixel_size()[1];
            items.push({layout, y, title: false});
            y += height + 13;
        }
        return {items, height: Math.max(0, y - 13), fontSize: size};
    }
    let lower = 8;
    let upper = 30;
    let plan = measure(lower);
    for (let i = 0; i < 10; i++) {
        const middle = (lower + upper) / 2;
        const candidate = measure(middle);
        if (candidate.height <= 552) {
            lower = middle;
            plan = candidate;
        } else {
            upper = middle;
        }
    }
    return plan;
}

function color(value) {
    const hex = /^#[a-f0-9]{6}$/i.test(value ?? '') ? value : '#f4f1e9';
    return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

export function drawPage(cr, width, height, content, options = {}) {
    const rgb = color(options.textColor);
    const alpha = Math.max(0.2, Math.min(1, options.opacity ?? 1));
    const ink = strength => cr.setSourceRGBA(...rgb, alpha * strength);
    const font = options.fontName || 'Noto Naskh Arabic';
    cr.save();
    cr.scale(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    if (options.showBackdrop) {
        const backgroundAlpha = Math.max(0, Math.min(1, options.backgroundOpacity ?? 1));
        cr.setSourceRGBA(0.025, 0.035, 0.04, alpha * backgroundAlpha);
        roundedRectangle(cr, 20, 15, 520, 770, (options.cornerRadius ?? 24) * DESIGN_HEIGHT / height);
        cr.fill();
    }
    const label = (text, x, y, size, strength = 1, family = font, w = 448) => {
        const layout = makeLayout(cr, text, size, family, w, true);
        ink(strength);
        cr.moveTo(x, y);
        PangoCairo.show_layout(cr, layout);
    };
    // Sparse dial marks echo Zclock without rotating or animating sacred text.
    for (let i = 0; i <= 30; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 30;
        const major = i % 5 === 0;
        const radius = 33;
        ink(i / 30 <= content.page / 604 ? 0.65 : 0.14);
        cr.setLineWidth(major ? 1.3 : 0.8);
        cr.moveTo(38 + Math.cos(angle) * (radius - (major ? 6 : 3)), 74 + Math.sin(angle) * (radius - (major ? 6 : 3)));
        cr.lineTo(38 + Math.cos(angle) * radius, 74 + Math.sin(angle) * radius);
        cr.stroke();
    }
    label('القرآن الكريم', 56, 34, 30);
    label(`JUZ ${String(content.juz).padStart(2, '0')}   /   THE NOBLE QURAN`, 56, 85, 9, 0.48, 'Sans');
    ink(0.2);
    cr.setLineWidth(0.8);
    cr.moveTo(56, 116);
    cr.lineTo(504, 116);
    cr.stroke();

    const plan = layoutPage(cr, content, font);
    const top = 142 + Math.max(0, (552 - plan.height) / 2);
    for (const item of plan.items) {
        ink(item.title ? 0.65 : 1);
        cr.moveTo(56, top + item.y);
        PangoCairo.show_layout(cr, item.layout);
    }
    ink(0.18);
    cr.moveTo(56, 722);
    cr.lineTo(504, 722);
    cr.stroke();
    ink(0.55);
    cr.moveTo(56, 722);
    cr.lineTo(56 + 448 * content.page / 604, 722);
    cr.stroke();
    label(arabicNumber(content.page), 223, 735, 24, 0.95, font, 114);
    label('PAGE', 56, 749, 9, 0.42, 'Sans', 42);
    label(`${String(content.page).padStart(3, '0')} / 604`, 408, 749, 9, 0.42, 'Sans', 96);
    cr.restore();
    return {height: plan.height, fontSize: plan.fontSize};
}
