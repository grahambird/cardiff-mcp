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
    areas = []
    for item in listing('population-types/UR/area-types/ltla/areas?'):
        if item['id'].startswith('W'):
            areas.append(dict(code=item['id'], name=item['label'], area_type='local_authority', parent_code=item['id'], parent_name=item['label'], boundary_date='2021'))
    rows = list(workbook_rows(fetch(WARD_SOURCE)))
    header = next(row for row in rows if 'WD22CD' in row.values())
    columns = {value: key for key, value in header.items()}
    for row in rows:
        if row.get(columns['LAD22CD']) == 'W06000015':
            areas.append(dict(code=row[columns['WD22CD']], name=row[columns['WD22NM']], area_type='ward', parent_code='W06000015', parent_name='Cardiff', boundary_date='2022-05'))
    for item in listing('population-types/UR/area-types/msoa/areas?q=Cardiff'):
        if not item['label'].startswith('Cardiff '):
            raise ValueError('Unexpected MSOA parent label')
        areas.append(dict(code=item['id'], name=item['label'], area_type='msoa', parent_code='W06000015', parent_name='Cardiff', boundary_date='2021'))
    assert sum(a['area_type'] == 'local_authority' for a in areas) == 22
    assert sum(a['area_type'] == 'ward' for a in areas) == 28
    assert sum(a['area_type'] == 'msoa' for a in areas) == 48
    assert len({a['code'] for a in areas}) == len(areas)
    # Welsh ward labels are published in the ONS lookup API. Keep them as exact aliases.
    lookup = json.loads(fetch('https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LSOA_2021_to_Ward_to_Lower_Tier_Local_Authority_May_2022_Lookup_for_England_2022/FeatureServer/0/query?where=LTLA22CD%3D%27W06000015%27&outFields=WD22CD,WD22NMW&returnDistinctValues=true&returnGeometry=false&f=json'))
    assert not lookup.get('exceededTransferLimit')
    welsh = {f['attributes']['WD22CD']: f['attributes']['WD22NMW'] for f in lookup['features']}
    for area in areas:
        area['aliases'] = [welsh[area['code']]] if area['code'] in welsh and welsh[area['code']] and welsh[area['code']] != area['name'] else []
        if area['code'] == 'W06000015': area['aliases'] = ['Caerdydd']
        if area['code'] == 'W06000011': area['aliases'] = ['Abertawe']
    result = dict(retrieved_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), sources=[WARD_SOURCE, BASE + '/population-types/UR/area-types/msoa/areas?q=Cardiff', BASE + '/population-types/UR/area-types/ltla/areas', 'https://geoportal.statistics.gov.uk/datasets/lsoa-2021-to-ward-to-local-authority-district-may-2022-best-fit-lookup-for-ew/about'], attribution=ATTRIBUTION, areas=sorted(areas, key=lambda a: a['code']))
    (ROOT / 'src/ons/geographies.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print('Refreshed 22 Welsh authorities, 28 Cardiff wards and 48 Cardiff MSOAs; no observations stored.')

if __name__ == "__main__":
    main()
