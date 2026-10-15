"""Validate local downloaded reference inputs and create a reviewable candidate.

No network calls. Does not overwrite application reference files.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTHORITY = 'W06000015'
OGL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')


def prepare(directory, candidate):
    manifest = json.loads((directory / 'inputs.json').read_text())
    for name, digest in manifest['files'].items():
        if hashlib.sha256((directory / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f'Input checksum mismatch: {name}')

    def pages(name):
        result = []
        count = json.loads((directory / f'{name}-count.json').read_text())['count']
        for offset in range(0, count, 1000):
            page = json.loads((directory / f'{name}-{offset}.json').read_text())
            result.extend(f['attributes'] for f in page['features'])
        if len(result) != count:
            raise ValueError(f'Incomplete {name}')
        return result

    old = json.loads((ROOT / 'src/ons/geographies.json').read_text())
    areas = {a['code']: dict(a, local_authority_code=a['parent_code']) for a in old['areas']}
    hierarchy = {}
    for row in pages('hierarchy'):
        if row['LAD22CD'] != AUTHORITY:
            raise ValueError('Hierarchy outside Cardiff')
        lsoa, msoa = row['LSOA21CD'], row['MSOA21CD']
        if lsoa in hierarchy and hierarchy[lsoa] != msoa:
            raise ValueError('Inconsistent LSOA hierarchy')
        hierarchy[lsoa] = msoa
        for kind, code, parent, parent_name in [('lsoa', lsoa, msoa, row['MSOA21NM']), ('msoa', msoa, AUTHORITY, 'Cardiff')]:
            prefix = kind.upper() + '21'
            welsh = row.get(prefix + 'NMW')
            areas[code] = dict(code=code, name=row[prefix + 'NM'], name_cy=welsh, area_type=kind,
                               parent_code=parent, parent_name=parent_name, local_authority_code=AUTHORITY,
                               boundary_date='2021', aliases=[welsh] if welsh and welsh != row[prefix + 'NM'] else [])
    best_fit = {}
    for row in pages('best-fit'):
        code, ward = row['LSOA21CD'], row['WD22CD']
        if code not in hierarchy or ward not in areas or code in best_fit:
            raise ValueError('Invalid best-fit relationship')
        best_fit[code] = ward
        areas[ward]['name_cy'] = row.get('WD22NMW')
    if set(best_fit) != set(hierarchy):
        raise ValueError('Incomplete best-fit lookup')
    boundaries = []
    for kind in ['ward', 'lsoa', 'msoa']:
        files = [directory / 'ward-geometry.json'] if kind == 'ward' else sorted(directory.glob(f'{kind}-geometry-*.json'))
        for file in files:
            data = json.loads(file.read_text())
            if data.get('exceededTransferLimit'):
                raise ValueError('Truncated geometry')
            for feature in data['features']:
                properties, geometry = feature['properties'], feature['geometry']
                code = properties['census_code'] if kind == 'ward' else properties[kind.upper() + '21CD']
                if code not in areas or areas[code]['area_type'] != kind or geometry['type'] not in ['Polygon', 'MultiPolygon']:
                    raise ValueError('Unexpected geometry or code')
                polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
                points = []
                for polygon in polygons:
                    for ring in polygon:
                        if len(ring) < 4 or ring[0] != ring[-1]:
                            raise ValueError('Unclosed boundary ring')
                        for point in ring:
                            if len(point) != 2 or not (-4 < point[0] < -2 and 50 < point[1] < 53):
                                raise ValueError('Unexpected coordinate system or coverage')
                        points.extend(ring)
                bbox = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
                boundaries.append(dict(code=code, area_type=kind, bbox=bbox, geometry=geometry))
    expected = {a['code'] for a in areas.values() if a['area_type'] != 'local_authority'}
    if len(boundaries) != len(expected) or {b['code'] for b in boundaries} != expected:
        raise ValueError('Incomplete or duplicate boundaries')
    postcodes = {}
    for row in pages('postcodes'):
        postcode = ' '.join(row['pcds'].upper().split())
        if postcode in postcodes or row['lad26cd'] != AUTHORITY:
            raise ValueError('Duplicate postcode or unsupported authority')
        def number(value):
            return float(value) if value not in [None, '', '999999', '99.999999', '0.000000'] else None
        lsoa, msoa = row.get('lsoa21cd'), row.get('msoa21cd')
        if lsoa and (lsoa not in hierarchy or hierarchy[lsoa] != msoa):
            raise ValueError('Postcode statistical hierarchy mismatch')
        postcodes[postcode] = dict(postcode=postcode, terminated=str(row['doterm']) if row.get('doterm') else None,
                                   quality=int(row['gridind']), latitude=number(row['lat']), longitude=number(row['long']),
                                   lsoa_code=lsoa, msoa_code=msoa)
    sources = []
    for kind in ['hierarchy', 'lsoa', 'msoa', 'best-fit', 'postcodes']:
        item = json.loads((directory / f'{kind}-item.json').read_text())
        def date(ms):
            return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).isoformat()
        publication_dates = {'best-fit': '2022-08-26', 'postcodes': '2026-09-16'}
        sources.append(dict(kind=kind, publisher='Office for National Statistics', title=item['title'],
                            source_url=f"https://www.arcgis.com/home/item.html?id={item['id']}", download_url=item['url'],
                            publication_date=publication_dates.get(kind), portal_created_at=date(item['created']), modified_at=date(item['modified']), licence=OGL))
    sources.append(dict(kind='ward', publisher='Welsh Government', title='Electoral Wards Wales May 2022',
                        source_url='https://datamap.gov.wales/layers/geonode:electoral_wards_wales_may_2022',
                        download_url='https://datamap.gov.wales/geoserver/ows', publication_date=None, created_at='2022-07-04', licence=OGL))
    candidate.mkdir(parents=True, exist_ok=True)
    reference = dict(authority_code=AUTHORITY, boundary_dates=dict(ward='2022-05', lsoa='2021', msoa='2021'),
                     postcode_edition='2026-08', retrieved_at=manifest['retrieved_at'], sources=sources, input_sha256=manifest['files'],
                     importer_version='1', attribution=['Source: Office for National Statistics licensed under the Open Government Licence v.3.0',
                     'Contains OS data © Crown copyright and database right 2026', 'Contains Royal Mail data © Royal Mail copyright and database right 2026',
                     'Electoral ward boundaries: Welsh Government. Contains OS data © Crown copyright and database right 2022.'])
    version = 'cardiff-' + hashlib.sha256(json.dumps(reference, sort_keys=True).encode()).hexdigest()[:16]
    reference['version'] = version
    write(candidate / 'catalogue.json', dict(areas=sorted(areas.values(), key=lambda a: a['code']), reference=reference,
          hierarchy=hierarchy, best_fit=best_fit, legacy_source={k: v for k, v in old.items() if k != 'areas'}))
    write(candidate / 'boundaries.json', dict(version=version, boundaries=sorted(boundaries, key=lambda b: b['code'])))
    write(candidate / 'postcodes.json', dict(version=version, postcodes=postcodes))
    print(f'Candidate: {len(areas)} areas, {len(boundaries)} boundaries, {len(postcodes)} postcodes; {version}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--candidate', type=Path, required=True)
    args = parser.parse_args()
    if args.candidate.resolve().is_relative_to(ROOT / 'src'):
        raise ValueError('Write a candidate outside src, review before promotion')
    prepare(args.directory, args.candidate)
