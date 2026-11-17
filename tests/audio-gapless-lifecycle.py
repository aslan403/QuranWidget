#!/usr/bin/python3
"""Direct production-helper tests: synchronized silent output only."""
import importlib.util
import json
import os
import pathlib
import queue
import subprocess
import tempfile
import threading
import time
import unittest
import wave
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('worker', ROOT/'audioWorker.py')
worker=importlib.util.module_from_spec(spec); spec.loader.exec_module(worker)
Gst,GLib=worker.Gst,worker.GLib

class Client:
    def __init__(self, uri, trace=False):
        self.p=subprocess.Popen(['/usr/bin/python3','-s',str(ROOT/'audioWorker.py'),uri,'--continuous','--test-sink']+(['--test-trace'] if trace else []), stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.events=[]; self.incoming=queue.Queue()
        def read():
            for line in self.p.stdout: self.incoming.put(json.loads(line))
            self.incoming.put(None)
        threading.Thread(target=read,daemon=True).start()
    def send(self, **data):
        self.p.stdin.write(json.dumps(data)+'\n'); self.p.stdin.flush()
    def until(self, name, timeout=5):
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            event=self.incoming.get(timeout=max(.01,deadline-time.monotonic()))
            if event is None: raise AssertionError(self.events)
            self.events.append(event)
            if event['event']==name: return event
        raise AssertionError(self.events)
    def close(self):
        if self.p.stderr.closed: return
        if self.p.poll() is None:
            self.p.stdin.close()
        try: self.p.wait(timeout=3)
        except subprocess.TimeoutExpired: self.p.kill(); self.p.wait(); raise
        stderr=self.p.stderr.read()
        assert not stderr,stderr
        self.p.stdout.close(); self.p.stderr.close()
        if not self.p.stdin.closed: self.p.stdin.close()

class Tests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory(prefix='quran-gap-life-',dir=os.environ['TMPDIR'])
        self.path=pathlib.Path(self.directory.name)/'synthetic.wav'
        with wave.open(str(self.path),'wb') as wav:
            wav.setparams((1,2,16000,0,'NONE','PCM')); wav.writeframes(b'\xe8\x03'*8000)
        self.clients=[]
    def tearDown(self):
        for client in self.clients: client.close()
        self.directory.cleanup()
    def client(self, uri=None):
        client=Client(uri or self.path.as_uri()); self.clients.append(client); return client
    def test_typed_error_does_not_evict_current_for_ambiguous_preroll(self):
        player=worker.Player.__new__(worker.Player)
        player.finished=False; player.continuous=True
        errors=[]
        player.finish=lambda *args:errors.append(args)
        message=Gst.Message.new_error(None,GLib.Error.new_literal(Gst.StreamError.quark(),'localized',Gst.StreamError.DECODE), 'native typed error')
        player.prepared=False
        player.message(None,message)
        self.assertTrue(errors[-1][2], 'first stream must retain one-retry typed repair')
        player.prepared=True
        player.message(None,message)
        self.assertFalse(errors[-1][2], 'ambiguous future decoder must not evict healthy audible media')
    def test_stop_wakes_empty_queue_and_reaps(self):
        client=self.client(); client.until('playing'); client.send(command='stop')
        client.until('stopped'); client.close(); self.assertEqual(client.p.returncode,0)
    def test_stdin_eof_wakes_empty_queue(self):
        client=self.client(); client.until('playing'); client.p.stdin.close()
        client.until('stopped'); client.close(); self.assertEqual(client.p.returncode,0)
    def test_pause_holds_boundary_and_resume_uses_media_clock(self):
        client=self.client()
        client.send(command='queue',uri=self.path.as_uri(),id='1'); client.send(command='queue',end=True)
        client.until('boundary'); client.send(command='pause'); client.until('paused')
        time.sleep(.65)
        self.assertFalse(any(event['event']=='boundary' and event['id']=='1' for event in client.events))
        client.send(command='resume'); boundary=client.until('boundary')
        self.assertEqual(boundary['id'],'1'); self.assertGreaterEqual(boundary['clock'],boundary['start'])
        client.until('ended'); client.close()
    def test_late_download_reports_actual_clock_not_preparation(self):
        client=self.client(); client.until('boundary'); time.sleep(.8)
        client.send(command='queue',uri=self.path.as_uri(),id='late'); client.send(command='queue',end=True)
        client.until('queued'); boundary=client.until('boundary')
        self.assertEqual(boundary['id'],'late'); self.assertGreaterEqual(boundary['clock'],boundary['start'])
        client.until('ended'); client.close()
    def test_invalid_future_file_is_non_evicting(self):
        broken=pathlib.Path(self.directory.name)/'broken.wav'; broken.write_bytes(b'not an audio file')
        client=self.client(); client.send(command='queue',uri=broken.as_uri(),id='bad'); client.send(command='queue',end=True)
        error=client.until('error'); self.assertFalse(error['corruptMedia'])
        self.assertTrue(self.path.exists()); client.close(); self.assertEqual(client.p.returncode,1)
    def test_real_mp3_boundaries(self):
        directory=pathlib.Path.home()/'.cache/quran-desktop/audio-v1/alafasy'
        paths=[directory/name for name in ('001001.mp3','001002.mp3')]
        if not all(path.exists() for path in paths): self.skipTest('real upstream cached MP3 fixtures absent')
        client=self.client(paths[0].as_uri())
        client.send(command='queue',uri=paths[1].as_uri(),id='real-1:2'); client.send(command='queue',end=True)
        first=client.until('boundary',15); second=client.until('boundary',15)
        self.assertEqual(first['id'],'0'); self.assertEqual(second['id'],'real-1:2')
        self.assertGreater(second['start'],0); self.assertGreaterEqual(second['clock'],second['start'])
        self.assertLess(second['clock']-second['start'],30_000_000)
        print('real MP3 boundary running_ns=',second['start'],'clock_error_ms=',(second['clock']-second['start'])/1e6,flush=True)
        client.until('ended',15); client.close()

if __name__=='__main__': unittest.main(verbosity=2)
