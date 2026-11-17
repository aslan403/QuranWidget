// Real source fixtures only; this script never creates an audio output device.
import Gio from 'gi://Gio';
import {AudioCache} from '../audioCache.js';
import {CoordinateStore} from '../coordinateStore.js';
import {MadaniPageStore} from '../pageStore.js';
const audio = new AudioCache();
const coordinates = new CoordinateStore();
try {
    for (const [s,v] of [[1,1],[1,2],[112,3]]) await audio.load('alafasy',s,v,new Gio.Cancellable());
    for (const edition of ['madani','tajweed'])
        for (const page of [1,3,604]) await coordinates.load(edition,page,new Gio.Cancellable());
    for (const edition of ['madani','tajweed']) {
        const images = new MadaniPageStore(null,edition);
        try { for (const page of [1,3,604]) await images.load(page,new Gio.Cancellable()); }
        finally { images.destroy(); }
    }
    print('PASS: real MP3 and upstream coordinate fixtures cached without audio output');
} finally { audio.destroy(); coordinates.destroy(); }
