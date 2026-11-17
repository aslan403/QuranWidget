import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const {AudioCache} = await import('../audioCache.js');
const directory = GLib.dir_make_tmp('quran-audio-cache-XXXXXX');
const cache = new AudioCache(directory);
try {
    const invalid = Gio.File.new_for_path(`${directory}/invalid.mp3`);
    for (const bytes of ['ID3', 'ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000', '\u00ff\u00fb\u0090\u0000']) {
        GLib.file_set_contents(invalid.get_path(), new Uint8Array([...bytes].map(c => c.charCodeAt(0))));
        if (cache._valid(invalid,new Gio.Cancellable())) throw new Error('Truncated MP3 accepted');
    }
    invalid.delete(null);
    print('PASS: truncated ID3 and MPEG frame headers rejected');
    const file = await cache.load('alafasy',1,1,new Gio.Cancellable());
    const info = file.query_info('standard::size',Gio.FileQueryInfoFlags.NONE,null);
    if (info.get_size() < 1000) throw new Error('Recitation download is not a real audio file');
    print(`PASS: actual HTTPS Alafasy 1:1 MP3 cached (${info.get_size()} bytes)`);
    // Native chunks deliberately omit HTTP Content-Length; bounds must be enforced while reading.
    const target = Gio.File.new_for_path(`${directory}/stream.mp3`);
    const chunk = new GLib.Bytes(new Uint8Array(65536));
    const oversized = new Gio.MemoryInputStream();
    for (let i=0;i<321;i++) oversized.add_bytes(chunk);
    let bounded = false;
    try { await cache._storeStream(oversized,target,new Gio.Cancellable()); } catch (error) { bounded = error.message.includes('size'); }
    if (!bounded || target.query_exists(null)) throw new Error('Unbounded stream published');
    print('PASS: unknown-length stream stops at 20 MiB and never publishes');
    const cancelledStream = new Gio.MemoryInputStream();
    for (let i=0;i<320;i++) cancelledStream.add_bytes(chunk);
    const midCancel = new Gio.Cancellable();
    GLib.idle_add(GLib.PRIORITY_DEFAULT,()=>{midCancel.cancel();return GLib.SOURCE_REMOVE;});
    try { await cache._storeStream(cancelledStream,target,midCancel); throw new Error('Cancellation ignored'); }
    catch (error) { if (!midCancel.is_cancelled()) throw error; }
    if (target.query_exists(null)) throw new Error('Cancelled stream published');
    const entries = Gio.File.new_for_path(directory).enumerate_children('standard::name',Gio.FileQueryInfoFlags.NONE,null);
    for (let info; (info=entries.next_file(null));) if (info.get_name().includes('.part-')) throw new Error('Temporary download leaked');
    entries.close(null);
    print('PASS: mid-stream cancellation removes private temporary file');
    const [bytes] = file.load_bytes(null);
    const shortResponse = Gio.MemoryInputStream.new_from_bytes(bytes);
    let incompleteResponse = false;
    try { await cache._storeStream(shortResponse,target,new Gio.Cancellable(),bytes.get_size()+100); }
    catch (_) { incompleteResponse = true; }
    if (!incompleteResponse || target.query_exists(null)) throw new Error('Incomplete declared response was published');
    print('PASS: complete frame boundaries cannot hide a short declared HTTP response');
    GLib.file_set_contents(file.get_path(),'ID3');
    const repaired = await cache.load('alafasy',1,1,new Gio.Cancellable());
    if (!bytes.equal(repaired.load_bytes(null)[0])) throw new Error('Truncated cached clip was not replaced with original download');
    print('PASS: truncated cached clip is repaired with byte-identical real recitation');
    const incomplete = Gio.File.new_for_path(`${directory}/incomplete.mp3`);
    GLib.file_set_contents(incomplete.get_path(), bytes.new_from_bytes(0,bytes.get_size()-1).get_data());
    if (cache._valid(incomplete,new Gio.Cancellable())) throw new Error('Truncated last MPEG frame accepted');
    incomplete.delete(null);
    print('PASS: truncated final MPEG frame rejected');
    const again = await cache.load('alafasy',1,1,new Gio.Cancellable());
    if (!bytes.equal(again.load_bytes(null)[0])) throw new Error('Cached recitation changed');
    print('PASS: repeat playback reuses byte-identical local audio');
    const cancel = new Gio.Cancellable(); cancel.cancel();
    let rejected = false;
    try { await cache.load('alafasy',1,1,cancel); } catch (_) { rejected = true; }
    if (!rejected) throw new Error('Cancelled audio request was accepted');
    print('PASS: cancelled audio requests do not start playback or a download');
    let unsafe = false;
    try { await cache.load('../outside',1,1,new Gio.Cancellable()); } catch (_) { unsafe = true; }
    if (!unsafe) throw new Error('Unsafe reciter path was accepted');
    print('PASS: reciter cache paths are restricted to the allowlist');
} finally { cache.destroy(); }
