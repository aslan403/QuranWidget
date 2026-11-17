// Synthetic PCM controller sequencing/lifecycle, never synthetic Quran audio.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {RecitationController} from '../recitationController.js';
const [,raw] = Gio.File.new_for_path('data/quran.json').load_contents(null);
const data = JSON.parse(new TextDecoder().decode(raw));
const delay = ms => new Promise(resolve => GLib.timeout_add(0,ms,()=>{resolve();return GLib.SOURCE_REMOVE;}));
const assert = (value,label) => { if (!value) throw new Error(label); };
const path = `${GLib.dir_make_tmp('quran-continuous-controller-XXXXXX')}/synthetic.wav`;
const pcm = new Uint8Array(44+3200);
const view = new DataView(pcm.buffer);
for (const [offset,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])
    for (let i=0;i<text.length;i++) pcm[offset+i]=text.charCodeAt(i);
view.setUint32(4,pcm.length-8,true); view.setUint32(16,16,true);
view.setUint16(20,1,true); view.setUint16(22,1,true);
view.setUint32(24,16000,true); view.setUint32(28,32000,true);
view.setUint16(32,2,true); view.setUint16(34,16,true); view.setUint32(40,3200,true);
for (let i=44;i<pcm.length;i+=2) view.setInt16(i,1000,true);
GLib.file_set_contents(path,pcm);
const file=Gio.File.new_for_path(path);
const players=[];
function make() {
    let player;
    const prepares=[];
    player = new RecitationController(data,()=>{},async (verse,cancel)=>{
        cancel.set_error_if_cancelled();
        assert(player.current === verse,'beforePlay cannot prepare a future visible page');
        if (player._session) assert(player.active === verse,'subsequent beforePlay only at actual boundary');
        prepares.push(`${verse.surah}:${verse.numberInSurah}`);
    });
    player.cache.destroy();
    player.cache={load:async ()=>file,destroy(){}};
    player._workerArgs=['--test-sink'];
    players.push(player);
    return {player,prepares};
}
async function wait(player,condition,label) {
    for (let i=0;i<400;i++) {
        if (condition()) return;
        if (player.state==='error') throw new Error(player.error);
        await delay(10);
    }
    throw new Error(label);
}
try {
    const {player,prepares}=make();
    player.playVerse(1,6);
    await wait(player,()=>player._session?.boundaries>=4,'short clips did not advance across page/surah');
    const session=player._session;
    assert(prepares.slice(0,4).join(',')==='1:6,1:7,2:1,2:2','source order or boundary preparation incorrect');
    assert(player._children.size===1 && session.serial>=3,'short clips restarted decoder');
    assert(session.entries.size<=3,'prefetch exceeded two future clips');
    player.configure({reciter:'alafasy',volume:.5,repeat:'verse',continuous:true});
    assert(player.state==='stopped' && !player.active,'policy edit retained stale queued stream');
    player.playVerse(112,3);
    await wait(player,()=>player._session?.boundaries>=3,'repeat verse');
    assert(player.current.surah===112 && player.current.numberInSurah===3,'repeat verse advanced');
    player.step(1);
    await wait(player,()=>player.active?.surah===112 && player.active?.numberInSurah===4,'manual next');
    player.step(-1);
    await wait(player,()=>player.active?.numberInSurah===3,'manual previous');
    player.stop();
    await wait(player,()=>player._children.size===0,'stop did not reap actual Python decoder');
    player.configure({reciter:'alafasy',volume:.5,repeat:'page',continuous:true});
    player.playVerse(1,6);
    await wait(player,()=>player._session?.boundaries>=3,'page repeat');
    assert(player.current.surah===1 && player.current.numberInSurah===1,'page repeat left its anchor');
    player.stop();
    player.configure({reciter:'alafasy',volume:.5,repeat:'none',continuous:true});
    player.playVerse(114,6);
    await wait(player,()=>player.state==='stopped','Quran end');
    assert(!player.active,'Quran end retained highlight');
    const terminal=make().player;
    let visible, oldCancel, oldSession, releaseView, oldViewFinished=false;
    terminal.beforePlay=async (verse,cancel)=>{
        const key=`${verse.surah}:${verse.numberInSurah}`;
        if (key==='114:6') {
            oldCancel=cancel;
            oldSession=terminal._session;
            try {
                await new Promise(resolve=>{releaseView=resolve;});
                cancel.set_error_if_cancelled();
                visible=key;
            } finally { oldViewFinished=true; }
        } else {
            cancel.set_error_if_cancelled();
            visible=key;
        }
    };
    terminal.playVerse(114,5);
    await wait(terminal,()=>Boolean(releaseView),'final boundary beforePlay not started');
    await wait(terminal,()=>terminal.state==='stopped','held final view prevented natural Quran end');
    assert(oldSession.ended && oldSession.succeeded && oldSession.exited && oldSession.eof,
        'final session did not naturally exit and drain stdout');
    terminal.playVerse(1,1);
    await wait(terminal,()=>terminal.active?.surah===1 && terminal.active?.numberInSurah===1,
        'new playback did not start after natural Quran end');
    assert(visible==='1:1','new playback did not install its visible state');
    releaseView();
    await wait(terminal,()=>oldViewFinished,'held final beforePlay did not finish');
    assert(oldCancel.is_cancelled(),'natural completion left final beforePlay cancellable live');
    assert(visible==='1:1','old final beforePlay overwrote new playback visible state');
    assert(oldSession.prefetchCancel.is_cancelled(),'natural completion left prefetch cancellable live');
    terminal.stop();
    const pending=make().player;
    let loads=0, release;
    pending.cache.load=async (_reciter,_surah,_verse,cancel)=>{
        if (++loads===2) await new Promise(resolve=>{release=resolve;});
        cancel.set_error_if_cancelled(); return file;
    };
    pending.playPage(1);
    await wait(pending,()=>loads===2,'prefetch not started');
    pending.stop(); release(); await delay(100);
    assert(pending.state==='stopped' && pending._children.size===0,'stale initial prefetch started playback');
    print('PASS synthetic short-clip persistent output, source/page order, two-ahead bound, real-boundary preparation, verse/page repeat, manual next/previous, policy invalidation, Quran end, cancellation and reaping');
} finally {
    for (const player of players) player.destroy();
    await delay(100);
    file.delete(null); file.get_parent().delete(null);
}
