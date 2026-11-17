// Native integration tests: gjs -m tests/audio-worker.js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';
import Gst from 'gi://Gst?version=1.0';
import {isCorruptMediaError} from '../audioWorker.js';
Gst.init(null);
const nativeError = (domain,code,message) => Gst.Message.new_error(null,
    new GLib.Error(domain,code,message),'test bus error').parse_error()[0];
for (const code of [Gst.StreamError.DECODE,Gst.StreamError.DEMUX])
    if (!isCorruptMediaError(nativeError(Gst.StreamError.quark(),code,'localized'))) throw new Error('Corrupt decoder error not classified');
for (const [domain,code] of [[Gst.ResourceError.quark(),Gst.ResourceError.OPEN_WRITE],
    [Gst.ResourceError.quark(),Gst.ResourceError.NOT_FOUND], [Gst.CoreError.quark(),Gst.CoreError.MISSING_PLUGIN],
    [Gst.StreamError.quark(),Gst.StreamError.CODEC_NOT_FOUND], [Gst.StreamError.quark(),Gst.StreamError.TYPE_NOT_FOUND]])
    if (isCorruptMediaError(nativeError(domain,code,'decode corrupt media'))) throw new Error('Environment error classified as corruption');
print('PASS typed Gst domains/codes distinguish corruption from output/plugin errors regardless of message');

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

function delay(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

// Real 440 Hz, mono signed PCM16 samples; no network or audio device required.
function writeWav(path, seconds) {
    const rate = 16000;
    const samples = rate * seconds;
    const bytes = new Uint8Array(44 + samples * 2);
    const view = new DataView(bytes.buffer);
    const text = (offset, value) => {
        for (let i = 0; i < value.length; i++)
            bytes[offset + i] = value.charCodeAt(i);
    };
    text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true);
    text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++)
        view.setInt16(44 + i * 2, Math.round(12000 * Math.sin(2 * Math.PI * 440 * i / rate)), true);
    GLib.file_set_contents(path, bytes);
}

const worker = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('audioWorker.js').get_path();
const clients = [];
class Client {
    constructor(uri, options = ['--test-sink']) {
        this.events = [];
        this.readError = null;
        this.started = GLib.get_monotonic_time();
        this.process = Gio.Subprocess.new(['gjs', '-m', worker, ...[uri].filter(v => v !== undefined), ...options],
            Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        this.input = this.process.get_stdin_pipe();
        this.output = new Gio.DataInputStream({base_stream: this.process.get_stdout_pipe()});
        this.exited = false;
        this.process.wait_async(null, (proc, result) => {
            proc.wait_finish(result);
            this.exited = true;
        });
        clients.push(this);
        this.read();
    }

    read() {
        this.output.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, result) => {
            try {
                const [line] = stream.read_line_finish_utf8(result);
                if (line === null)
                    return;
                const event = JSON.parse(line);
                assert(['playing', 'paused', 'ended', 'stopped', 'error'].includes(event.event), `Invalid event: ${line}`);
                assert(Object.keys(event).every(key => ['event', 'message', 'corruptMedia'].includes(key)), `Invalid schema: ${line}`);
                if (event.event === 'error')
                    assert(typeof event.message === 'string' && event.message.length > 0, 'Error needs a message');
                this.events.push({...event, at: GLib.get_monotonic_time()});
                this.read();
            } catch (error) {
                this.readError = error;
            }
        });
    }

    send(command) {
        this.raw(`${JSON.stringify(command)}\n`);
    }

    raw(text) {
        this.input.write_all(new TextEncoder().encode(text), null);
    }

    async until(predicate, message, timeout = 6000) {
        const deadline = GLib.get_monotonic_time() + timeout * 1000;
        while (!predicate()) {
            if (this.readError)
                throw this.readError;
            assert(GLib.get_monotonic_time() < deadline, `${message}; events=${JSON.stringify(this.events)}`);
            await delay(10);
        }
    }

    async event(name, from = 0) {
        await this.until(() => this.events.slice(from).some(e => e.event === name) || this.exited, `Waiting for ${name}`);
        assert(this.events.slice(from).some(e => e.event === name), `Missing ${name}; events=${JSON.stringify(this.events)}`);
        return this.events.slice(from).find(e => e.event === name);
    }

    async done(status = 0) {
        await this.until(() => this.exited, 'Worker did not exit');
        // Drain stdout callbacks queued just before process completion.
        await delay(30);
        assert(this.process.get_exit_status() === status, `Expected exit ${status}, got ${this.process.get_exit_status()}`);
        const stderr = new Gio.DataInputStream({base_stream: this.process.get_stderr_pipe()});
        const lines = [];
        for (let line; ([line] = stderr.read_line_utf8(null), line !== null);)
            lines.push(line);
        assert(lines.length === 0, `Unexpected stderr: ${lines.join('\n')}`);
        assert(!this.readError, `stdout failure: ${this.readError}`);
    }
}

const tests = [];
tests.push(['real WAV reaches EOS only after its duration', async uri => {
    const client = new Client(uri);
    await client.event('playing');
    const ended = await client.event('ended');
    assert(ended.at - client.started >= 900000, 'EOS arrived before one-second media ended');
    await client.done();
    assert(client.events.filter(e => e.event === 'ended').length === 1, 'EOS must fire once');
    assert(!client.events.some(e => e.event === 'error'), 'Playback unexpectedly failed');
}]);

