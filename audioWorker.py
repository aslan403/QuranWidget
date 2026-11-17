#!/usr/bin/python3
"""Owned gapless player. All streaming callbacks stay in CPython, never GJS.

queue commands supply local cached URIs (at most two waiting entries). Boundary
notifications use the sink segment's running time and the actual pipeline clock;
about-to-finish only prepares media and never advances the displayed verse.
"""
import collections
import json
import math
import os
import sys
import threading
import time


def emit(event, **fields):
    print(json.dumps(dict(event=event, **fields)), flush=True)

try:
    import gi
    gi.require_version('Gst', '1.0')
    from gi.repository import Gst, GLib
except (ImportError, ValueError) as error:
    emit('error', message='System Python needs PyGObject and GStreamer 1.0 introspection: '+str(error), corruptMedia=False)
    sys.exit(1)

Gst.init(None)

class Player:
    def __init__(self, args):
        self.loop = GLib.MainLoop()
        self.condition = threading.Condition()
        self.queue = collections.deque()
        self.ids = collections.deque(['0'])
        self.finished = False
        self.prepared = False
        self.status = 0
        self.desired = Gst.State.PLAYING
        self.segment = None
        self.new_segment = False
        self.pending = collections.deque()
        self.player = None
        self.trace = '--test-trace' in args
        self.continuous = '--continuous' in args
        if not args or not Gst.uri_is_valid(args[0]):
            raise ValueError('A valid audio URI is required')
        volume = 1.0
        seen = set()
        for arg in args[1:]:
            key = arg.split('=')[0]
            if key in seen: raise ValueError('Duplicate worker argument')
            seen.add(key)
            if arg in ('--test-sink', '--continuous', '--test-trace'): continue
            if arg.startswith('--volume='):
                volume = float(arg.split('=',1)[1])
                self.validate_volume(volume)
            else: raise ValueError('Unknown worker argument')
        if self.trace and '--test-sink' not in args: raise ValueError('Trace requires test sink')
        self.player = Gst.ElementFactory.make('playbin3', 'audio-player')
        if not self.player: raise ValueError('GStreamer playbin3 is unavailable (install playback plugins)')
        self.player.props.flags = 0x2 | 0x10
        self.player.props.volume = volume
        self.player.props.uri = args[0]
        sink = Gst.ElementFactory.make('fakesink' if '--test-sink' in args else 'autoaudiosink', 'audio-output')
        if not sink: raise ValueError('GStreamer audio sink is unavailable')
        if '--test-sink' in args:
            sink.props.sync = True
            if self.trace:
                sink.props.signal_handoffs = True
                sink.connect('handoff',self.rendered)
        sink.get_static_pad('sink').add_probe(Gst.PadProbeType.EVENT_DOWNSTREAM | Gst.PadProbeType.BUFFER, self.probe)
        self.player.props.audio_sink = sink
        self.player.connect('about-to-finish', self.about_to_finish)
        bus = self.player.get_bus()
        bus.add_signal_watch()
        bus.connect('message', self.message)
        GLib.timeout_add(2, self.dispatch)
        threading.Thread(target=self.commands, daemon=True).start()

    @staticmethod
    def validate_volume(value):
        if isinstance(value, bool) or not isinstance(value, (float,int)) or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError('volume value must be a finite number between 0 and 1')

    def commands(self):
        try:
            for line in sys.stdin:
                command = json.loads(line)
                if not isinstance(command, dict): raise ValueError('Invalid command shape')
                name = command.get('command')
                if name == 'queue' and self.continuous:
                    with self.condition:
                        if len(self.queue) >= 3: raise ValueError('Audio queue limit exceeded')
                        if command.get('end') is True: self.queue.append(None)
                        else:
                            uri, ident = command.get('uri'), command.get('id')
                            if not isinstance(uri,str) or not uri.startswith('file:') or not Gst.uri_is_valid(uri): raise ValueError('queue requires cached local URI')
                            if not isinstance(ident,str) or len(ident)>128: raise ValueError('queue requires bounded id')
                            self.queue.append((uri,ident))
                        self.condition.notify_all()
                elif name in ('pause','resume'):
                    GLib.idle_add(self.change_state, Gst.State.PAUSED if name=='pause' else Gst.State.PLAYING)
                elif name=='volume':
                    self.validate_volume(command.get('value'))
                    GLib.idle_add(self.set_volume, command['value'])
                elif name=='stop':
                    GLib.idle_add(self.finish,'stopped'); return
                else: raise ValueError('Unknown audio worker command')
            GLib.idle_add(self.finish,'stopped')
        except Exception as error:
            GLib.idle_add(self.finish,'error',str(error),False)

    def set_volume(self, value):
        if not self.finished: self.player.props.volume = value
        return False

    def change_state(self, state):
        if not self.finished:
            self.desired = state
            if self.player.set_state(state)==Gst.StateChangeReturn.FAILURE: self.finish('error','Unable to change playback state')
        return False

    def about_to_finish(self, player):
        if not self.continuous: return
        # A missing download is real starvation, not a guessed verse timer.
        # Waiting releases the GIL/condition; the GLib main loop and stop remain live.
        deadline = time.monotonic()+35
        with self.condition:
            while not self.queue and not self.finished:
                if self.desired == Gst.State.PAUSED:
                    deadline = time.monotonic()+35
                remaining = deadline-time.monotonic()
                if remaining<=0:
                    GLib.idle_add(self.finish,'error','Next recitation was not ready (network starvation)',False)
                    return
                self.condition.wait(min(remaining,0.25))
            if self.finished: return
            item = self.queue.popleft()
            if item is None: return
            uri, ident = item
            self.ids.append(ident)
            self.prepared = True
            player.props.uri = uri
        GLib.idle_add(self.queued, ident)

    def queued(self, ident):
        if not self.finished: emit('queued', id=ident)
        return False

    def probe(self, pad, info):
        if info.type & Gst.PadProbeType.EVENT_DOWNSTREAM:
            event = info.get_event()
            if event.type==Gst.EventType.SEGMENT:
                self.segment = event.parse_segment().copy()
                self.new_segment = True
        elif info.type & Gst.PadProbeType.BUFFER and self.segment:
            buffer = info.get_buffer()
            start = self.segment.to_running_time(Gst.Format.TIME,buffer.pts)
            if start==Gst.CLOCK_TIME_NONE: return Gst.PadProbeReturn.OK
            if self.new_segment:
                self.new_segment=False
                with self.condition:
                    ident=self.ids.popleft() if self.ids else '?'
                self.pending.append(dict(event='boundary',id=ident,start=start))
        return Gst.PadProbeReturn.OK

    def rendered(self, sink, buffer, pad):
        # fakesink handoff runs after GstBaseSink clock synchronization. Test only:
        # independently measure rendering instead of trusting our boundary dispatch.
        import struct
        start = self.segment.to_running_time(Gst.Format.TIME,buffer.pts)
        clock = self.running_time()
        ok, mapping = buffer.map(Gst.MapFlags.READ)
        if ok:
            values = struct.unpack('<'+'h'*(len(mapping.data)//2), mapping.data)
            buffer.unmap(mapping)
            self.pending.append(dict(event='sample', start=start,end=start+buffer.duration,
                frames=len(values),sum=sum(values),minimum=min(values),maximum=max(values),renderClock=clock))

    def running_time(self):
        clock = self.player.get_clock()
        return clock.get_time()-self.player.get_base_time() if clock else 0

    def dispatch(self):
        if self.finished: return False
        if self.desired!=Gst.State.PLAYING: return True
        _,state,_ = self.player.get_state(0)
        if state!=Gst.State.PLAYING: return True
        clock=self.running_time()
        latency=self.player.get_latency()
        if latency==Gst.CLOCK_TIME_NONE: latency=0
        while self.pending and self.pending[0]['start']+latency<=clock:
            event=self.pending.popleft()
            if event['event']=='boundary': event['clock']=clock; event['latency']=latency
            if self.continuous or self.trace:
                emit(**event)
        return True

    def message(self, bus, message):
        if self.finished: return
        if message.type==Gst.MessageType.ERROR:
            error,_ = message.parse_error()
            corrupt=any(error.matches(Gst.StreamError.quark(),code) for code in (Gst.StreamError.DECODE,Gst.StreamError.DEMUX))
            # Prefetched decoder failures cannot be attributed safely to the audible
            # clip. Never evict it on an ambiguous queued-stream error.
            self.finish('error',error.message,corrupt and not self.prepared)
        elif message.type==Gst.MessageType.EOS:
            self.dispatch()
            self.finish('ended')
        elif message.type==Gst.MessageType.STATE_CHANGED and message.src==self.player:
            _,state,_=message.parse_state_changed()
            if state==self.desired:
                if state==Gst.State.PLAYING: emit('playing')
                elif state==Gst.State.PAUSED: emit('paused')

    def finish(self, event, message=None, corrupt=False):
        if self.finished: return False
        with self.condition:
            self.finished=True
            self.condition.notify_all()
        # Wake any about-to-finish wait before joining streaming threads in NULL.
        if self.player: self.player.set_state(Gst.State.NULL)
        self.status=1 if event=='error' else 0
        if message is None: emit(event)
        else: emit(event,message=message,corruptMedia=corrupt)
        self.loop.quit()
        return False

    def run(self):
        if self.player.set_state(Gst.State.PLAYING)==Gst.StateChangeReturn.FAILURE:
            self.finish('error','Unable to start audio playback')
        if not self.finished: self.loop.run()
        return self.status

if __name__=='__main__':
    try: sys.exit(Player(sys.argv[1:]).run())
    except Exception as error:
        emit('error',message=str(error),corruptMedia=False)
        sys.exit(1)
