import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const uuid=new GLib.Variant('(s)',['quran-desktop@local']);
const ext=`Main.extensionManager.lookup('quran-desktop@local').stateObj`;
function call(iface,method,params=null) {return Gio.DBus.session.call_sync('org.gnome.Shell','/org/gnome/Shell',iface,method,params,null,Gio.DBusCallFlags.NONE,10000,null).deep_unpack();}
function evaluate(code) {const [ok,value]=call('org.gnome.Shell','Eval',new GLib.Variant('(s)',[code]));if(!ok)throw new Error(value);return value === '' ? null : JSON.parse(value);}
function expect(value,label){if(!value)throw new Error(label);print('PASS: '+label);}
function waitFor(callback,label){for(let i=0;i<200;i++){if(callback())return;if(evaluate(`${ext}._audio?.state`) === 'error')throw new Error(evaluate(`${ext}._audio.error`));GLib.usleep(100000);}throw new Error('Timeout: '+label+' '+JSON.stringify(evaluate(`({state:${ext}._audio?.state,current:${ext}._audio?.current?.numberInSurah})`)));}
function capture(name){GLib.usleep(250000);const file=GLib.getenv('QURAN_TEST_ROOT')+'/'+name+'.png';const[ok]=Gio.DBus.session.call_sync('org.gnome.Shell','/org/gnome/Shell/Screenshot','org.gnome.Shell.Screenshot','Screenshot',new GLib.Variant('(bbs)',[false,false,file]),null,Gio.DBusCallFlags.NONE,10000,null).deep_unpack();expect(ok,'audio/highlight screenshot: '+file);}
expect(evaluate(`${ext}._audio.state === 'stopped' && ${ext}._audio._children.size === 0`),'Shell enable never autoplays recitation');
expect(evaluate('Number.isInteger(imports.gi.Meta.KeyBindingFlags.IGNORE_AUTOREPEAT)'),'native play/pause binding supports suppression of held-key repeats');
evaluate(`Main.overview.hide(); globalThis.quranAudioKeyboardReady=false; Promise.all([import('gi://Clutter'),import('gi://GLib')]).then(([c,g])=>{globalThis.quranAudioClutter=c.default;globalThis.quranAudioGLib=g.default;globalThis.quranAudioKeyboard=c.default.get_default_backend().get_default_seat().create_virtual_device(c.default.InputDeviceType.KEYBOARD_DEVICE);globalThis.quranAudioKeyboardReady=true;});true`);
waitFor(()=>evaluate('globalThis.quranAudioKeyboardReady && !Main.overview.visible'),'audio virtual keyboard');
GLib.usleep(300000);

