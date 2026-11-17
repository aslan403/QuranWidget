// Compatibility entry point; streaming-thread callbacks live only in Python.
import Gio from 'gi://Gio';
import Gst from 'gi://Gst?version=1.0';
import System from 'system';
import {audioWorkerCommand} from './audioProcess.js';
export {audioWorkerCommand};

export function isCorruptMediaError(error) {
    return [Gst.StreamError.DECODE,Gst.StreamError.DEMUX].some(code =>
        error.matches?.(Gst.StreamError.quark(),code));
}


if (System.programPath && Gio.File.new_for_path(System.programPath).equal(Gio.File.new_for_uri(import.meta.url))) {
    try {
        const child = Gio.Subprocess.new([...audioWorkerCommand(),...ARGV],Gio.SubprocessFlags.STDIN_INHERIT);
        child.wait(null);
        System.exit(child.get_successful() ? 0 : 1);
    } catch (error) {
        print(JSON.stringify({event:'error',message:error.message,corruptMedia:false}));
        System.exit(1);
    }
}
