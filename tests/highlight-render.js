import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import {CoordinateStore} from '../coordinateStore.js';
import {MadaniPageStore} from '../pageStore.js';
import {pageContent} from '../model.js';
import {drawMadaniPage} from '../madaniRenderer.js';
import {drawPage} from '../renderer.js';
const directory=GLib.dir_make_tmp('quran-highlight-render-XXXXXX');
const [,bytes]=Gio.File.new_for_path('data/quran.json').load_contents(null);
const data=JSON.parse(new TextDecoder().decode(bytes));
const verse=data.ayahs.find(a=>a.surah===2 && a.numberInSurah===6);
const coordinates=new CoordinateStore();
function render(name,draw,content,asset,options={}) {
    const surface=new Cairo.ImageSurface(Cairo.Format.ARGB32,560,960);
    const cr=new Cairo.Context(surface);
    if(draw===drawPage) draw(cr,560,960,content,options);
    else draw(cr,560,960,content,asset,options);
    cr.$dispose(); const file=directory+'/'+name+'.png';surface.writeToPNG(file);return GdkPixbuf.Pixbuf.new_from_file(file);
}
function difference(left,right) {
    const a=left.get_pixels(),b=right.get_pixels();let changed=0;
    for(let i=0;i<a.length;i++) if(a[i]!==b[i])changed++;
    return changed;
}
for(const edition of ['madani','tajweed']) {
    const info=await coordinates.load(edition,3,new Gio.Cancellable());
    if(info.verses['2:6'].rectangles.length!==2 || !info.verses['2:6'].complete) throw new Error('Wrong real verse-line geometry');
    const store=new MadaniPageStore(null,edition);
    const asset=await store.load(3,new Gio.Cancellable());
    const plain=render(edition+'-plain',drawMadaniPage,pageContent(data,3),asset);
    const highlighted=render(edition+'-highlight',drawMadaniPage,pageContent(data,3),asset,{activeVerse:verse,coordinates:info});
    if(difference(plain,highlighted)<100)throw new Error('Printed-page verse highlight was not rendered');
    store.destroy();print(`PASS: ${edition} actual per-ayah line rectangles render a visible highlight`);
}
const plain=render('text-plain',drawPage,pageContent(data,3),null,{showBackdrop:true});
const marked=render('text-highlight',drawPage,pageContent(data,3),null,{showBackdrop:true,activeVerse:verse});
if(difference(plain,marked)<100)throw new Error('Exact Pango verse highlight missing');
print('PASS: native Arabic Pango byte-range verse highlighting');
const last=await coordinates.load('tajweed',604,new Gio.Cancellable());
if(last.verses['112:3'].complete || last.verses['112:3'].rectangles.length)throw new Error('Known missing Tajweed word was silently fabricated');
print('PASS: known upstream 112:3 omission is explicitly flagged, not guessed');
coordinates.destroy();print('Highlight evidence: '+directory);
