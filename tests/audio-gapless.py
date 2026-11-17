#!/usr/bin/python3
"""Synthetic PCM boundary regression; no Quran audio is fabricated."""
import json, os, pathlib, selectors, subprocess, tempfile, time, wave, struct
ROOT = pathlib.Path(__file__).resolve().parents[1]

def run():
    with tempfile.TemporaryDirectory(prefix='quran-gapless-', dir=os.environ['TMPDIR']) as directory:
        paths = []
        for value in (1000, 2000, 3000):
            path = pathlib.Path(directory) / f'{value}.wav'
            with wave.open(str(path), 'wb') as out:
                out.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
                out.writeframes(struct.pack('<h', value) * 3200)
            paths.append(path.as_uri())
        # Optional immutable old worker baseline (never label the new implementation legacy).
        baseline = []
        for uri in (paths[:2] if os.environ.get('QURAN_BASELINE_WORKER') else []):
            p = subprocess.Popen(['gjs','-m',os.environ['QURAN_BASELINE_WORKER'],uri,'--test-sink'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            for line in p.stdout:
                event = json.loads(line)
                if event['event'] in ('playing','ended'):
                    baseline.append((event['event'], time.monotonic_ns()))
            p.wait(timeout=5)
        if baseline: print('legacy EOS→next PLAYING gap_ms=', (baseline[2][1]-baseline[1][1])/1e6, flush=True)
        # A single persistent output must accept queued clips, preserve every PCM sample,
        # and report highlights at the rendered boundary, not when next is prepared.
        p = subprocess.Popen(['/usr/bin/python3','-s',str(ROOT/'audioWorker.py'),paths[0],'--test-sink','--test-trace','--continuous'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for i, uri in enumerate(paths[1:], 1):
            p.stdin.write(json.dumps({'command':'queue','uri':uri,'id':str(i)})+'\n')
        p.stdin.write(json.dumps({'command':'queue','end':True})+'\n'); p.stdin.flush()
        events = []
        deadline = time.monotonic()+10
        selector = selectors.DefaultSelector(); selector.register(p.stdout, selectors.EVENT_READ)
        try:
            while time.monotonic()<deadline:
                if selector.select(0.1):
                    line = p.stdout.readline()
                    if not line: break
                    events.append(json.loads(line))
                if p.poll() is not None:
                    events.extend(json.loads(line) for line in p.stdout if line.strip()); break
            assert p.wait(timeout=2)==0, events
            assert not p.stderr.read(), 'unexpected stderr'
            buffers = [e for e in events if e['event']=='sample']
            boundaries = [e for e in events if e['event']=='boundary']
            assert len(boundaries)==3, events
            assert [e['id'] for e in boundaries]==['0','1','2'], 'source order changed'
            assert sum(e['frames'] for e in buffers)==9600, 'lost or duplicated samples'
            assert sum(e['sum'] for e in buffers)==3200*6000, 'changed PCM samples'
            gaps = [(b['start']-a['end']) for a,b in zip(buffers,buffers[1:])]
            assert all(gap==0 for gap in gaps), gaps
            assert all(e['minimum']==e['maximum'] for e in buffers), 'mixed or changed samples'
            for value in (1000,2000,3000):
                assert sum(e['frames'] for e in buffers if e['minimum']==value)==3200
            assert [e['minimum'] for e in buffers]==sorted(e['minimum'] for e in buffers), 'sample order changed'
            rendered_gaps=[b['renderClock']-(a['renderClock']+a['end']-a['start']) for a,b in zip(buffers,buffers[1:]) if a['minimum']!=b['minimum']]
            assert all(abs(gap)<30_000_000 for gap in rendered_gaps), rendered_gaps
            for boundary in boundaries:
                sample=next(e for e in buffers if e['start']==boundary['start'])
                assert abs(sample['renderClock']-boundary['clock'])<30_000_000, 'highlight not at synchronized render'
            print('synchronized render boundary gap_ms=',[round(gap/1e6,3) for gap in rendered_gaps])
            assert all(0 <= e['clock']-e['start'] < 30_000_000 for e in boundaries), boundaries
            print('PASS synthetic PCM: 9600 unchanged samples; max PTS gap_ns=',max(gaps),'; boundary clock error_ms=',[round((e['clock']-e['start'])/1e6,3) for e in boundaries])
        finally:
            if p.poll() is None: p.kill(); p.wait()
if __name__=='__main__': run()
