import importlib.util
import pathlib
import sqlite3
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / 'coordinateWorker.py'
spec = importlib.util.spec_from_file_location('coordinate_worker', path)
assert spec is not None and spec.loader is not None
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class CoordinatesTest(unittest.TestCase):
    def test_line_aggregation_never_unions_different_lines(self):
        db = sqlite3.connect(':memory:')
        db.execute(worker.SCHEMA)
        db.executemany('INSERT INTO glyphs VALUES (?,?,?,?,?,?,?,?,?,?)', [
            (1,3,1,2,6,1,100,200,10,60), (2,3,1,2,6,2,210,300,10,65),
            (3,3,2,2,6,3,700,900,80,140),
        ])
        result = worker.page_bounds(db,'madani',3)
        self.assertEqual(result['verses']['2:6']['rectangles'],[[100,10,300,65],[700,80,900,140]])
        self.assertTrue(result['verses']['2:6']['complete'])

    def test_missing_word_positions_are_not_filled_with_guessed_bounds(self):
        db = sqlite3.connect(':memory:')
        db.execute(worker.SCHEMA)
        db.executemany('INSERT INTO glyphs VALUES (?,?,?,?,?,?,?,?,?,?)', [
            (1,604,3,112,3,1,231,289,254,378), (2,604,4,112,3,3,908,1283,378,504),
        ])
        result = worker.page_bounds(db,'tajweed',604)['verses']['112:3']
        self.assertFalse(result['complete'])
        self.assertEqual(result['rectangles'],[])

    def test_upstream_sql_is_parsed_as_integer_records_not_executed(self):
        sql = b'ATTACH DATABASE "/not/a/database" AS injected;\n(1,1,2,1,1,1,349,987,460,604),\nCOMMIT;'
        self.assertEqual(list(worker.parse_tajweed_sql(sql)),[(1,1,2,1,1,1,349,987,460,604)])

if __name__ == '__main__': unittest.main()
