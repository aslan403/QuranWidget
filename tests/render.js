import Cairo from 'cairo';
import GLib from 'gi://GLib';
import {layoutPage, drawPage} from '../renderer.js';

const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 560, 800);
const cr = new Cairo.Context(surface);
const fixture = {page: 1, juz: 1, sections: [{title: 'اختبار', startsSurah: true, text: 'نص تجريبي '.repeat(250)}]};
const plan = layoutPage(cr, fixture, 'Noto Naskh Arabic');
if (plan.height > 552 || plan.fontSize < 8 || plan.items.length < 2)
    throw new Error(`Text does not fit: ${JSON.stringify({height: plan.height, size: plan.fontSize})}`);
drawPage(cr, 560, 800, fixture, {});
cr.$dispose();
print('PASS: real Pango Arabic shaping and auto-fit layout');
