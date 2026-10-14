import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('refresh', Path(__file__).with_name('refresh-census-geographies.py'))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

class PaginationTests(unittest.TestCase):
    def test_consumes_all_pages(self):
        with patch.object(refresh, 'fetch', side_effect=[b'{"items":[{"id":"a"}],"total_count":2}', b'{"items":[{"id":"b"}],"total_count":2}']) as fetch:
            self.assertEqual(refresh.listing('areas?'), [{'id': 'a'}, {'id': 'b'}])
            self.assertIn('offset=1', fetch.call_args_list[1].args[0])
    def test_incomplete_page_fails(self):
        with patch.object(refresh, 'fetch', return_value=b'{"items":[],"total_count":2}'):
            with self.assertRaisesRegex(ValueError, 'Incomplete'):
                refresh.listing('areas?')
    def test_failed_source_does_not_write(self):
        with patch.object(refresh, 'fetch', side_effect=RuntimeError('upstream unavailable')), patch.object(Path, 'write_text') as write:
            with self.assertRaises(RuntimeError):
                refresh.main()
            write.assert_not_called()

if __name__ == '__main__':
    unittest.main()
