#!/usr/bin/env python3
"""Cache the upstream Madani v8 page pack; never extract its databases or paths."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request
import zipfile

URL = 'https://android.quran.com/data/zips/images_1024.zip'

def install_archive(archive, destination):
    destination = Path(destination)
    with zipfile.ZipFile(archive) as bundle:
        expected = [f'width_1024/page{number:03d}.png' for number in range(1, 605)]
        names = bundle.namelist()
        if len(set(names)) != len(names) or 'width_1024/.v8' not in names:
            raise ValueError('Expected the Madani version 8 image pack')
        if not set(expected).issubset(names):
            raise ValueError('Archive is missing Quran pages')
        # Validate all entries before touching a preexisting cache.
        manifest = {}
        for name in expected:
            if bundle.getinfo(name).file_size > 5 * 1024 * 1024:
                raise ValueError(f'Image is unexpectedly large: {name}')
            data = bundle.read(name)
            if data[:8] != b'\x89PNG\r\n\x1a\n' or len(data) < 24:
                raise ValueError(f'Invalid PNG: {name}')
            if int.from_bytes(data[16:20], 'big') != 1024 or not 100 <= int.from_bytes(data[20:24], 'big') <= 3000:
                raise ValueError(f'Unexpected dimensions: {name}')
            manifest[Path(name).name] = hashlib.sha256(data).hexdigest()
        destination.mkdir(parents=True, exist_ok=True)
        for name in expected:
            target = destination / Path(name).name
            data = bundle.read(name)
            with tempfile.NamedTemporaryFile(dir=destination, delete=False) as temporary:
                temporary.write(data)
                temporary_name = temporary.name
            os.replace(temporary_name, target)
            target.with_name(target.stem + '-mask.png').unlink(missing_ok=True)
        provenance = {'source': URL, 'imageVersion': 8, 'pages': 604, 'sha256': manifest}
        (destination / 'SOURCE.json').write_text(json.dumps(provenance, indent=2) + '\n')
    return len(manifest)

def main():
    parser = argparse.ArgumentParser(description='Download all 604 Quran Android Madani pages for offline reading (~61 MB transfer).')
    parser.add_argument('--archive', type=Path, help='Use an already downloaded upstream images_1024.zip')
    parser.add_argument('--destination', type=Path, default=Path(os.environ.get('XDG_CACHE_HOME', Path.home() / '.cache')) / 'quran-desktop' / 'madani-1024-v8')
    args = parser.parse_args()
    if args.archive:
        count = install_archive(args.archive, args.destination)
    else:
        scratch = Path(os.environ.get('TMPDIR', args.destination.parent))
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='quran-download-', dir=scratch) as directory:
            archive = Path(directory) / 'images_1024.zip'
            print(f'Downloading {URL}', flush=True)
            with urllib.request.urlopen(URL, timeout=120) as response, archive.open('wb') as target:
                while chunk := response.read(1024 * 1024):
                    target.write(chunk)
            count = install_archive(archive, args.destination)
    print(f'Cached {count} original Madani v8 pages in {args.destination}')

if __name__ == '__main__':
    main()
