"""Check public-source metadata without replacing runtime snapshots."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]


def fetch(url):
    return subprocess.check_output(
        ['curl', '-fsSL', '--max-time', '30', '--max-filesize', '5000000', url],
        stderr=subprocess.DEVNULL, timeout=35)


def load(path):
    return json.loads((ROOT / path).read_text())


class RegisterPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = set()
        self.dates = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and urlparse(attrs.get('href', '')).path.endswith('.ods'):
            self.links.add(attrs['href'])
        if tag == 'time' and attrs.get('datetime'):
            self.dates.add(attrs['datetime'][:10])
        if tag == 'meta' and attrs.get('property') == 'article:modified_time':
            self.dates.add(attrs.get('content', '')[:10])


def register_check(get):
    stored = load('src/schools/directory.json')
    page = RegisterPage()
    page.feed(get(stored['source_url']).decode())
    links = {urljoin(stored['source_url'], link) for link in page.links}
    if len(links) != 1:
        raise ValueError('Expected one school-register ODS link; review page structure')
    link = links.pop()
    if urlparse(link).hostname != 'www.gov.wales':
        raise ValueError('Unexpected register download host')
    digest = hashlib.sha256(get(link)).hexdigest()
    changes = []
    if link != stored['source_download_url']:
        changes.append('download link changed')
    if digest != stored['source_sha256']:
        changes.append('workbook content changed')
    if page.dates and max(page.dates) != stored['source_published_at']:
        changes.append('page modification date changed')
    return '; '.join(changes)


def stats_check(kind, get):
    stored = load(f'src/schools/statswales/{kind}.json')['source']
    latest = json.loads(get(f"https://api.stats.gov.wales/v2/{stored['dataset_id']}?language=en-gb"))
    if latest['id'] != stored['dataset_id']:
        raise ValueError('Unexpected dataset identity')
    revision = latest['published_revision']
    title = next(m['title'] for m in revision['metadata'] if m['language'].lower() == 'en-gb')
    periods = re.findall(r'\d{4}/\d{2}', title)
    if len(periods) != 1 or not revision['id']:
        raise ValueError('Missing revision or reporting period')
    changes = []
    if revision['id'] != stored['revision_id']:
        changes.append(f"revision changed; published {revision['publish_at'][:10]}")
    if periods[0] != stored['reporting_period']:
        changes.append(f"reporting period {stored['reporting_period']} → {periods[0]}")
    return '; '.join(changes)


def ons_check(dataset, version, get):
    metadata = json.loads(get(f'https://api.beta.ons.gov.uk/v1/datasets/{dataset}'))
    href = metadata['links']['latest_version']['href']
    match = re.search(r'/datasets/([^/]+)/editions/([^/]+)/versions/(\d+)/?$', href)
    if not match or match[1].upper() != dataset:
        raise ValueError('Unexpected latest-version metadata')
    if match[2] != '2021':
        return f'latest edition is {match[2]}; review separately from Census 2021'
    latest = int(match[3])
    return f'pinned version {version}; latest version {latest}' if latest != version else ''


def geography_check(source, get):
    item = urlparse(source['source_url']).query.split('id=')[-1]
    latest = json.loads(get(f'https://www.arcgis.com/sharing/rest/content/items/{item}?f=json'))
    if latest['id'] != item:
        raise ValueError('Unexpected reference identity')
    modified = datetime.datetime.fromtimestamp(latest['modified'] / 1000, datetime.timezone.utc).isoformat()
    return 'pinned reference metadata changed; review correction without changing boundary vintage' if modified != source['modified_at'] else ''


def postcode_edition_check(get):
    reference = load('src/geography/data/W06000015/catalogue.json')['reference']
    query = urlencode(dict(f='json', q='owner:ONSGeography_data AND type:"Feature Service" AND title:"ONS Postcode Directory" AND title:"Hosted Table"', sortField='created', sortOrder='desc', num=1))
    latest = json.loads(get('https://www.arcgis.com/sharing/rest/search?' + query))['results'][0]
    stored = next(s for s in reference['sources'] if s['kind'] == 'postcodes')
    return f"new postcode edition available: {latest['title']}" if latest['id'] not in stored['source_url'] else ''


def fsa_snapshot_check():
    stored = load('src/fsa/source.json')
    age = (datetime.date.today() - datetime.date.fromisoformat(stored['source_extract_time'])).days
    return f'FSA ward snapshot is {age} days old; manually refresh and deploy' if age > 30 else ''


def checks(get=fetch):
    tasks = [('School register', lambda: register_check(get))]
    for kind in ['characteristics', 'year_groups', 'fsm']:
        tasks.append((f'StatsWales {kind}', lambda kind=kind: stats_check(kind, get)))
    registry = (ROOT / 'src/ons/datasets.ts').read_text()
    pins = re.findall(r'id: "(TS\d+)", version: (\d+)', registry)
    if len(pins) != 4 or len({item[0] for item in pins}) != 4:
        raise ValueError('Could not read all four ONS dataset pins')
    for dataset, version in pins:
        tasks.append((f'ONS {dataset}', lambda dataset=dataset, version=version: ons_check(dataset, int(version), get)))
    for source in load('src/geography/data/W06000015/catalogue.json')['reference']['sources']:
        if source['publisher'] == 'Office for National Statistics':
            tasks.append((f"Geography {source['kind']}", lambda source=source: geography_check(source, get)))
    tasks.append(('ONSPD latest edition', lambda: postcode_edition_check(get)))
    tasks.append(('FSA ward snapshot age', fsa_snapshot_check))
    results = []
    for name, check in tasks:
        try:
            detail = check()
            results.append(dict(source=name, status='update available' if detail else 'unchanged', detail=detail))
        except Exception as error:
            results.append(dict(source=name, status='check failed', detail=f'{type(error).__name__}: source could not be fetched or validated'))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, default=Path('source-freshness.md'))
    args = parser.parse_args()
    results = checks()
    lines = ['<!-- mcp-wales-source-freshness -->', '# Source freshness review', '',
             'Checks compare public sources with committed snapshots and pins. No runtime data was changed.', '']
    for result in results:
        lines.append(f"- **{result['source']} — {result['status']}**" + (f": {result['detail']}" if result['detail'] else ''))
    lines += ['', 'For updates, follow DATA_SOURCES.md: review, import, test and deploy manually.',
              'Geography boundaries remain a manual review because Census 2021 uses historical geographies.', '']
    args.report.write_text('\n'.join(lines))
    print('\n'.join(lines))
    # Updates are actionable, but not failures. Inaccessible sources fail the workflow.
    return 1 if any(r['status'] == 'check failed' for r in results) else 0


if __name__ == '__main__':
    raise SystemExit(main())
