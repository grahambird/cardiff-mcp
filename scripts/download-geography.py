"""Download pinned official Cardiff reference inputs, never application snapshots.

Usage: python3 scripts/download-geography.py /tmp/cardiff-geography-inputs
Existing inputs are reused. Use a new directory to check for publisher corrections.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.parse

ARC = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/'
AUTHORITY = 'W06000015'


def download(directory, name, url):
    path = directory / name
    if not path.exists():
        raw = subprocess.check_output(['curl', '-fsSL', '--max-time', '60', url])
        parsed = json.loads(raw)
        if 'error' in parsed:
            raise ValueError(f'Source refused {name}: review source schema before retrying')
        path.write_bytes(raw)
    return path.read_bytes()


def query(directory, name, service, where, **options):
    base = ARC + service + '/FeatureServer/0'
    metadata = json.loads(download(directory, name + '-service.json', base + '?f=json'))
    if 'error' in metadata:
        raise ValueError(metadata['error'])
    params = dict(f='json', where=where, outFields='*', returnGeometry='false')
    params.update(options)
    count = json.loads(download(directory, name + '-count.json', base + '/query?' + urllib.parse.urlencode(dict(f='json', where=where, returnCountOnly='true'))))['count']
    features = []
    for offset in range(0, count, 1000):
        url = base + '/query?' + urllib.parse.urlencode(dict(params, resultOffset=offset, resultRecordCount=1000, orderByFields=metadata['objectIdField']))
        page = json.loads(download(directory, f'{name}-{offset}.json', url))
        if 'error' in page or not page.get('features'):
            raise ValueError(f'Incomplete {name} page: {offset}')
        features.extend(page['features'])
    if len(features) != count:
        raise ValueError(f'Incomplete {name}: {len(features)} != {count}')
    return features


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    directory = args.directory
    directory.mkdir(parents=True, exist_ok=True)
    hierarchy_service = 'OA_LSOA_MSOA_EW_DEC_2021_LU_v3'
    hierarchy = query(directory, 'hierarchy', hierarchy_service, "LAD22CD='W06000015'")
    lsoas = sorted({f['attributes']['LSOA21CD'] for f in hierarchy})
    msoas = sorted({f['attributes']['MSOA21CD'] for f in hierarchy})
    for name, service, field, codes in [
        ('lsoa', 'Lower_layer_Super_Output_Areas_December_2021_Boundaries_EW_BFC_V10', 'LSOA21CD', lsoas),
        ('msoa', 'Middle_layer_Super_Output_Areas_December_2021_Boundaries_EW_BFC_V7', 'MSOA21CD', msoas),
    ]:
        # GeoJSON preserves polygon rings and exports WGS84 without generalisation.
        for i in range(0, len(codes), 50):
            selected = ','.join("'" + code + "'" for code in codes[i:i+50])
            params = dict(f='geojson', where=f'{field} IN ({selected})', outFields='*', outSR=4326, returnGeometry='true')
            url = ARC + service + '/FeatureServer/0/query?' + urllib.parse.urlencode(params)
            data = json.loads(download(directory, f'{name}-geometry-{i}.json', url))
            if len(data.get('features', [])) != len(codes[i:i+50]) or data.get('exceededTransferLimit'):
                raise ValueError(f'Incomplete {name} geometry')
    params = dict(service='WFS', version='2.0.0', request='GetFeature', typeNames='geonode:electoral_wards_wales_may_2022', outputFormat='application/json', srsName='EPSG:4326', CQL_FILTER="census_code IN (" + ','.join("'" + a['code'] + "'" for a in json.loads((Path(__file__).resolve().parents[1] / 'src/ons/geographies.json').read_text())['areas'] if a['area_type'] == 'ward') + ")")
    download(directory, 'ward-geometry.json', 'https://datamap.gov.wales/geoserver/ows?' + urllib.parse.urlencode(params))
    query(directory, 'best-fit', 'LSOA_2021_to_Ward_to_Lower_Tier_Local_Authority_May_2022_Lookup_for_England_2022', "LTLA22CD='W06000015'")
    query(directory, 'postcodes', 'ONS_Postcode_Directory_(August_2026)_(Hosted_Table)', "lad26cd='W06000015'", outFields='pcds,doterm,gridind,lat,long,lsoa21cd,msoa21cd,lad26cd')
    items = {'hierarchy': 'b9ca90c10aaa4b8d9791e9859a38ca67', 'lsoa': '2bbaef5230694f3abae4f9145a3a9800', 'msoa': '12baf1e6a44441208ffe5ba5ed063a68', 'best-fit': 'ab1ae1a7600e483d82c8f76566cae805', 'postcodes': '189f78ab06fd4df4a35fe806d022c563'}
    for name, item in items.items():
        download(directory, name + '-item.json', f'https://www.arcgis.com/sharing/rest/content/items/{item}?f=json')
    files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.glob('*.json')) if p.name != 'inputs.json'}
    manifest = directory / 'inputs.json'
    if not manifest.exists():
        manifest.write_text(json.dumps(dict(retrieved_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), files=files), indent=2) + '\n')
    elif json.loads(manifest.read_text())['files'] != files:
        raise ValueError('Input directory changed; use a fresh directory')
    print(f'Prepared {len(lsoas)} LSOAs, {len(msoas)} MSOAs; raw inputs in {directory}')


if __name__ == '__main__':
    main()
