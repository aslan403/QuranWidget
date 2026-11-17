import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {audioFilename, audioUrl} from './audioModel.js';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export class AudioCache {
    constructor(directory = null) {
        this.directory = directory ?? GLib.build_filenamev([GLib.get_user_cache_dir(),'quran-desktop','audio-v1']);
        this._session = new Soup.Session({timeout:30,user_agent:'QuranDesktop audio (GNOME Shell)'});
        this._closed = false;
    }

    _valid(file, cancellable) {
        const size = file.query_info('standard::size',Gio.FileQueryInfoFlags.NONE,cancellable).get_size();
        if (size < 8 || size > MAX_AUDIO_BYTES) return false;
        const input = file.read(cancellable);
        try {
            // Walk frame boundaries, not payloads. Only a 64 KiB window enters JS.
            let base = -1, window = null;
            const at = (offset, count) => {
                if (offset + count > size) return [];
                if (base < 0 || offset < base || offset + count > base + window.length) {
                    input.seek(offset,GLib.SeekType.SET,cancellable);
                    window = input.read_bytes(Math.min(65536,size-offset),cancellable).get_data();
                    base = offset;
                }
                return window.subarray(offset-base,offset-base+count);
            };
            let offset = 0, frames = 0;
            const tag = at(0,10);
            if (tag[0] === 73 && tag[1] === 68 && tag[2] === 51) {
                if (tag.length !== 10 || ![2,3,4].includes(tag[3]) || tag.slice(6).some(b => b & 128)) return false;
                offset = 10 + tag.slice(6).reduce((n,b) => n*128+b,0) + (tag[3] === 4 && (tag[5]&16) ? 10 : 0);
            }
            while (offset < size) {
                cancellable?.set_error_if_cancelled();
                const h = at(offset,4);
                if (size-offset === 128 && h[0] === 84 && h[1] === 65 && h[2] === 71) { offset = size; break; }
                if (h.length !== 4 || h[0] !== 255 || (h[1]&224) !== 224) return false;
                const version = (h[1]>>3)&3, layer = (h[1]>>1)&3, bitrate = h[2]>>4, rate = (h[2]>>2)&3;
                if (version === 1 || layer !== 1 || bitrate === 0 || bitrate === 15 || rate === 3 || (h[3]&3) === 2) return false;
                const kbps = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] :
                    [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrate];
                const hz = [44100,48000,32000][rate] / (version === 3 ? 1 : version === 2 ? 2 : 4);
                offset += Math.floor((version === 3 ? 144000 : 72000)*kbps/hz) + ((h[2]>>1)&1);
                if (offset > size) return false;
                frames++;
            }
            return offset === size && frames >= 2;
        } finally { input.close(null); }
    }

    async load(reciter, surah, verse, cancellable) {
        const url = audioUrl(reciter,surah,verse);
        cancellable.set_error_if_cancelled();
        if (this._closed) throw new Error('Audio cache was closed');
        const directory = GLib.build_filenamev([this.directory,reciter]);
        const file = Gio.File.new_for_path(GLib.build_filenamev([directory,audioFilename(surah,verse)]));
        if (file.query_exists(null)) {
            if (this._valid(file,cancellable)) return file;
            file.delete(cancellable);
        }
        const message = Soup.Message.new('GET',url);
        const input = await new Promise((resolve,reject) => {
            this._session.send_async(message,GLib.PRIORITY_DEFAULT,cancellable,(session,result) => {
                try { resolve(session.send_finish(result)); } catch (error) { reject(error); }
            });
        });
        try {
            cancellable.set_error_if_cancelled();
            if (this._closed) throw new Error('Audio cache was closed');
            if (message.status_code !== Soup.Status.OK) throw new Error(`Recitation download returned HTTP ${message.status_code}`);
            if (message.response_headers.get_content_length() > MAX_AUDIO_BYTES) throw new Error('Unexpected recitation size');
            GLib.mkdir_with_parents(directory,0o700);
            const expected = message.response_headers.get_encoding() === Soup.Encoding.CONTENT_LENGTH ?
                message.response_headers.get_content_length() : null;
            return await this._storeStream(input,file,cancellable,expected);
        } finally { input.close(null); }
    }

    async _storeStream(input,file,cancellable,expected = null) {
        const temporary = file.get_parent().get_child(`${file.get_basename()}.part-${GLib.uuid_string_random()}`);
        let output = null;
        try {
            output = temporary.create(Gio.FileCreateFlags.PRIVATE,cancellable);
            let total = 0;
            while (true) {
                const bytes = await new Promise((resolve,reject) => {
                    input.read_bytes_async(65536,GLib.PRIORITY_DEFAULT,cancellable,(stream,result) => {
                        try { resolve(stream.read_bytes_finish(result)); } catch (error) { reject(error); }
                    });
                });
                const size = bytes.get_size();
                if (size === 0) break;
                total += size;
                if (total > MAX_AUDIO_BYTES) throw new Error('Unexpected recitation size');
                // Keep chunks as native GBytes, including partial native writes.
                let remaining = bytes;
                while (remaining.get_size()) {
                    const written = await new Promise((resolve,reject) => {
                        output.write_bytes_async(remaining,GLib.PRIORITY_DEFAULT,cancellable,(stream,result) => {
                            try { resolve(stream.write_bytes_finish(result)); } catch (error) { reject(error); }
                        });
                    });
                    if (!written) throw new Error('Unable to write recitation');
                    remaining = remaining.new_from_bytes(written,remaining.get_size()-written);
                }
            }
            if (expected !== null && total !== expected) throw new Error('Unexpected recitation size');
            output.close(cancellable);
            output = null;
            if (!this._valid(temporary,cancellable)) throw new Error('Recitation server did not return MP3 audio');
            cancellable.set_error_if_cancelled();
            if (this._closed) throw new Error('Audio cache was closed');
            temporary.move(file,Gio.FileCopyFlags.OVERWRITE,cancellable,null);
            return file;
        } finally {
            try { if (output) output.close(null); }
            finally { if (temporary.query_exists(null)) temporary.delete(null); }
        }
    }

    destroy() { this._closed = true; this._session.abort(); }
}