tests.push(['pause holds media clock and resume completes remaining playback', async uri => {
    const client = new Client(uri);
    await client.event('playing');
    client.send({command: 'pause'});
    await client.event('paused');
    const count = client.events.length;
    await delay(1300);
    assert(!client.exited && client.events.length === count, 'Paused pipeline advanced or exited');
    client.send({command: 'resume'});
    const resumed = await client.event('playing', count);
    const ended = await client.event('ended');
    assert(ended.at - resumed.at >= 700000, 'Resume did not preserve remaining playback');
    await client.done();
}]);

tests.push(['stop while paused exits without EOS', async uri => {
    const client = new Client(uri);
    await client.event('playing');
    client.send({command: 'pause'});
    await client.event('paused');
    client.send({command: 'stop'});
    await client.event('stopped');
    await client.done();
    assert(!client.events.some(e => e.event === 'ended'), 'Stop must not synthesize EOS');
}]);

tests.push(['volume accepts 0..1 and rejects out-of-range values', async uri => {
    const client = new Client(uri);
    await client.event('playing');
    client.send({command: 'volume', value: 0});
    client.send({command: 'volume', value: 0.4});
    client.send({command: 'volume', value: 1});
    client.send({command: 'pause'});
    await client.event('paused');
    assert(!client.events.some(e => e.event === 'error'), 'Valid volume rejected');
    client.send({command: 'volume', value: 1.1});
    const error = await client.event('error');
    assert(error.message.includes('volume'), 'Volume error must identify invalid field');
    await client.done(1);
    assert(!client.events.some(e => e.event === 'ended'), 'Invalid volume must not synthesize EOS');
}]);

tests.push(['unknown command produces terminal protocol error', async uri => {
    const client = new Client(uri);
    await client.event('playing');
    client.send({command: 'seek'});
    await client.event('error');
    await client.done(1);
}]);

tests.push(['stdin EOF stops paused worker without orphaning it', async uri => {
    const client = new Client(uri);
    await client.event('playing');
    client.send({command: 'pause'});
    await client.event('paused');
    client.input.close(null);
    await client.event('stopped');
    await client.done();
    assert(!client.events.some(e => e.event === 'ended'), 'EOF must not synthesize EOS');
}]);

tests.push(['stop during playback exits without EOS', async uri => {
    const client = new Client(uri);
    await client.event('playing');
    client.send({command: 'stop'});
    await client.event('stopped');
    await client.done();
    assert(!client.events.some(e => e.event === 'ended'), 'Stop must not synthesize EOS');
}]);

tests.push(['missing local source reports real GStreamer error', async (_uri, directory) => {
    const client = new Client(Gio.File.new_for_path(`${directory}/missing.wav`).get_uri());
    await client.event('error');
    await client.done(1);
    assert(!client.events.some(e => e.event === 'ended'), 'Source error must not synthesize EOS');
}]);

tests.push(['non-audio local file reports real decode error', async (_uri, directory) => {
    const path = `${directory}/invalid.wav`;
    GLib.file_set_contents(path, 'This is not a WAV audio file.');
    const client = new Client(Gio.File.new_for_path(path).get_uri());
    await client.event('error');
    await client.done(1);
    assert(!client.events.some(e => e.event === 'playing' || e.event === 'ended'), 'Undecodable media must never play');
}]);

tests.push(['malformed JSON fails with machine-readable error', async uri => {
    const client = new Client(uri);
    await client.event('playing');
    client.raw('{broken JSON}\n');
    await client.event('error');
    await client.done(1);
}]);

tests.push(['invalid command shapes and volume values fail safely', async uri => {
    for (const command of [null, [], {}, {command: 'volume', value: -0.1},
        {command: 'volume', value: '0.5'}, {command: 'volume'}]) {
        const client = new Client(uri);
        await client.event('playing');
        client.send(command);
        await client.event('error');
        await client.done(1);
    }
}]);

tests.push(['invalid startup arguments emit JSON errors', async uri => {
    for (const [source, options] of [[undefined, []], ['not-a-uri', ['--test-sink']],
        [uri, ['--unknown-flag']]]) {
        const client = new Client(source, options);
        await client.event('error');
        await client.done(1);
    }
}]);

tests.push(['startup volume is validated before playback', async uri => {
    const quiet = new Client(uri,['--test-sink','--volume=0']);
    await quiet.event('playing');
    quiet.send({command:'stop'});
    await quiet.done(0);
    for (const value of ['-1','1.1','NaN']) {
        const invalid = new Client(uri,['--test-sink',`--volume=${value}`]);
        await invalid.event('error');
        await invalid.done(1);
    }
}]);

const mainloop = new GLib.MainLoop(null, false);
let failed = false;
let directory;
(async () => {
    try {
        directory = GLib.dir_make_tmp('quran-audio-worker-XXXXXX');
        const path = GLib.build_filenamev([directory, 'tone.wav']);
        writeWav(path, 1);
        const uri = Gio.File.new_for_path(path).get_uri();
        for (const [name, test] of tests) {
            await test(uri, directory);
            print(`PASS ${name}`);
        }
        print(`PASS ${tests.length} audio worker integration tests`);
    } catch (error) {
        failed = true;
        printerr(`FAIL ${error.message}`);
    } finally {
        for (const client of clients) {
            if (!client.exited)
                client.process.force_exit();
        }
        if (directory) {
            const dir = Gio.File.new_for_path(directory);
            const entries = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            for (let info; (info = entries.next_file(null));)
                dir.get_child(info.get_name()).delete(null);
            entries.close(null);
            dir.delete(null);
        }
        mainloop.quit();
    }
})();
mainloop.run();
if (failed)
    System.exit(1);
