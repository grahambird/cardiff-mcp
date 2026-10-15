"""Validate a complete official Cardiff XML download into a source-only candidate.

No geographical associations and no network calls. Original XML fields are retained.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET


def import_fsa(path, expected_count, retrieved_at):
    raw = path.read_bytes()
    if len(raw) > 20 * 1024 * 1024 or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('Unsafe or oversized XML')
    root = ET.fromstring(raw)
    header = root.find('Header')
    if root.tag != 'FHRSEstablishment' or header is None:
        raise ValueError('Missing extract header')
    if header.findtext('ReturnCode') != 'Success':
        raise ValueError('Unsuccessful FSA extract')
    datetime.date.fromisoformat(header.findtext('ExtractDate', ''))
    datetime.datetime.fromisoformat(retrieved_at.replace('Z', '+00:00'))
    def value(element):
        if element.attrib.get('{http://www.w3.org/2001/XMLSchema-instance}nil') == 'true':
            return None
        children = list(element)
        if not children:
            return element.text or ''
        if len({child.tag for child in children}) != len(children):
            raise ValueError('Unexpected duplicate source field')
        return {child.tag: value(child) for child in children}
    records = [value(element) for element in root.findall('.//EstablishmentDetail')]
    if not records or len(records) != expected_count or int(header.findtext('ItemCount', '-1')) != len(records):
        raise ValueError('Incomplete FSA population')
    ids = set()
    for record in records:
        identity = record.get('FHRSID', '')
        if not identity.isdigit() or int(identity) <= 0 or str(int(identity)) != identity or identity in ids:
            raise ValueError('Invalid or duplicate FHRSID')
        ids.add(identity)
        if record.get('LocalAuthorityCode') != '556' or record.get('SchemeType') != 'FHRS':
            raise ValueError('Unexpected authority or scheme')
        if not record.get('BusinessName') or not record.get('BusinessType') or not record.get('RatingValue'):
            raise ValueError('Missing required FSA fields')
        for field in ['BusinessName', 'BusinessType', 'RatingValue', 'RatingDate', 'AddressLine1', 'AddressLine2', 'AddressLine3', 'AddressLine4', 'PostCode']:
            if record.get(field) is not None and not isinstance(record[field], str):
                raise ValueError('Unexpected nested source field')
        if not str(record.get('BusinessTypeID', '')).isdigit() or int(record['BusinessTypeID']) <= 0:
            raise ValueError('Missing or invalid business type ID')
        if record.get('RatingDate'):
            datetime.date.fromisoformat(record['RatingDate'][:10])
        geocode = record.get('Geocode')
        if geocode not in [None, '']:
            if not isinstance(geocode, dict) or any(geocode.get(field) is not None and not isinstance(geocode[field], str) for field in ['Latitude', 'Longitude']):
                raise ValueError('Unexpected coordinate structure')
        if record.get('NewRatingPending') not in ['True', 'False', 'true', 'false']:
            raise ValueError('Unexpected FSA pending flag')
    return dict(source_url='https://ratings.food.gov.uk/api/open-data-files/FHRS556en-GB.xml',
                source_extract_time=header.findtext('ExtractDate'), source_retrieved_at=retrieved_at,
                input_sha256=hashlib.sha256(raw).hexdigest(), expected_count=expected_count,
                attribution='Contains public sector information licensed under the Open Government Licence v3.0. Source: Food Standards Agency.',
                records=sorted(records, key=lambda r: int(r['FHRSID'])))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('xml', type=Path)
    parser.add_argument('--expected-count', type=int, required=True, help='Count from the official download listing for this extract')
    parser.add_argument('--retrieved-at', default=datetime.datetime.now(datetime.timezone.utc).isoformat())
    parser.add_argument('--candidate', type=Path, required=True)
    args = parser.parse_args()
    if args.candidate.resolve().is_relative_to(Path(__file__).resolve().parents[1] / 'src'):
        raise ValueError('Write a candidate outside src, review before promotion')
    result = import_fsa(args.xml, args.expected_count, args.retrieved_at)
    args.candidate.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"Validated {len(result['records'])} Cardiff FSA source records")
