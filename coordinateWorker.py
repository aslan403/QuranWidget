"""Fetch/prepare upstream verse geometry outside Shell; never execute upstream SQL."""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import sys
import tempfile
import urllib.request
import zipfile

SOURCES = {
    'madani': ('https://files.quran.app/hafs/madani/databases/ayahinfo/ayahinfo_1024.zip',
               '30fa152370e19097ad1b4ddac2ea59a05f7ad0a4aa932b427ed87047c75cef69', 1024, 1656, 88246),
    'tajweed': ('https://raw.githubusercontent.com/HiIAmMoot/quran-android-tajweed-page-provider/85e22a084b59fbe6b51d0ad9f090f9e0d4ceae97/glyphs.sql',
                '3376459dc9940f5f7f2ed33059d9893179890da899e2d5d783586a6dd87f98a9', 1340, 1890, 83881),
}
SCHEMA = 'CREATE TABLE glyphs (glyph_id INTEGER,page_number INTEGER,line_number INTEGER,sura_number INTEGER,ayah_number INTEGER,position INTEGER,min_x INTEGER,max_x INTEGER,min_y INTEGER,max_y INTEGER)'

def parse_tajweed_sql(data):
    for line in data.decode('utf-8').splitlines():
        match = re.fullmatch(r'\s*\(\s*(-?\d+(?:\s*,\s*-?\d+){9})\s*\)\s*[,;]?\s*', line)
        if match:
            yield tuple(int(value.strip()) for value in match[1].split(','))

def atomic_bytes(path, data):
    fd, temporary = tempfile.mkstemp(prefix='.prepare-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def ensure_database(directory, edition):
    source, expected, _, _, count = SOURCES[edition]
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    database = directory / 'source.db'
    marker = directory / 'source.sha256'
    if database.exists() and marker.exists() and marker.read_text() == expected:
        return database
    request = urllib.request.Request(source, headers={'User-Agent': 'QuranDesktop verse geometry'})
    with urllib.request.urlopen(request, timeout=20) as response:
        data = response.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError('Verse coordinate download is too large')
    if edition == 'madani':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members = [entry for entry in archive.infolist() if PurePosixPath(entry.filename).name == 'ayahinfo_1024.db']
            if len(members) != 1 or members[0].file_size > 30 * 1024 * 1024:
                raise ValueError('Unexpected verse-coordinate archive')
            data = archive.read(members[0])
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('Verse-coordinate source changed; refusing unverified geometry')
    if edition == 'madani':
        atomic_bytes(database, data)
    else:
        # Only literal ten-integer rows are imported. CREATE/ATTACH/PRAGMA from
        # the upstream text are never executed (its trailing comma is harmless).
        fd, temporary = tempfile.mkstemp(prefix='.source-', dir=directory)
        os.close(fd)
        try:
            with sqlite3.connect(temporary) as connection:
                connection.execute(SCHEMA)
                connection.executemany('INSERT INTO glyphs VALUES (?,?,?,?,?,?,?,?,?,?)', parse_tajweed_sql(data))
                if connection.execute('SELECT COUNT(*) FROM glyphs').fetchone()[0] != count:
                    raise ValueError('Incomplete Tajweed coordinate records')
            os.replace(temporary, database)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    atomic_bytes(marker, expected.encode('ascii'))
    return database

def page_bounds(connection, edition, page):
    _, _, width, height, _ = SOURCES[edition]
    rows = connection.execute('SELECT sura_number,ayah_number,line_number,MIN(min_x),MIN(min_y),MAX(max_x),MAX(max_y) FROM glyphs WHERE page_number=? GROUP BY sura_number,ayah_number,line_number ORDER BY sura_number,ayah_number,line_number', (page,))
    verses = {}
    for surah, verse, _, left, top, right, bottom in rows:
        entry = verses.setdefault(f'{surah}:{verse}', {'rectangles': [], 'complete': True})
        if not (0 <= left < right <= width and 0 <= top < bottom <= height):
            entry['complete'] = False
        entry['rectangles'].append([left, top, right, bottom])
    for surah, verse, first, last, total in connection.execute('SELECT sura_number,ayah_number,MIN(position),MAX(position),COUNT(DISTINCT position) FROM glyphs WHERE page_number=? GROUP BY sura_number,ayah_number', (page,)):
        entry = verses[f'{surah}:{verse}']
        if first != 1 or last != total:
            entry['complete'] = False
        if not entry['complete']:
            entry['rectangles'] = []  # Never invent or knowingly show a partial verse box.
    if not verses:
        raise ValueError('Verse coordinate page is empty')
    return {'version': 1, 'edition': edition, 'page': page, 'width': width, 'height': height, 'verses': verses}

def main():
    edition, page_text, cache_path = sys.argv[1:]
    if edition not in SOURCES or not page_text.isdecimal() or not 1 <= int(page_text) <= 604:
        raise ValueError('Invalid coordinate request')
    cache = Path(cache_path)
    if not cache.is_absolute():
        raise ValueError('Coordinate cache path must be absolute')
    directory = cache / edition
    database = ensure_database(directory, edition)
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
        connection.execute('PRAGMA trusted_schema=OFF')
        kind = connection.execute("SELECT type FROM sqlite_master WHERE name='glyphs'").fetchone()
        if kind != ('table',):
            raise ValueError('Unexpected coordinate database schema')
        result = page_bounds(connection, edition, int(page_text))
    atomic_bytes(directory / f'page{int(page_text):03}.json', json.dumps(result, separators=(',', ':')).encode('utf-8'))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
