"""Synthetic, offline importer regressions. Never assert live FSA ratings."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


def module(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


fsa = module('import-fsa')
references = module('prepare-geography')

XML = '''<FHRSEstablishment><Header><ExtractDate>2026-01-01</ExtractDate><ItemCount>1</ItemCount><ReturnCode>Success</ReturnCode></Header><EstablishmentCollection><EstablishmentDetail>
<FHRSID>123</FHRSID><BusinessName>Synthetic cafe</BusinessName><BusinessType>Restaurant/Cafe/Canteen</BusinessType><BusinessTypeID>1</BusinessTypeID><PostCode>CF10 1AA</PostCode><RatingValue>AwaitingInspection</RatingValue><RatingDate xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/><NewRatingPending>False</NewRatingPending><LocalAuthorityCode>556</LocalAuthorityCode><SchemeType>FHRS</SchemeType><Geocode><Latitude>51.48</Latitude><Longitude>-3.18</Longitude></Geocode></EstablishmentDetail></EstablishmentCollection></FHRSEstablishment>'''


class Imports(unittest.TestCase):
    def test_source_fields_and_nulls_are_preserved_without_enrichment(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'source.xml'
            path.write_text(XML)
            snapshot = fsa.import_fsa(path, 1, '2026-01-02T00:00:00Z')
            record = snapshot['records'][0]
            self.assertEqual(record['FHRSID'], '123')
            self.assertEqual(record['RatingValue'], 'AwaitingInspection')
            self.assertIsNone(record['RatingDate'])
            self.assertEqual(record['Geocode']['Longitude'], '-3.18')
            self.assertNotIn('ward_code', record)
            self.assertEqual(snapshot['expected_count'], 1)

    def test_incomplete_wrong_scope_duplicate_or_unsafe_sources_fail(self):
        invalid = [XML[:-30], XML.replace('<ItemCount>1', '<ItemCount>2'), XML.replace('>556<', '>999<'), XML.replace('>FHRS<', '>FHIS<'),
                   XML.replace('>False<', '>Perhaps<'), XML.replace('>123<', '>not-an-id<'), XML.replace('>123<', '>00123<'),
                   XML.replace('<BusinessTypeID>1', '<BusinessTypeID>invalid'), '<!DOCTYPE x>' + XML, XML.replace('>Success<', '>Failed<')]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'source.xml'
            canonical = Path(folder) / 'previous.json'
            canonical.write_text('previous snapshot')
            for raw in invalid:
                path.write_text(raw)
                with self.assertRaises(Exception):
                    fsa.import_fsa(path, 1, '2026-01-02T00:00:00Z')
                self.assertEqual(canonical.read_text(), 'previous snapshot')
            path.write_text(XML)
            with self.assertRaisesRegex(ValueError, 'Incomplete'):
                fsa.import_fsa(path, 2, '2026-01-02T00:00:00Z')

    def test_changed_reference_input_cannot_publish_partial_candidate(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            (directory / 'input.json').write_text('{}')
            (directory / 'inputs.json').write_text(json.dumps(dict(files={'input.json': 'wrong-checksum'})))
            candidate = directory / 'candidate'
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                references.prepare(directory, candidate)
            self.assertFalse(candidate.exists())


if __name__ == '__main__':
    unittest.main()
