"""Offline contracts for source freshness classification."""
import importlib.util
import json
import unittest
import runpy
import tempfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('freshness', __file__.replace('test-source-freshness.py', 'check-source-freshness.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class FreshnessTests(unittest.TestCase):
    def test_register_same_and_replaced_workbook(self):
        stored = m.load('src/schools/directory.json')
        page = f'<a href="{stored["source_download_url"]}">Register</a>'.encode()
        def get(url):
            return page if url == stored['source_url'] else b'changed workbook'
        self.assertIn('workbook content changed', m.register_check(get))
        with patch.object(m.hashlib, 'sha256') as digest:
            digest.return_value.hexdigest.return_value = stored['source_sha256']
            self.assertEqual(m.register_check(get), '')
        with self.assertRaises(ValueError):
            m.register_check(lambda url: b'<html>No document</html>')

    def test_stats_revision_and_period(self):
        metadata = m.load('scripts/fixtures/statswales/characteristics-metadata.json')
        get = lambda url: json.dumps(metadata).encode()
        self.assertEqual(m.stats_check('characteristics', get), '')
        metadata['published_revision']['id'] = 'new-revision'
        metadata['published_revision']['metadata'][0]['title'] = 'Pupils 2026/27'
        result = m.stats_check('characteristics', get)
        self.assertIn('revision changed', result)
        self.assertIn('2025/26 → 2026/27', result)
        metadata['id'] = 'wrong-dataset'
        with self.assertRaises(ValueError):
            m.stats_check('characteristics', get)

    def test_ons_versions_and_malformed_metadata(self):
        def get(version):
            return lambda url: json.dumps({'links': {'latest_version': {'href':
                f'https://api.beta.ons.gov.uk/v1/datasets/TS001/editions/2021/versions/{version}'}}}).encode()
        self.assertEqual(m.ons_check('TS001', 3, get(3)), '')
        self.assertIn('latest version 4', m.ons_check('TS001', 3, get(4)))
        with self.assertRaises(ValueError):
            m.ons_check('TS008', 4, get(3))
        with self.assertRaises(KeyError):
            m.ons_check('TS001', 3, lambda url: b'{}')

    def test_failed_requests_never_become_unchanged(self):
        def unavailable(url):
            raise TimeoutError()
        results = m.checks(unavailable)
        self.assertEqual(len(results), 15)
        self.assertTrue(all(r['status'] == 'check failed' for r in results if r['source'] != 'FSA ward snapshot age'))

    def test_reference_corrections_and_postcode_editions(self):
        source = next(s for s in m.load('src/geography/data/W06000015/catalogue.json')['reference']['sources'] if s['kind'] == 'postcodes')
        identity = source['source_url'].split('id=')[-1]
        modified = int(m.datetime.datetime.fromisoformat(source['modified_at']).timestamp() * 1000)
        self.assertEqual(m.geography_check(source, lambda url: json.dumps(dict(id=identity, modified=modified)).encode()), '')
        self.assertIn('changed', m.geography_check(source, lambda url: json.dumps(dict(id=identity, modified=modified + 1000)).encode()))
        self.assertEqual(m.postcode_edition_check(lambda url: json.dumps(dict(results=[dict(id=identity, title='Same edition')])).encode()), '')
        self.assertIn('new postcode edition', m.postcode_edition_check(lambda url: json.dumps(dict(results=[dict(id='new', title='New edition')])).encode()))


class IssueTests(unittest.TestCase):
    def publish(self, body, issues):
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / 'report.md'
            report.write_text(body)
            with patch('sys.argv', ['publish', str(report)]), \
                    patch('subprocess.check_output', return_value=json.dumps(issues).encode()), \
                    patch('subprocess.run') as run:
                runpy.run_path(str(m.ROOT / 'scripts/publish-source-freshness.py'), run_name='__main__')
                return [call.args[0] for call in run.call_args_list]

    def test_issue_lifecycle(self):
        marker = '<!-- mcp-wales-source-freshness -->'
        changed = marker + '\n- **School register — update available**'
        self.assertEqual(self.publish(marker, []), [])
        self.assertEqual(self.publish(changed, [])[0][:3], ['gh', 'issue', 'create'])
        issue = dict(number=12, title='Review public-source freshness', body=changed,
                     author={'login': 'github-actions[bot]'})
        self.assertEqual(self.publish(changed, [issue]), [])
        self.assertEqual(self.publish(marker, [issue])[0][:4], ['gh', 'issue', 'close', '12'])
        failed = marker + '\n- **ONS TS001 — check failed**'
        self.assertEqual(self.publish(failed, [issue])[0][:4], ['gh', 'issue', 'edit', '12'])
        issue['author']['login'] = 'someone-else'
        self.assertEqual(self.publish(changed, [issue])[0][:3], ['gh', 'issue', 'create'])


if __name__ == '__main__':
    unittest.main()
