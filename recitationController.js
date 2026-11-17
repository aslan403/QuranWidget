import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {AudioCache} from './audioCache.js';
import {RECITERS, RecitationIndex} from './audioModel.js';
import {audioWorkerCommand} from './audioProcess.js';

// One controller and decoder process for all display copies. No clock guessing.
export class RecitationController {
    constructor(data, onChanged, beforePlay = async () => {}) {
        this.index = new RecitationIndex(data);
        this.cache = new AudioCache();
        this.onChanged = onChanged;
        this.beforePlay = beforePlay;
        this.state = 'stopped';
        this.current = null;
        this.active = null;
        this.error = '';
        this.reciter = 'alafasy';
        this.volume = 0.8;
        this.repeat = 'none';
        this.continuous = true;
        this._loopPage = 1;
        this._generation = 0;
        this._closed = false;
        this._session = null;
        this._children = new Set();
        this._download = null;
        this._workerArgs = []; // Tests may explicitly inject --test-sink; production never does.
    }

    configure({reciter, volume, repeat, continuous}) {
        if (!RECITERS.some(item => item.id === reciter)) throw new Error('Unknown reciter');
        if (reciter !== this.reciter) { this.stop(); this.reciter = reciter; }
        const changedVolume = this.volume !== volume;
        this.volume = Math.max(0,Math.min(1,volume));
        if (repeat === 'page' && this.repeat !== 'page' && this.current) this._loopPage = this.current.page;
        // Already-prerolled streams cannot be retracted without changing audio.
        // Stop on policy edits rather than play an obsolete queued verse.
        if ((repeat !== this.repeat || continuous !== this.continuous) && (this._session || this.state === 'loading')) this.stop();
        this.repeat = repeat;
        this.continuous = continuous;
        if (changedVolume) this._send({command:'volume',value:this.volume});
    }

    _notify() { if (!this._closed) this.onChanged?.(); }

    playPage(page) {
        const verse = this.index.firstOnPage(page);
        if (!verse) return;
        this._loopPage = page;
        this._start(verse);
    }

    playVerse(surah,numberInSurah) {
        const verse = this.index.find(surah,numberInSurah);
        if (!verse) return false;
        this._loopPage = verse.page;
        this._start(verse);
        return true;
    }

    step(delta) {
        const verse = this.index.adjacent(this.current,delta);
        if (verse) { this._loopPage = verse.page; this._start(verse); } else this.stop();
    }

    pause() { if (this.state === 'playing') this._send({command:'pause'}); }
    resume() { if (this.state === 'paused') this._send({command:'resume'}); }

    _kill(session) {
        if (!session) return;
        session.cancel.cancel();
        session.prefetchCancel?.cancel();
        session.viewCancel?.cancel();
        try { session.process.get_stdin_pipe().close(null); } catch (_) {}
        if (session.process.get_identifier() !== null) session.process.force_exit();
    }

    stop() {
        this._generation++;
        this._download?.cancel();
        this._download = null;
        this._kill(this._session);
        this._session = null;
        this.state = 'stopped';
        this.current = this.active = null;
        this.error = '';
        this._notify();
    }