function press(key) {
    evaluate(`(()=>{const C=globalThis.quranAudioClutter,k=globalThis.quranAudioKeyboard;const notify=(symbol,state)=>k.notify_keyval(globalThis.quranAudioGLib.get_monotonic_time(),C['KEY_'+symbol],state);notify('Control_L',C.KeyState.PRESSED);notify('Alt_L',C.KeyState.PRESSED);notify('${key}',C.KeyState.PRESSED);notify('${key}',C.KeyState.RELEASED);notify('Alt_L',C.KeyState.RELEASED);notify('Control_L',C.KeyState.RELEASED);return true;})()`);
}
evaluate(`${ext}._audio._workerArgs=['--test-sink']; ${ext}._settings.set_string('page-layout','madani'); ${ext}._settings.set_string('mushaf-edition','madani'); ${ext}._settings.set_string('page-theme','light'); ${ext}._settings.set_string('audio-repeat','verse'); ${ext}._settings.set_int('page',1); ${ext}._settings.set_boolean('all-monitors',true); true`);
press('space');
waitFor(()=>evaluate(`${ext}._audio.state`) === 'playing','real recitation playing with silent test sink');
expect(evaluate(`${ext}._audio.active.surah === 1 && ${ext}._audio.active.numberInSurah === 1 && ${ext}._coordinates.verses['1:1'].complete`),'real decoder state drives accurate Madani verse highlight');
capture('audio-madani');
evaluate(`${ext}._indicator.menu.open(); true`);
capture('audio-controls');
evaluate(`${ext}._indicator.menu.close(); true`);
GLib.usleep(250000);
press('space');
waitFor(()=>evaluate(`${ext}._audio.state`) === 'paused','pause');
expect(evaluate(`${ext}._audio.active.numberInSurah`) === 1,'pause retains verse selection');
press('bracketleft'); GLib.usleep(100000);
expect(evaluate(`${ext}._audio.state === 'paused' && ${ext}._audio.active.numberInSurah === 1`),'previous shortcut at first verse does not stop playback');
press('space');
waitFor(()=>evaluate(`${ext}._audio.state`) === 'playing','resume');
press('bracketright');
waitFor(()=>evaluate(`${ext}._audio.active?.numberInSurah`) === 2,'next verse');
expect(true,'next verse replaces audio and highlight together');
press('bracketleft');
waitFor(()=>evaluate(`${ext}._audio.active?.numberInSurah`) === 1,'previous verse shortcut');
evaluate(`globalThis.quranVolumeSession=${ext}._audio._session; true`);
press('equal');
waitFor(()=>evaluate(`${ext}._settings.get_int('audio-volume')`) === 85,'volume up shortcut');
press('minus');
waitFor(()=>evaluate(`${ext}._settings.get_int('audio-volume')`) === 80,'volume down shortcut');
evaluate(`${ext}._settings.set_int('audio-volume',97); true`); press('equal');
waitFor(()=>evaluate(`${ext}._settings.get_int('audio-volume')`) === 100,'upper volume clamp');
evaluate(`${ext}._settings.set_int('audio-volume',2); true`); press('minus');
waitFor(()=>evaluate(`${ext}._settings.get_int('audio-volume')`) === 0,'lower volume clamp');
expect(evaluate(`${ext}._audio._session === globalThis.quranVolumeSession`),'volume shortcuts clamp and update without restarting playback');
evaluate(`${ext}._settings.set_int('audio-volume',80); delete globalThis.quranVolumeSession; true`);
evaluate(`${ext}._settings.set_int('page',3); true`);
expect(evaluate(`${ext}._audio.state === 'stopped' && ${ext}._audio.active === null`),'manual page navigation stops audio and clears highlights');
evaluate(`${ext}._settings.set_string('mushaf-edition','tajweed'); ${ext}._audioEntry.set_text('١:١'); ${ext}._audioEntry.clutter_text.emit('activate'); true`);
waitFor(()=>evaluate(`${ext}._audio.state`) === 'playing','Tajweed verse playback');
expect(evaluate(`${ext}._settings.get_int('page') === 1 && ${ext}._coordinates.edition === 'tajweed'`),'Arabic verse reference follows the correct page and edition');
expect(evaluate(`${ext}._areas.length`) === evaluate('Main.layoutManager.monitors.length'),'one decoder drives every display copy');
capture('audio-tajweed');
evaluate(`${ext}._audio.stop(); ${ext}._audio.playVerse(112,3); true`);
waitFor(()=>evaluate(`${ext}._audio.active?.surah === 112 && ${ext}._audio.active?.numberInSurah === 3`),'known incomplete-coordinate verse');
expect(evaluate(`${ext}._coordinates.verses['112:3'].complete === false && ${ext}._coordinates.verses['112:3'].rectangles.length === 0`),'upstream omission uses explicit full-text footer fallback, never guessed boxes');
capture('audio-tajweed-fallback');
evaluate(`${ext}._audio.stop(); ${ext}._settings.set_string('page-layout','transparent'); ${ext}._audio.playVerse(1,1); true`);
waitFor(()=>evaluate(`${ext}._audio.state`) === 'playing','transparent text playback');
capture('audio-transparent');
press('s');
waitFor(()=>evaluate(`${ext}._audio.state`) === 'stopped','stop shortcut');
press('bracketright'); GLib.usleep(100000);
expect(evaluate(`${ext}._audio.state === 'stopped' && ${ext}._audio.current === null`),'verse shortcut while stopped does not autoplay');
evaluate(`${ext}._settings.set_strv('quran-audio-toggle',[]); true`); GLib.usleep(200000);
press('space'); GLib.usleep(200000);
expect(evaluate(`${ext}._audio.state`) === 'stopped','empty audio binding disables the global shortcut');
evaluate(`${ext}._settings.set_strv('quran-audio-toggle',['<Control><Alt>p']); true`); GLib.usleep(200000);
press('space'); GLib.usleep(100000);
expect(evaluate(`${ext}._audio.state`) === 'stopped','old audio accelerator no longer fires after rebinding');
press('p');
waitFor(()=>evaluate(`${ext}._audio.state`) === 'playing','live rebound play shortcut');
expect(true,'custom audio shortcut starts playback without restarting Shell');
evaluate(`${ext}._settings.reset('quran-audio-toggle'); true`);
evaluate(`globalThis.quranOldAudio=${ext}._audio; globalThis.quranOldCoordinates=${ext}._coordinateStore; true`);
call('org.gnome.Shell.Extensions','DisableExtension',uuid);
press('space'); GLib.usleep(100000);
expect(evaluate('globalThis.quranOldAudio.state') === 'stopped','disable removes audio keybindings');
for(let i=0;i<100 && evaluate('globalThis.quranOldAudio._children.size')>0;i++)GLib.usleep(50000);
expect(evaluate('globalThis.quranOldAudio._closed && globalThis.quranOldAudio._children.size === 0 && globalThis.quranOldCoordinates._workers.size === 0'),'disable stops and reaps audio and coordinate workers');
call('org.gnome.Shell.Extensions','EnableExtension',uuid);
waitFor(()=>evaluate(`Boolean(${ext}._audio)`),'re-enable audio controller');
expect(evaluate(`${ext}._audio.state === 'stopped' && ${ext}._audio._workerArgs.length === 0`),'re-enable is stopped and production never selects the test sink');
evaluate(`${ext}._settings.set_boolean('all-monitors',false); ${ext}._settings.set_string('audio-repeat','none'); ${ext}._settings.set_string('page-layout','madani'); ${ext}._settings.set_string('mushaf-edition','tajweed'); ${ext}._settings.set_int('page',3); delete globalThis.quranOldAudio;delete globalThis.quranOldCoordinates;true`);
print('All native audio and synchronized highlighting checks passed.');
