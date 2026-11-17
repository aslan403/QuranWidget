import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {RecitationController} from '../recitationController.js';
import {AudioCache} from '../audioCache.js';
const [,bytes] = Gio.File.new_for_path('data/quran.json').load_contents(null);
const data = JSON.parse(new TextDecoder().decode(bytes));
const delay = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT,ms,()=>{resolve();return GLib.SOURCE_REMOVE;}));
async function waitFor(callback,label,limit=15000) {
    const start = GLib.get_monotonic_time();
    while ((GLib.get_monotonic_time()-start)/1000 < limit) {
        if (callback()) return;
        if (player.state === 'error') throw new Error(player.error);
        await delay(25);
    }
    throw new Error(`Timeout: ${label}`);
}
function expect(value,label) { if (!value) throw new Error(label); print(`PASS: ${label}`); }
const player = new RecitationController(data,()=>{});
player.cache.destroy();
player.cache = new AudioCache(GLib.dir_make_tmp('quran-controller-audio-XXXXXX'));
player._workerArgs = ['--test-sink'];
try {
    const navigation = new RecitationController(data,()=>{});
    navigation.repeat = 'page';
    navigation._start = verse => { navigation.current = verse; };
    for (const delta of [1,-1]) {
        const boundary = navigation.index.firstOnPage(2);
        navigation.current = delta === 1 ? navigation.index.adjacent(boundary,-1) : boundary;
        navigation._loopPage = navigation.current.page;
        navigation.step(delta);
        expect(navigation._loopPage === navigation.current.page,`manual step ${delta} resets repeat page`);
        const chosen = navigation.current.page;
        let last = navigation.current;
        while (navigation.index.adjacent(last,1)?.page === chosen) last = navigation.index.adjacent(last,1);
        const session = {verse:last,exited:true,eof:true,ended:true,succeeded:true,cancel:new Gio.Cancellable()};
        navigation._session = session;
        navigation._finishSession(session);
        expect(navigation.current === navigation.index.firstOnPage(chosen),`EOS loops manually selected page after step ${delta}`);
    }
    navigation.destroy();
    const recovery = new RecitationController(data,()=>{});
    const repairFile = Gio.File.new_for_path(`${GLib.dir_make_tmp('quran-repair-XXXXXX')}/clip.mp3`);
    const verse = recovery.index.firstOnPage(1);
    let retries = [];
    recovery._start = (...args) => retries.push(args);
    const failedSession = (corruptMedia,repaired=false) => ({verse,file:repairFile,repaired,exited:true,eof:true,ended:false,
        succeeded:false,failed:true,failure:{message:'localized',corruptMedia},cancel:new Gio.Cancellable()});
    GLib.file_set_contents(repairFile.get_path(),'corrupt payload');
    let failed = failedSession(true);
    recovery._session = failed;
    recovery._finishSession(failed);
    expect(!repairFile.query_exists(null) && retries.length===1 && retries[0][1]===true,'confirmed corrupt decode evicts exact clip and retries once');
    GLib.file_set_contents(repairFile.get_path(),'second corrupt response');
    failed = failedSession(true,true);
    recovery._session = failed;
    recovery._finishSession(failed);
    expect(retries.length===1 && recovery.state==='error' && !repairFile.query_exists(null),'second decode failure cannot loop retries');
    for (const corruptMedia of [false,undefined]) {
        GLib.file_set_contents(repairFile.get_path(),'good media preserved');
        failed = failedSession(corruptMedia);
        recovery._session = failed;
        recovery._finishSession(failed);
        expect(repairFile.query_exists(null) && retries.length===1,'output/plugin/unknown error never evicts media or retries');
    }
    failed = failedSession(true);
    recovery._session = null;
    recovery._finishSession(failed);
    expect(repairFile.query_exists(null) && retries.length===1,'cancelled obsolete decoder cannot evict or retry');
    recovery.destroy();
    const ordering = new RecitationController(data,()=>{});
    let advances = 0;
    ordering._start = () => { advances++; };
    for (const first of ['exited','eof']) {
        const session = {verse:ordering.index.firstOnPage(1),exited:false,eof:false,ended:true,succeeded:true,cancel:new Gio.Cancellable()};
        ordering._session = session;
        const before = advances;
        session[first] = true;
        ordering._finishSession(session);
        expect(advances === before,`${first} alone cannot advance EOS`);
        session[first === 'exited' ? 'eof' : 'exited'] = true;
        ordering._finishSession(session);
        ordering._finishSession(session);
        expect(advances === before+1,`EOS advances exactly once with ${first} delivered first`);
    }
    ordering.destroy();
    expect(player.state === 'stopped' && player._children.size === 0,'enabling controller never autoplays');
    player.configure({reciter:'alafasy',volume:0.3,repeat:'verse',continuous:false});
    player.playPage(1);
    await waitFor(()=>player.state==='playing','actual MP3 playing');
    expect(player.active?.surah === 1 && player.active?.numberInSurah === 1,'real MP3 decoder state identifies the highlighted verse');
    const session = player._session;
    const boundaries = session.boundaries;
    player.pause();
    await waitFor(()=>player.state==='paused','pause');
    expect(player.active?.numberInSurah === 1,'pause retains the correct verse highlight');
    await delay(100);
    player.resume();
    await waitFor(()=>player.state==='playing','resume');
    await waitFor(()=>player.state==='playing' && player._session === session && session.boundaries>boundaries,'real MP3 EOS repeats current verse',20000);
    expect(player.current.numberInSurah===1,'EOS advances through repeat policy, not a timer');
    player.configure({reciter:'husary',volume:0.4,repeat:'none',continuous:true});
    expect(player.state==='stopped' && player.active===null,'changing reciter stops the previous voice without autoplay');
    await waitFor(()=>player._children.size===0,'stopped worker reaped');
    player.playPage(1);
    player.stop();
    await delay(100);
    expect(player.state==='stopped' && player.active===null && player._children.size===0,'stopping during load rejects stale playback');
} finally {
    player.destroy();
    await delay(100);
}
print('All native recitation controller checks passed.');
