import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('download_pages', Path(__file__).parents[1] / 'scripts/download-pages.py')
downloader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(downloader)

class ArchiveTests(unittest.TestCase):
    def test_refresh_invalidates_derived_ink_masks(self):
        # Explicit synthetic PNG headers test archive plumbing, not Quran content.
        header = b'\x89PNG\r\n\x1a\n' + b'\x00\x00\x00\rIHDR' + (1024).to_bytes(4, 'big') + (1656).to_bytes(4, 'big')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'pages.zip'
            with zipfile.ZipFile(archive, 'w') as bundle:
                bundle.writestr('width_1024/.v8', '')
                for number in range(1, 605):
                    bundle.writestr(f'width_1024/page{number:03d}.png', header)
                bundle.writestr('../../outside', 'must not be extracted')
            cache = root / 'cache'
            cache.mkdir()
            (cache / 'page001-mask.png').write_bytes(b'stale derived mask')
            self.assertEqual(downloader.install_archive(archive, cache), 604)
            self.assertFalse((cache / 'page001-mask.png').exists())
            self.assertEqual(len(list(cache.glob('page*.png'))), 604)
            self.assertFalse((root / 'outside').exists())

    def test_incomplete_pack_leaves_existing_cache_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'pages.zip'
            with zipfile.ZipFile(archive, 'w') as bundle:
                bundle.writestr('width_1024/.v8', '')
            cache = root / 'cache'
            with self.assertRaisesRegex(ValueError, 'missing Quran pages'):
                downloader.install_archive(archive, cache)
            self.assertFalse(cache.exists())

if __name__ == '__main__':
    unittest.main()
