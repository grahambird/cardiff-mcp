"""Refresh geography identifiers only. Never downloads census observations.
Run manually; review the generated diff before committing.
"""
import datetime
import io
import json
from pathlib import Path
import subprocess
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://api.beta.ons.gov.uk/v1'
WARD_SOURCE = 'https://www.arcgis.com/sharing/rest/content/items/96172380bb7d429bac154d03bf35a651/data'
ATTRIBUTION = 'Source: Office for National Statistics licensed under the Open Government Licence v.3.0'

def fetch(url):
    return subprocess.check_output(['curl', '--location', '--fail', '--silent', '--show-error', '--max-time', '20', url])

def listing(path):
    items, offset = [], 0
    while True:
        data = json.loads(fetch(f'{BASE}/{path}&limit=500&offset={offset}'))
        page = data.get('items') or []
        if not page and len(items) < data['total_count']:
            raise ValueError('Incomplete geography pagination')
        items.extend(page)
        offset += len(page)
        if offset >= data['total_count']:
            return items

def workbook_rows(raw):
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        strings = [''.join(x.itertext()) for x in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', ns)]
        for row in ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('.//s:row', ns):
            values = {}
            for cell in row.findall('s:c', ns):
                value = cell.find('s:v', ns)
                if value is not None:
                    values[''.join(c for c in cell.attrib['r'] if c.isalpha())] = strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text
            yield values

def main():
    raise RuntimeError('The geography catalogue is now shared. Follow docs/geography.md: download-geography.py, prepare-geography.py and build-geography.mts. This legacy command no longer writes a separate Census catalogue.')

if __name__ == "__main__":
    main()
