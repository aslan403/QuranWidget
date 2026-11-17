// Shell-safe launcher: do not import GStreamer into the compositor process.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function audioWorkerCommand() {
    // Prefer the distro interpreter that owns the distro PyGObject bindings,
    // not an unrelated venv/agent Python found first in PATH.
    const python = ['/usr/bin/python3','/usr/local/bin/python3',GLib.find_program_in_path('python3')]
        .find(path => path && GLib.file_test(path,GLib.FileTest.IS_EXECUTABLE));
    if (!python) throw new Error('Recitation needs system Python 3 with PyGObject and GStreamer 1.0 introspection');
    const script = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('audioWorker.py');
    if (!script.query_exists(null)) throw new Error('Missing recitation helper audioWorker.py; reinstall the extension');
    return [python,'-s',script.get_path()];
}
