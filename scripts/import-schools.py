"""Manually convert an official school-register ODS; Python standard library only."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("ods", type=Path)
parser.add_argument("--published-at", required=True, type=datetime.date.fromisoformat)
parser.add_argument("--download-url", required=True)
args = parser.parse_args()
ns = {"table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0"}
with zipfile.ZipFile(args.ods) as archive:
    root = ET.fromstring(archive.read("content.xml"))
table = next(t for t in root.findall(".//table:table", ns)
             if t.get("{" + ns["table"] + "}name") == "Maintained")
rows = []
for row in table.findall("table:table-row", ns):
    cells = []
    for cell in row.findall("table:table-cell", ns):
        repeat = int(cell.get("{" + ns["table"] + "}number-columns-repeated", "1"))
        cells.extend(["".join(cell.itertext()).strip()] * min(repeat, 100))
    rows.append(cells)
expected = ["School Number", "School Name", "LA Code", "Local Authority", "Sector",
            "Governance - see notes", "School Language Category - see notes", "School Type",
            "Religious Character", "Address 1", "Address 2", "Address 3", "Address 4",
            "Postcode", "Phone Number"]
if rows[0][:15] != expected:
    raise ValueError("Register columns changed; review the source before importing")
schools = []
for cells in rows[1:]:
    if len(cells) < 3 or cells[2] != "681":
        continue
    if len(cells) < 15 or not re.fullmatch(r"681\d{4}", cells[0]):
        raise ValueError("Invalid Cardiff school row")
    if any(not cells[i] for i in [1, 3, 4, 5, 6, 7, 9, 13, 14]):
        raise ValueError("Missing required directory field")
    schools.append(dict(school_id=cells[0], name=cells[1], local_authority_code=cells[2],
                        local_authority=cells[3], sector=cells[4], school_type=cells[7],
                        governance=cells[5], language_category=cells[6],
                        address=", ".join(c for c in cells[9:13] if c),
                        postcode=cells[13], telephone=cells[14]))
if not schools or len({s["school_id"] for s in schools}) != len(schools):
    raise ValueError("Empty directory or duplicate school IDs")
snapshot = dict(
    source_url="https://www.gov.wales/addresses-and-phone-numbers-schools-and-pupil-referral-units",
    source_download_url=args.download_url,
    source_published_at=args.published_at.isoformat(),
    snapshot_imported_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    source_sha256=hashlib.sha256(args.ods.read_bytes()).hexdigest(),
    schools=sorted(schools, key=lambda s: (s["name"].casefold(), s["school_id"])),
)
output = Path(__file__).resolve().parents[1] / "src/schools/directory.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
print(f"Imported {len(schools)} Cardiff maintained schools into {output}")