    async _start(verse, repaired = false) {
        this.stop();
        if (this._closed) return;
        const generation = this._generation;
        const cancel = new Gio.Cancellable();
        this._download = cancel;
        this.current = verse;
        this.state = 'loading';
        this._notify();
        try {
            const [file] = await Promise.all([
                this.cache.load(this.reciter,verse.surah,verse.numberInSurah,cancel),
                this.beforePlay(verse,cancel),
            ]);
            cancel.set_error_if_cancelled();
            if (this._closed || generation !== this._generation) return;
            // Prefetch downloads only: beforePlay installs visible page/geometry
            // and must never run for a future verse while old media is audible.
            const ahead = [];
            let tail = verse;
            for (let i = 0; i < 2; i++) {
                const next = this.index.next(tail,{repeat:this.repeat,loopPage:this._loopPage,continuous:this.continuous});
                if (!next) break;
                const nextFile = await this.cache.load(this.reciter,next.surah,next.numberInSurah,cancel);
                cancel.set_error_if_cancelled();
                if (this._closed || generation !== this._generation) return;
                ahead.push({verse:next,file:nextFile});
                tail = next;
            }
            await Promise.all([...this._children].map(child => child.reaped));
            cancel.set_error_if_cancelled();
            if (this._closed || generation !== this._generation) return;
            this._download = null;
            const process = Gio.Subprocess.new([...audioWorkerCommand(),file.get_uri(),`--volume=${this.volume}`,'--continuous',...this._workerArgs],
                Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            const session = {process,verse,file,repaired,cancel:new Gio.Cancellable(),ended:false,failed:false,exited:false,eof:false,writes:Promise.resolve(),
                input:new Gio.DataInputStream({base_stream:process.get_stdout_pipe()})};
            session.reaped = new Promise(resolve => { session.resolveReaped = resolve; });
            session.entries = new Map([['0',{verse,file}]]);
            session.serial = 0;
            session.tail = verse;
            session.boundaries = 0;
            session.prefetchCancel = cancel;
            this._session = session;
            this._children.add(session);
            for (const entry of ahead) this._enqueue(session,entry);
            if (ahead.length < 2) { this._send({command:'queue',end:true}); session.queueEnded = true; }
            this._send({command:'volume',value:this.volume});
            this._read(session);
            process.wait_async(null,(child,result) => {
                let succeeded = false;
                try { child.wait_finish(result); succeeded = child.get_successful(); } catch (_) { /* reported below */ }
                session.exited = true;
                session.resolveReaped();
                session.succeeded = succeeded;
                this._children.delete(session);
                if (this._closed || this._session !== session || generation !== this._generation) return;
                this._finishSession(session);
            });
        } catch (error) {
            if (!this._closed && generation === this._generation && !cancel.is_cancelled()) this._fail(error.message);
        }
    }

    _finishSession(session) {
        // Child exit and pipe delivery are independent: drain EOS before deciding.
        if (this._closed || this._session !== session || !session.exited || !session.eof) return;
        session.cancel.cancel();
        session.viewCancel?.cancel();
        session.prefetchCancel?.cancel();
        this._session = null;
        if (session.ended && session.succeeded) {
            const next = this.index.next(session.verse,{repeat:this.repeat,loopPage:this._loopPage,continuous:this.continuous});
            if (next) this._start(next); else this.stop();
        } else if (session.failure?.corruptMedia === true) {
            // Reap + drain first; stale/cancelled sessions never reach this branch.
            // Always discard confirmed bad media, but retry only once per attempt.
            try {
                if (session.file.query_exists(null)) session.file.delete(null);
                if (!session.repaired) this._start(session.verse,true);
                else this._fail(session.failure.message || 'Audio playback failed');
            } catch (error) { this._fail(error.message); }
        } else {
            this._fail(session.failure?.message || 'Audio decoder stopped unexpectedly. Check GStreamer and MP3 plugins.');
        }
    }

    _read(session) {
        session.input.read_line_async(GLib.PRIORITY_DEFAULT,session.cancel,(stream,result) => {
            try {
                const [line] = stream.read_line_finish_utf8(result);
                if (this._closed || this._session !== session) return;
                if (line === null) { session.eof = true; this._finishSession(session); return; }
                const event = JSON.parse(line);
                if (event.event === 'boundary') {
                    this._boundary(session,event.id);
                } else if (event.event === 'queued') {
                    // Preparation is not a rendered boundary. Never highlight here.
                } else if (event.event === 'playing' || event.event === 'paused') {
                    if (event.event === 'paused' || session.boundaries > 0) this.state = event.event;
                    // Initial highlight is driven by the first sink boundary too.
                    if (session.boundaries > 0) this.active = this.current;
                    this._notify();
                } else if (event.event === 'ended') {
                    session.ended = true;
                    this.active = null;
                    this.state = 'loading';
                    this._notify();
                } else if (event.event === 'error') {
                    session.failed = true;
                    session.failure = event;
                    this.active = null;
                    this.state = 'loading';
                    this._notify();
                }
                if (this._session === session) this._read(session);
            } catch (error) {
                if (!session.cancel.is_cancelled() && this._session === session) this._fail(error.message);
            }
        });
    }

    _enqueue(session, entry) {
        const id = String(++session.serial);
        session.entries.set(id,entry);
        session.tail = entry.verse;
        this._send({command:'queue',uri:entry.file.get_uri(),id});
    }

    async _fill(session) {
        if (session.filling || session.queueEnded || this._session !== session) return;
        session.filling = true;
        try {
            while (this._session === session && session.entries.size < 3) {
                const verse = this.index.next(session.tail,{repeat:this.repeat,loopPage:this._loopPage,continuous:this.continuous});
                if (!verse) {
                    this._send({command:'queue',end:true});
                    session.queueEnded = true;
                    break;
                }
                const file = await this.cache.load(this.reciter,verse.surah,verse.numberInSurah,session.prefetchCancel);
                if (this._session !== session || session.prefetchCancel.is_cancelled()) return;
                this._enqueue(session,{verse,file});
            }
        } catch (error) {
            if (this._session === session && !session.prefetchCancel.is_cancelled()) this._fail(`Next recitation unavailable: ${error.message}`);
        } finally { session.filling = false; }
    }

    async _boundary(session,id) {
        const entry = session.entries.get(id);
        if (!entry || this._session !== session) return;
        for (const key of session.entries.keys()) {
            if (key === id) break;
            session.entries.delete(key);
        }
        session.verse = this.current = this.active = entry.verse;
        session.file = entry.file;
        if (id !== '0') session.repaired = false;
        session.boundaries++;
        session.boundaryId = id;
        this.state = 'playing';
        this._notify();
        this._fill(session);
        if (id === '0') return; // Initial beforePlay already installed this page.
        session.viewCancel?.cancel();
        const viewCancel = new Gio.Cancellable();
        session.viewCancel = viewCancel;
        try {
            await this.beforePlay(entry.verse,viewCancel);
            if (this._session === session && session.boundaryId === id) this._notify();
        } catch (error) {
            if (this._session === session && !viewCancel.is_cancelled()) this._fail(error.message);
        }
    }

    _send(command) {
        const session = this._session;
        if (!session) return;
        session.writes = session.writes.catch(() => {}).then(() => {
            if (this._session !== session || session.cancel.is_cancelled()) return;
            const bytes = new TextEncoder().encode(JSON.stringify(command)+'\n');
            return new Promise((resolve,reject) => {
                session.process.get_stdin_pipe().write_all_async(bytes,GLib.PRIORITY_DEFAULT,session.cancel,(stream,result) => {
                    try { stream.write_all_finish(result); resolve(); } catch (error) { reject(error); }
                });
            });
        }).catch(error => {
            if (this._session === session && !session.cancel.is_cancelled()) this._fail(error.message);
        });
    }

    _fail(message) {
        this._kill(this._session);
        this._session = null;
        this._download?.cancel();
        this._download = null;
        this.state = 'error';
        this.active = null;
        this.error = String(message);
        this._notify();
    }

    destroy() {
        this.stop();
        this._closed = true;
        for (const session of this._children) this._kill(session);
        this.cache.destroy();
        this.onChanged = this.beforePlay = null;
    }
}
